mod state;
mod commands;

use state::AppState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            greet, 
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
            commands::replace_line_range
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
