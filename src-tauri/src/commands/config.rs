use super::*;

use std::path::PathBuf;

#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, SHCNF_IDLIST,
};
#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
#[cfg(windows)]
use winreg::RegKey;

fn normalize_filter_rule_input(rule: FilterRuleInput) -> Option<FilterRuleInput> {
    let keyword = rule.keyword.trim().to_string();
    if keyword.is_empty() {
        return None;
    }

    let match_mode = match parse_filter_match_mode(&rule.match_mode).ok()? {
        FilterMatchMode::Contains => "contains".to_string(),
        FilterMatchMode::Regex => "regex".to_string(),
        FilterMatchMode::Wildcard => "wildcard".to_string(),
    };

    let apply_to = match parse_filter_apply_to(&rule.apply_to).ok()? {
        FilterApplyTo::Line => "line".to_string(),
        FilterApplyTo::Match => "match".to_string(),
    };

    let background_color = rule.background_color.trim().to_string();

    let text_color = if rule.text_color.trim().is_empty() {
        DEFAULT_FILTER_RULE_TEXT.to_string()
    } else {
        rule.text_color
    };

    Some(FilterRuleInput {
        keyword,
        match_mode,
        background_color,
        text_color,
        bold: rule.bold,
        italic: rule.italic,
        apply_to,
    })
}

fn normalize_filter_rule_groups(
    groups: Option<Vec<FilterRuleGroupConfig>>,
) -> Option<Vec<FilterRuleGroupConfig>> {
    let normalized_groups: Vec<FilterRuleGroupConfig> = groups
        .unwrap_or_default()
        .into_iter()
        .filter_map(|group| {
            let name = group.name.trim().to_string();
            if name.is_empty() {
                return None;
            }

            let rules: Vec<FilterRuleInput> = group
                .rules
                .into_iter()
                .filter_map(normalize_filter_rule_input)
                .collect();

            if rules.is_empty() {
                return None;
            }

            Some(FilterRuleGroupConfig { name, rules })
        })
        .collect();

    if normalized_groups.is_empty() {
        None
    } else {
        Some(normalized_groups)
    }
}

fn normalize_windows_file_association_extension(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut normalized = trimmed.replace('*', "");
    if !normalized.starts_with('.') {
        normalized = format!(".{}", normalized);
    }

    let normalized = normalized.to_lowercase();
    if normalized.len() < 2 {
        return None;
    }

    let is_valid = normalized
        .chars()
        .skip(1)
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '+'));

    if !is_valid {
        return None;
    }

    Some(normalized)
}

fn normalize_windows_file_association_extensions(extensions: Option<Vec<String>>) -> Vec<String> {
    let mut unique_extensions = BTreeSet::new();

    for extension in extensions.unwrap_or_default() {
        if let Some(normalized) = normalize_windows_file_association_extension(extension.as_str()) {
            unique_extensions.insert(normalized);
        }
    }

    if unique_extensions.is_empty() {
        return settings::default_windows_file_association_extensions();
    }

    unique_extensions.into_iter().collect()
}

fn normalize_recent_paths(paths: Option<Vec<String>>) -> Vec<String> {
    let mut normalized_paths: Vec<String> = Vec::new();

    for path in paths.unwrap_or_default() {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            continue;
        }

        if normalized_paths.iter().any(|item| item == trimmed) {
            continue;
        }

        normalized_paths.push(trimmed.to_string());

        if normalized_paths.len() >= MAX_RECENT_PATHS {
            break;
        }
    }

    normalized_paths
}

fn normalize_mouse_gesture_pattern(value: &str) -> String {
    value
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|ch| matches!(ch, 'L' | 'R' | 'U' | 'D'))
        .take(8)
        .collect()
}

fn is_valid_mouse_gesture_action(value: &str) -> bool {
    matches!(
        value,
        "previousTab"
            | "nextTab"
            | "toTop"
            | "toBottom"
            | "closeCurrentTab"
            | "closeAllTabs"
            | "closeOtherTabs"
            | "quitApp"
            | "toggleSidebar"
            | "toggleOutline"
            | "toggleBookmarkSidebar"
            | "toggleWordWrap"
            | "openSettings"
    )
}

fn normalize_mouse_gestures(
    gestures: Option<Vec<settings::MouseGestureConfig>>,
) -> Vec<settings::MouseGestureConfig> {
    if matches!(gestures.as_ref(), Some(list) if list.is_empty()) {
        return Vec::new();
    }

    let mut normalized = Vec::new();
    let mut seen_patterns: BTreeSet<String> = BTreeSet::new();

    for gesture in gestures.unwrap_or_default() {
        let pattern = normalize_mouse_gesture_pattern(gesture.pattern.as_str());
        if pattern.is_empty() {
            continue;
        }

        if !is_valid_mouse_gesture_action(gesture.action.as_str()) {
            continue;
        }

        if !seen_patterns.insert(pattern.clone()) {
            continue;
        }

        normalized.push(settings::MouseGestureConfig {
            pattern,
            action: gesture.action,
        });
    }

    if normalized.is_empty() {
        return settings::AppConfig::default().mouse_gestures;
    }

    normalized
}

fn normalize_window_state(
    window_state: Option<settings::WindowStateConfig>,
) -> Option<settings::WindowStateConfig> {
    window_state.map(|state| {
        let width = state.width.filter(|value| *value > 0);
        let height = state.height.filter(|value| *value > 0);

        settings::WindowStateConfig {
            width,
            height,
            maximized: state.maximized,
        }
    })
}

fn normalize_app_config(config: AppConfig) -> AppConfig {
    AppConfig {
        language: settings::normalize_language(Some(config.language.as_str())),
        theme: settings::normalize_theme(Some(config.theme.as_str())),
        font_family: if config.font_family.trim().is_empty() {
            DEFAULT_FONT_FAMILY.to_string()
        } else {
            config.font_family
        },
        font_size: config.font_size.clamp(8, 72),
        tab_width: settings::normalize_tab_width(config.tab_width),
        new_file_line_ending: settings::normalize_new_file_line_ending(Some(
            config.new_file_line_ending.as_str(),
        )),
        word_wrap: config.word_wrap,
        double_click_close_tab: config.double_click_close_tab,
        show_line_numbers: config.show_line_numbers,
        highlight_current_line: config.highlight_current_line,
        single_instance_mode: config.single_instance_mode,
        remember_window_state: config.remember_window_state,
        recent_files: normalize_recent_paths(Some(config.recent_files)),
        recent_folders: normalize_recent_paths(Some(config.recent_folders)),
        windows_file_association_extensions: normalize_windows_file_association_extensions(Some(
            config.windows_file_association_extensions,
        )),
        mouse_gestures_enabled: config.mouse_gestures_enabled,
        mouse_gestures: normalize_mouse_gestures(Some(config.mouse_gestures)),
        window_state: normalize_window_state(config.window_state),
        filter_rule_groups: normalize_filter_rule_groups(config.filter_rule_groups),
    }
}

#[cfg(windows)]
fn context_menu_display_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "使用 Rutar 打开",
        _ => "Open with Rutar",
    }
}

#[cfg(windows)]
const WIN_FILE_SHELL_KEY: &str = r"Software\Classes\*\shell\Rutar";
#[cfg(windows)]
const WIN_DIR_SHELL_KEY: &str = r"Software\Classes\Directory\shell\Rutar";
#[cfg(windows)]
const WIN_DIR_BG_SHELL_KEY: &str = r"Software\Classes\Directory\Background\shell\Rutar";
#[cfg(windows)]
const WIN_FILE_ASSOC_PROG_ID: &str = "Rutar.Document";
#[cfg(windows)]
const WIN_FILE_ASSOC_PROG_KEY: &str = r"Software\Classes\Rutar.Document";
#[cfg(windows)]
const WIN_FILE_ASSOC_BACKUP_KEY: &str = r"Software\Rutar\FileAssociationBackups";
#[cfg(windows)]
const WIN_REGISTERED_APPLICATIONS_KEY: &str = r"Software\RegisteredApplications";
#[cfg(windows)]
const WIN_APP_REGISTRATION_NAME: &str = "Rutar";
#[cfg(windows)]
const WIN_APP_CAPABILITIES_KEY: &str = r"Software\Rutar\Capabilities";

#[cfg(windows)]
fn executable_path_string() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.to_string_lossy().to_string())
}

#[cfg(windows)]
fn executable_file_name_string() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let file_name = exe
        .file_name()
        .ok_or_else(|| "Failed to resolve executable file name".to_string())?
        .to_string_lossy()
        .to_string();
    Ok(file_name)
}

#[cfg(windows)]
fn context_menu_command_line(argument_placeholder: &str) -> Result<String, String> {
    let exe = executable_path_string()?;
    Ok(format!("\"{}\" \"{}\"", exe, argument_placeholder))
}

#[cfg(windows)]
fn write_windows_context_shell(
    root: &RegKey,
    shell_key: &str,
    icon_path: &str,
    argument_placeholder: &str,
    display_name: &str,
) -> Result<(), String> {
    let (menu_key, _) = root
        .create_subkey(shell_key)
        .map_err(|e| format!("Failed to create registry key {}: {}", shell_key, e))?;

    menu_key
        .set_value("", &display_name)
        .map_err(|e| e.to_string())?;
    menu_key
        .set_value("Icon", &icon_path)
        .map_err(|e| e.to_string())?;

    let command = context_menu_command_line(argument_placeholder)?;
    let (command_key, _) = menu_key
        .create_subkey("command")
        .map_err(|e| e.to_string())?;
    command_key
        .set_value("", &command)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn set_windows_context_shell_display_name(
    root: &RegKey,
    shell_key: &str,
    display_name: &str,
) -> Result<(), String> {
    match root.open_subkey_with_flags(shell_key, KEY_WRITE) {
        Ok(menu_key) => menu_key
            .set_value("", &display_name)
            .map_err(|e| e.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!(
            "Failed to open registry key {}: {}",
            shell_key, err
        )),
    }
}

#[cfg(windows)]
fn remove_registry_tree(root: &RegKey, path: &str) -> Result<(), String> {
    match root.delete_subkey_all(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Failed to remove registry key {}: {}", path, err)),
    }
}

#[cfg(windows)]
fn read_registry_command(root: &RegKey, shell_key: &str) -> Option<String> {
    let command_key_path = format!(r"{}\command", shell_key);
    let command_key = root
        .open_subkey_with_flags(command_key_path, KEY_READ)
        .ok()?;
    command_key.get_value::<String, _>("").ok()
}

#[cfg(windows)]
fn expected_registry_command(argument_placeholder: &str) -> Option<String> {
    context_menu_command_line(argument_placeholder).ok()
}

#[cfg(windows)]
fn windows_file_association_type_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar 文本文档",
        _ => "Rutar Text Document",
    }
}

#[cfg(windows)]
fn windows_document_icon_path_string() -> Result<String, String> {
    executable_path_string()
}

#[cfg(windows)]
fn windows_default_icon_value(icon_path: &str) -> String {
    format!("{},0", icon_path)
}

#[cfg(windows)]
fn windows_file_extension_key(extension: &str) -> String {
    format!(r"Software\Classes\{}", extension)
}

#[cfg(windows)]
fn windows_file_association_backup_key(extension: &str) -> String {
    format!(r"{}\{}", WIN_FILE_ASSOC_BACKUP_KEY, extension)
}

#[cfg(windows)]
fn windows_applications_key(executable_name: &str) -> String {
    format!(r"Software\Classes\Applications\{}", executable_name)
}

#[cfg(windows)]
fn windows_default_app_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar",
        _ => "Rutar",
    }
}

#[cfg(windows)]
fn windows_default_app_description(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar 文本编辑器",
        _ => "Rutar text editor",
    }
}

#[cfg(windows)]
fn windows_file_exts_user_choice_key(extension: &str) -> String {
    format!(
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{}\UserChoice",
        extension
    )
}

#[cfg(windows)]
fn notify_windows_association_changed() {
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST | SHCNF_FLUSHNOWAIT,
            std::ptr::null(),
            std::ptr::null(),
        );
    }
}

#[cfg(windows)]
fn clear_windows_user_choice(root: &RegKey, extension: &str) -> Result<(), String> {
    let user_choice_key = windows_file_exts_user_choice_key(extension);
    remove_registry_tree(root, user_choice_key.as_str())
}

#[cfg(windows)]
fn read_registry_default_value(root: &RegKey, key_path: &str) -> Result<Option<String>, String> {
    let key = match root.open_subkey_with_flags(key_path, KEY_READ) {
        Ok(value) => value,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("Failed to open registry key {}: {}", key_path, err)),
    };

    match key.get_value::<String, _>("") {
        Ok(value) => Ok(Some(value)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!(
            "Failed to read registry key {} default value: {}",
            key_path, err
        )),
    }
}

#[cfg(windows)]
fn backup_extension_default_value(root: &RegKey, extension: &str) -> Result<(), String> {
    let backup_key_path = windows_file_association_backup_key(extension);
    if root
        .open_subkey_with_flags(&backup_key_path, KEY_READ)
        .is_ok()
    {
        return Ok(());
    }

    let extension_key_path = windows_file_extension_key(extension);
    let previous_default = read_registry_default_value(root, extension_key_path.as_str())?;

    let (backup_key, _) = root.create_subkey(backup_key_path.as_str()).map_err(|e| {
        format!(
            "Failed to create backup registry key {}: {}",
            backup_key_path, e
        )
    })?;

    let has_previous_default: u32 = if previous_default.is_some() { 1 } else { 0 };
    backup_key
        .set_value("HasPreviousDefault", &has_previous_default)
        .map_err(|e| e.to_string())?;

    if let Some(previous) = previous_default {
        backup_key
            .set_value("PreviousDefault", &previous)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(windows)]
fn write_windows_file_association_progid(
    root: &RegKey,
    icon_path: &str,
    language: &str,
) -> Result<(), String> {
    let (prog_key, _) = root.create_subkey(WIN_FILE_ASSOC_PROG_KEY).map_err(|e| {
        format!(
            "Failed to create registry key {}: {}",
            WIN_FILE_ASSOC_PROG_KEY, e
        )
    })?;
    prog_key
        .set_value("", &windows_file_association_type_name(language))
        .map_err(|e| e.to_string())?;

    let (icon_key, _) = prog_key
        .create_subkey("DefaultIcon")
        .map_err(|e| e.to_string())?;
    icon_key
        .set_value("", &windows_default_icon_value(icon_path))
        .map_err(|e| e.to_string())?;

    let command = context_menu_command_line("%1")?;
    let (command_key, _) = prog_key
        .create_subkey(r"shell\open\command")
        .map_err(|e| e.to_string())?;
    command_key
        .set_value("", &command)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn write_windows_registered_application(
    root: &RegKey,
    executable_name: &str,
    icon_path: &str,
    language: &str,
    extensions: &[String],
) -> Result<(), String> {
    let command = context_menu_command_line("%1")?;
    let app_name = windows_default_app_name(language);
    let app_description = windows_default_app_description(language);
    let app_key_path = windows_applications_key(executable_name);

    let (app_key, _) = root
        .create_subkey(app_key_path.as_str())
        .map_err(|e| format!("Failed to create registry key {}: {}", app_key_path, e))?;
    app_key
        .set_value("FriendlyAppName", &app_name)
        .map_err(|e| e.to_string())?;

    let (app_icon_key, _) = app_key
        .create_subkey("DefaultIcon")
        .map_err(|e| e.to_string())?;
    app_icon_key
        .set_value("", &windows_default_icon_value(icon_path))
        .map_err(|e| e.to_string())?;

    let (app_command_key, _) = app_key
        .create_subkey(r"shell\open\command")
        .map_err(|e| e.to_string())?;
    app_command_key
        .set_value("", &command)
        .map_err(|e| e.to_string())?;

    remove_registry_tree(root, format!(r"{}\SupportedTypes", app_key_path).as_str())?;
    let (supported_types_key, _) = app_key
        .create_subkey("SupportedTypes")
        .map_err(|e| e.to_string())?;
    for extension in extensions {
        supported_types_key
            .set_value(extension.as_str(), &"")
            .map_err(|e| e.to_string())?;
    }

    remove_registry_tree(
        root,
        format!(r"{}\FileAssociations", WIN_APP_CAPABILITIES_KEY).as_str(),
    )?;
    let (capabilities_key, _) = root.create_subkey(WIN_APP_CAPABILITIES_KEY).map_err(|e| {
        format!(
            "Failed to create registry key {}: {}",
            WIN_APP_CAPABILITIES_KEY, e
        )
    })?;
    capabilities_key
        .set_value("ApplicationName", &app_name)
        .map_err(|e| e.to_string())?;
    capabilities_key
        .set_value("ApplicationDescription", &app_description)
        .map_err(|e| e.to_string())?;

    let (file_associations_key, _) = capabilities_key
        .create_subkey("FileAssociations")
        .map_err(|e| e.to_string())?;
    for extension in extensions {
        file_associations_key
            .set_value(extension.as_str(), &WIN_FILE_ASSOC_PROG_ID)
            .map_err(|e| e.to_string())?;
    }

    let (registered_apps_key, _) = root
        .create_subkey(WIN_REGISTERED_APPLICATIONS_KEY)
        .map_err(|e| {
            format!(
                "Failed to create registry key {}: {}",
                WIN_REGISTERED_APPLICATIONS_KEY, e
            )
        })?;
    registered_apps_key
        .set_value(WIN_APP_REGISTRATION_NAME, &WIN_APP_CAPABILITIES_KEY)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn remove_windows_registered_application(root: &RegKey) -> Result<(), String> {
    if let Ok(registered_apps_key) =
        root.open_subkey_with_flags(WIN_REGISTERED_APPLICATIONS_KEY, KEY_WRITE)
    {
        let _ = registered_apps_key.delete_value(WIN_APP_REGISTRATION_NAME);
    }

    remove_registry_tree(root, WIN_APP_CAPABILITIES_KEY)
}

#[cfg(windows)]
fn associate_extension_with_rutar(root: &RegKey, extension: &str) -> Result<(), String> {
    backup_extension_default_value(root, extension)?;
    clear_windows_user_choice(root, extension)?;

    let extension_key_path = windows_file_extension_key(extension);
    let (extension_key, _) = root
        .create_subkey(extension_key_path.as_str())
        .map_err(|e| {
            format!(
                "Failed to create registry key {}: {}",
                extension_key_path, e
            )
        })?;

    extension_key
        .set_value("", &WIN_FILE_ASSOC_PROG_ID)
        .map_err(|e| e.to_string())?;

    let (open_with_key, _) = extension_key
        .create_subkey("OpenWithProgids")
        .map_err(|e| e.to_string())?;
    open_with_key
        .set_value(WIN_FILE_ASSOC_PROG_ID, &"")
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn restore_extension_default_value(root: &RegKey, extension: &str) -> Result<(), String> {
    let backup_key_path = windows_file_association_backup_key(extension);
    let backup_key = match root.open_subkey_with_flags(backup_key_path.as_str(), KEY_READ) {
        Ok(value) => value,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => {
            return Err(format!(
                "Failed to open backup registry key {}: {}",
                backup_key_path, err
            ))
        }
    };

    let has_previous_default = backup_key
        .get_value::<u32, _>("HasPreviousDefault")
        .unwrap_or(0)
        == 1;
    let previous_default = backup_key.get_value::<String, _>("PreviousDefault").ok();

    let extension_key_path = windows_file_extension_key(extension);
    let (extension_key, _) = root
        .create_subkey(extension_key_path.as_str())
        .map_err(|e| format!("Failed to open registry key {}: {}", extension_key_path, e))?;

    if has_previous_default {
        if let Some(previous) = previous_default {
            extension_key
                .set_value("", &previous)
                .map_err(|e| e.to_string())?;
        } else {
            let _ = extension_key.delete_value("");
        }
    } else {
        let _ = extension_key.delete_value("");
    }

    if let Ok(open_with_key) = extension_key.open_subkey_with_flags("OpenWithProgids", KEY_WRITE) {
        let _ = open_with_key.delete_value(WIN_FILE_ASSOC_PROG_ID);
    }

    clear_windows_user_choice(root, extension)?;

    remove_registry_tree(root, backup_key_path.as_str())
}

#[cfg(windows)]
fn is_extension_associated_with_rutar(root: &RegKey, extension: &str) -> bool {
    let extension_key_path = windows_file_extension_key(extension);
    let extension_default = read_registry_default_value(root, extension_key_path.as_str())
        .ok()
        .flatten();

    matches!(extension_default.as_deref(), Some(value) if value == WIN_FILE_ASSOC_PROG_ID)
}

#[cfg(windows)]
fn is_windows_file_association_registered(extensions: &[String]) -> bool {
    if extensions.is_empty() {
        return false;
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let expected_command = match context_menu_command_line("%1") {
        Ok(value) => value,
        Err(_) => return false,
    };

    let command_matches =
        read_registry_default_value(&hkcu, r"Software\Classes\Rutar.Document\shell\open\command")
            .ok()
            .flatten()
            .map(|value| value == expected_command)
            .unwrap_or(false);

    if !command_matches {
        return false;
    }

    extensions
        .iter()
        .all(|extension| is_extension_associated_with_rutar(&hkcu, extension.as_str()))
}

fn config_file_path() -> Result<PathBuf, String> {
    let app_data =
        std::env::var("APPDATA").map_err(|_| "Failed to locate APPDATA directory".to_string())?;
    Ok(PathBuf::from(app_data).join("Rutar").join("config.json"))
}

pub(super) fn get_startup_paths_impl(state: State<'_, AppState>) -> Vec<String> {
    state.take_startup_paths()
}

#[cfg(windows)]
fn list_extensions_associated_with_rutar(root: &RegKey) -> Vec<String> {
    let classes_key = match root.open_subkey_with_flags(r"Software\Classes", KEY_READ) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let mut extensions = Vec::new();

    for key_name in classes_key.enum_keys().flatten() {
        if !key_name.starts_with('.') {
            continue;
        }

        if is_extension_associated_with_rutar(root, key_name.as_str()) {
            extensions.push(key_name.to_lowercase());
        }
    }

    extensions.sort();
    extensions
}

#[cfg(windows)]
fn open_windows_default_apps_settings_page() -> Result<(), String> {
    Command::new("explorer")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Windows default apps settings page: {}", e))
}

pub(super) fn register_windows_context_menu_impl(language: Option<String>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Err("Windows context menu is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let icon_path = executable_path_string()?;
        let normalized_language = settings::normalize_language(language.as_deref());
        let display_name = context_menu_display_name(normalized_language.as_str());

        write_windows_context_shell(&hkcu, WIN_FILE_SHELL_KEY, &icon_path, "%1", display_name)?;
        write_windows_context_shell(&hkcu, WIN_DIR_SHELL_KEY, &icon_path, "%1", display_name)?;
        write_windows_context_shell(&hkcu, WIN_DIR_BG_SHELL_KEY, &icon_path, "%V", display_name)?;

        Ok(())
    }
}

pub(super) fn unregister_windows_context_menu_impl() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Err("Windows context menu is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        remove_registry_tree(&hkcu, WIN_FILE_SHELL_KEY)?;
        remove_registry_tree(&hkcu, WIN_DIR_SHELL_KEY)?;
        remove_registry_tree(&hkcu, WIN_DIR_BG_SHELL_KEY)?;

        Ok(())
    }
}

pub(super) fn is_windows_context_menu_registered_impl() -> bool {
    #[cfg(not(windows))]
    {
        false
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let expected_file = match expected_registry_command("%1") {
            Some(value) => value,
            None => return false,
        };
        let expected_dir_bg = match expected_registry_command("%V") {
            Some(value) => value,
            None => return false,
        };

        let file_ok = read_registry_command(&hkcu, WIN_FILE_SHELL_KEY)
            .map(|value| value == expected_file)
            .unwrap_or(false);
        let dir_ok = read_registry_command(&hkcu, WIN_DIR_SHELL_KEY)
            .map(|value| value == expected_file)
            .unwrap_or(false);
        let dir_bg_ok = read_registry_command(&hkcu, WIN_DIR_BG_SHELL_KEY)
            .map(|value| value == expected_dir_bg)
            .unwrap_or(false);

        file_ok && dir_ok && dir_bg_ok
    }
}

pub(super) fn get_default_windows_file_association_extensions_impl() -> Vec<String> {
    settings::default_windows_file_association_extensions()
}

pub(super) fn apply_windows_file_associations_impl(
    language: Option<String>,
    extensions: Vec<String>,
    open_settings_page: bool,
) -> Result<Vec<String>, String> {
    #[cfg(not(windows))]
    {
        let _ = language;
        let _ = extensions;
        let _ = open_settings_page;
        Err("Windows file association is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let normalized_extensions = normalize_windows_file_association_extensions(Some(extensions));
        let normalized_language = settings::normalize_language(language.as_deref());
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let icon_path = windows_document_icon_path_string()?;
        let executable_name = executable_file_name_string()?;

        write_windows_file_association_progid(
            &hkcu,
            icon_path.as_str(),
            normalized_language.as_str(),
        )?;
        write_windows_registered_application(
            &hkcu,
            executable_name.as_str(),
            icon_path.as_str(),
            normalized_language.as_str(),
            normalized_extensions.as_slice(),
        )?;

        for extension in &normalized_extensions {
            associate_extension_with_rutar(&hkcu, extension.as_str())?;
        }

        notify_windows_association_changed();

        if open_settings_page {
            if let Err(error) = open_windows_default_apps_settings_page() {
                eprintln!("{error}");
            }
        }

        Ok(normalized_extensions)
    }
}

pub(super) fn remove_windows_file_associations_impl(extensions: Vec<String>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = extensions;
        Err("Windows file association is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let normalized_extensions = normalize_windows_file_association_extensions(Some(extensions));
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let executable_name = executable_file_name_string()?;

        for extension in &normalized_extensions {
            restore_extension_default_value(&hkcu, extension.as_str())?;
        }

        let remaining_extensions = list_extensions_associated_with_rutar(&hkcu);
        if remaining_extensions.is_empty() {
            remove_registry_tree(&hkcu, WIN_FILE_ASSOC_PROG_KEY)?;
            remove_windows_registered_application(&hkcu)?;
            remove_registry_tree(
                &hkcu,
                windows_applications_key(executable_name.as_str()).as_str(),
            )?;
        } else {
            let icon_path = windows_document_icon_path_string()?;
            let language = load_config_impl()
                .map(|config| settings::normalize_language(Some(config.language.as_str())))
                .unwrap_or_else(|_| settings::normalize_language(None));
            write_windows_registered_application(
                &hkcu,
                executable_name.as_str(),
                icon_path.as_str(),
                language.as_str(),
                remaining_extensions.as_slice(),
            )?;
        }

        notify_windows_association_changed();

        Ok(())
    }
}

pub(super) fn get_windows_file_association_status_impl(
    extensions: Vec<String>,
) -> WindowsFileAssociationStatus {
    let normalized_extensions = normalize_windows_file_association_extensions(Some(extensions));

    #[cfg(not(windows))]
    {
        WindowsFileAssociationStatus {
            enabled: false,
            extensions: normalized_extensions,
        }
    }

    #[cfg(windows)]
    {
        WindowsFileAssociationStatus {
            enabled: is_windows_file_association_registered(&normalized_extensions),
            extensions: normalized_extensions,
        }
    }
}

pub(super) fn load_config_impl() -> Result<AppConfig, String> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(AppConfig::default());
    }

    let partial: settings::PartialAppConfig =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse config file: {}", e))?;

    let mut config = AppConfig::default();

    if let Some(language) = partial.language {
        config.language = settings::normalize_language(Some(language.as_str()));
    }

    if let Some(theme) = partial.theme {
        config.theme = settings::normalize_theme(Some(theme.as_str()));
    }

    if let Some(font_family) = partial.font_family {
        if !font_family.trim().is_empty() {
            config.font_family = font_family;
        }
    }

    if let Some(font_size) = partial.font_size {
        config.font_size = font_size.clamp(8, 72);
    }

    if let Some(tab_width) = partial.tab_width {
        config.tab_width = settings::normalize_tab_width(tab_width);
    }

    if let Some(new_file_line_ending) = partial.new_file_line_ending {
        config.new_file_line_ending =
            settings::normalize_new_file_line_ending(Some(new_file_line_ending.as_str()));
    }

    if let Some(word_wrap) = partial.word_wrap {
        config.word_wrap = word_wrap;
    }

    if let Some(double_click_close_tab) = partial.double_click_close_tab {
        config.double_click_close_tab = double_click_close_tab;
    }

    if let Some(show_line_numbers) = partial.show_line_numbers {
        config.show_line_numbers = show_line_numbers;
    }

    if let Some(highlight_current_line) = partial.highlight_current_line {
        config.highlight_current_line = highlight_current_line;
    }

    if let Some(single_instance_mode) = partial.single_instance_mode {
        config.single_instance_mode = single_instance_mode;
    }

    if let Some(remember_window_state) = partial.remember_window_state {
        config.remember_window_state = remember_window_state;
    }

    if let Some(recent_files) = partial.recent_files {
        config.recent_files = normalize_recent_paths(Some(recent_files));
    }

    if let Some(recent_folders) = partial.recent_folders {
        config.recent_folders = normalize_recent_paths(Some(recent_folders));
    }

    if let Some(extensions) = partial.windows_file_association_extensions {
        config.windows_file_association_extensions =
            normalize_windows_file_association_extensions(Some(extensions));
    }

    if let Some(mouse_gestures_enabled) = partial.mouse_gestures_enabled {
        config.mouse_gestures_enabled = mouse_gestures_enabled;
    }

    if let Some(mouse_gestures) = partial.mouse_gestures {
        config.mouse_gestures = normalize_mouse_gestures(Some(mouse_gestures));
    }

    config.window_state = normalize_window_state(partial.window_state);

    config.filter_rule_groups = normalize_filter_rule_groups(partial.filter_rule_groups);

    Ok(config)
}

pub(super) fn is_single_instance_mode_enabled_in_config_impl() -> bool {
    load_config_impl()
        .map(|config| config.single_instance_mode)
        .unwrap_or(DEFAULT_SINGLE_INSTANCE_MODE)
}

pub(super) fn is_remember_window_state_enabled_in_config_impl() -> bool {
    load_config_impl()
        .map(|config| config.remember_window_state)
        .unwrap_or(true)
}

pub(super) fn load_main_window_state_in_config_impl() -> Option<settings::WindowStateConfig> {
    load_config_impl()
        .ok()
        .filter(|config| config.remember_window_state)
        .and_then(|config| normalize_window_state(config.window_state))
}

pub(super) fn save_main_window_state_in_config_impl(
    width: Option<u32>,
    height: Option<u32>,
    maximized: bool,
) -> Result<(), String> {
    let mut config = load_config_impl().unwrap_or_default();
    config.window_state = normalize_window_state(Some(settings::WindowStateConfig {
        width: if maximized { None } else { width },
        height: if maximized { None } else { height },
        maximized,
    }));

    save_config_impl(config)
}

pub(super) fn save_config_impl(config: AppConfig) -> Result<(), String> {
    let mut normalized = normalize_app_config(config);

    if normalized.filter_rule_groups.is_none() {
        if let Ok(existing) = load_config_impl() {
            normalized.filter_rule_groups = existing.filter_rule_groups;
        }
    }

    let path = config_file_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, format!("{}\n", content)).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        if is_windows_context_menu_registered_impl() {
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let display_name = context_menu_display_name(normalized.language.as_str());

            set_windows_context_shell_display_name(&hkcu, WIN_FILE_SHELL_KEY, display_name)?;
            set_windows_context_shell_display_name(&hkcu, WIN_DIR_SHELL_KEY, display_name)?;
            set_windows_context_shell_display_name(&hkcu, WIN_DIR_BG_SHELL_KEY, display_name)?;
        }

        if is_windows_file_association_registered(&normalized.windows_file_association_extensions) {
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let icon_path = windows_document_icon_path_string()?;
            let executable_name = executable_file_name_string()?;
            let associated_extensions = list_extensions_associated_with_rutar(&hkcu);

            write_windows_file_association_progid(
                &hkcu,
                icon_path.as_str(),
                normalized.language.as_str(),
            )?;

            if !associated_extensions.is_empty() {
                write_windows_registered_application(
                    &hkcu,
                    executable_name.as_str(),
                    icon_path.as_str(),
                    normalized.language.as_str(),
                    associated_extensions.as_slice(),
                )?;
            }
        }
    }

    Ok(())
}

pub(super) fn load_filter_rule_groups_config_impl() -> Result<Vec<FilterRuleGroupConfig>, String> {
    let config = load_config_impl()?;
    Ok(config.filter_rule_groups.unwrap_or_default())
}

pub(super) fn save_filter_rule_groups_config_impl(
    groups: Vec<FilterRuleGroupConfig>,
) -> Result<(), String> {
    let mut config = load_config_impl()?;
    config.filter_rule_groups = normalize_filter_rule_groups(Some(groups));
    save_config_impl(config)
}

pub(super) fn import_filter_rule_groups_impl(
    path: String,
) -> Result<Vec<FilterRuleGroupConfig>, String> {
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Err("Import file is empty".to_string());
    }

    let parsed_groups = match serde_json::from_str::<FilterRuleGroupsFilePayload>(&raw) {
        Ok(payload) => payload.filter_rule_groups,
        Err(_) => serde_json::from_str::<Vec<FilterRuleGroupConfig>>(&raw)
            .map_err(|e| format!("Failed to parse filter groups file: {}", e))?,
    };

    let normalized = normalize_filter_rule_groups(Some(parsed_groups)).unwrap_or_default();
    if normalized.is_empty() {
        return Err("No valid filter rule groups found in import file".to_string());
    }

    Ok(normalized)
}

pub(super) fn export_filter_rule_groups_impl(
    path: String,
    groups: Vec<FilterRuleGroupConfig>,
) -> Result<(), String> {
    let normalized = normalize_filter_rule_groups(Some(groups)).unwrap_or_default();
    if normalized.is_empty() {
        return Err("No valid filter rule groups to export".to_string());
    }

    let output_path = PathBuf::from(path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let payload = FilterRuleGroupsFilePayload {
        filter_rule_groups: normalized,
    };
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(output_path, format!("{}\n", content)).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_rule(keyword: &str, match_mode: &str, apply_to: &str, text_color: &str) -> FilterRuleInput {
        FilterRuleInput {
            keyword: keyword.to_string(),
            match_mode: match_mode.to_string(),
            background_color: "#111111".to_string(),
            text_color: text_color.to_string(),
            bold: false,
            italic: false,
            apply_to: apply_to.to_string(),
        }
    }

    #[test]
    fn normalize_filter_rule_input_should_trim_and_normalize_fields() {
        let normalized = normalize_filter_rule_input(make_rule("  error  ", "exists", "LINE", "  "));
        assert!(normalized.is_some());

        let normalized = normalized.expect("normalized rule should exist");
        assert_eq!(normalized.keyword, "error");
        assert_eq!(normalized.match_mode, "contains");
        assert_eq!(normalized.apply_to, "line");
        assert_eq!(normalized.text_color, DEFAULT_FILTER_RULE_TEXT);
    }

    #[test]
    fn normalize_filter_rule_input_should_drop_invalid_rules() {
        assert!(normalize_filter_rule_input(make_rule("   ", "contains", "line", "#fff")).is_none());
        assert!(normalize_filter_rule_input(make_rule("x", "invalid", "line", "#fff")).is_none());
        assert!(normalize_filter_rule_input(make_rule("x", "contains", "invalid", "#fff")).is_none());
    }

    #[test]
    fn normalize_filter_rule_groups_should_keep_only_valid_groups_and_rules() {
        let groups = vec![
            FilterRuleGroupConfig {
                name: "  ".to_string(),
                rules: vec![make_rule("x", "contains", "line", "#fff")],
            },
            FilterRuleGroupConfig {
                name: " Main ".to_string(),
                rules: vec![
                    make_rule(" ok ", "contains", "line", "#fff"),
                    make_rule(" ", "contains", "line", "#fff"),
                ],
            },
        ];

        let normalized = normalize_filter_rule_groups(Some(groups));
        assert!(normalized.is_some());

        let normalized = normalized.expect("normalized groups should exist");
        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].name, "Main");
        assert_eq!(normalized[0].rules.len(), 1);
        assert_eq!(normalized[0].rules[0].keyword, "ok");
    }

    #[test]
    fn normalize_windows_file_association_extension_should_validate_and_normalize() {
        assert_eq!(
            normalize_windows_file_association_extension(" TXT "),
            Some(".txt".to_string())
        );
        assert_eq!(
            normalize_windows_file_association_extension("*.Md"),
            Some(".md".to_string())
        );
        assert_eq!(normalize_windows_file_association_extension("."), None);
        assert_eq!(normalize_windows_file_association_extension(".a!"), None);
    }

    #[test]
    fn normalize_windows_file_association_extensions_should_dedup_and_fallback() {
        let normalized = normalize_windows_file_association_extensions(Some(vec![
            "txt".to_string(),
            ".TXT".to_string(),
            "*.md".to_string(),
            "??".to_string(),
        ]));
        assert_eq!(normalized, vec![".md".to_string(), ".txt".to_string()]);

        let fallback = normalize_windows_file_association_extensions(Some(vec![
            " ".to_string(),
            "*".to_string(),
        ]));
        assert_eq!(fallback, settings::default_windows_file_association_extensions());
    }

    #[test]
    fn normalize_recent_paths_should_trim_dedup_and_limit_length() {
        let mut source = vec!["  a  ".to_string(), "a".to_string(), " ".to_string()];
        source.extend((0..(MAX_RECENT_PATHS + 5)).map(|i| format!("p{}", i)));

        let normalized = normalize_recent_paths(Some(source));
        assert_eq!(normalized[0], "a");
        assert_eq!(normalized.len(), MAX_RECENT_PATHS);
    }

    #[test]
    fn normalize_mouse_gesture_pattern_should_filter_and_uppercase() {
        assert_eq!(normalize_mouse_gesture_pattern(" lrxdu9 "), "LRDU");
        assert_eq!(normalize_mouse_gesture_pattern("123"), "");
        assert_eq!(normalize_mouse_gesture_pattern("llllrrrruuuudddd"), "LLLLRRRR");
    }

    #[test]
    fn normalize_mouse_gestures_should_handle_empty_invalid_and_duplicates() {
        let empty = normalize_mouse_gestures(Some(Vec::new()));
        assert!(empty.is_empty());

        let normalized = normalize_mouse_gestures(Some(vec![
            settings::MouseGestureConfig {
                pattern: " l ".to_string(),
                action: "previousTab".to_string(),
            },
            settings::MouseGestureConfig {
                pattern: "L".to_string(),
                action: "nextTab".to_string(),
            },
            settings::MouseGestureConfig {
                pattern: "R".to_string(),
                action: "invalid".to_string(),
            },
        ]));
        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].pattern, "L");
        assert_eq!(normalized[0].action, "previousTab");

        let fallback = normalize_mouse_gestures(None);
        assert!(!fallback.is_empty());
    }

    #[test]
    fn normalize_window_state_should_drop_non_positive_dimensions() {
        let normalized = normalize_window_state(Some(settings::WindowStateConfig {
            width: Some(0),
            height: Some(720),
            maximized: true,
        }))
        .expect("window state should exist");

        assert_eq!(normalized.width, None);
        assert_eq!(normalized.height, Some(720));
        assert!(normalized.maximized);
    }

    #[test]
    fn normalize_app_config_should_apply_all_normalization_rules() {
        let config = AppConfig {
            language: "unknown".to_string(),
            theme: "unknown".to_string(),
            font_family: "  ".to_string(),
            font_size: 100,
            tab_width: 0,
            new_file_line_ending: "bad".to_string(),
            word_wrap: true,
            double_click_close_tab: true,
            show_line_numbers: true,
            highlight_current_line: true,
            single_instance_mode: true,
            remember_window_state: true,
            recent_files: vec!["  a  ".to_string(), "a".to_string()],
            recent_folders: vec!["  b  ".to_string(), "b".to_string()],
            windows_file_association_extensions: vec!["TXT".to_string()],
            mouse_gestures_enabled: true,
            mouse_gestures: vec![settings::MouseGestureConfig {
                pattern: " l ".to_string(),
                action: "previousTab".to_string(),
            }],
            window_state: Some(settings::WindowStateConfig {
                width: Some(0),
                height: Some(1),
                maximized: false,
            }),
            filter_rule_groups: Some(vec![FilterRuleGroupConfig {
                name: " Group ".to_string(),
                rules: vec![make_rule(" key ", "contains", "line", "#fff")],
            }]),
        };

        let normalized = normalize_app_config(config);
        assert_eq!(normalized.language, DEFAULT_LANGUAGE);
        assert_eq!(normalized.theme, DEFAULT_THEME);
        assert_eq!(normalized.font_family, DEFAULT_FONT_FAMILY);
        assert_eq!(normalized.font_size, 72);
        assert_eq!(normalized.tab_width, 1);
        assert_eq!(normalized.new_file_line_ending, default_line_ending().label());
        assert_eq!(normalized.recent_files, vec!["a".to_string()]);
        assert_eq!(normalized.recent_folders, vec!["b".to_string()]);
        assert_eq!(
            normalized.windows_file_association_extensions,
            vec![".txt".to_string()]
        );
        assert_eq!(normalized.mouse_gestures.len(), 1);
        assert_eq!(normalized.mouse_gestures[0].pattern, "L");
        assert!(normalized.filter_rule_groups.is_some());
    }
}
