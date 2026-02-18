use super::*;
use base64::Engine as _;

fn point_for_char(rope: &Rope, char_idx: usize) -> Point {
    let clamped = char_idx.min(rope.len_chars());
    let row = rope.char_to_line(clamped);
    let line_start = rope.line_to_char(row);
    let column = rope.slice(line_start..clamped).len_bytes();

    Point { row, column }
}

fn advance_point_with_text(start: Point, text: &str) -> Point {
    let mut row = start.row;
    let mut column = start.column;

    for b in text.bytes() {
        if b == b'\n' {
            row += 1;
            column = 0;
        } else {
            column += 1;
        }
    }

    Point { row, column }
}

pub(super) fn apply_operation(doc: &mut Document, operation: &EditOperation) -> Result<(), String> {
    let rope = &mut doc.rope;
    let start = operation.start_char.min(rope.len_chars());
    let old_char_len = operation.old_text.chars().count();
    let end = start
        .checked_add(old_char_len)
        .ok_or_else(|| "Edit range overflow".to_string())?;

    if end > rope.len_chars() {
        return Err("Edit range out of bounds".to_string());
    }

    let current_old = rope.slice(start..end).to_string();
    if current_old != operation.old_text {
        return Err("Edit history out of sync".to_string());
    }

    let start_byte = rope.char_to_byte(start);
    let old_end_byte = start_byte + operation.old_text.len();
    let new_end_byte = start_byte + operation.new_text.len();

    let start_position = point_for_char(rope, start);
    let old_end_position = advance_point_with_text(start_position, &operation.old_text);
    let new_end_position = advance_point_with_text(start_position, &operation.new_text);

    if start < end {
        rope.remove(start..end);
    }

    if !operation.new_text.is_empty() {
        rope.insert(start, &operation.new_text);
    }

    if let Some(tree) = doc.tree.as_mut() {
        tree.edit(&InputEdit {
            start_byte,
            old_end_byte,
            new_end_byte,
            start_position,
            old_end_position,
            new_end_position,
        });
    }

    doc.syntax_dirty = doc.parser.is_some();
    doc.document_version = doc.document_version.saturating_add(1);
    Ok(())
}

pub(super) fn create_edit_operation(
    doc: &mut Document,
    start_char: usize,
    old_text: String,
    new_text: String,
) -> EditOperation {
    EditOperation {
        operation_id: doc.allocate_edit_operation_id(),
        start_char,
        old_text,
        new_text,
    }
}

pub(super) fn undo_impl(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if let Some(operation) = doc.undo_stack.pop() {
            let inverse = operation.inverse();
            apply_operation(&mut doc, &inverse)?;
            doc.redo_stack.push(operation);
            Ok(doc.rope.len_lines())
        } else {
            Err("No more undo steps".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn redo_impl(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if let Some(operation) = doc.redo_stack.pop() {
            apply_operation(&mut doc, &operation)?;
            doc.undo_stack.push(operation);
            Ok(doc.rope.len_lines())
        } else {
            Err("No more redo steps".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn get_edit_history_state_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<EditHistoryState, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(EditHistoryState {
            can_undo: !doc.undo_stack.is_empty(),
            can_redo: !doc.redo_stack.is_empty(),
            is_dirty: doc.has_unsaved_text_changes()
                || doc.encoding.name() != doc.saved_encoding
                || doc.line_ending != doc.saved_line_ending,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn edit_text_impl(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    new_text: String,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let len_chars = doc.rope.len_chars();
        let start = start_char.min(len_chars);
        let end = end_char.min(len_chars).max(start);

        let old_text = doc.rope.slice(start..end).to_string();
        if old_text == new_text {
            return Ok(doc.rope.len_lines());
        }

        let operation = create_edit_operation(&mut doc, start, old_text, new_text);

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairOffsetsResultPayload {
    pub left_offset: usize,
    pub right_offset: usize,
    pub left_line: usize,
    pub left_column: usize,
    pub right_line: usize,
    pub right_column: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRectangularSelectionResultPayload {
    pub next_text: String,
    pub caret_offset: usize,
}

fn is_quote_u16(value: u16) -> bool {
    value == b'\'' as u16 || value == b'"' as u16
}

fn matching_opening_bracket_u16(value: u16) -> Option<u16> {
    if value == b')' as u16 {
        Some(b'(' as u16)
    } else if value == b']' as u16 {
        Some(b'[' as u16)
    } else if value == b'}' as u16 {
        Some(b'{' as u16)
    } else {
        None
    }
}

fn matching_closing_bracket_u16(value: u16) -> Option<u16> {
    if value == b'(' as u16 {
        Some(b')' as u16)
    } else if value == b'[' as u16 {
        Some(b']' as u16)
    } else if value == b'{' as u16 {
        Some(b'}' as u16)
    } else {
        None
    }
}

fn is_escaped_utf16_unit(units: &[u16], index: usize) -> bool {
    if index == 0 || index > units.len() {
        return false;
    }

    let mut backslash_count = 0usize;
    let mut cursor = index;

    while cursor > 0 {
        let previous = units[cursor - 1];
        if previous != b'\\' as u16 {
            break;
        }

        backslash_count = backslash_count.saturating_add(1);
        cursor -= 1;
    }

    backslash_count % 2 == 1
}

fn count_unescaped_quotes_before_utf16(units: &[u16], index: usize, quote: u16) -> usize {
    let mut count = 0usize;

    for cursor in 0..index {
        if units[cursor] == quote && !is_escaped_utf16_unit(units, cursor) {
            count = count.saturating_add(1);
        }
    }

    count
}

fn find_matching_quote_index_utf16(units: &[u16], index: usize) -> Option<usize> {
    let quote = *units.get(index)?;
    if !is_quote_u16(quote) || is_escaped_utf16_unit(units, index) {
        return None;
    }

    let count_before = count_unescaped_quotes_before_utf16(units, index, quote);
    let is_opening_quote = count_before % 2 == 0;

    if is_opening_quote {
        for cursor in (index + 1)..units.len() {
            if units[cursor] == quote && !is_escaped_utf16_unit(units, cursor) {
                return Some(cursor);
            }
        }

        return None;
    }

    let mut cursor = index;
    while cursor > 0 {
        cursor -= 1;
        if units[cursor] == quote && !is_escaped_utf16_unit(units, cursor) {
            return Some(cursor);
        }
    }

    None
}

fn find_matching_bracket_index_utf16(units: &[u16], index: usize) -> Option<usize> {
    let ch = *units.get(index)?;

    if let Some(closing) = matching_closing_bracket_u16(ch) {
        let mut depth = 1usize;

        for cursor in (index + 1)..units.len() {
            let current = units[cursor];

            if current == ch {
                depth = depth.saturating_add(1);
                continue;
            }

            if current == closing {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(cursor);
                }
            }
        }

        return None;
    }

    if let Some(opening) = matching_opening_bracket_u16(ch) {
        let mut depth = 1usize;
        let mut cursor = index;

        while cursor > 0 {
            cursor -= 1;
            let current = units[cursor];

            if current == ch {
                depth = depth.saturating_add(1);
                continue;
            }

            if current == opening {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(cursor);
                }
            }
        }
    }

    None
}

fn find_matching_pair_near_offset_utf16(units: &[u16], offset: usize) -> Option<(usize, usize)> {
    let safe_offset = offset.min(units.len());
    let mut candidate_indexes = Vec::with_capacity(2);

    if safe_offset > 0 {
        candidate_indexes.push(safe_offset - 1);
    }

    if safe_offset < units.len() {
        candidate_indexes.push(safe_offset);
    }

    for index in candidate_indexes {
        let current = units[index];

        let matched = if matching_closing_bracket_u16(current).is_some()
            || matching_opening_bracket_u16(current).is_some()
        {
            find_matching_bracket_index_utf16(units, index)
        } else if is_quote_u16(current) {
            find_matching_quote_index_utf16(units, index)
        } else {
            None
        };

        if let Some(matched_index) = matched {
            return Some((index, matched_index));
        }
    }

    None
}

fn utf16_offset_to_line_column(starts: &[usize], offset: usize) -> (usize, usize) {
    if starts.is_empty() {
        return (1, 1);
    }

    let line_index = starts
        .partition_point(|start| *start <= offset)
        .saturating_sub(1);
    let line_start = starts[line_index];
    (
        line_index.saturating_add(1),
        offset.saturating_sub(line_start).saturating_add(1),
    )
}

pub(super) fn find_matching_pair_offsets_impl(
    text: String,
    offset: usize,
) -> Result<Option<PairOffsetsResultPayload>, String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.is_empty() {
        return Ok(None);
    }

    let matched = find_matching_pair_near_offset_utf16(&units, offset);
    let line_starts = build_line_start_offsets_utf16(&units);
    Ok(matched.map(|(left_offset, right_offset)| {
        let (left_line, left_column) = utf16_offset_to_line_column(&line_starts, left_offset);
        let (right_line, right_column) = utf16_offset_to_line_column(&line_starts, right_offset);
        PairOffsetsResultPayload {
            left_offset,
            right_offset,
            left_line,
            left_column,
            right_line,
            right_column,
        }
    }))
}

fn normalize_line_text_for_rectangular_edit(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn build_line_start_offsets_utf16(units: &[u16]) -> Vec<usize> {
    let mut starts = Vec::with_capacity(64);
    starts.push(0);

    for (index, unit) in units.iter().enumerate() {
        if *unit == b'\n' as u16 {
            starts.push(index + 1);
        }
    }

    starts
}

fn get_line_bounds_by_line_number_utf16(
    units: &[u16],
    starts: &[usize],
    line_number: usize,
) -> Option<(usize, usize)> {
    let index = line_number.saturating_sub(1);
    if index >= starts.len() {
        return None;
    }

    let start = starts[index];
    let end = if index + 1 < starts.len() {
        starts[index + 1].saturating_sub(1)
    } else {
        units.len()
    };

    Some((start, end))
}

fn get_offset_for_column_in_line_utf16(line_start: usize, line_end: usize, column: usize) -> usize {
    let safe_column = column.max(1);
    let line_length = line_end.saturating_sub(line_start);
    line_start + line_length.min(safe_column.saturating_sub(1))
}

pub(super) fn replace_rectangular_selection_text_impl(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
    insert_text: String,
    collapse_to_start: bool,
) -> Result<ReplaceRectangularSelectionResultPayload, String> {
    let source_units: Vec<u16> = text.encode_utf16().collect();
    let line_starts = build_line_start_offsets_utf16(&source_units);

    let normalized_insert = normalize_line_text_for_rectangular_edit(&insert_text);
    let raw_rows: Vec<Vec<u16>> = normalized_insert
        .split('\n')
        .map(|row| row.encode_utf16().collect())
        .collect();

    let safe_start_line = start_line.min(end_line).max(1);
    let safe_end_line = start_line.max(end_line).max(1);
    let safe_start_column = start_column.min(end_column).max(1);
    let safe_end_column = start_column.max(end_column).max(1);

    let row_count = safe_end_line
        .saturating_sub(safe_start_line)
        .saturating_add(1);
    let rows: Vec<Vec<u16>> = (0..row_count)
        .map(|index| {
            if raw_rows.is_empty() {
                Vec::new()
            } else {
                raw_rows[index.min(raw_rows.len().saturating_sub(1))].clone()
            }
        })
        .collect();

    let mut pieces: Vec<u16> =
        Vec::with_capacity(source_units.len().saturating_add(insert_text.len()));
    let mut cursor = 0usize;
    let mut built_len = 0usize;
    let mut caret_offset = 0usize;

    for line in safe_start_line..=safe_end_line {
        let Some((line_start, line_end)) =
            get_line_bounds_by_line_number_utf16(&source_units, &line_starts, line)
        else {
            continue;
        };

        let segment_start =
            get_offset_for_column_in_line_utf16(line_start, line_end, safe_start_column);
        let segment_end =
            get_offset_for_column_in_line_utf16(line_start, line_end, safe_end_column);

        if segment_start > cursor {
            pieces.extend_from_slice(&source_units[cursor..segment_start]);
            built_len = built_len.saturating_add(segment_start.saturating_sub(cursor));
        }

        let row_index = line.saturating_sub(safe_start_line);
        let replacement_row = rows
            .get(row_index)
            .map(|row| row.as_slice())
            .unwrap_or_default();
        let replacement_len = replacement_row.len();
        pieces.extend_from_slice(replacement_row);
        built_len = built_len.saturating_add(replacement_len);

        cursor = segment_end;

        if line == safe_end_line {
            let collapse_len = if collapse_to_start {
                replacement_len
            } else {
                0
            };
            caret_offset = built_len.saturating_sub(collapse_len);
        }
    }

    if cursor < source_units.len() {
        pieces.extend_from_slice(&source_units[cursor..]);
    }

    let next_text = String::from_utf16(&pieces)
        .map_err(|error| format!("Failed to convert rectangular replacement result: {error}"))?;

    Ok(ReplaceRectangularSelectionResultPayload {
        next_text,
        caret_offset,
    })
}

pub(super) fn get_rectangular_selection_text_impl(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
) -> Result<String, String> {
    let source_units: Vec<u16> = text.encode_utf16().collect();
    let line_starts = build_line_start_offsets_utf16(&source_units);

    let safe_start_line = start_line.min(end_line).max(1);
    let safe_end_line = start_line.max(end_line).max(1);
    let safe_start_column = start_column.min(end_column).max(1);
    let safe_end_column = start_column.max(end_column).max(1);

    let mut pieces: Vec<u16> = Vec::new();

    for line in safe_start_line..=safe_end_line {
        if line > safe_start_line {
            pieces.push(b'\n' as u16);
        }

        let Some((line_start, line_end)) =
            get_line_bounds_by_line_number_utf16(&source_units, &line_starts, line)
        else {
            continue;
        };

        let segment_start =
            get_offset_for_column_in_line_utf16(line_start, line_end, safe_start_column);
        let segment_end =
            get_offset_for_column_in_line_utf16(line_start, line_end, safe_end_column);

        if segment_start < segment_end {
            pieces.extend_from_slice(&source_units[segment_start..segment_end]);
        }
    }

    String::from_utf16(&pieces)
        .map_err(|error| format!("Failed to convert rectangular selection text result: {error}"))
}

pub(super) fn replace_line_range_impl(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    new_text: String,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let len_lines = doc.rope.len_lines();
        let start = start_line.min(len_lines);
        let end = end_line.min(len_lines).max(start);

        if start >= end {
            return Ok(doc.rope.len_lines());
        }

        let start_char = doc.rope.line_to_char(start);
        let end_char = doc.rope.line_to_char(end);

        let old_text = doc.rope.slice(start_char..end_char).to_string();
        if old_text == new_text {
            return Ok(doc.rope.len_lines());
        }

        let operation = create_edit_operation(&mut doc, start_char, old_text, new_text);

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

fn encode_base64_utf8(value: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(value.as_bytes())
}

fn decode_base64_utf8(value: &str) -> Result<String, String> {
    let mut normalized = String::with_capacity(value.len());

    for ch in value.chars() {
        if ch.is_whitespace() {
            continue;
        }

        match ch {
            '-' => normalized.push('+'),
            '_' => normalized.push('/'),
            _ => normalized.push(ch),
        }
    }

    if normalized.is_empty() {
        return Ok(String::new());
    }

    let remainder = normalized.len() % 4;
    if remainder == 1 {
        return Err("Invalid base64 text".to_string());
    }

    if remainder > 0 {
        normalized.push_str("=".repeat(4 - remainder).as_str());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(normalized)
        .map_err(|_| "Invalid base64 text".to_string())?;

    String::from_utf8(bytes).map_err(|_| "Invalid UTF-8 text".to_string())
}

pub(super) fn convert_text_base64_impl(text: String, action: String) -> Result<String, String> {
    match action.as_str() {
        "base64_encode" => Ok(encode_base64_utf8(&text)),
        "base64_decode" => decode_base64_utf8(&text),
        _ => Err("Unsupported base64 action".to_string()),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleLineCommentsResultPayload {
    pub(super) changed: bool,
    pub(super) line_count: usize,
    pub(super) document_version: u64,
    pub(super) selection_start_char: usize,
    pub(super) selection_end_char: usize,
}

struct ToggleLineCommentsComputation {
    start_char: usize,
    old_text: String,
    new_text: String,
    selection_start_char: usize,
    selection_end_char: usize,
}

fn split_indent_and_body<'a>(line: &'a str) -> (&'a str, &'a str) {
    let body_start = line
        .char_indices()
        .find_map(|(index, ch)| {
            if ch.is_whitespace() {
                None
            } else {
                Some(index)
            }
        })
        .unwrap_or(line.len());

    (&line[..body_start], &line[body_start..])
}

fn is_line_commented_by_prefix(line: &str, prefix: &str) -> bool {
    let (_, body) = split_indent_and_body(line);
    body == prefix
        || body.starts_with(&format!("{} ", prefix))
        || body.starts_with(&format!("{}\t", prefix))
}

fn add_line_comment_prefix(line: &str, prefix: &str) -> String {
    let (indent, body) = split_indent_and_body(line);

    if body.trim().is_empty() {
        return line.to_string();
    }

    format!("{indent}{prefix} {body}")
}

fn remove_line_comment_prefix(line: &str, prefix: &str) -> String {
    let (indent, body) = split_indent_and_body(line);

    if body.trim().is_empty() {
        return line.to_string();
    }

    if is_line_commented_by_prefix(line, prefix) {
        if body == prefix {
            return indent.to_string();
        }

        if let Some(after_prefix) = body.strip_prefix(prefix) {
            if after_prefix.starts_with(' ') || after_prefix.starts_with('\t') {
                return format!("{indent}{}", &after_prefix[1..]);
            }

            return format!("{indent}{after_prefix}");
        }
    }

    line.to_string()
}

fn map_offset_across_line_transformation(
    old_lines: &[String],
    new_lines: &[String],
    old_offset: usize,
) -> usize {
    let safe_offset = old_offset;
    let mut old_cursor = 0usize;
    let mut new_cursor = 0usize;

    for (index, old_line) in old_lines.iter().enumerate() {
        let new_line = new_lines.get(index).cloned().unwrap_or_default();
        let old_line_len = old_line.chars().count();
        let new_line_len = new_line.chars().count();
        let old_line_end = old_cursor + old_line_len;

        if safe_offset <= old_line_end {
            return new_cursor + (safe_offset - old_cursor).min(new_line_len);
        }

        old_cursor = old_line_end;
        new_cursor += new_line_len;

        if index < old_lines.len().saturating_sub(1) {
            old_cursor += 1;
            new_cursor += 1;

            if safe_offset <= old_cursor {
                return new_cursor;
            }
        }
    }

    new_cursor
}

fn build_char_to_byte_starts(text: &str) -> Vec<usize> {
    let mut starts = Vec::with_capacity(text.chars().count() + 1);
    starts.push(0);

    for (byte_index, _) in text.char_indices().skip(1) {
        starts.push(byte_index);
    }

    starts.push(text.len());
    starts
}

fn resolve_selection_line_range_chars(
    chars: &[char],
    start_offset: usize,
    end_offset: usize,
    is_collapsed: bool,
) -> (usize, usize, usize, usize) {
    let len = chars.len();
    let safe_start = start_offset.min(len);
    let safe_end = end_offset.min(len);
    let selection_start = safe_start.min(safe_end);
    let selection_end = safe_start.max(safe_end);

    let mut line_start = 0usize;
    if selection_start > 0 {
        for index in (0..selection_start).rev() {
            if chars[index] == '\n' {
                line_start = index + 1;
                break;
            }
        }
    }

    let mut effective_selection_end = selection_end;
    if !is_collapsed
        && effective_selection_end > line_start
        && chars.get(effective_selection_end.saturating_sub(1)) == Some(&'\n')
    {
        effective_selection_end = effective_selection_end.saturating_sub(1);
    }

    let mut line_end = len;
    for (index, ch) in chars.iter().enumerate().skip(effective_selection_end) {
        if *ch == '\n' {
            line_end = index;
            break;
        }
    }

    (
        line_start,
        line_end.max(line_start),
        selection_start,
        selection_end,
    )
}

fn compute_toggle_line_comments(
    source: &str,
    start_char: usize,
    end_char: usize,
    is_collapsed: bool,
    prefix: &str,
) -> Option<ToggleLineCommentsComputation> {
    if prefix.trim().is_empty() {
        return None;
    }

    let chars: Vec<char> = source.chars().collect();
    let char_to_byte = build_char_to_byte_starts(source);
    let (line_start, line_end, selection_start, selection_end) =
        resolve_selection_line_range_chars(&chars, start_char, end_char, is_collapsed);

    let selected_block = source
        .get(*char_to_byte.get(line_start)?..*char_to_byte.get(line_end)?)
        .unwrap_or_default();

    let selected_lines: Vec<String> = selected_block
        .split('\n')
        .map(|line| line.to_string())
        .collect();
    let has_non_empty_line = selected_lines.iter().any(|line| !line.trim().is_empty());
    if !has_non_empty_line {
        return None;
    }

    let should_uncomment = selected_lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .all(|line| is_line_commented_by_prefix(line, prefix));

    let transformed_lines: Vec<String> = selected_lines
        .iter()
        .map(|line| {
            if line.trim().is_empty() {
                return line.to_string();
            }

            if should_uncomment {
                remove_line_comment_prefix(line, prefix)
            } else {
                add_line_comment_prefix(line, prefix)
            }
        })
        .collect();

    let transformed_block = transformed_lines.join("\n");
    if transformed_block == selected_block {
        return None;
    }

    let selection_start_in_block = selection_start.saturating_sub(line_start);
    let selection_end_in_block = selection_end.saturating_sub(line_start);
    let next_selection_start = line_start
        + map_offset_across_line_transformation(
            &selected_lines,
            &transformed_lines,
            selection_start_in_block,
        );
    let next_selection_end = line_start
        + map_offset_across_line_transformation(
            &selected_lines,
            &transformed_lines,
            selection_end_in_block,
        );

    Some(ToggleLineCommentsComputation {
        start_char: line_start,
        old_text: selected_block.to_string(),
        new_text: transformed_block,
        selection_start_char: next_selection_start,
        selection_end_char: next_selection_end,
    })
}

pub(super) fn toggle_line_comments_impl(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    is_collapsed: bool,
    prefix: String,
) -> Result<ToggleLineCommentsResultPayload, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let source = doc.rope.to_string();
        let source_len = doc.rope.len_chars();
        let safe_start = start_char.min(source_len);
        let safe_end = end_char.min(source_len);

        let Some(computation) =
            compute_toggle_line_comments(&source, safe_start, safe_end, is_collapsed, &prefix)
        else {
            return Ok(ToggleLineCommentsResultPayload {
                changed: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                selection_start_char: safe_start.min(safe_end),
                selection_end_char: safe_start.max(safe_end),
            });
        };

        let operation = create_edit_operation(
            &mut doc,
            computation.start_char,
            computation.old_text,
            computation.new_text,
        );

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(ToggleLineCommentsResultPayload {
            changed: true,
            line_count: doc.rope.len_lines(),
            document_version: doc.document_version,
            selection_start_char: computation.selection_start_char,
            selection_end_char: computation.selection_end_char,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[derive(Clone, Copy)]
enum DocumentCleanupAction {
    RemoveEmptyLines,
    RemoveDuplicateLines,
    TrimLeadingWhitespace,
    TrimTrailingWhitespace,
    TrimSurroundingWhitespace,
    SortLinesAscending,
    SortLinesAscendingIgnoreCase,
    SortLinesDescending,
    SortLinesDescendingIgnoreCase,
    SortLinesByPinyinAscending,
    SortLinesByPinyinDescending,
}

impl DocumentCleanupAction {
    fn from_value(value: &str) -> Option<Self> {
        match value {
            "remove_empty_lines" => Some(Self::RemoveEmptyLines),
            "remove_duplicate_lines" => Some(Self::RemoveDuplicateLines),
            "trim_leading_whitespace" => Some(Self::TrimLeadingWhitespace),
            "trim_trailing_whitespace" => Some(Self::TrimTrailingWhitespace),
            "trim_surrounding_whitespace" => Some(Self::TrimSurroundingWhitespace),
            "sort_lines_ascending" => Some(Self::SortLinesAscending),
            "sort_lines_ascending_ignore_case" => Some(Self::SortLinesAscendingIgnoreCase),
            "sort_lines_descending" => Some(Self::SortLinesDescending),
            "sort_lines_descending_ignore_case" => Some(Self::SortLinesDescendingIgnoreCase),
            "sort_lines_pinyin_ascending" => Some(Self::SortLinesByPinyinAscending),
            "sort_lines_pinyin_descending" => Some(Self::SortLinesByPinyinDescending),
            _ => None,
        }
    }
}

fn build_pinyin_sort_key(line: &str) -> String {
    let mut key = String::with_capacity(line.len() * 2);

    for character in line.chars() {
        if let Some(pinyin) = character.to_pinyin() {
            key.push_str(pinyin.plain());
        } else {
            key.push(character);
        }

        key.push('\u{0001}');
    }

    key
}

fn cleanup_document_lines(source: &str, action: DocumentCleanupAction) -> String {
    let normalized = text_utils::normalize_to_lf(source);
    let had_terminal_newline = normalized.ends_with('\n');
    let mut lines: Vec<String> = normalized
        .split('\n')
        .map(|line| line.to_string())
        .collect();

    if had_terminal_newline {
        lines.pop();
    }

    let cleaned_lines = match action {
        DocumentCleanupAction::RemoveEmptyLines => lines
            .into_iter()
            .filter(|line| !line.trim().is_empty())
            .collect(),
        DocumentCleanupAction::RemoveDuplicateLines => {
            let mut seen = HashSet::new();
            let mut unique_lines = Vec::with_capacity(lines.len());

            for line in lines {
                if seen.insert(line.clone()) {
                    unique_lines.push(line);
                }
            }

            unique_lines
        }
        DocumentCleanupAction::TrimLeadingWhitespace => lines
            .into_iter()
            .map(|line| line.trim_start().to_string())
            .collect(),
        DocumentCleanupAction::TrimTrailingWhitespace => lines
            .into_iter()
            .map(|line| line.trim_end().to_string())
            .collect(),
        DocumentCleanupAction::TrimSurroundingWhitespace => lines
            .into_iter()
            .map(|line| line.trim().to_string())
            .collect(),
        DocumentCleanupAction::SortLinesAscending => {
            lines.sort();
            lines
        }
        DocumentCleanupAction::SortLinesAscendingIgnoreCase => {
            lines.sort_by_cached_key(|line| line.to_lowercase());
            lines
        }
        DocumentCleanupAction::SortLinesDescending => {
            lines.sort_by(|left, right| right.cmp(left));
            lines
        }
        DocumentCleanupAction::SortLinesDescendingIgnoreCase => {
            lines.sort_by_cached_key(|line| line.to_lowercase());
            lines.reverse();
            lines
        }
        DocumentCleanupAction::SortLinesByPinyinAscending => {
            lines.sort_by_cached_key(|line| (build_pinyin_sort_key(line), line.clone()));
            lines
        }
        DocumentCleanupAction::SortLinesByPinyinDescending => {
            lines.sort_by_cached_key(|line| (build_pinyin_sort_key(line), line.clone()));
            lines.reverse();
            lines
        }
    };

    let mut cleaned = cleaned_lines.join("\n");
    if had_terminal_newline && !cleaned_lines.is_empty() {
        cleaned.push('\n');
    }

    cleaned
}

pub(super) fn cleanup_document_impl(
    state: State<'_, AppState>,
    id: String,
    action: String,
) -> Result<usize, String> {
    let cleanup_action = DocumentCleanupAction::from_value(action.as_str()).ok_or_else(|| {
        "Unsupported cleanup action. Use remove_empty_lines, remove_duplicate_lines, trim_leading_whitespace, trim_trailing_whitespace, trim_surrounding_whitespace, sort_lines_ascending, sort_lines_ascending_ignore_case, sort_lines_descending, sort_lines_descending_ignore_case, sort_lines_pinyin_ascending, or sort_lines_pinyin_descending".to_string()
    })?;

    if let Some(mut doc) = state.documents.get_mut(&id) {
        let source = doc.rope.to_string();
        let cleaned = cleanup_document_lines(&source, cleanup_action);

        if source == cleaned {
            return Ok(doc.rope.len_lines());
        }

        let operation = create_edit_operation(&mut doc, 0, source, cleaned);

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn format_document_impl(
    state: State<'_, AppState>,
    id: String,
    mode: String,
    file_syntax: Option<String>,
    file_path: Option<String>,
    file_name: Option<String>,
    tab_width: Option<u8>,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let source = doc.rope.to_string();
        let formatted = formatting::format_document_text(
            &source,
            mode.as_str(),
            file_syntax.as_deref(),
            file_path.as_deref(),
            file_name.as_deref(),
            &doc.path,
            tab_width.unwrap_or(DEFAULT_TAB_WIDTH),
        )?;

        if source == formatted {
            return Ok(doc.rope.len_lines());
        }

        let operation = create_edit_operation(&mut doc, 0, source, formatted);

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{cleanup_document_lines, find_matching_pair_offsets_impl, DocumentCleanupAction};

    #[test]
    fn remove_empty_lines_should_drop_blank_lines_and_keep_terminal_newline() {
        let source = "alpha\n\n  \n\tbeta\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::RemoveEmptyLines);

        assert_eq!(result, "alpha\n\tbeta\n");
    }

    #[test]
    fn remove_duplicate_lines_should_keep_first_occurrence_order() {
        let source = "a\nb\na\nb\nc\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::RemoveDuplicateLines);

        assert_eq!(result, "a\nb\nc\n");
    }

    #[test]
    fn trim_leading_whitespace_should_only_trim_line_prefix() {
        let source = "  a  \n\tb\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::TrimLeadingWhitespace);

        assert_eq!(result, "a  \nb\n");
    }

    #[test]
    fn trim_trailing_whitespace_should_only_trim_line_suffix() {
        let source = "  a  \n\tb\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::TrimTrailingWhitespace);

        assert_eq!(result, "  a\n\tb\n");
    }

    #[test]
    fn trim_surrounding_whitespace_should_trim_both_sides_per_line() {
        let source = "  a  \n\tb\n";
        let result =
            cleanup_document_lines(source, DocumentCleanupAction::TrimSurroundingWhitespace);

        assert_eq!(result, "a\nb\n");
    }

    #[test]
    fn sort_lines_ascending_should_sort_lines_lexicographically() {
        let source = "beta\nAlpha\nalpha\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::SortLinesAscending);

        assert_eq!(result, "Alpha\nalpha\nbeta\n");
    }

    #[test]
    fn sort_lines_ascending_ignore_case_should_sort_without_case_distinction() {
        let source = "beta\nAlpha\nalpha\n";
        let result =
            cleanup_document_lines(source, DocumentCleanupAction::SortLinesAscendingIgnoreCase);

        assert_eq!(result, "Alpha\nalpha\nbeta\n");
    }

    #[test]
    fn sort_lines_descending_should_sort_lines_reverse_lexicographically() {
        let source = "beta\nAlpha\nalpha\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::SortLinesDescending);

        assert_eq!(result, "beta\nalpha\nAlpha\n");
    }

    #[test]
    fn sort_lines_descending_ignore_case_should_sort_reverse_without_case_distinction() {
        let source = "beta\nAlpha\nalpha\n";
        let result =
            cleanup_document_lines(source, DocumentCleanupAction::SortLinesDescendingIgnoreCase);

        assert_eq!(result, "beta\nalpha\nAlpha\n");
    }

    #[test]
    fn sort_lines_by_pinyin_ascending_should_sort_chinese_lines_by_pinyin() {
        let source = "赵\n李\n王\n张\n";
        let result =
            cleanup_document_lines(source, DocumentCleanupAction::SortLinesByPinyinAscending);

        assert_eq!(result, "李\n王\n张\n赵\n");
    }

    #[test]
    fn sort_lines_by_pinyin_descending_should_sort_chinese_lines_by_pinyin_reverse() {
        let source = "赵\n李\n王\n张\n";
        let result =
            cleanup_document_lines(source, DocumentCleanupAction::SortLinesByPinyinDescending);

        assert_eq!(result, "赵\n张\n王\n李\n");
    }

    #[test]
    fn find_matching_pair_offsets_should_include_line_and_column_positions() {
        let payload = find_matching_pair_offsets_impl("a(\nxx)".to_string(), 2)
            .expect("pair lookup should succeed")
            .expect("pair should exist");
        assert_eq!(payload.left_offset, 1);
        assert_eq!(payload.right_offset, 5);
        assert_eq!(payload.left_line, 1);
        assert_eq!(payload.left_column, 2);
        assert_eq!(payload.right_line, 2);
        assert_eq!(payload.right_column, 3);
    }

    #[test]
    fn find_matching_pair_offsets_should_use_utf16_columns_for_surrogate_pairs() {
        let payload = find_matching_pair_offsets_impl("😀(x)".to_string(), 3)
            .expect("pair lookup should succeed")
            .expect("pair should exist");
        assert_eq!(payload.left_offset, 2);
        assert_eq!(payload.right_offset, 4);
        assert_eq!(payload.left_line, 1);
        assert_eq!(payload.left_column, 3);
        assert_eq!(payload.right_line, 1);
        assert_eq!(payload.right_column, 5);
    }
}
