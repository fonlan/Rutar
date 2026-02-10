use crate::state::{default_line_ending, AppState, Document, EditOperation, LineEnding};
use chardetng::EncodingDetector;
use encoding_rs::Encoding;
use memmap2::Mmap;
use pinyin::ToPinyin;
use ropey::Rope;
use std::collections::{BTreeSet, HashSet};
use std::fs::{self, File};
use std::process::Command;
use tauri::State;
use tree_sitter::{InputEdit, Point};
use uuid::Uuid;

mod search;
pub(crate) mod search_commands;
mod outline;
mod config;
mod document;
mod file_io;
pub(crate) mod file_io_commands;
mod editing;
pub(crate) mod editing_commands;
mod formatting;
mod syntax;
mod settings;
mod types;
mod text_utils;
mod constants;

use self::search::*;
pub use self::settings::AppConfig;
pub use self::types::{
    DirEntry,
    EditHistoryState,
    FileInfo,
    SyntaxToken,
    WindowsFileAssociationStatus,
};
use self::constants::*;

#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    let source = font_kit::source::SystemSource::new();
    let families = source.all_families().map_err(|error| error.to_string())?;

    let mut normalized = families
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<String>>();

    normalized.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    normalized.dedup_by(|left, right| left.to_lowercase() == right.to_lowercase());

    Ok(normalized)
}

#[tauri::command]
pub fn register_windows_context_menu(language: Option<String>) -> Result<(), String> {
    config::register_windows_context_menu_impl(language)
}

#[tauri::command]
pub fn unregister_windows_context_menu() -> Result<(), String> {
    config::unregister_windows_context_menu_impl()
}

#[tauri::command]
pub fn is_windows_context_menu_registered() -> bool {
    config::is_windows_context_menu_registered_impl()
}

#[tauri::command]
pub fn get_default_windows_file_association_extensions() -> Vec<String> {
    config::get_default_windows_file_association_extensions_impl()
}

#[tauri::command]
pub fn apply_windows_file_associations(
    language: Option<String>,
    extensions: Vec<String>,
    open_settings_page: Option<bool>,
) -> Result<Vec<String>, String> {
    config::apply_windows_file_associations_impl(
        language,
        extensions,
        open_settings_page.unwrap_or(false),
    )
}

#[tauri::command]
pub fn remove_windows_file_associations(extensions: Vec<String>) -> Result<(), String> {
    config::remove_windows_file_associations_impl(extensions)
}

#[tauri::command]
pub fn get_windows_file_association_status(extensions: Vec<String>) -> WindowsFileAssociationStatus {
    config::get_windows_file_association_status_impl(extensions)
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    config::load_config_impl()
}

pub fn is_single_instance_mode_enabled_in_config() -> bool {
    config::is_single_instance_mode_enabled_in_config_impl()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    config::save_config_impl(config)
}

#[tauri::command]
pub fn load_filter_rule_groups_config() -> Result<Vec<FilterRuleGroupConfig>, String> {
    config::load_filter_rule_groups_config_impl()
}

#[tauri::command]
pub fn save_filter_rule_groups_config(groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
    config::save_filter_rule_groups_config_impl(groups)
}

#[tauri::command]
pub fn import_filter_rule_groups(path: String) -> Result<Vec<FilterRuleGroupConfig>, String> {
    config::import_filter_rule_groups_impl(path)
}

#[tauri::command]
pub fn export_filter_rule_groups(path: String, groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
    config::export_filter_rule_groups_impl(path, groups)
}

#[tauri::command]
pub fn get_startup_paths(state: State<'_, AppState>) -> Vec<String> {
    config::get_startup_paths_impl(state)
}

#[tauri::command]
pub fn get_document_version(state: State<'_, AppState>, id: String) -> Result<u64, String> {
    document::get_document_version_impl(state, id)
}

#[tauri::command]
pub fn get_syntax_tokens(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<Vec<SyntaxToken>, String> {
    document::get_syntax_tokens_impl(state, id, start_line, end_line)
}

#[tauri::command]
pub fn get_outline(
    state: State<'_, AppState>,
    id: String,
    file_type: String,
) -> Result<Vec<outline::OutlineNode>, String> {
    outline::get_outline_impl(state, id, file_type)
}

