use super::path_search::{
    self, PathReplaceApplyPayload, PathReplacePreviewPayload, PathSearchNextPayload,
    PathSearchStartPayload,
};

#[tauri::command]
pub fn path_search_start(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    max_results: usize,
) -> Result<PathSearchStartPayload, String> {
    path_search::path_search_start_impl(target, keyword, mode, case_sensitive, max_results)
}

#[tauri::command]
pub fn path_search_next(
    session_id: String,
    max_results: usize,
) -> Result<PathSearchNextPayload, String> {
    path_search::path_search_next_impl(session_id, max_results)
}

#[tauri::command]
pub fn path_search_dispose(session_id: String) -> bool {
    path_search::path_search_dispose_impl(session_id)
}

#[tauri::command]
pub fn path_replace_preview(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
) -> Result<PathReplacePreviewPayload, String> {
    path_search::path_replace_preview_impl(target, keyword, mode, case_sensitive)
}

#[tauri::command]
pub fn path_replace_apply(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    parse_escape_sequences: bool,
) -> Result<PathReplaceApplyPayload, String> {
    path_search::path_replace_apply_impl(
        target,
        keyword,
        mode,
        case_sensitive,
        replace_value,
        parse_escape_sequences,
    )
}
