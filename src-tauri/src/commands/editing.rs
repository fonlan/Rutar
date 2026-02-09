use super::*;

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
    let mut lines: Vec<String> = normalized.split('\n').map(|line| line.to_string()).collect();

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
        DocumentCleanupAction::TrimLeadingWhitespace => {
            lines.into_iter().map(|line| line.trim_start().to_string()).collect()
        }
        DocumentCleanupAction::TrimTrailingWhitespace => {
            lines.into_iter().map(|line| line.trim_end().to_string()).collect()
        }
        DocumentCleanupAction::TrimSurroundingWhitespace => {
            lines.into_iter().map(|line| line.trim().to_string()).collect()
        }
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
    file_path: Option<String>,
    file_name: Option<String>,
    tab_width: Option<u8>,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let source = doc.rope.to_string();
        let formatted = formatting::format_document_text(
            &source,
            mode.as_str(),
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
        let result = cleanup_document_lines(source, DocumentCleanupAction::TrimSurroundingWhitespace);

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
        let result = cleanup_document_lines(source, DocumentCleanupAction::SortLinesByPinyinAscending);

        assert_eq!(result, "李\n王\n张\n赵\n");
    }

    #[test]
    fn sort_lines_by_pinyin_descending_should_sort_chinese_lines_by_pinyin_reverse() {
        let source = "赵\n李\n王\n张\n";
        let result = cleanup_document_lines(source, DocumentCleanupAction::SortLinesByPinyinDescending);

        assert_eq!(result, "赵\n张\n王\n李\n");
    }
}
