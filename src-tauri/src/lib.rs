mod commands;
mod state;

use state::AppState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalSize, Size, WebviewWindow, WindowEvent};

#[derive(Clone, serde::Serialize)]
struct ExternalFileChangeEventPayload {
    id: String,
}

#[tauri::command]
fn show_main_window_when_ready(window: WebviewWindow) -> Result<(), String> {
    wake_main_window(&window);
    Ok(())
}

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
    let window = match app.get_webview_window("main") {
        Some(main_window) => main_window,
        None => return,
    };

    wake_main_window(&window);

    if startup_paths.is_empty() {
        return;
    }

    if let Err(error) = window.emit("rutar://open-paths", startup_paths) {
        eprintln!("failed to forward startup paths to main window: {error}");
    }
}

fn wake_main_window(window: &WebviewWindow) {
    if matches!(window.is_minimized(), Ok(true)) {
        if let Err(error) = window.unminimize() {
            eprintln!("failed to unminimize main window: {error}");
        }
    }

    if let Err(error) = window.show() {
        eprintln!("failed to show main window: {error}");
    }

    if let Err(error) = window.set_focus() {
        eprintln!("failed to focus main window: {error}");
    }
}

fn restore_main_window_state(window: &WebviewWindow) {
    let Some(window_state) = commands::load_main_window_state_in_config() else {
        return;
    };

    if window_state.maximized {
        if let Err(error) = window.maximize() {
            eprintln!("failed to restore main window maximized state: {error}");
        }
        return;
    }

    if let (Some(width), Some(height)) = (window_state.width, window_state.height) {
        if let Err(error) = window.set_size(Size::Physical(PhysicalSize::new(width, height))) {
            eprintln!("failed to restore main window size: {error}");
        }
    }
}

fn persist_main_window_state(window: &WebviewWindow) {
    if !commands::is_remember_window_state_enabled_in_config() {
        return;
    }

    let maximized = window.is_maximized().unwrap_or(false);

    let (width, height) = if maximized {
        (None, None)
    } else {
        match window.outer_size() {
            Ok(size) => (Some(size.width), Some(size.height)),
            Err(error) => {
                eprintln!("failed to read main window size: {error}");
                (None, None)
            }
        }
    };

    if let Err(error) = commands::save_main_window_state_in_config(width, height, maximized) {
        eprintln!("failed to persist main window state: {error}");
    }
}

fn setup_main_window_state_tracking(app: &AppHandle) {
    let Some(main_window) = app.get_webview_window("main") else {
        return;
    };

    restore_main_window_state(&main_window);

    let main_window_for_events = main_window.clone();
    main_window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            persist_main_window_state(&main_window_for_events);
        }
    });
}

fn setup_external_file_change_tracking(app: &AppHandle) {
    let app_handle = app.clone();

    let _ = std::thread::Builder::new()
        .name("rutar-external-change-tracker".to_string())
        .spawn(move || loop {
            let changed_ids =
                commands::collect_external_file_change_document_ids(app_handle.state::<AppState>());

            if !changed_ids.is_empty() {
                if let Some(window) = app_handle.get_webview_window("main") {
                    for id in changed_ids {
                        let payload = ExternalFileChangeEventPayload { id };
                        if let Err(error) = window.emit("rutar://external-file-changed", payload) {
                            eprintln!("failed to emit external file change event: {error}");
                        }
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(1200));
        });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_paths = collect_valid_startup_paths_from_args(std::env::args().skip(1));

    let single_instance_mode_enabled = commands::is_single_instance_mode_enabled_in_config();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup_main_window_state_tracking(app.handle());
            setup_external_file_change_tracking(app.handle());
            Ok(())
        });

    if single_instance_mode_enabled {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let startup_paths = collect_valid_startup_paths_from_args(args.into_iter().skip(1));
            forward_startup_paths_to_main_window(app, startup_paths);
        }));
    }

    if let Err(err) = builder
        .manage(AppState::new(startup_paths))
        .invoke_handler(tauri::generate_handler![
            commands::file_io_commands::open_file,
            commands::file_io_commands::open_files,
            commands::file_io_commands::get_visible_lines,
            commands::file_io_commands::get_visible_lines_chunk,
            commands::file_io_commands::get_bookmark_line_previews,
            commands::get_syntax_tokens,
            commands::get_syntax_token_lines,
            commands::file_io_commands::close_file,
            commands::file_io_commands::close_files,
            commands::file_io_commands::save_file,
            commands::file_io_commands::save_files,
            commands::file_io_commands::save_file_as,
            commands::file_io_commands::convert_encoding,
            commands::file_io_commands::set_line_ending,
            commands::file_io_commands::set_document_syntax,
            commands::file_io_commands::new_file,
            commands::file_io_commands::read_dir,
            commands::file_io_commands::read_dir_if_directory,
            commands::file_io_commands::open_in_file_manager,
            commands::file_io_commands::get_word_count_info,
            commands::file_io_commands::has_external_file_change,
            commands::file_io_commands::acknowledge_external_file_change,
            commands::file_io_commands::reload_file_from_disk,
            commands::editing_commands::undo,
            commands::editing_commands::redo,
            commands::editing_commands::get_edit_history_state,
            commands::editing_commands::edit_text,
            commands::editing_commands::replace_line_range,
            commands::editing_commands::toggle_line_comments,
            commands::editing_commands::convert_text_base64,
            commands::editing_commands::find_matching_pair_offsets,
            commands::editing_commands::replace_rectangular_selection_text,
            commands::editing_commands::get_rectangular_selection_text,
            commands::editing_commands::cleanup_document,
            commands::editing_commands::format_document,
            commands::search_commands::search_first_in_document,
            commands::search_commands::search_in_document_chunk,
            commands::search_commands::step_result_filter_search_in_document,
            commands::search_commands::search_count_in_document,
            commands::search_commands::replace_all_in_document,
            commands::search_commands::replace_all_and_search_chunk_in_document,
            commands::search_commands::replace_current_in_document,
            commands::search_commands::replace_current_and_search_chunk_in_document,
            commands::search_commands::filter_in_document_chunk,
            commands::search_commands::step_result_filter_search_in_filter_document,
            commands::search_commands::filter_count_in_document,
            commands::search_commands::search_in_document,
            commands::get_document_version,
            commands::compare_documents_by_line,
            commands::get_outline,
            commands::filter_outline_nodes,
            commands::list_system_fonts,
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
            commands::get_startup_paths,
            show_main_window_when_ready
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::collect_valid_startup_paths_from_args;
    use std::fs;
    use std::path::PathBuf;

    fn make_temp_workspace() -> (PathBuf, String, String, String) {
        let root = std::env::temp_dir().join(format!(
            "rutar-lib-tests-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ));

        let existing_dir = root.join("folder");
        let existing_file = root.join("file.txt");
        let missing_file = root.join("missing.txt");

        fs::create_dir_all(&existing_dir).expect("failed to create temp dir");
        fs::write(&existing_file, "hello").expect("failed to create temp file");

        (
            root,
            existing_file.to_string_lossy().to_string(),
            existing_dir.to_string_lossy().to_string(),
            missing_file.to_string_lossy().to_string(),
        )
    }

    #[test]
    fn collect_valid_startup_paths_from_args_should_keep_only_existing_non_option_paths() {
        let (root, existing_file, existing_dir, missing_file) = make_temp_workspace();

        let args = vec![
            "--verbose".to_string(),
            existing_file.clone(),
            missing_file,
            existing_dir.clone(),
            "-x".to_string(),
        ];

        let paths = collect_valid_startup_paths_from_args(args);
        assert_eq!(paths, vec![existing_file, existing_dir]);

        let _ = fs::remove_dir_all(root);
    }
}
