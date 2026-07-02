// Windows-only integrations for the OS shell: context menu entries under
// `HKCU\Software\Classes\*\shell\Rutar` (and Directory / Directory Background
// variants) and the file-extension / RegisteredApplications associations used
// by the "Open with" / Default Apps surfaces.
//
// All helpers in this module are gated behind `#[cfg(windows)]` so the file
// itself only compiles on Windows; the cross-platform facade lives in
// `super::profile`.

#![cfg(windows)]

use super::super::*;

use windows_sys::Win32::UI::Shell::{
    SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, SHCNF_IDLIST,
};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;

use super::profile::{load_config_impl, normalize_windows_file_association_extensions};

pub(crate) const WIN_FILE_SHELL_KEY: &str = r"Software\Classes\*\shell\Rutar";
pub(crate) const WIN_DIR_SHELL_KEY: &str = r"Software\Classes\Directory\shell\Rutar";
pub(crate) const WIN_DIR_BG_SHELL_KEY: &str = r"Software\Classes\Directory\Background\shell\Rutar";
pub(crate) const WIN_FILE_ASSOC_PROG_ID: &str = "Rutar.Document";
pub(crate) const WIN_FILE_ASSOC_PROG_KEY: &str = r"Software\Classes\Rutar.Document";
pub(crate) const WIN_FILE_ASSOC_BACKUP_KEY: &str = r"Software\Rutar\FileAssociationBackups";
pub(crate) const WIN_REGISTERED_APPLICATIONS_KEY: &str = r"Software\RegisteredApplications";
pub(crate) const WIN_APP_REGISTRATION_NAME: &str = "Rutar";
pub(crate) const WIN_APP_CAPABILITIES_KEY: &str = r"Software\Rutar\Capabilities";

pub(crate) fn context_menu_display_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "\u{4f7f}\u{7528} Rutar \u{6253}\u{5f00}",
        _ => "Open with Rutar",
    }
}

pub(crate) fn executable_path_string() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.to_string_lossy().to_string())
}

fn executable_file_name_string() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let file_name = exe
        .file_name()
        .ok_or_else(|| "Failed to resolve executable file name".to_string())?
        .to_string_lossy()
        .to_string();
    Ok(file_name)
}

fn context_menu_command_line(argument_placeholder: &str) -> Result<String, String> {
    let exe = executable_path_string()?;
    Ok(format!("\"{}\" \"{}\"", exe, argument_placeholder))
}

pub(crate) fn write_windows_context_shell(
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

pub(crate) fn set_windows_context_shell_display_name(
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

pub(crate) fn remove_registry_tree(root: &RegKey, path: &str) -> Result<(), String> {
    match root.delete_subkey_all(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Failed to remove registry key {}: {}", path, err)),
    }
}

fn read_registry_command(root: &RegKey, shell_key: &str) -> Option<String> {
    let command_key_path = format!(r"{}\command", shell_key);
    let command_key = root
        .open_subkey_with_flags(command_key_path, KEY_READ)
        .ok()?;
    command_key.get_value::<String, _>("").ok()
}

fn expected_registry_command(argument_placeholder: &str) -> Option<String> {
    context_menu_command_line(argument_placeholder).ok()
}

fn windows_file_association_type_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar \u{6587}\u{672c}\u{6587}\u{6863}",
        _ => "Rutar Text Document",
    }
}

pub(crate) fn windows_document_icon_path_string() -> Result<String, String> {
    executable_path_string()
}

fn windows_default_icon_value(icon_path: &str) -> String {
    format!("{},0", icon_path)
}

fn windows_file_extension_key(extension: &str) -> String {
    format!(r"Software\Classes\{}", extension)
}

fn windows_file_association_backup_key(extension: &str) -> String {
    format!(r"{}\{}", WIN_FILE_ASSOC_BACKUP_KEY, extension)
}

fn windows_applications_key(executable_name: &str) -> String {
    format!(r"Software\Classes\Applications\{}", executable_name)
}

fn windows_default_app_name(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar",
        _ => "Rutar",
    }
}

fn windows_default_app_description(language: &str) -> &'static str {
    match settings::normalize_language(Some(language)) {
        value if value == "zh-CN" => "Rutar \u{6587}\u{672c}\u{7f16}\u{8f91}\u{5668}",
        _ => "Rutar text editor",
    }
}

fn windows_file_exts_user_choice_key(extension: &str) -> String {
    format!(
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{}\UserChoice",
        extension
    )
}

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

fn clear_windows_user_choice(root: &RegKey, extension: &str) -> Result<(), String> {
    let user_choice_key = windows_file_exts_user_choice_key(extension);
    remove_registry_tree(root, user_choice_key.as_str())
}

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

pub(crate) fn write_windows_file_association_progid(
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

pub(crate) fn write_windows_registered_application(
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

fn remove_windows_registered_application(root: &RegKey) -> Result<(), String> {
    if let Ok(registered_apps_key) =
        root.open_subkey_with_flags(WIN_REGISTERED_APPLICATIONS_KEY, KEY_WRITE)
    {
        let _ = registered_apps_key.delete_value(WIN_APP_REGISTRATION_NAME);
    }

    remove_registry_tree(root, WIN_APP_CAPABILITIES_KEY)
}

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

fn is_extension_associated_with_rutar(root: &RegKey, extension: &str) -> bool {
    let extension_key_path = windows_file_extension_key(extension);
    let extension_default = read_registry_default_value(root, extension_key_path.as_str())
        .ok()
        .flatten();

    matches!(extension_default.as_deref(), Some(value) if value == WIN_FILE_ASSOC_PROG_ID)
}

pub(crate) fn is_windows_file_association_registered(extensions: &[String]) -> bool {
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

pub(crate) fn list_extensions_associated_with_rutar(root: &RegKey) -> Vec<String> {
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

fn open_windows_default_apps_settings_page() -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Windows default apps settings page: {}", e))
}

// --- High-level entry points called by `super::profile` ----------------

pub(crate) fn register_context_menu(language: Option<String>) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let icon_path = executable_path_string()?;
    let normalized_language = settings::normalize_language(language.as_deref());
    let display_name = context_menu_display_name(normalized_language.as_str());

    write_windows_context_shell(&hkcu, WIN_FILE_SHELL_KEY, &icon_path, "%1", display_name)?;
    write_windows_context_shell(&hkcu, WIN_DIR_SHELL_KEY, &icon_path, "%1", display_name)?;
    write_windows_context_shell(&hkcu, WIN_DIR_BG_SHELL_KEY, &icon_path, "%V", display_name)?;

    Ok(())
}

pub(crate) fn unregister_context_menu() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    remove_registry_tree(&hkcu, WIN_FILE_SHELL_KEY)?;
    remove_registry_tree(&hkcu, WIN_DIR_SHELL_KEY)?;
    remove_registry_tree(&hkcu, WIN_DIR_BG_SHELL_KEY)?;
    Ok(())
}

pub(crate) fn is_context_menu_registered() -> bool {
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

pub(crate) fn apply_file_associations(
    language: Option<String>,
    extensions: Vec<String>,
    open_settings_page: bool,
) -> Result<Vec<String>, String> {
    let normalized_extensions = normalize_windows_file_association_extensions(Some(extensions));
    let normalized_language = settings::normalize_language(language.as_deref());
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let icon_path = windows_document_icon_path_string()?;
    let executable_name = executable_file_name_string()?;

    write_windows_file_association_progid(&hkcu, icon_path.as_str(), normalized_language.as_str())?;
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

pub(crate) fn remove_file_associations(extensions: Vec<String>) -> Result<(), String> {
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

// Called by `save_config_impl` after the config has been normalized and
// persisted so the registered context-menu / file-association entries reflect
// the latest language and extension list (no-op if nothing is registered).
pub(crate) fn sync_with_saved_config(normalized: &AppConfig) -> Result<(), String> {
    if is_context_menu_registered() {
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

    Ok(())
}
