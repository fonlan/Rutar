use super::*;
use similar::{Algorithm, ChangeTag, TextDiff};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineDiffResult {
    pub aligned_source_lines: Vec<String>,
    pub aligned_target_lines: Vec<String>,
    pub aligned_source_present: Vec<bool>,
    pub aligned_target_present: Vec<bool>,
    pub diff_line_numbers: Vec<usize>,
    pub source_diff_line_numbers: Vec<usize>,
    pub target_diff_line_numbers: Vec<usize>,
    pub source_line_count: usize,
    pub target_line_count: usize,
    pub aligned_line_count: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyAlignedDiffEditResult {
    pub line_diff: LineDiffResult,
    pub source_is_dirty: bool,
    pub target_is_dirty: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DiffEditSide {
    Source,
    Target,
}

impl DiffEditSide {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "source" => Ok(Self::Source),
            "target" => Ok(Self::Target),
            _ => Err("Invalid diff side".to_string()),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct TextPatch {
    start_char: usize,
    end_char: usize,
    new_text: String,
}

fn normalize_rope_line_text(mut value: String) -> String {
    if value.ends_with('\n') {
        value.pop();
        if value.ends_with('\r') {
            value.pop();
        }
    }

    value
}

fn load_document_lines(state: &State<'_, AppState>, id: &str) -> Result<Vec<String>, String> {
    let doc = state
        .documents
        .get(id)
        .ok_or_else(|| "Document not found".to_string())?;

    let line_count = doc.rope.len_lines();
    let mut lines = Vec::with_capacity(line_count);

    for index in 0..line_count {
        lines.push(normalize_rope_line_text(doc.rope.line(index).to_string()));
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    Ok(lines)
}

fn load_document_is_dirty(state: &State<'_, AppState>, id: &str) -> Result<bool, String> {
    let doc = state
        .documents
        .get(id)
        .ok_or_else(|| "Document not found".to_string())?;

    Ok(doc.has_unsaved_text_changes()
        || doc.encoding.name() != doc.saved_encoding
        || doc.line_ending != doc.saved_line_ending)
}

fn extract_actual_lines_from_aligned(aligned_lines: &[String], present: &[bool]) -> Vec<String> {
    let mut actual_lines: Vec<String> = Vec::new();

    for (index, line_text) in aligned_lines.iter().enumerate() {
        if present.get(index).copied().unwrap_or(false) {
            actual_lines.push(line_text.clone());
            continue;
        }

        if !line_text.is_empty() {
            actual_lines.push(line_text.clone());
        }
    }

    if actual_lines.is_empty() {
        actual_lines.push(String::new());
    }

    actual_lines
}

fn serialize_actual_lines(actual_lines: &[String], trailing_newline: bool) -> String {
    let mut result = if actual_lines.is_empty() {
        String::new()
    } else {
        actual_lines.join("\n")
    };

    if trailing_newline {
        result.push('\n');
    }

    result
}

fn compute_text_patch(previous_text: &str, next_text: &str) -> TextPatch {
    let previous_chars: Vec<char> = previous_text.chars().collect();
    let next_chars: Vec<char> = next_text.chars().collect();
    let previous_len = previous_chars.len();
    let next_len = next_chars.len();

    let mut start_char = 0usize;
    while start_char < previous_len
        && start_char < next_len
        && previous_chars[start_char] == next_chars[start_char]
    {
        start_char = start_char.saturating_add(1);
    }

    let mut previous_end = previous_len;
    let mut next_end = next_len;
    while previous_end > start_char
        && next_end > start_char
        && previous_chars[previous_end - 1] == next_chars[next_end - 1]
    {
        previous_end -= 1;
        next_end -= 1;
    }

    TextPatch {
        start_char,
        end_char: previous_end,
        new_text: next_chars[start_char..next_end].iter().collect(),
    }
}

fn apply_serialized_text_to_document(
    doc: &mut Document,
    next_text: String,
) -> Result<bool, String> {
    let previous_text = doc.rope.to_string();
    let patch = compute_text_patch(&previous_text, &next_text);

    if patch.start_char == patch.end_char && patch.new_text.is_empty() {
        return Ok(false);
    }

    let old_text = doc.rope.slice(patch.start_char..patch.end_char).to_string();
    if old_text == patch.new_text {
        return Ok(false);
    }

    let operation = editing::create_edit_operation(doc, patch.start_char, old_text, patch.new_text);
    editing::apply_operation(doc, &operation)?;
    doc.undo_stack.push(operation);
    doc.redo_stack.clear();

    Ok(true)
}

fn push_aligned_line(
    source: Option<String>,
    target: Option<String>,
    aligned_source_lines: &mut Vec<String>,
    aligned_target_lines: &mut Vec<String>,
    aligned_source_present: &mut Vec<bool>,
    aligned_target_present: &mut Vec<bool>,
    diff_line_numbers: &mut Vec<usize>,
) {
    let source_present = source.is_some();
    let target_present = target.is_some();
    let source_text = source.unwrap_or_default();
    let target_text = target.unwrap_or_default();
    let line_number = aligned_source_lines.len() + 1;
    if source_text != target_text {
        diff_line_numbers.push(line_number);
    }

    aligned_source_lines.push(source_text);
    aligned_target_lines.push(target_text);
    aligned_source_present.push(source_present);
    aligned_target_present.push(target_present);
}

fn flush_pending_changes(
    pending_deletes: &mut Vec<String>,
    pending_inserts: &mut Vec<String>,
    aligned_source_lines: &mut Vec<String>,
    aligned_target_lines: &mut Vec<String>,
    aligned_source_present: &mut Vec<bool>,
    aligned_target_present: &mut Vec<bool>,
    diff_line_numbers: &mut Vec<usize>,
) {
    let row_count = pending_deletes.len().max(pending_inserts.len());

    for row in 0..row_count {
        let source = pending_deletes.get(row).cloned();
        let target = pending_inserts.get(row).cloned();
        push_aligned_line(
            source,
            target,
            aligned_source_lines,
            aligned_target_lines,
            aligned_source_present,
            aligned_target_present,
            diff_line_numbers,
        );
    }

    pending_deletes.clear();
    pending_inserts.clear();
}

fn build_line_diff_result(source_lines: Vec<String>, target_lines: Vec<String>) -> LineDiffResult {
    let mut aligned_source_lines = Vec::new();
    let mut aligned_target_lines = Vec::new();
    let mut aligned_source_present = Vec::new();
    let mut aligned_target_present = Vec::new();
    let mut diff_line_numbers = Vec::new();
    let mut source_diff_line_numbers = Vec::new();
    let mut target_diff_line_numbers = Vec::new();
    let mut pending_deletes: Vec<String> = Vec::new();
    let mut pending_inserts: Vec<String> = Vec::new();
    let mut source_line_cursor = 0usize;
    let mut target_line_cursor = 0usize;

    let source_refs: Vec<&str> = source_lines.iter().map(String::as_str).collect();
    let target_refs: Vec<&str> = target_lines.iter().map(String::as_str).collect();

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .diff_slices(&source_refs, &target_refs);

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                flush_pending_changes(
                    &mut pending_deletes,
                    &mut pending_inserts,
                    &mut aligned_source_lines,
                    &mut aligned_target_lines,
                    &mut aligned_source_present,
                    &mut aligned_target_present,
                    &mut diff_line_numbers,
                );

                push_aligned_line(
                    Some(change.value().to_string()),
                    Some(change.value().to_string()),
                    &mut aligned_source_lines,
                    &mut aligned_target_lines,
                    &mut aligned_source_present,
                    &mut aligned_target_present,
                    &mut diff_line_numbers,
                );
                source_line_cursor = source_line_cursor.saturating_add(1);
                target_line_cursor = target_line_cursor.saturating_add(1);
            }
            ChangeTag::Delete => {
                pending_deletes.push(change.value().to_string());
                source_diff_line_numbers.push(source_line_cursor.saturating_add(1));
                source_line_cursor = source_line_cursor.saturating_add(1);
            }
            ChangeTag::Insert => {
                pending_inserts.push(change.value().to_string());
                target_diff_line_numbers.push(target_line_cursor.saturating_add(1));
                target_line_cursor = target_line_cursor.saturating_add(1);
            }
        }
    }

    flush_pending_changes(
        &mut pending_deletes,
        &mut pending_inserts,
        &mut aligned_source_lines,
        &mut aligned_target_lines,
        &mut aligned_source_present,
        &mut aligned_target_present,
        &mut diff_line_numbers,
    );

    if aligned_source_lines.is_empty() {
        aligned_source_lines.push(String::new());
        aligned_target_lines.push(String::new());
        aligned_source_present.push(true);
        aligned_target_present.push(true);
    }

    source_diff_line_numbers.sort_unstable();
    source_diff_line_numbers.dedup();
    target_diff_line_numbers.sort_unstable();
    target_diff_line_numbers.dedup();

    LineDiffResult {
        source_line_count: source_lines.len(),
        target_line_count: target_lines.len(),
        aligned_line_count: aligned_source_lines.len(),
        aligned_source_lines,
        aligned_target_lines,
        aligned_source_present,
        aligned_target_present,
        diff_line_numbers,
        source_diff_line_numbers,
        target_diff_line_numbers,
    }
}

pub(super) async fn compare_documents_by_line_impl(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<LineDiffResult, String> {
    let source_lines = load_document_lines(&state, &source_id)?;
    let target_lines = load_document_lines(&state, &target_id)?;

    tauri::async_runtime::spawn_blocking(move || build_line_diff_result(source_lines, target_lines))
        .await
        .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn apply_aligned_diff_edit_impl(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
    edited_side: String,
    aligned_source_lines: Vec<String>,
    aligned_target_lines: Vec<String>,
    aligned_source_present: Vec<bool>,
    aligned_target_present: Vec<bool>,
    edited_trailing_newline: bool,
) -> Result<ApplyAlignedDiffEditResult, String> {
    let side = DiffEditSide::parse(edited_side.as_str())?;
    let (edited_id, edited_lines, edited_present) = match side {
        DiffEditSide::Source => (
            source_id.as_str(),
            &aligned_source_lines,
            &aligned_source_present,
        ),
        DiffEditSide::Target => (
            target_id.as_str(),
            &aligned_target_lines,
            &aligned_target_present,
        ),
    };

    let actual_lines = extract_actual_lines_from_aligned(edited_lines, edited_present);
    let next_text = serialize_actual_lines(&actual_lines, edited_trailing_newline);

    {
        let mut doc = state
            .documents
            .get_mut(edited_id)
            .ok_or_else(|| "Document not found".to_string())?;
        let _ = apply_serialized_text_to_document(&mut doc, next_text)?;
    }

    let source_lines = load_document_lines(&state, &source_id)?;
    let target_lines = load_document_lines(&state, &target_id)?;
    let source_is_dirty = load_document_is_dirty(&state, &source_id)?;
    let target_is_dirty = load_document_is_dirty(&state, &target_id)?;

    let line_diff = tauri::async_runtime::spawn_blocking(move || {
        build_line_diff_result(source_lines, target_lines)
    })
    .await
    .map_err(|error| error.to_string())?;

    Ok(ApplyAlignedDiffEditResult {
        line_diff,
        source_is_dirty,
        target_is_dirty,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        apply_serialized_text_to_document, build_line_diff_result, compute_text_patch,
        extract_actual_lines_from_aligned, normalize_rope_line_text, serialize_actual_lines,
    };
    use crate::state::{default_line_ending, Document};
    use encoding_rs::UTF_8;
    use ropey::Rope;

    fn make_document(text: &str) -> Document {
        let rope = Rope::from_str(text);
        Document {
            rope,
            encoding: UTF_8,
            saved_encoding: UTF_8.name().to_string(),
            line_ending: default_line_ending(),
            saved_line_ending: default_line_ending(),
            path: None,
            syntax_override: None,
            document_version: 0,
            saved_document_version: 0,
            next_edit_operation_id: 1,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            saved_undo_depth: 0,
            saved_undo_operation_id: None,
            parser: None,
            tree: None,
            language: None,
            syntax_dirty: false,
            saved_file_fingerprint: None,
        }
    }

    #[test]
    fn normalize_rope_line_text_should_strip_trailing_newline_pairs() {
        assert_eq!(normalize_rope_line_text("alpha\n".to_string()), "alpha");
        assert_eq!(normalize_rope_line_text("beta\r\n".to_string()), "beta");
        assert_eq!(normalize_rope_line_text("gamma".to_string()), "gamma");
        assert_eq!(normalize_rope_line_text("delta\r".to_string()), "delta\r");
    }

    #[test]
    fn build_line_diff_result_should_keep_equal_lines_without_diffs() {
        let result = build_line_diff_result(
            vec!["one".to_string(), "two".to_string()],
            vec!["one".to_string(), "two".to_string()],
        );

        assert_eq!(result.source_line_count, 2);
        assert_eq!(result.target_line_count, 2);
        assert_eq!(result.aligned_line_count, 2);
        assert_eq!(result.aligned_source_lines, vec!["one", "two"]);
        assert_eq!(result.aligned_target_lines, vec!["one", "two"]);
        assert_eq!(result.aligned_source_present, vec![true, true]);
        assert_eq!(result.aligned_target_present, vec![true, true]);
        assert!(result.diff_line_numbers.is_empty());
        assert!(result.source_diff_line_numbers.is_empty());
        assert!(result.target_diff_line_numbers.is_empty());
    }

    #[test]
    fn build_line_diff_result_should_align_insertions_with_source_placeholders() {
        let result = build_line_diff_result(
            vec!["a".to_string(), "c".to_string()],
            vec!["a".to_string(), "b".to_string(), "c".to_string()],
        );

        assert_eq!(result.aligned_source_lines, vec!["a", "", "c"]);
        assert_eq!(result.aligned_target_lines, vec!["a", "b", "c"]);
        assert_eq!(result.aligned_source_present, vec![true, false, true]);
        assert_eq!(result.aligned_target_present, vec![true, true, true]);
        assert_eq!(result.diff_line_numbers, vec![2]);
        assert!(result.source_diff_line_numbers.is_empty());
        assert_eq!(result.target_diff_line_numbers, vec![2]);
    }

    #[test]
    fn build_line_diff_result_should_align_deletions_with_target_placeholders() {
        let result = build_line_diff_result(
            vec!["a".to_string(), "b".to_string(), "c".to_string()],
            vec!["a".to_string(), "c".to_string()],
        );

        assert_eq!(result.aligned_source_lines, vec!["a", "b", "c"]);
        assert_eq!(result.aligned_target_lines, vec!["a", "", "c"]);
        assert_eq!(result.aligned_source_present, vec![true, true, true]);
        assert_eq!(result.aligned_target_present, vec![true, false, true]);
        assert_eq!(result.diff_line_numbers, vec![2]);
        assert_eq!(result.source_diff_line_numbers, vec![2]);
        assert!(result.target_diff_line_numbers.is_empty());
    }

    #[test]
    fn build_line_diff_result_should_return_single_empty_row_for_empty_inputs() {
        let result = build_line_diff_result(Vec::new(), Vec::new());

        assert_eq!(result.source_line_count, 0);
        assert_eq!(result.target_line_count, 0);
        assert_eq!(result.aligned_line_count, 1);
        assert_eq!(result.aligned_source_lines, vec![""]);
        assert_eq!(result.aligned_target_lines, vec![""]);
        assert_eq!(result.aligned_source_present, vec![true]);
        assert_eq!(result.aligned_target_present, vec![true]);
        assert!(result.diff_line_numbers.is_empty());
    }

    #[test]
    fn extract_actual_lines_from_aligned_should_keep_present_and_nonempty_placeholder_lines() {
        let actual = extract_actual_lines_from_aligned(
            &["one".to_string(), String::new(), "ghost".to_string()],
            &[true, false, false],
        );

        assert_eq!(actual, vec!["one", "ghost"]);
    }

    #[test]
    fn serialize_actual_lines_should_keep_trailing_newline_when_requested() {
        let actual = vec!["a".to_string(), "b".to_string()];
        assert_eq!(serialize_actual_lines(&actual, false), "a\nb");
        assert_eq!(serialize_actual_lines(&actual, true), "a\nb\n");
        assert_eq!(serialize_actual_lines(&[], false), "");
    }

    #[test]
    fn compute_text_patch_should_use_unicode_scalar_offsets() {
        let patch = compute_text_patch("A😀C", "A😃C");
        assert_eq!(patch.start_char, 1);
        assert_eq!(patch.end_char, 2);
        assert_eq!(patch.new_text, "😃");
    }

    #[test]
    fn apply_serialized_text_to_document_should_apply_change_and_record_history() {
        let mut doc = make_document("alpha\nbeta\n");
        let changed = apply_serialized_text_to_document(&mut doc, "alpha\nBETA\n".to_string())
            .expect("diff edit should apply");

        assert!(changed);
        assert_eq!(doc.rope.to_string(), "alpha\nBETA\n");
        assert_eq!(doc.undo_stack.len(), 1);
        assert!(doc.redo_stack.is_empty());
        assert_eq!(doc.document_version, 1);
    }
}
