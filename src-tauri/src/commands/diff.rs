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

#[cfg(test)]
mod tests {
    use super::{build_line_diff_result, normalize_rope_line_text};

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
}
