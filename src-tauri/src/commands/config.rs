use super::*;

use std::path::PathBuf;

#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, SHCNF_IDLIST, SHChangeNotify,
};

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
        recent_files: normalize_recent_paths(Some(config.recent_files)),
        recent_folders: normalize_recent_paths(Some(config.recent_folders)),
        windows_file_association_extensions: normalize_windows_file_association_extensions(
            Some(config.windows_file_association_extensions),
        ),
        filter_rule_groups: normalize_filter_rule_groups(config.filter_rule_groups),
    }
}

#[cfg(windows)]
fn context_menu_display_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "浣跨敤 Rutar 鎵撳紑",
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
fn executable_path_string() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.to_string_lossy().to_string())
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
    command_key.set_value("", &command).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn set_windows_context_shell_display_name(
    root: &RegKey,
    shell_key: &str,
    display_name: &str,
) -> Result<(), String> {
    match root.open_subkey_with_flags(shell_key, KEY_WRITE) {
        Ok(menu_key) => menu_key.set_value("", &display_name).map_err(|e| e.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Failed to open registry key {}: {}", shell_key, err)),
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
    let command_key = root.open_subkey_with_flags(command_key_path, KEY_READ).ok()?;
    command_key.get_value::<String, _>("").ok()
}

#[cfg(windows)]
fn expected_registry_command(argument_placeholder: &str) -> Option<String> {
    context_menu_command_line(argument_placeholder).ok()
}

#[cfg(windows)]
fn windows_file_association_type_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar 鏂囨湰鏂囨。",
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
        Err(err) => Err(format!("Failed to read registry key {} default value: {}", key_path, err)),
    }
}

#[cfg(windows)]
fn backup_extension_default_value(root: &RegKey, extension: &str) -> Result<(), String> {
    let backup_key_path = windows_file_association_backup_key(extension);
    if root.open_subkey_with_flags(&backup_key_path, KEY_READ).is_ok() {
        return Ok(());
    }

    let extension_key_path = windows_file_extension_key(extension);
    let previous_default = read_registry_default_value(root, extension_key_path.as_str())?;

    let (backup_key, _) = root
        .create_subkey(backup_key_path.as_str())
        .map_err(|e| format!("Failed to create backup registry key {}: {}", backup_key_path, e))?;

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
    let (prog_key, _) = root
        .create_subkey(WIN_FILE_ASSOC_PROG_KEY)
        .map_err(|e| format!("Failed to create registry key {}: {}", WIN_FILE_ASSOC_PROG_KEY, e))?;
    prog_key
        .set_value("", &windows_file_association_type_name(language))
        .map_err(|e| e.to_string())?;

    let (icon_key, _) = prog_key.create_subkey("DefaultIcon").map_err(|e| e.to_string())?;
    icon_key
        .set_value("", &windows_default_icon_value(icon_path))
        .map_err(|e| e.to_string())?;

    let command = context_menu_command_line("%1")?;
    let (command_key, _) = prog_key
        .create_subkey(r"shell\open\command")
        .map_err(|e| e.to_string())?;
    command_key.set_value("", &command).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn associate_extension_with_rutar(root: &RegKey, extension: &str) -> Result<(), String> {
    backup_extension_default_value(root, extension)?;
    clear_windows_user_choice(root, extension)?;

    let extension_key_path = windows_file_extension_key(extension);
    let (extension_key, _) = root
        .create_subkey(extension_key_path.as_str())
        .map_err(|e| format!("Failed to create registry key {}: {}", extension_key_path, e))?;

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
            extension_key.set_value("", &previous).map_err(|e| e.to_string())?;
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
fn any_extension_associated_with_rutar(root: &RegKey) -> bool {
    let classes_key = match root.open_subkey_with_flags(r"Software\Classes", KEY_READ) {
        Ok(value) => value,
        Err(_) => return false,
    };

    for key_name in classes_key.enum_keys().flatten() {
        if !key_name.starts_with('.') {
            continue;
        }

        if is_extension_associated_with_rutar(root, key_name.as_str()) {
            return true;
        }
    }

    false
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

    let command_matches = read_registry_default_value(&hkcu, r"Software\Classes\Rutar.Document\shell\open\command")
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
    let app_data = std::env::var("APPDATA")
        .map_err(|_| "Failed to locate APPDATA directory".to_string())?;
    Ok(PathBuf::from(app_data).join("Rutar").join("config.json"))
}

pub(super) fn get_startup_paths_impl(state: State<'_, AppState>) -> Vec<String> {
    state.take_startup_paths()
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

        write_windows_file_association_progid(&hkcu, icon_path.as_str(), normalized_language.as_str())?;

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

        for extension in &normalized_extensions {
            restore_extension_default_value(&hkcu, extension.as_str())?;
        }

        let any_remaining = any_extension_associated_with_rutar(&hkcu);
        if !any_remaining {
            remove_registry_tree(&hkcu, WIN_FILE_ASSOC_PROG_KEY)?;
        }

        notify_windows_association_changed();

        Ok(())
    }
}

pub(super) fn get_windows_file_association_status_impl(extensions: Vec<String>) -> WindowsFileAssociationStatus {
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

    let partial: settings::PartialAppConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

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

    config.filter_rule_groups = normalize_filter_rule_groups(partial.filter_rule_groups);

    Ok(config)
}

pub(super) fn is_single_instance_mode_enabled_in_config_impl() -> bool {
    load_config_impl()
        .map(|config| config.single_instance_mode)
        .unwrap_or(DEFAULT_SINGLE_INSTANCE_MODE)
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

            write_windows_file_association_progid(
                &hkcu,
                icon_path.as_str(),
                normalized.language.as_str(),
            )?;
        }
    }

    Ok(())
}

pub(super) fn load_filter_rule_groups_config_impl() -> Result<Vec<FilterRuleGroupConfig>, String> {
    let config = load_config_impl()?;
    Ok(config.filter_rule_groups.unwrap_or_default())
}

pub(super) fn save_filter_rule_groups_config_impl(groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
    let mut config = load_config_impl()?;
    config.filter_rule_groups = normalize_filter_rule_groups(Some(groups));
    save_config_impl(config)
}

pub(super) fn import_filter_rule_groups_impl(path: String) -> Result<Vec<FilterRuleGroupConfig>, String> {
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

pub(super) fn export_filter_rule_groups_impl(path: String, groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
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

