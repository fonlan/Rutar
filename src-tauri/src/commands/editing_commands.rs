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
    editing::format_document_impl(state, id, mode, file_syntax, file_path, file_name, tab_width)
}
