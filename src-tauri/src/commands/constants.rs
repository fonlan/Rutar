pub(super) const LARGE_FILE_THRESHOLD_BYTES: usize = 50 * 1024 * 1024;
pub(super) const ENCODING_DETECT_SAMPLE_BYTES: usize = 1024 * 1024;
pub(super) const DEFAULT_LANGUAGE: &str = "zh-CN";
pub(super) const DEFAULT_THEME: &str = "light";
pub(super) const DEFAULT_FONT_FAMILY: &str = "Consolas, \"Courier New\", monospace";
pub(super) const DEFAULT_FONT_SIZE: u32 = 14;
pub(super) const DEFAULT_TAB_WIDTH: u8 = 4;
pub(super) const DEFAULT_DOUBLE_CLICK_CLOSE_TAB: bool = true;
pub(super) const DEFAULT_SHOW_LINE_NUMBERS: bool = true;
pub(super) const DEFAULT_HIGHLIGHT_CURRENT_LINE: bool = true;
pub(super) const DEFAULT_SINGLE_INSTANCE_MODE: bool = true;
pub(super) const MAX_RECENT_PATHS: usize = 12;
pub(super) const DEFAULT_FILTER_RULE_TEXT: &str = "#1f2937";
pub(super) const FILTER_MAX_RANGES_PER_LINE: usize = 256;
pub(super) const DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS: &[&str] = &[
    ".txt", ".md", ".log", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ini", ".conf",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thresholds_should_be_positive_and_consistent() {
        assert!(LARGE_FILE_THRESHOLD_BYTES > 0);
        assert!(ENCODING_DETECT_SAMPLE_BYTES > 0);
        assert!(LARGE_FILE_THRESHOLD_BYTES >= ENCODING_DETECT_SAMPLE_BYTES);
    }

    #[test]
    fn default_windows_file_association_extensions_should_be_unique_prefixed_and_lowercase() {
        assert!(!DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS.is_empty());
        assert!(DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS
            .iter()
            .all(|item| item.starts_with('.')));
        assert!(DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS
            .iter()
            .all(|item| item.chars().all(|ch| !ch.is_ascii_uppercase())));

        let mut unique = std::collections::BTreeSet::new();
        for extension in DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS {
            assert!(unique.insert(*extension));
        }
    }
}
