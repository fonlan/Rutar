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
            is_dirty: doc.document_version != doc.saved_document_version
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

        let operation = EditOperation {
            start_char: start,
            old_text,
            new_text,
        };

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
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

        let operation = EditOperation {
            start_char,
            old_text,
            new_text,
        };

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

        let operation = EditOperation {
            start_char: computation.start_char,
            old_text: computation.old_text,
            new_text: computation.new_text,
        };

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

        let operation = EditOperation {
            start_char: 0,
            old_text: source,
            new_text: cleaned,
        };

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

        let operation = EditOperation {
            start_char: 0,
            old_text: source,
            new_text: formatted,
        };

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
    use super::{cleanup_document_lines, DocumentCleanupAction};

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
}
