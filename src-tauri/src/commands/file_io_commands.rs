use super::*;

#[tauri::command]
pub async fn open_file(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    file_io::open_file_impl(state, path).await
}

#[tauri::command]
pub async fn open_files(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<file_io::OpenFileBatchResultItem>, String> {
    Ok(file_io::open_files_impl(state, paths).await)
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
pub fn get_bookmark_line_previews(
    state: State<'_, AppState>,
    id: String,
    lines: Vec<usize>,
) -> Result<Vec<String>, String> {
    file_io::get_bookmark_line_previews_impl(state, id, lines)
}

#[tauri::command]
pub fn close_file(state: State<'_, AppState>, id: String) {
    file_io::close_file_impl(state, id)
}

#[tauri::command]
pub fn close_files(state: State<'_, AppState>, ids: Vec<String>) {
    file_io::close_files_impl(state, ids)
}

#[tauri::command]
pub async fn save_file(state: State<'_, AppState>, id: String) -> Result<(), String> {
    file_io::save_file_impl(state, id).await
}

#[tauri::command]
pub async fn save_files(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Vec<file_io::SaveFileBatchResultItem>, String> {
    Ok(file_io::save_files_impl(state, ids).await)
}

#[tauri::command]
pub async fn save_file_as(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> Result<(), String> {
    file_io::save_file_as_impl(state, id, path).await
}

#[tauri::command]
pub fn convert_encoding(
    state: State<'_, AppState>,
    id: String,
    new_encoding: String,
) -> Result<(), String> {
    file_io::convert_encoding_impl(state, id, new_encoding)
}

#[tauri::command]
pub fn set_line_ending(
    state: State<'_, AppState>,
    id: String,
    new_line_ending: String,
) -> Result<(), String> {
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
pub fn read_dir_if_directory(path: String) -> Result<Option<Vec<DirEntry>>, String> {
    file_io::read_dir_if_directory_impl(path)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    file_io::path_exists_impl(path)
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
pub fn acknowledge_external_file_change(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    file_io::acknowledge_external_file_change_impl(state, id)
}

#[tauri::command]
pub fn reload_file_from_disk(state: State<'_, AppState>, id: String) -> Result<FileInfo, String> {
    file_io::reload_file_from_disk_impl(state, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn make_temp_dir_with_entries() -> (PathBuf, String, String) {
        let root = std::env::temp_dir().join(format!(
            "rutar-file-io-cmd-tests-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ));
        let child_dir = root.join("folder");
        let child_file = root.join("file.txt");

        fs::create_dir_all(&child_dir).expect("failed to create child directory");
        fs::write(&child_file, "data").expect("failed to create child file");

        (
            root,
            child_dir.to_string_lossy().to_string(),
            child_file.to_string_lossy().to_string(),
        )
    }

    #[test]
    fn read_dir_wrapper_should_return_expected_sorted_entries() {
        let (root, child_dir, child_file) = make_temp_dir_with_entries();
        let root_path = root.to_string_lossy().to_string();

        let entries = read_dir(root_path).expect("read_dir should succeed");
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].path, child_dir);
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].path, child_file);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_dir_if_directory_wrapper_should_return_none_for_file_path() {
        let (root, _child_dir, child_file) = make_temp_dir_with_entries();
        let root_path = root.to_string_lossy().to_string();

        let dir_entries = read_dir_if_directory(root_path)
            .expect("read_dir_if_directory should succeed for directory");
        assert!(dir_entries.is_some());

        let file_entries = read_dir_if_directory(child_file)
            .expect("read_dir_if_directory should succeed for file");
        assert!(file_entries.is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_exists_wrapper_should_reflect_file_system_state() {
        let (root, _child_dir, child_file) = make_temp_dir_with_entries();
        let missing_file = root.join("missing.txt").to_string_lossy().to_string();

        assert!(path_exists(child_file));
        assert!(!path_exists(missing_file));

        let _ = fs::remove_dir_all(root);
    }
}
