use super::*;

pub(super) fn default_windows_file_association_extensions() -> Vec<String> {
    DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

fn default_single_instance_mode() -> bool {
    DEFAULT_SINGLE_INSTANCE_MODE
}

fn default_recent_paths() -> Vec<String> {
    Vec::new()
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub(super) language: String,
    pub(super) theme: String,
    pub(super) font_family: String,
    pub(super) font_size: u32,
    pub(super) tab_width: u8,
    pub(super) word_wrap: bool,
    pub(super) double_click_close_tab: bool,
    pub(super) highlight_current_line: bool,
    #[serde(default = "default_single_instance_mode")]
    pub(super) single_instance_mode: bool,
    #[serde(default = "default_recent_paths")]
    pub(super) recent_files: Vec<String>,
    #[serde(default = "default_recent_paths")]
    pub(super) recent_folders: Vec<String>,
    #[serde(default = "default_windows_file_association_extensions")]
    pub(super) windows_file_association_extensions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) filter_rule_groups: Option<Vec<FilterRuleGroupConfig>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialAppConfig {
    pub(super) language: Option<String>,
    pub(super) theme: Option<String>,
    pub(super) font_family: Option<String>,
    pub(super) font_size: Option<u32>,
    pub(super) tab_width: Option<u8>,
    pub(super) word_wrap: Option<bool>,
    pub(super) double_click_close_tab: Option<bool>,
    pub(super) highlight_current_line: Option<bool>,
    pub(super) single_instance_mode: Option<bool>,
    pub(super) recent_files: Option<Vec<String>>,
    pub(super) recent_folders: Option<Vec<String>>,
    pub(super) windows_file_association_extensions: Option<Vec<String>>,
    pub(super) filter_rule_groups: Option<Vec<FilterRuleGroupConfig>>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.to_string(),
            theme: DEFAULT_THEME.to_string(),
            font_family: DEFAULT_FONT_FAMILY.to_string(),
            font_size: DEFAULT_FONT_SIZE,
            tab_width: DEFAULT_TAB_WIDTH,
            word_wrap: false,
            double_click_close_tab: DEFAULT_DOUBLE_CLICK_CLOSE_TAB,
            highlight_current_line: DEFAULT_HIGHLIGHT_CURRENT_LINE,
            single_instance_mode: DEFAULT_SINGLE_INSTANCE_MODE,
            recent_files: default_recent_paths(),
            recent_folders: default_recent_paths(),
            windows_file_association_extensions: default_windows_file_association_extensions(),
            filter_rule_groups: None,
        }
    }
}

pub(super) fn normalize_language(language: Option<&str>) -> String {
    match language {
        Some("en-US") => "en-US".to_string(),
        _ => DEFAULT_LANGUAGE.to_string(),
    }
}

pub(super) fn normalize_theme(theme: Option<&str>) -> String {
    match theme {
        Some("dark") => "dark".to_string(),
        _ => DEFAULT_THEME.to_string(),
    }
}

pub(super) fn normalize_tab_width(tab_width: u8) -> u8 {
    tab_width.clamp(1, 8)
}
