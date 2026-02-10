use super::*;

#[tauri::command]
pub async fn open_file(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    file_io::open_file_impl(state, path).await
}

#[tauri::command]
pub fn get_visible_lines_chunk(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<Vec<String>, String> {
    file_io::get_visible_lines_chunk_impl(state, id, start_line, end_line)
}

#[tauri::command]
pub fn get_visible_lines(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<String, String> {
    file_io::get_visible_lines_impl(state, id, start_line, end_line)
}

#[tauri::command]
pub fn close_file(state: State<'_, AppState>, id: String) {
    file_io::close_file_impl(state, id)
}

#[tauri::command]
pub async fn save_file(state: State<'_, AppState>, id: String) -> Result<(), String> {
    file_io::save_file_impl(state, id).await
}

#[tauri::command]
pub async fn save_file_as(state: State<'_, AppState>, id: String, path: String) -> Result<(), String> {
    file_io::save_file_as_impl(state, id, path).await
}

#[tauri::command]
pub fn convert_encoding(state: State<'_, AppState>, id: String, new_encoding: String) -> Result<(), String> {
    file_io::convert_encoding_impl(state, id, new_encoding)
}

#[tauri::command]
pub fn set_line_ending(state: State<'_, AppState>, id: String, new_line_ending: String) -> Result<(), String> {
    file_io::set_line_ending_impl(state, id, new_line_ending)
}

#[tauri::command]
pub fn set_document_syntax(
    state: State<'_, AppState>,
    id: String,
    syntax_override: Option<String>,
) -> Result<(), String> {
    file_io::set_document_syntax_impl(state, id, syntax_override)
}

#[tauri::command]
pub fn new_file(
    state: State<'_, AppState>,
    new_file_line_ending: Option<String>,
) -> Result<FileInfo, String> {
    file_io::new_file_impl(state, new_file_line_ending)
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    file_io::read_dir_impl(path)
}

#[tauri::command]
pub fn open_in_file_manager(path: String) -> Result<(), String> {
    file_io::open_in_file_manager_impl(path)
}

#[tauri::command]
pub async fn get_word_count_info(
    state: State<'_, AppState>,
    id: String,
) -> Result<WordCountInfo, String> {
    file_io::get_word_count_info_impl(state, id).await
}

#[tauri::command]
pub fn has_external_file_change(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    file_io::has_external_file_change_impl(state, id)
}

#[tauri::command]
pub fn acknowledge_external_file_change(state: State<'_, AppState>, id: String) -> Result<(), String> {
    file_io::acknowledge_external_file_change_impl(state, id)
}

#[tauri::command]
pub fn reload_file_from_disk(state: State<'_, AppState>, id: String) -> Result<FileInfo, String> {
    file_io::reload_file_from_disk_impl(state, id)
}
