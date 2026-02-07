mod state;
mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_file, 
            commands::get_visible_lines,
            commands::get_visible_lines_chunk,
            commands::get_syntax_tokens,
            commands::close_file,
            commands::save_file,
            commands::save_file_as,
            commands::convert_encoding,
            commands::new_file,
            commands::read_dir,
            commands::undo,
            commands::redo,
            commands::edit_text,
            commands::replace_line_range,
            commands::search_first_in_document,
            commands::search_in_document_chunk,
            commands::search_count_in_document,
            commands::search_in_document,
            commands::get_document_version,
            commands::get_content_tree,
            commands::load_config,
            commands::save_config
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
    }
}
