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

fn default_remember_window_state() -> bool {
    true
}

fn default_recent_paths() -> Vec<String> {
    Vec::new()
}

fn default_mouse_gestures_enabled() -> bool {
    true
}

fn default_mouse_gestures() -> Vec<MouseGestureConfig> {
    vec![
        MouseGestureConfig {
            pattern: "L".to_string(),
            action: "previousTab".to_string(),
        },
        MouseGestureConfig {
            pattern: "R".to_string(),
            action: "nextTab".to_string(),
        },
        MouseGestureConfig {
            pattern: "U".to_string(),
            action: "toTop".to_string(),
        },
        MouseGestureConfig {
            pattern: "D".to_string(),
            action: "toBottom".to_string(),
        },
        MouseGestureConfig {
            pattern: "DR".to_string(),
            action: "closeCurrentTab".to_string(),
        },
    ]
}

fn default_new_file_line_ending() -> String {
    default_line_ending().label().to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowStateConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) height: Option<u32>,
    #[serde(default)]
    pub(super) maximized: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MouseGestureConfig {
    pub(super) pattern: String,
    pub(super) action: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub(super) language: String,
    pub(super) theme: String,
    pub(super) font_family: String,
    pub(super) font_size: u32,
    pub(super) tab_width: u8,
    #[serde(default = "default_new_file_line_ending")]
    pub(super) new_file_line_ending: String,
    pub(super) word_wrap: bool,
    pub(super) double_click_close_tab: bool,
    pub(super) show_line_numbers: bool,
    pub(super) highlight_current_line: bool,
    #[serde(default = "default_single_instance_mode")]
    pub(super) single_instance_mode: bool,
    #[serde(default = "default_remember_window_state")]
    pub(super) remember_window_state: bool,
    #[serde(default = "default_recent_paths")]
    pub(super) recent_files: Vec<String>,
    #[serde(default = "default_recent_paths")]
    pub(super) recent_folders: Vec<String>,
    #[serde(default = "default_windows_file_association_extensions")]
    pub(super) windows_file_association_extensions: Vec<String>,
    #[serde(default = "default_mouse_gestures_enabled")]
    pub(super) mouse_gestures_enabled: bool,
    #[serde(default = "default_mouse_gestures")]
    pub(super) mouse_gestures: Vec<MouseGestureConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) window_state: Option<WindowStateConfig>,
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
    pub(super) new_file_line_ending: Option<String>,
    pub(super) word_wrap: Option<bool>,
    pub(super) double_click_close_tab: Option<bool>,
    pub(super) show_line_numbers: Option<bool>,
    pub(super) highlight_current_line: Option<bool>,
    pub(super) single_instance_mode: Option<bool>,
    pub(super) remember_window_state: Option<bool>,
    pub(super) recent_files: Option<Vec<String>>,
    pub(super) recent_folders: Option<Vec<String>>,
    pub(super) windows_file_association_extensions: Option<Vec<String>>,
    pub(super) mouse_gestures_enabled: Option<bool>,
    pub(super) mouse_gestures: Option<Vec<MouseGestureConfig>>,
    pub(super) window_state: Option<WindowStateConfig>,
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
            new_file_line_ending: default_new_file_line_ending(),
            word_wrap: false,
            double_click_close_tab: DEFAULT_DOUBLE_CLICK_CLOSE_TAB,
            show_line_numbers: DEFAULT_SHOW_LINE_NUMBERS,
            highlight_current_line: DEFAULT_HIGHLIGHT_CURRENT_LINE,
            single_instance_mode: DEFAULT_SINGLE_INSTANCE_MODE,
            remember_window_state: default_remember_window_state(),
            recent_files: default_recent_paths(),
            recent_folders: default_recent_paths(),
            windows_file_association_extensions: default_windows_file_association_extensions(),
            mouse_gestures_enabled: default_mouse_gestures_enabled(),
            mouse_gestures: default_mouse_gestures(),
            window_state: None,
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

pub(super) fn normalize_new_file_line_ending(label: Option<&str>) -> String {
    label
        .and_then(LineEnding::from_label)
        .unwrap_or_else(default_line_ending)
        .label()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_language_should_only_accept_supported_values() {
        assert_eq!(normalize_language(Some("en-US")), "en-US");
        assert_eq!(normalize_language(Some("zh-CN")), DEFAULT_LANGUAGE);
        assert_eq!(normalize_language(Some("unknown")), DEFAULT_LANGUAGE);
        assert_eq!(normalize_language(None), DEFAULT_LANGUAGE);
    }

    #[test]
    fn normalize_theme_should_only_accept_dark_or_default() {
        assert_eq!(normalize_theme(Some("dark")), "dark");
        assert_eq!(normalize_theme(Some("light")), DEFAULT_THEME);
        assert_eq!(normalize_theme(None), DEFAULT_THEME);
    }

    #[test]
    fn normalize_tab_width_should_be_clamped_to_valid_range() {
        assert_eq!(normalize_tab_width(0), 1);
        assert_eq!(normalize_tab_width(4), 4);
        assert_eq!(normalize_tab_width(9), 8);
    }

    #[test]
    fn normalize_new_file_line_ending_should_fallback_to_platform_default() {
        assert_eq!(normalize_new_file_line_ending(Some("lf")), "LF");
        assert_eq!(
            normalize_new_file_line_ending(Some("invalid")),
            default_line_ending().label()
        );
        assert_eq!(
            normalize_new_file_line_ending(None),
            default_line_ending().label()
        );
    }

    #[test]
    fn app_config_default_should_use_expected_defaults() {
        let config = AppConfig::default();

        assert_eq!(config.language, DEFAULT_LANGUAGE);
        assert_eq!(config.theme, DEFAULT_THEME);
        assert_eq!(config.tab_width, DEFAULT_TAB_WIDTH);
        assert_eq!(config.new_file_line_ending, default_line_ending().label());
        assert_eq!(config.single_instance_mode, DEFAULT_SINGLE_INSTANCE_MODE);
        assert!(config.remember_window_state);
        assert!(config.mouse_gestures_enabled);
        assert!(!config.mouse_gestures.is_empty());
    }

    #[test]
    fn default_windows_file_association_extensions_should_be_non_empty_and_prefixed() {
        let extensions = default_windows_file_association_extensions();
        assert!(!extensions.is_empty());
        assert!(extensions.iter().all(|item| item.starts_with('.')));
    }
}
