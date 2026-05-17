// Cross-platform persisted-config IO and normalization. Windows-shell
// integrations (registry-backed context menu + file associations) live in
// `super::windows_integration` and are reached via the `#[cfg(windows)]`
// branches of the fa\xC3\xA7ade functions below.

use super::super::*;

use std::path::PathBuf;

#[cfg(windows)]
use super::windows_integration;

pub(crate) fn normalize_filter_rule_input(rule: FilterRuleInput) -> Option<FilterRuleInput> {
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

pub(crate) fn normalize_filter_rule_groups(
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

pub(crate) fn normalize_windows_file_association_extension(value: &str) -> Option<String> {
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

pub(crate) fn normalize_windows_file_association_extensions(
    extensions: Option<Vec<String>>,
) -> Vec<String> {
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

pub(crate) fn normalize_recent_paths(paths: Option<Vec<String>>) -> Vec<String> {
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

pub(crate) fn normalize_recent_text_history(entries: Option<Vec<String>>) -> Vec<String> {
    let mut normalized_entries: Vec<String> = Vec::new();

    for entry in entries.unwrap_or_default() {
        if normalized_entries.iter().any(|item| item == &entry) {
            continue;
        }

        normalized_entries.push(entry);

        if normalized_entries.len() >= MAX_RECENT_TEXT_HISTORY_ITEMS {
            break;
        }
    }

    normalized_entries
}

pub(crate) fn normalize_mouse_gesture_pattern(value: &str) -> String {
    value
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|ch| matches!(ch, 'L' | 'R' | 'U' | 'D'))
        .take(8)
        .collect()
}

pub(crate) fn is_valid_mouse_gesture_action(value: &str) -> bool {
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

pub(crate) fn normalize_mouse_gestures(
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

pub(crate) fn normalize_window_state(
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

pub(crate) fn normalize_app_config(config: AppConfig) -> AppConfig {
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
        tab_indent_mode: settings::normalize_tab_indent_mode(Some(config.tab_indent_mode.as_str())),
        new_file_line_ending: settings::normalize_new_file_line_ending(Some(
            config.new_file_line_ending.as_str(),
        )),
        word_wrap: config.word_wrap,
        minimap: config.minimap,
        double_click_close_tab: config.double_click_close_tab,
        show_line_numbers: config.show_line_numbers,
        highlight_current_line: config.highlight_current_line,
        single_instance_mode: config.single_instance_mode,
        remember_window_state: config.remember_window_state,
        recent_files: normalize_recent_paths(Some(config.recent_files)),
        recent_folders: normalize_recent_paths(Some(config.recent_folders)),
        recent_search_keywords: normalize_recent_text_history(Some(config.recent_search_keywords)),
        recent_replace_values: normalize_recent_text_history(Some(config.recent_replace_values)),
        pinned_tab_paths: normalize_recent_paths(Some(config.pinned_tab_paths)),
        windows_file_association_extensions: normalize_windows_file_association_extensions(Some(
            config.windows_file_association_extensions,
        )),
        mouse_gestures_enabled: config.mouse_gestures_enabled,
        mouse_gestures: normalize_mouse_gestures(Some(config.mouse_gestures)),
        window_state: normalize_window_state(config.window_state),
        filter_rule_groups: normalize_filter_rule_groups(config.filter_rule_groups),
    }
}

fn config_file_path() -> Result<PathBuf, String> {
    let app_data =
        std::env::var("APPDATA").map_err(|_| "Failed to locate APPDATA directory".to_string())?;
    Ok(PathBuf::from(app_data).join("Rutar").join("config.json"))
}

pub(crate) fn get_startup_paths_impl(state: State<'_, AppState>) -> Vec<String> {
    state.take_startup_paths()
}

// --- Windows shell integration facade (no-op on non-Windows) ---------

pub(crate) fn register_windows_context_menu_impl(language: Option<String>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = language;
        Err("Windows context menu is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        windows_integration::register_context_menu(language)
    }
}

pub(crate) fn unregister_windows_context_menu_impl() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Err("Windows context menu is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        windows_integration::unregister_context_menu()
    }
}

pub(crate) fn is_windows_context_menu_registered_impl() -> bool {
    #[cfg(not(windows))]
    {
        false
    }

    #[cfg(windows)]
    {
        windows_integration::is_context_menu_registered()
    }
}

pub(crate) fn get_default_windows_file_association_extensions_impl() -> Vec<String> {
    settings::default_windows_file_association_extensions()
}

pub(crate) fn apply_windows_file_associations_impl(
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
        windows_integration::apply_file_associations(language, extensions, open_settings_page)
    }
}

pub(crate) fn remove_windows_file_associations_impl(extensions: Vec<String>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = extensions;
        Err("Windows file association is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        windows_integration::remove_file_associations(extensions)
    }
}

pub(crate) fn get_windows_file_association_status_impl(
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
            enabled: windows_integration::is_windows_file_association_registered(
                &normalized_extensions,
            ),
            extensions: normalized_extensions,
        }
    }
}

// --- Persisted config IO --------------------------------------------------

pub(crate) fn load_config_impl() -> Result<AppConfig, String> {
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

    if let Some(tab_indent_mode) = partial.tab_indent_mode {
        config.tab_indent_mode =
            settings::normalize_tab_indent_mode(Some(tab_indent_mode.as_str()));
    }

    if let Some(new_file_line_ending) = partial.new_file_line_ending {
        config.new_file_line_ending =
            settings::normalize_new_file_line_ending(Some(new_file_line_ending.as_str()));
    }

    if let Some(word_wrap) = partial.word_wrap {
        config.word_wrap = word_wrap;
    }

    if let Some(minimap) = partial.minimap {
        config.minimap = minimap;
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

    if let Some(recent_search_keywords) = partial.recent_search_keywords {
        config.recent_search_keywords = normalize_recent_text_history(Some(recent_search_keywords));
    }

    if let Some(recent_replace_values) = partial.recent_replace_values {
        config.recent_replace_values = normalize_recent_text_history(Some(recent_replace_values));
    }

    if let Some(pinned_tab_paths) = partial.pinned_tab_paths {
        config.pinned_tab_paths = normalize_recent_paths(Some(pinned_tab_paths));
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

pub(crate) fn is_single_instance_mode_enabled_in_config_impl() -> bool {
    load_config_impl()
        .map(|config| config.single_instance_mode)
        .unwrap_or(DEFAULT_SINGLE_INSTANCE_MODE)
}

pub(crate) fn is_remember_window_state_enabled_in_config_impl() -> bool {
    load_config_impl()
        .map(|config| config.remember_window_state)
        .unwrap_or(true)
}

pub(crate) fn load_main_window_state_in_config_impl() -> Option<settings::WindowStateConfig> {
    load_config_impl()
        .ok()
        .filter(|config| config.remember_window_state)
        .and_then(|config| normalize_window_state(config.window_state))
}

pub(crate) fn save_main_window_state_in_config_impl(
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

pub(crate) fn save_config_impl(config: AppConfig) -> Result<(), String> {
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
        windows_integration::sync_with_saved_config(&normalized)?;
    }

    Ok(())
}

pub(crate) fn load_filter_rule_groups_config_impl() -> Result<Vec<FilterRuleGroupConfig>, String> {
    let config = load_config_impl()?;
    Ok(config.filter_rule_groups.unwrap_or_default())
}

pub(crate) fn save_filter_rule_groups_config_impl(
    groups: Vec<FilterRuleGroupConfig>,
) -> Result<(), String> {
    let mut config = load_config_impl()?;
    config.filter_rule_groups = normalize_filter_rule_groups(Some(groups));
    save_config_impl(config)
}

pub(crate) fn import_filter_rule_groups_impl(
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

pub(crate) fn export_filter_rule_groups_impl(
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

    fn make_rule(
        keyword: &str,
        match_mode: &str,
        apply_to: &str,
        text_color: &str,
    ) -> FilterRuleInput {
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
        let normalized =
            normalize_filter_rule_input(make_rule("  error  ", "exists", "LINE", "  "));
        assert!(normalized.is_some());

        let normalized = normalized.expect("normalized rule should exist");
        assert_eq!(normalized.keyword, "error");
        assert_eq!(normalized.match_mode, "contains");
        assert_eq!(normalized.apply_to, "line");
        assert_eq!(normalized.text_color, DEFAULT_FILTER_RULE_TEXT);
    }

    #[test]
    fn normalize_filter_rule_input_should_drop_invalid_rules() {
        assert!(
            normalize_filter_rule_input(make_rule("   ", "contains", "line", "#fff")).is_none()
        );
        assert!(normalize_filter_rule_input(make_rule("x", "invalid", "line", "#fff")).is_none());
        assert!(
            normalize_filter_rule_input(make_rule("x", "contains", "invalid", "#fff")).is_none()
        );
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
        assert_eq!(
            fallback,
            settings::default_windows_file_association_extensions()
        );
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
    fn normalize_recent_text_history_should_dedup_and_limit_length_without_trimming() {
        let mut source = vec!["".to_string(), "  ".to_string(), "".to_string()];
        source.extend((0..(MAX_RECENT_TEXT_HISTORY_ITEMS + 5)).map(|i| format!("value{}", i)));

        let normalized = normalize_recent_text_history(Some(source));
        assert_eq!(normalized[0], "");
        assert_eq!(normalized[1], "  ");
        assert_eq!(normalized.len(), MAX_RECENT_TEXT_HISTORY_ITEMS);
    }

    #[test]
    fn normalize_mouse_gesture_pattern_should_filter_and_uppercase() {
        assert_eq!(normalize_mouse_gesture_pattern(" lrxdu9 "), "LRDU");
        assert_eq!(normalize_mouse_gesture_pattern("123"), "");
        assert_eq!(
            normalize_mouse_gesture_pattern("llllrrrruuuudddd"),
            "LLLLRRRR"
        );
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
            tab_indent_mode: "invalid".to_string(),
            new_file_line_ending: "bad".to_string(),
            word_wrap: true,
            minimap: false,
            double_click_close_tab: true,
            show_line_numbers: true,
            highlight_current_line: true,
            single_instance_mode: true,
            remember_window_state: true,
            recent_files: vec!["  a  ".to_string(), "a".to_string()],
            recent_folders: vec!["  b  ".to_string(), "b".to_string()],
            recent_search_keywords: vec![
                "alpha".to_string(),
                "alpha".to_string(),
                "  ".to_string(),
            ],
            recent_replace_values: vec!["".to_string(), "beta".to_string(), "beta".to_string()],
            pinned_tab_paths: vec!["  c  ".to_string(), "c".to_string()],
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
        assert_eq!(normalized.tab_indent_mode, "tabs");
        assert_eq!(
            normalized.new_file_line_ending,
            crate::state::default_line_ending().label()
        );
        assert!(!normalized.minimap);
        assert_eq!(normalized.recent_files, vec!["a".to_string()]);
        assert_eq!(normalized.recent_folders, vec!["b".to_string()]);
        assert_eq!(
            normalized.recent_search_keywords,
            vec!["alpha".to_string(), "  ".to_string()]
        );
        assert_eq!(
            normalized.recent_replace_values,
            vec!["".to_string(), "beta".to_string()]
        );
        assert_eq!(normalized.pinned_tab_paths, vec!["c".to_string()]);
        assert_eq!(
            normalized.windows_file_association_extensions,
            vec![".txt".to_string()]
        );
        assert_eq!(normalized.mouse_gestures.len(), 1);
        assert_eq!(normalized.mouse_gestures[0].pattern, "L");
        assert!(normalized.filter_rule_groups.is_some());
    }
}
