mod state;
mod commands;

use state::AppState;
use tauri::{AppHandle, Emitter, Manager};

fn collect_valid_startup_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    args.into_iter()
        .filter(|value| {
            if value.starts_with('-') {
                return false;
            }

            std::path::Path::new(value).exists()
        })
        .collect()
}

fn forward_startup_paths_to_main_window(app: &AppHandle, startup_paths: Vec<String>) {
    if startup_paths.is_empty() {
        return;
    }

    let window = match app.get_webview_window("main") {
        Some(main_window) => main_window,
        None => return,
    };

    if let Err(error) = window.emit("rutar://open-paths", startup_paths) {
        eprintln!("failed to forward startup paths to main window: {error}");
    }

    if let Err(error) = window.show() {
        eprintln!("failed to show main window: {error}");
    }

    if let Err(error) = window.set_focus() {
        eprintln!("failed to focus main window: {error}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_paths = collect_valid_startup_paths_from_args(std::env::args().skip(1));

    let single_instance_mode_enabled = commands::is_single_instance_mode_enabled_in_config();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    if single_instance_mode_enabled {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let startup_paths = collect_valid_startup_paths_from_args(args.into_iter().skip(1));
            forward_startup_paths_to_main_window(app, startup_paths);
        }));
    }

    if let Err(err) = builder
        .manage(AppState::new(startup_paths))
        .invoke_handler(tauri::generate_handler![
            commands::open_file, 
            commands::get_visible_lines,
            commands::get_visible_lines_chunk,
            commands::get_syntax_tokens,
            commands::close_file,
            commands::save_file,
            commands::save_file_as,
            commands::convert_encoding,
            commands::set_line_ending,
            commands::set_document_syntax,
            commands::new_file,
            commands::read_dir,
            commands::open_in_file_manager,
            commands::undo,
            commands::redo,
            commands::edit_text,
            commands::replace_line_range,
            commands::cleanup_document,
            commands::format_document,
            commands::search_first_in_document,
            commands::search_in_document_chunk,
            commands::step_result_filter_search_in_document,
            commands::search_count_in_document,
            commands::filter_in_document_chunk,
            commands::step_result_filter_search_in_filter_document,
            commands::filter_count_in_document,
            commands::search_in_document,
            commands::get_document_version,
            commands::get_outline,
            commands::load_config,
            commands::save_config,
            commands::load_filter_rule_groups_config,
            commands::save_filter_rule_groups_config,
            commands::import_filter_rule_groups,
            commands::export_filter_rule_groups,
            commands::register_windows_context_menu,
            commands::unregister_windows_context_menu,
            commands::is_windows_context_menu_registered,
            commands::get_default_windows_file_association_extensions,
            commands::apply_windows_file_associations,
            commands::remove_windows_file_associations,
            commands::get_windows_file_association_status,
            commands::get_startup_paths
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
    }
}
