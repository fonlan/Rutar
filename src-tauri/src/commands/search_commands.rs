use super::*;

#[tauri::command]
pub fn search_first_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    reverse: bool,
) -> Result<SearchFirstResultPayload, String> {
    search::search_first_in_document_impl(state, id, keyword, mode, case_sensitive, reverse)
}

#[tauri::command]
pub fn search_in_document_chunk(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    start_offset: usize,
    max_results: usize,
) -> Result<SearchChunkResultPayload, String> {
    search::search_in_document_chunk_impl(
        state,
        id,
        keyword,
        mode,
        case_sensitive,
        result_filter_keyword,
        start_offset,
        max_results,
    )
}

#[tauri::command]
pub fn search_count_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
) -> Result<SearchCountResultPayload, String> {
    search::search_count_in_document_impl(
        state,
        id,
        keyword,
        mode,
        case_sensitive,
        result_filter_keyword,
    )
}

#[tauri::command]
pub fn step_result_filter_search_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    current_start: Option<usize>,
    current_end: Option<usize>,
    step: i32,
    max_results: usize,
) -> Result<SearchResultFilterStepPayload, String> {
    search::step_result_filter_search_in_document_impl(
        state,
        id,
        keyword,
        mode,
        case_sensitive,
        result_filter_keyword,
        result_filter_case_sensitive,
        current_start,
        current_end,
        step,
        max_results,
    )
}

#[tauri::command]
pub fn filter_count_in_document(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
) -> Result<FilterCountResultPayload, String> {
    search::filter_count_in_document_impl(
        state,
        id,
        rules,
        result_filter_keyword,
        result_filter_case_sensitive,
    )
}

#[tauri::command]
pub fn filter_in_document_chunk(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    start_line: usize,
    max_results: usize,
) -> Result<FilterChunkResultPayload, String> {
    search::filter_in_document_chunk_impl(
        state,
        id,
        rules,
        result_filter_keyword,
        result_filter_case_sensitive,
        start_line,
        max_results,
    )
}

#[tauri::command]
pub fn step_result_filter_search_in_filter_document(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    current_line: Option<usize>,
    current_column: Option<usize>,
    step: i32,
    max_results: usize,
) -> Result<FilterResultFilterStepPayload, String> {
    search::step_result_filter_search_in_filter_document_impl(
        state,
        id,
        rules,
        result_filter_keyword,
        result_filter_case_sensitive,
        current_line,
        current_column,
        step,
        max_results,
    )
}

#[tauri::command]
pub fn search_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
) -> Result<SearchResultPayload, String> {
    search::search_in_document_impl(state, id, keyword, mode, case_sensitive)
}
