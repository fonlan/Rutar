use crate::state::{default_line_ending, AppState, Document, EditOperation, LineEnding};
use chardetng::EncodingDetector;
use dashmap::DashMap;
use encoding_rs::Encoding;
use memmap2::Mmap;
use pinyin::ToPinyin;
use ropey::Rope;
use std::collections::{BTreeSet, HashSet};
use std::fs::{self, File};
use std::process::Command;
use std::sync::OnceLock;
use tauri::State;
use tree_sitter::{InputEdit, Point};
use uuid::Uuid;

mod config;
mod constants;
mod diff;
mod document;
mod editing;
pub(crate) mod editing_commands;
mod file_io;
pub(crate) mod file_io_commands;
mod formatting;
mod outline;
mod search;
pub(crate) mod search_commands;
mod settings;
mod syntax;
mod text_utils;
mod types;

use self::constants::*;
use self::search::*;
pub use self::settings::AppConfig;
pub use self::types::{
    DirEntry, EditHistoryState, FileInfo, SyntaxToken, WindowsFileAssociationStatus, WordCountInfo,
};

#[derive(Clone, Copy)]
pub struct PersistedWindowState {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub maximized: bool,
}

static EXTERNAL_CHANGE_NOTIFIED_IDS: OnceLock<DashMap<String, ()>> = OnceLock::new();

fn external_change_notified_ids() -> &'static DashMap<String, ()> {
    EXTERNAL_CHANGE_NOTIFIED_IDS.get_or_init(DashMap::new)
}

pub fn collect_external_file_change_document_ids(state: State<'_, AppState>) -> Vec<String> {
    let cache = external_change_notified_ids();
    let mut active_ids = HashSet::new();
    let mut changed_ids = Vec::new();

    for doc in state.documents.iter() {
        let id = doc.key().clone();
        active_ids.insert(id.clone());

        let changed = doc
            .path
            .as_ref()
            .map(|path| {
                file_io::has_external_file_change_by_snapshot(path, doc.saved_file_fingerprint)
            })
            .unwrap_or(false);

        if changed {
            if cache.insert(id.clone(), ()).is_none() {
                changed_ids.push(id);
            }
        } else {
            cache.remove(&id);
        }
    }

    let stale_ids: Vec<String> = cache
        .iter()
        .map(|entry| entry.key().clone())
        .filter(|id| !active_ids.contains(id))
        .collect();

    for id in stale_ids {
        cache.remove(&id);
    }

    changed_ids
}

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
pub fn get_windows_file_association_status(
    extensions: Vec<String>,
) -> WindowsFileAssociationStatus {
    config::get_windows_file_association_status_impl(extensions)
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    config::load_config_impl()
}

pub fn is_single_instance_mode_enabled_in_config() -> bool {
    config::is_single_instance_mode_enabled_in_config_impl()
}

pub fn is_remember_window_state_enabled_in_config() -> bool {
    config::is_remember_window_state_enabled_in_config_impl()
}

pub fn load_main_window_state_in_config() -> Option<PersistedWindowState> {
    config::load_main_window_state_in_config_impl().map(|window_state| PersistedWindowState {
        width: window_state.width,
        height: window_state.height,
        maximized: window_state.maximized,
    })
}

pub fn save_main_window_state_in_config(
    width: Option<u32>,
    height: Option<u32>,
    maximized: bool,
) -> Result<(), String> {
    config::save_main_window_state_in_config_impl(width, height, maximized)
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
pub fn export_filter_rule_groups(
    path: String,
    groups: Vec<FilterRuleGroupConfig>,
) -> Result<(), String> {
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
pub fn get_syntax_token_lines(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<Vec<Vec<SyntaxToken>>, String> {
    document::get_syntax_token_lines_impl(state, id, start_line, end_line)
}

#[tauri::command]
pub fn get_outline(
    state: State<'_, AppState>,
    id: String,
    file_type: String,
) -> Result<Vec<outline::OutlineNode>, String> {
    outline::get_outline_impl(state, id, file_type)
}

#[tauri::command]
pub fn filter_outline_nodes(
    nodes: Vec<outline::OutlineNode>,
    keyword: String,
) -> Vec<outline::OutlineNode> {
    outline::filter_outline_nodes_impl(nodes, keyword)
}

#[tauri::command]
pub async fn compare_documents_by_line(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<diff::LineDiffResult, String> {
    diff::compare_documents_by_line_impl(state, source_id, target_id).await
}

#[cfg(test)]
mod tests {
    use super::external_change_notified_ids;

    #[test]
    fn external_change_notified_ids_should_return_singleton_instance() {
        let first = external_change_notified_ids();
        let second = external_change_notified_ids();

        assert!(std::ptr::eq(first, second));

        first.clear();
        first.insert("doc-1".to_string(), ());
        assert!(second.contains_key("doc-1"));
        second.clear();
    }
}
