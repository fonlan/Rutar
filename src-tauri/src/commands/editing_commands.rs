use super::*;

#[tauri::command]
pub fn undo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    editing::undo_impl(state, id)
}

#[tauri::command]
pub fn redo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    editing::redo_impl(state, id)
}

#[tauri::command]
pub fn get_edit_history_state(
    state: State<'_, AppState>,
    id: String,
) -> Result<EditHistoryState, String> {
    editing::get_edit_history_state_impl(state, id)
}

#[tauri::command]
pub fn edit_text(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    new_text: String,
) -> Result<usize, String> {
    editing::edit_text_impl(state, id, start_char, end_char, new_text)
}

#[tauri::command]
pub fn replace_line_range(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    new_text: String,
) -> Result<usize, String> {
    editing::replace_line_range_impl(state, id, start_line, end_line, new_text)
}

#[tauri::command]
pub fn cleanup_document(
    state: State<'_, AppState>,
    id: String,
    action: String,
) -> Result<usize, String> {
    editing::cleanup_document_impl(state, id, action)
}

#[tauri::command]
pub fn format_document(
    state: State<'_, AppState>,
    id: String,
    mode: String,
    file_syntax: Option<String>,
    file_path: Option<String>,
    file_name: Option<String>,
    tab_width: Option<u8>,
) -> Result<usize, String> {
    editing::format_document_impl(
        state,
        id,
        mode,
        file_syntax,
        file_path,
        file_name,
        tab_width,
    )
}

#[tauri::command]
pub fn toggle_line_comments(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    is_collapsed: bool,
    prefix: String,
) -> Result<editing::ToggleLineCommentsResultPayload, String> {
    editing::toggle_line_comments_impl(state, id, start_char, end_char, is_collapsed, prefix)
}

#[tauri::command]
pub fn convert_text_base64(text: String, action: String) -> Result<String, String> {
    editing::convert_text_base64_impl(text, action)
}

#[tauri::command]
pub fn find_matching_pair_offsets(
    text: String,
    offset: usize,
) -> Result<Option<editing::PairOffsetsResultPayload>, String> {
    editing::find_matching_pair_offsets_impl(text, offset)
}

#[tauri::command]
pub fn replace_rectangular_selection_text(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
    insert_text: String,
    collapse_to_start: bool,
) -> Result<editing::ReplaceRectangularSelectionResultPayload, String> {
    editing::replace_rectangular_selection_text_impl(
        text,
        start_line,
        end_line,
        start_column,
        end_column,
        insert_text,
        collapse_to_start,
    )
}

#[tauri::command]
pub fn get_rectangular_selection_text(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
) -> Result<String, String> {
    editing::get_rectangular_selection_text_impl(
        text,
        start_line,
        end_line,
        start_column,
        end_column,
    )
}
