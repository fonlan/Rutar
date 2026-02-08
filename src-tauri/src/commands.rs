use crate::state::{AppState, Document, EditOperation};
use chardetng::EncodingDetector;
use encoding_rs::Encoding;
use memmap2::Mmap;
use quick_xml::events::Event;
use quick_xml::{Reader, Writer};
use regex::RegexBuilder;
use ropey::Rope;
use serde::Serialize;
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::path::PathBuf;
use tauri::State;
use tree_sitter::{InputEdit, Language, Parser, Point};
use uuid::Uuid;

#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, SHCNF_IDLIST, SHChangeNotify,
};

const LARGE_FILE_THRESHOLD_BYTES: usize = 50 * 1024 * 1024;
const ENCODING_DETECT_SAMPLE_BYTES: usize = 1024 * 1024;
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_THEME: &str = "light";
const DEFAULT_FONT_FAMILY: &str = "Consolas, \"Courier New\", monospace";
const DEFAULT_FONT_SIZE: u32 = 14;
const DEFAULT_TAB_WIDTH: u8 = 4;
const DEFAULT_HIGHLIGHT_CURRENT_LINE: bool = true;
const DEFAULT_FILTER_RULE_TEXT: &str = "#1f2937";
const FILTER_MAX_RANGES_PER_LINE: usize = 256;
const DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS: &[&str] = &[
    ".txt", ".md", ".log", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ini",
    ".cfg", ".conf", ".csv",
];

fn default_windows_file_association_extensions() -> Vec<String> {
    DEFAULT_WINDOWS_FILE_ASSOCIATION_EXTENSIONS
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    language: String,
    theme: String,
    font_family: String,
    font_size: u32,
    tab_width: u8,
    word_wrap: bool,
    highlight_current_line: bool,
    #[serde(default = "default_windows_file_association_extensions")]
    windows_file_association_extensions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    filter_rule_groups: Option<Vec<FilterRuleGroupConfig>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialAppConfig {
    language: Option<String>,
    theme: Option<String>,
    font_family: Option<String>,
    font_size: Option<u32>,
    tab_width: Option<u8>,
    word_wrap: Option<bool>,
    highlight_current_line: Option<bool>,
    windows_file_association_extensions: Option<Vec<String>>,
    filter_rule_groups: Option<Vec<FilterRuleGroupConfig>>,
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
            highlight_current_line: DEFAULT_HIGHLIGHT_CURRENT_LINE,
            windows_file_association_extensions: default_windows_file_association_extensions(),
            filter_rule_groups: None,
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    id: String,
    path: String,
    name: String,
    encoding: String,
    line_count: usize,
    large_file_mode: bool,
}

#[derive(serde::Serialize)]
pub struct SyntaxToken {
    #[serde(skip_serializing_if = "Option::is_none")]
    r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_byte: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_byte: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchResult {
    start: usize,
    end: usize,
    start_char: usize,
    end_char: usize,
    text: String,
    line: usize,
    column: usize,
    line_text: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPayload {
    matches: Vec<SearchMatchResult>,
    document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFirstResultPayload {
    first_match: Option<SearchMatchResult>,
    document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunkResultPayload {
    matches: Vec<SearchMatchResult>,
    document_version: u64,
    next_offset: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCountResultPayload {
    total_matches: usize,
    matched_lines: usize,
    document_version: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleInput {
    keyword: String,
    match_mode: String,
    background_color: String,
    text_color: String,
    bold: bool,
    italic: bool,
    apply_to: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleGroupConfig {
    name: String,
    rules: Vec<FilterRuleInput>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilterRuleGroupsFilePayload {
    filter_rule_groups: Vec<FilterRuleGroupConfig>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleStyleResult {
    background_color: String,
    text_color: String,
    bold: bool,
    italic: bool,
    apply_to: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterMatchRangeResult {
    start_char: usize,
    end_char: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterLineMatchResult {
    line: usize,
    column: usize,
    length: usize,
    line_text: String,
    rule_index: usize,
    style: FilterRuleStyleResult,
    ranges: Vec<FilterMatchRangeResult>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterChunkResultPayload {
    matches: Vec<FilterLineMatchResult>,
    document_version: u64,
    next_line: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterCountResultPayload {
    matched_lines: usize,
    document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentTreeNode {
    label: String,
    node_type: String,
    line: usize,
    column: usize,
    children: Vec<ContentTreeNode>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFileAssociationStatus {
    enabled: bool,
    extensions: Vec<String>,
}

#[derive(Clone, Copy)]
enum ContentTreeFileType {
    Json,
    Yaml,
    Xml,
}

#[derive(Clone, Copy)]
enum StructuredFormat {
    Json,
    Yaml,
    Xml,
    Toml,
}

#[derive(Clone, Copy)]
enum FormatMode {
    Beautify,
    Minify,
}

#[derive(Debug)]
struct LeafToken {
    kind: String,
    start_byte: usize,
    end_byte: usize,
}

fn truncate_preview(value: &str, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value.to_string();
    }

    let mut preview: String = value.chars().take(max_len).collect();
    preview.push_str("...");
    preview
}

fn parse_content_tree_file_type(file_type: &str) -> Option<ContentTreeFileType> {
    match file_type.trim().to_lowercase().as_str() {
        "json" => Some(ContentTreeFileType::Json),
        "yaml" | "yml" => Some(ContentTreeFileType::Yaml),
        "xml" => Some(ContentTreeFileType::Xml),
        _ => None,
    }
}

fn get_content_tree_language(file_type: ContentTreeFileType) -> Language {
    match file_type {
        ContentTreeFileType::Json => tree_sitter_json::LANGUAGE.into(),
        ContentTreeFileType::Yaml => tree_sitter_yaml::LANGUAGE.into(),
        ContentTreeFileType::Xml => tree_sitter_xml::LANGUAGE_XML.into(),
    }
}

fn get_node_text_preview(node: tree_sitter::Node<'_>, source: &str, max_len: usize) -> String {
    let snippet = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    truncate_preview(snippet.trim(), max_len)
}

fn first_named_child(node: tree_sitter::Node<'_>) -> Option<tree_sitter::Node<'_>> {
    let mut cursor = node.walk();
    let first = node.children(&mut cursor).find(|child| child.is_named());
    first
}

fn second_named_child(node: tree_sitter::Node<'_>) -> Option<tree_sitter::Node<'_>> {
    let mut cursor = node.walk();
    let mut found_first = false;

    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if !found_first {
            found_first = true;
            continue;
        }

        return Some(child);
    }

    None
}

fn is_pair_kind(kind: &str) -> bool {
    kind == "pair" || kind.contains("pair")
}

fn is_container_kind(file_type: ContentTreeFileType, kind: &str) -> bool {
    match file_type {
        ContentTreeFileType::Json => kind == "object" || kind == "array",
        ContentTreeFileType::Yaml => {
            kind == "document"
                || kind == "stream"
                || kind.contains("mapping")
                || kind.contains("sequence")
        }
        ContentTreeFileType::Xml => kind == "document" || kind == "element",
    }
}

fn is_scalar_value_kind(file_type: ContentTreeFileType, kind: &str) -> bool {
    !is_pair_kind(kind) && !is_container_kind(file_type, kind)
}

fn format_content_tree_label(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: ContentTreeFileType,
    has_named_children: bool,
) -> String {
    let kind = node.kind();

    match file_type {
        ContentTreeFileType::Json => match kind {
            "object" => "{}".to_string(),
            "array" => "[]".to_string(),
            "pair" => {
                if let Some(key_node) = first_named_child(node) {
                    let key = get_node_text_preview(key_node, source, 60).trim_matches('"').to_string();

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!("{}: {}", key, get_node_text_preview(value_node, source, 80));
                        }
                    }

                    return format!("{}:", key);
                }

                kind.to_string()
            }
            "string" | "number" | "true" | "false" | "null" => {
                get_node_text_preview(node, source, 80)
            }
            _ => {
                if has_named_children {
                    kind.to_string()
                } else {
                    get_node_text_preview(node, source, 80)
                }
            }
        },
        ContentTreeFileType::Yaml => {
            if kind.contains("mapping") {
                return "{}".to_string();
            }

            if kind.contains("sequence") {
                return "[]".to_string();
            }

            if kind.contains("pair") {
                if let Some(key_node) = first_named_child(node) {
                    let key = get_node_text_preview(key_node, source, 60);

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!("{}: {}", key, get_node_text_preview(value_node, source, 80));
                        }
                    }

                    return format!("{}:", key);
                }
            }

            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
        ContentTreeFileType::Xml => {
            if kind == "element" {
                let preview = get_node_text_preview(node, source, 80);
                if let Some(raw_name) = preview
                    .trim_start_matches('<')
                    .split([' ', '>', '/'])
                    .find(|part| !part.trim().is_empty())
                {
                    return format!("<{}>", raw_name);
                }
            }

            if kind == "attribute" {
                let preview = get_node_text_preview(node, source, 80);
                return format!("@{}", preview);
            }

            if kind == "text" {
                return format!("#text {}", get_node_text_preview(node, source, 60));
            }

            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
    }
}

fn build_tree_sitter_content_node(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: ContentTreeFileType,
) -> ContentTreeNode {
    let mut children = Vec::new();
    let kind = node.kind();

    if is_pair_kind(kind) {
        if let Some(value_node) = second_named_child(node) {
            if !is_scalar_value_kind(file_type, value_node.kind()) {
                children.push(build_tree_sitter_content_node(value_node, source, file_type));
            }
        }
    } else if is_container_kind(file_type, kind) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() {
                children.push(build_tree_sitter_content_node(child, source, file_type));
            }
        }
    }

    let has_named_children = !children.is_empty();
    let label = format_content_tree_label(node, source, file_type, has_named_children);
    let start = node.start_position();

    ContentTreeNode {
        label,
        node_type: node.kind().to_string(),
        line: start.row + 1,
        column: start.column + 1,
        children,
    }
}

fn get_language_from_path(path: &Option<PathBuf>) -> Option<Language> {
    if let Some(p) = path {
        if let Some(file_name) = p.file_name().and_then(|name| name.to_str()) {
            let lower_name = file_name.to_lowercase();
            match lower_name.as_str() {
                "dockerfile" | "makefile" => return Some(tree_sitter_bash::LANGUAGE.into()),
                _ => {}
            }
        }

        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            return match ext.to_lowercase().as_str() {
                "js" | "jsx" | "mjs" | "cjs" => Some(tree_sitter_javascript::LANGUAGE.into()),
                "ts" | "tsx" | "mts" | "cts" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
                "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
                "py" | "pyw" => Some(tree_sitter_python::LANGUAGE.into()),
                "json" | "jsonc" => Some(tree_sitter_json::LANGUAGE.into()),
                "html" | "htm" | "xhtml" => Some(tree_sitter_html::LANGUAGE.into()),
                "css" | "scss" | "sass" | "less" => Some(tree_sitter_css::LANGUAGE.into()),
                "sh" | "bash" | "zsh" => Some(tree_sitter_bash::LANGUAGE.into()),
                "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
                "yaml" | "yml" => Some(tree_sitter_yaml::LANGUAGE.into()),
                "xml" | "svg" => Some(tree_sitter_xml::LANGUAGE_XML.into()),
                "c" | "h" => Some(tree_sitter_c::LANGUAGE.into()),
                "cc" | "cp" | "cpp" | "cxx" | "c++" | "hh" | "hpp" | "hxx" => {
                    Some(tree_sitter_cpp::LANGUAGE.into())
                }
                "go" => Some(tree_sitter_go::LANGUAGE.into()),
                "java" => Some(tree_sitter_java::LANGUAGE.into()),
                _ => None,
            };
        }
    }

    None
}

fn create_parser(language: Option<Language>) -> Option<Parser> {
    let lang = language?;
    let mut parser = Parser::new();
    parser.set_language(&lang).ok()?;
    Some(parser)
}

fn normalize_language(language: Option<&str>) -> String {
    match language {
        Some("en-US") => "en-US".to_string(),
        _ => DEFAULT_LANGUAGE.to_string(),
    }
}

fn normalize_theme(theme: Option<&str>) -> String {
    match theme {
        Some("dark") => "dark".to_string(),
        _ => DEFAULT_THEME.to_string(),
    }
}

fn normalize_tab_width(tab_width: u8) -> u8 {
    tab_width.clamp(1, 8)
}

fn parse_format_mode(mode: &str) -> Option<FormatMode> {
    match mode.trim().to_lowercase().as_str() {
        "beautify" | "format" => Some(FormatMode::Beautify),
        "minify" => Some(FormatMode::Minify),
        _ => None,
    }
}

fn parse_structured_format_from_name(name: &str) -> Option<StructuredFormat> {
    let lower = name.trim().to_lowercase();

    if lower.ends_with(".json") || lower.ends_with(".jsonc") {
        return Some(StructuredFormat::Json);
    }

    if lower.ends_with(".yaml") || lower.ends_with(".yml") {
        return Some(StructuredFormat::Yaml);
    }

    if lower.ends_with(".xml") || lower.ends_with(".svg") {
        return Some(StructuredFormat::Xml);
    }

    if lower.ends_with(".toml") {
        return Some(StructuredFormat::Toml);
    }

    None
}

fn resolve_structured_format(
    file_path: Option<&str>,
    file_name: Option<&str>,
    document_path: &Option<PathBuf>,
) -> Option<StructuredFormat> {
    if let Some(path) = file_path {
        if let Some(detected) = parse_structured_format_from_name(path) {
            return Some(detected);
        }
    }

    if let Some(name) = file_name {
        if let Some(detected) = parse_structured_format_from_name(name) {
            return Some(detected);
        }
    }

    if let Some(path) = document_path.as_ref().and_then(|value| value.to_str()) {
        if let Some(detected) = parse_structured_format_from_name(path) {
            return Some(detected);
        }
    }

    None
}

fn strip_yaml_header(value: &str) -> String {
    let stripped = value.strip_prefix("---\n").unwrap_or(value);
    stripped.trim_end_matches('\n').to_string()
}

fn detect_indent_unit(source: &str) -> Option<usize> {
    let mut unit = 0usize;

    for line in source.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let spaces = line.chars().take_while(|ch| *ch == ' ').count();
        if spaces == 0 {
            continue;
        }

        if unit == 0 {
            unit = spaces;
            continue;
        }

        unit = gcd(unit, spaces);
        if unit == 1 {
            break;
        }
    }

    if unit == 0 {
        None
    } else {
        Some(unit)
    }
}

fn gcd(mut a: usize, mut b: usize) -> usize {
    while b != 0 {
        let tmp = a % b;
        a = b;
        b = tmp;
    }

    a
}

fn reindent_text(source: &str, target_width: usize) -> String {
    let from_unit = detect_indent_unit(source).unwrap_or(2).max(1);
    let mut result = String::with_capacity(source.len());
    let mut start = 0usize;

    while start < source.len() {
        let relative_end = source[start..].find('\n').map(|idx| idx + start);
        let end = relative_end.unwrap_or(source.len());
        let line = &source[start..end];

        let leading_spaces = line.chars().take_while(|ch| *ch == ' ').count();
        let rest = &line[leading_spaces..];

        if line.starts_with('\t') {
            result.push_str(line);
        } else {
            let levels = leading_spaces / from_unit;
            let remainder = leading_spaces % from_unit;
            let new_leading = levels
                .checked_mul(target_width)
                .unwrap_or(leading_spaces)
                .saturating_add(remainder);

            result.push_str(&" ".repeat(new_leading));
            result.push_str(rest);
        }

        if relative_end.is_some() {
            result.push('\n');
        }

        start = end.saturating_add(1);
    }

    if source.is_empty() {
        String::new()
    } else {
        result
    }
}

fn serialize_json_pretty_with_indent<T: Serialize>(value: &T, indent_width: usize) -> Result<String, String> {
    let indent = vec![b' '; indent_width.max(1)];
    let mut output = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(&indent);
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);

    value
        .serialize(&mut serializer)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    String::from_utf8(output).map_err(|e| e.to_string())
}

fn format_json(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(source)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    match mode {
        FormatMode::Beautify => serialize_json_pretty_with_indent(&value, tab_width),
        FormatMode::Minify => serde_json::to_string(&value).map_err(|e| e.to_string()),
    }
}

fn format_yaml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(source)
        .map_err(|e| format!("Invalid YAML: {}", e))?;

    match mode {
        FormatMode::Beautify => {
            let pretty = serde_yaml::to_string(&value)
                .map_err(|e| format!("Failed to serialize YAML: {}", e))?;
            let without_header = strip_yaml_header(&pretty);
            Ok(reindent_text(&without_header, tab_width))
        }
        FormatMode::Minify => {
            let json_value = serde_json::to_value(&value)
                .map_err(|e| format!("Failed to minify YAML: {}", e))?;
            serde_json::to_string(&json_value).map_err(|e| e.to_string())
        }
    }
}

fn format_toml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: toml::Value = toml::from_str(source)
        .map_err(|e| format!("Invalid TOML: {}", e))?;

    match mode {
        FormatMode::Beautify => {
            let pretty = toml::to_string_pretty(&value)
                .map_err(|e| format!("Failed to serialize TOML: {}", e))?;
            Ok(reindent_text(pretty.trim_end_matches('\n'), tab_width))
        }
        FormatMode::Minify => {
            let compact = toml::to_string(&value)
                .map_err(|e| format!("Failed to minify TOML: {}", e))?;
            Ok(compact.replace(['\r', '\n'], " ").split_whitespace().collect::<Vec<_>>().join(" "))
        }
    }
}

fn format_xml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let mut reader = Reader::from_str(source);
    reader.config_mut().trim_text(false);

    let mut writer = match mode {
        FormatMode::Beautify => Writer::new_with_indent(Vec::new(), b' ', tab_width.max(1)),
        FormatMode::Minify => Writer::new(Vec::new()),
    };

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(Event::Text(text_event)) if matches!(mode, FormatMode::Minify) => {
                let unescaped = text_event
                    .xml_content()
                    .map_err(|e| format!("Failed to read XML text: {}", e))?;
                if unescaped.trim().is_empty() {
                    continue;
                }
                writer
                    .write_event(Event::Text(text_event.into_owned()))
                    .map_err(|e| format!("Failed to write XML text: {}", e))?;
            }
            Ok(event) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|e| format!("Failed to write XML event: {}", e))?;
            }
            Err(error) => {
                return Err(format!("Invalid XML at {}: {}", reader.buffer_position(), error));
            }
        }
    }

    String::from_utf8(writer.into_inner()).map_err(|e| e.to_string())
}

fn format_structured_text(
    source: &str,
    file_format: StructuredFormat,
    mode: FormatMode,
    tab_width: u8,
) -> Result<String, String> {
    let indent_width = normalize_tab_width(tab_width) as usize;

    match file_format {
        StructuredFormat::Json => format_json(source, mode, indent_width),
        StructuredFormat::Yaml => format_yaml(source, mode, indent_width),
        StructuredFormat::Xml => format_xml(source, mode, indent_width),
        StructuredFormat::Toml => format_toml(source, mode, indent_width),
    }
}

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
        return default_windows_file_association_extensions();
    }

    unique_extensions.into_iter().collect()
}

fn normalize_app_config(config: AppConfig) -> AppConfig {
    AppConfig {
        language: normalize_language(Some(config.language.as_str())),
        theme: normalize_theme(Some(config.theme.as_str())),
        font_family: if config.font_family.trim().is_empty() {
            DEFAULT_FONT_FAMILY.to_string()
        } else {
            config.font_family
        },
        font_size: config.font_size.clamp(8, 72),
        tab_width: normalize_tab_width(config.tab_width),
        word_wrap: config.word_wrap,
        highlight_current_line: config.highlight_current_line,
        windows_file_association_extensions: normalize_windows_file_association_extensions(
            Some(config.windows_file_association_extensions),
        ),
        filter_rule_groups: normalize_filter_rule_groups(config.filter_rule_groups),
    }
}

#[cfg(windows)]
fn context_menu_display_name(language: &str) -> &'static str {
    match normalize_language(Some(language)) {
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
    match normalize_language(Some(language)) {
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

#[tauri::command]
pub fn get_startup_paths(state: State<'_, AppState>) -> Vec<String> {
    state.take_startup_paths()
}

#[tauri::command]
pub fn register_windows_context_menu(language: Option<String>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Err("Windows context menu is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let icon_path = executable_path_string()?;
        let normalized_language = normalize_language(language.as_deref());
        let display_name = context_menu_display_name(normalized_language.as_str());

        write_windows_context_shell(&hkcu, WIN_FILE_SHELL_KEY, &icon_path, "%1", display_name)?;
        write_windows_context_shell(&hkcu, WIN_DIR_SHELL_KEY, &icon_path, "%1", display_name)?;
        write_windows_context_shell(&hkcu, WIN_DIR_BG_SHELL_KEY, &icon_path, "%V", display_name)?;

        Ok(())
    }
}

#[tauri::command]
pub fn unregister_windows_context_menu() -> Result<(), String> {
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

#[tauri::command]
pub fn is_windows_context_menu_registered() -> bool {
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

#[tauri::command]
pub fn get_default_windows_file_association_extensions() -> Vec<String> {
    default_windows_file_association_extensions()
}

#[tauri::command]
pub fn apply_windows_file_associations(
    language: Option<String>,
    extensions: Vec<String>,
) -> Result<Vec<String>, String> {
    #[cfg(not(windows))]
    {
        let _ = language;
        let _ = extensions;
        Err("Windows file association is only supported on Windows".to_string())
    }

    #[cfg(windows)]
    {
        let normalized_extensions = normalize_windows_file_association_extensions(Some(extensions));
        let normalized_language = normalize_language(language.as_deref());
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let icon_path = windows_document_icon_path_string()?;

        write_windows_file_association_progid(&hkcu, icon_path.as_str(), normalized_language.as_str())?;

        for extension in &normalized_extensions {
            associate_extension_with_rutar(&hkcu, extension.as_str())?;
        }

        notify_windows_association_changed();

        Ok(normalized_extensions)
    }
}

#[tauri::command]
pub fn remove_windows_file_associations(extensions: Vec<String>) -> Result<(), String> {
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

#[tauri::command]
pub fn get_windows_file_association_status(extensions: Vec<String>) -> WindowsFileAssociationStatus {
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

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(AppConfig::default());
    }

    let partial: PartialAppConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

    let mut config = AppConfig::default();

    if let Some(language) = partial.language {
        config.language = normalize_language(Some(language.as_str()));
    }

    if let Some(theme) = partial.theme {
        config.theme = normalize_theme(Some(theme.as_str()));
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
        config.tab_width = normalize_tab_width(tab_width);
    }

    if let Some(word_wrap) = partial.word_wrap {
        config.word_wrap = word_wrap;
    }

    if let Some(highlight_current_line) = partial.highlight_current_line {
        config.highlight_current_line = highlight_current_line;
    }

    if let Some(extensions) = partial.windows_file_association_extensions {
        config.windows_file_association_extensions =
            normalize_windows_file_association_extensions(Some(extensions));
    }

    config.filter_rule_groups = normalize_filter_rule_groups(partial.filter_rule_groups);

    Ok(config)
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let mut normalized = normalize_app_config(config);

    if normalized.filter_rule_groups.is_none() {
        if let Ok(existing) = load_config() {
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
        if is_windows_context_menu_registered() {
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

#[tauri::command]
pub fn load_filter_rule_groups_config() -> Result<Vec<FilterRuleGroupConfig>, String> {
    let config = load_config()?;
    Ok(config.filter_rule_groups.unwrap_or_default())
}

#[tauri::command]
pub fn save_filter_rule_groups_config(groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
    let mut config = load_config()?;
    config.filter_rule_groups = normalize_filter_rule_groups(Some(groups));
    save_config(config)
}

#[tauri::command]
pub fn import_filter_rule_groups(path: String) -> Result<Vec<FilterRuleGroupConfig>, String> {
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

#[tauri::command]
pub fn export_filter_rule_groups(path: String, groups: Vec<FilterRuleGroupConfig>) -> Result<(), String> {
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

fn configure_document_syntax(doc: &mut Document, enable_syntax: bool) {
    if !enable_syntax {
        doc.language = None;
        doc.parser = None;
        doc.tree = None;
        doc.syntax_dirty = false;
        return;
    }

    doc.language = get_language_from_path(&doc.path);
    doc.parser = create_parser(doc.language.clone());
    doc.tree = None;
    doc.syntax_dirty = doc.parser.is_some();
}

fn ensure_document_tree(doc: &mut Document) {
    if doc.parser.is_none() {
        doc.tree = None;
        doc.syntax_dirty = false;
        return;
    }

    if !doc.syntax_dirty && doc.tree.is_some() {
        return;
    }

    if let Some(parser) = doc.parser.as_mut() {
        let source: String = doc.rope.chunks().collect();
        let parsed = parser.parse(&source, doc.tree.as_ref());
        doc.tree = parsed;
    }

    doc.syntax_dirty = false;
}

fn point_for_char(rope: &Rope, char_idx: usize) -> Point {
    let clamped = char_idx.min(rope.len_chars());
    let row = rope.char_to_line(clamped);
    let line_start = rope.line_to_char(row);
    let column = rope.slice(line_start..clamped).len_bytes();

    Point { row, column }
}

fn advance_point_with_text(start: Point, text: &str) -> Point {
    let mut row = start.row;
    let mut column = start.column;

    for b in text.bytes() {
        if b == b'\n' {
            row += 1;
            column = 0;
        } else {
            column += 1;
        }
    }

    Point { row, column }
}

fn collect_leaf_tokens(
    node: tree_sitter::Node,
    range_start_byte: usize,
    range_end_byte: usize,
    out: &mut Vec<LeafToken>,
) {
    if node.end_byte() <= range_start_byte || node.start_byte() >= range_end_byte {
        return;
    }

    if node.child_count() == 0 {
        let start = node.start_byte().max(range_start_byte);
        let end = node.end_byte().min(range_end_byte);

        if start < end {
            out.push(LeafToken {
                kind: node.kind().to_string(),
                start_byte: start,
                end_byte: end,
            });
        }

        return;
    }

    let mut cursor = node.walk();
    if cursor.goto_first_child() {
        loop {
            collect_leaf_tokens(cursor.node(), range_start_byte, range_end_byte, out);
            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }
}

fn push_plain_token(tokens: &mut Vec<SyntaxToken>, rope: &Rope, start_byte: usize, end_byte: usize) {
    if start_byte >= end_byte {
        return;
    }

    let text = rope.byte_slice(start_byte..end_byte).to_string();
    if text.is_empty() {
        return;
    }

    tokens.push(SyntaxToken {
        r#type: None,
        text: Some(text),
        start_byte: Some(start_byte),
        end_byte: Some(end_byte),
    });
}

fn build_tokens_with_gaps(
    rope: &Rope,
    mut leaves: Vec<LeafToken>,
    range_start_byte: usize,
    range_end_byte: usize,
) -> Vec<SyntaxToken> {
    leaves.sort_by(|a, b| {
        a.start_byte
            .cmp(&b.start_byte)
            .then(a.end_byte.cmp(&b.end_byte))
    });

    let mut tokens = Vec::new();
    let mut last_pos = range_start_byte;

    for leaf in leaves {
        if leaf.end_byte <= last_pos {
            continue;
        }

        if leaf.start_byte > last_pos {
            push_plain_token(&mut tokens, rope, last_pos, leaf.start_byte);
        }

        let start = leaf.start_byte.max(last_pos);
        let end = leaf.end_byte.min(range_end_byte);

        if start < end {
            let text = rope.byte_slice(start..end).to_string();
            if !text.is_empty() {
                tokens.push(SyntaxToken {
                    r#type: Some(leaf.kind),
                    text: Some(text),
                    start_byte: Some(start),
                    end_byte: Some(end),
                });
            }
            last_pos = end;
        }

        if last_pos >= range_end_byte {
            break;
        }
    }

    if last_pos < range_end_byte {
        push_plain_token(&mut tokens, rope, last_pos, range_end_byte);
    }

    tokens
}

fn apply_operation(doc: &mut Document, operation: &EditOperation) -> Result<(), String> {
    let rope = &mut doc.rope;
    let start = operation.start_char.min(rope.len_chars());
    let old_char_len = operation.old_text.chars().count();
    let end = start
        .checked_add(old_char_len)
        .ok_or_else(|| "Edit range overflow".to_string())?;

    if end > rope.len_chars() {
        return Err("Edit range out of bounds".to_string());
    }

    let current_old = rope.slice(start..end).to_string();
    if current_old != operation.old_text {
        return Err("Edit history out of sync".to_string());
    }

    let start_byte = rope.char_to_byte(start);
    let old_end_byte = start_byte + operation.old_text.len();
    let new_end_byte = start_byte + operation.new_text.len();

    let start_position = point_for_char(rope, start);
    let old_end_position = advance_point_with_text(start_position, &operation.old_text);
    let new_end_position = advance_point_with_text(start_position, &operation.new_text);

    if start < end {
        rope.remove(start..end);
    }

    if !operation.new_text.is_empty() {
        rope.insert(start, &operation.new_text);
    }

    if let Some(tree) = doc.tree.as_mut() {
        tree.edit(&InputEdit {
            start_byte,
            old_end_byte,
            new_end_byte,
            start_position,
            old_end_position,
            new_end_position,
        });
    }

    doc.syntax_dirty = doc.parser.is_some();
    doc.document_version = doc.document_version.saturating_add(1);
    Ok(())
}

fn find_line_index_by_offset(line_starts: &[usize], target_offset: usize) -> usize {
    if line_starts.is_empty() {
        return 0;
    }

    let mut low = 0usize;
    let mut high = line_starts.len() - 1;
    let mut result = 0usize;

    while low <= high {
        let middle = low + (high - low) / 2;
        let line_start = line_starts[middle];

        if line_start <= target_offset {
            result = middle;
            low = middle.saturating_add(1);
        } else {
            if middle == 0 {
                break;
            }
            high = middle - 1;
        }
    }

    result
}

fn build_line_starts(text: &str) -> Vec<usize> {
    let mut line_starts = vec![0usize];

    for (index, byte) in text.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            line_starts.push(index + 1);
        }
    }

    line_starts
}

fn build_byte_to_char_map(text: &str) -> Vec<usize> {
    let mut mapping = vec![0usize; text.len() + 1];
    let mut char_index = 0usize;

    for (byte_index, ch) in text.char_indices() {
        let char_len = ch.len_utf8();
        for offset in 0..char_len {
            mapping[byte_index + offset] = char_index;
        }
        char_index += 1;
    }

    mapping[text.len()] = char_index;
    mapping
}

fn get_line_text(text: &str, line_starts: &[usize], line_index: usize) -> String {
    if line_starts.is_empty() {
        return String::new();
    }

    let line_start = *line_starts.get(line_index).unwrap_or(&0usize);
    let next_line_start = *line_starts.get(line_index + 1).unwrap_or(&text.len());
    let line_end = next_line_start.saturating_sub(1).max(line_start);

    text.get(line_start..line_end)
        .unwrap_or_default()
        .trim_end_matches('\r')
        .to_string()
}

fn escape_regex_literal(keyword: &str) -> String {
    keyword
        .chars()
        .flat_map(|ch| match ch {
            '.' | '*' | '+' | '?' | '^' | '$' | '{' | '}' | '(' | ')' | '|' | '[' | ']' | '\\' => {
                vec!['\\', ch]
            }
            _ => vec![ch],
        })
        .collect()
}

fn wildcard_to_regex_source(keyword: &str) -> String {
    let mut source = String::new();

    for ch in keyword.chars() {
        match ch {
            '*' => source.push_str(".*"),
            '?' => source.push('.'),
            _ => source.push_str(&escape_regex_literal(&ch.to_string())),
        }
    }

    source
}

#[derive(Clone, Copy)]
enum FilterMatchMode {
    Contains,
    Regex,
    Wildcard,
}

#[derive(Clone, Copy)]
enum FilterApplyTo {
    Line,
    Match,
}

#[derive(Clone)]
struct CompiledFilterRule {
    rule_index: usize,
    keyword: String,
    match_mode: FilterMatchMode,
    regex: Option<regex::Regex>,
    style: FilterRuleStyleResult,
    apply_to: FilterApplyTo,
}

fn parse_filter_match_mode(mode: &str) -> Result<FilterMatchMode, String> {
    match mode.trim().to_lowercase().as_str() {
        "contains" | "exist" | "exists" => Ok(FilterMatchMode::Contains),
        "regex" => Ok(FilterMatchMode::Regex),
        "wildcard" => Ok(FilterMatchMode::Wildcard),
        _ => Err("Unsupported filter match mode".to_string()),
    }
}

fn parse_filter_apply_to(value: &str) -> Result<FilterApplyTo, String> {
    match value.trim().to_lowercase().as_str() {
        "line" => Ok(FilterApplyTo::Line),
        "match" => Ok(FilterApplyTo::Match),
        _ => Err("Unsupported filter apply target".to_string()),
    }
}

fn compile_filter_rules(rules: Vec<FilterRuleInput>) -> Result<Vec<CompiledFilterRule>, String> {
    let mut compiled = Vec::new();

    for (rule_index, rule) in rules.into_iter().enumerate() {
        if rule.keyword.is_empty() {
            continue;
        }

        let match_mode = parse_filter_match_mode(&rule.match_mode)?;
        let apply_to = parse_filter_apply_to(&rule.apply_to)?;

        let regex = match match_mode {
            FilterMatchMode::Contains => None,
            FilterMatchMode::Regex => Some(
                RegexBuilder::new(&rule.keyword)
                    .build()
                    .map_err(|e| e.to_string())?,
            ),
            FilterMatchMode::Wildcard => {
                let regex_source = wildcard_to_regex_source(&rule.keyword);
                Some(
                    RegexBuilder::new(&regex_source)
                        .build()
                        .map_err(|e| e.to_string())?,
                )
            }
        };

        compiled.push(CompiledFilterRule {
            rule_index,
            keyword: rule.keyword,
            match_mode,
            regex,
            style: FilterRuleStyleResult {
                background_color: rule.background_color,
                text_color: rule.text_color,
                bold: rule.bold,
                italic: rule.italic,
                apply_to: match apply_to {
                    FilterApplyTo::Line => "line".to_string(),
                    FilterApplyTo::Match => "match".to_string(),
                },
            },
            apply_to,
        });
    }

    Ok(compiled)
}

fn line_matches_filter_rule(line_text: &str, rule: &CompiledFilterRule) -> bool {
    match rule.match_mode {
        FilterMatchMode::Contains => line_text.contains(&rule.keyword),
        FilterMatchMode::Regex | FilterMatchMode::Wildcard => {
            rule.regex.as_ref().map(|regex| regex.is_match(line_text)).unwrap_or(false)
        }
    }
}

fn collect_filter_rule_ranges(
    line_text: &str,
    rule: &CompiledFilterRule,
    max_ranges: usize,
) -> Vec<(usize, usize)> {
    if max_ranges == 0 {
        return Vec::new();
    }

    match rule.match_mode {
        FilterMatchMode::Contains => line_text
            .match_indices(&rule.keyword)
            .take(max_ranges)
            .map(|(start, matched)| (start, start + matched.len()))
            .collect(),
        FilterMatchMode::Regex | FilterMatchMode::Wildcard => rule
            .regex
            .as_ref()
            .map(|regex| {
                regex
                    .find_iter(line_text)
                    .take(max_ranges)
                    .map(|capture| (capture.start(), capture.end()))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn normalize_rope_line_text(line_text: &str) -> String {
    line_text.trim_end_matches('\n').trim_end_matches('\r').to_string()
}

fn build_filter_match_result(
    line_number: usize,
    line_text: &str,
    rule: &CompiledFilterRule,
    ranges_in_bytes: Vec<(usize, usize)>,
) -> FilterLineMatchResult {
    let byte_to_char = build_byte_to_char_map(line_text);
    let fallback_start_char = 0usize;
    let fallback_end_char = 0usize;

    let (column, length) = if let Some((first_start, first_end)) = ranges_in_bytes.first().copied() {
        let start_char = *byte_to_char.get(first_start).unwrap_or(&fallback_start_char);
        let end_char = *byte_to_char.get(first_end).unwrap_or(&start_char);
        (start_char.saturating_add(1), end_char.saturating_sub(start_char))
    } else {
        (1usize, 0usize)
    };

    let ranges = ranges_in_bytes
        .into_iter()
        .map(|(start, end)| {
            let start_char = *byte_to_char.get(start).unwrap_or(&fallback_start_char);
            let end_char = *byte_to_char.get(end).unwrap_or(&fallback_end_char);
            FilterMatchRangeResult {
                start_char,
                end_char,
            }
        })
        .collect();

    FilterLineMatchResult {
        line: line_number,
        column,
        length,
        line_text: line_text.to_string(),
        rule_index: rule.rule_index,
        style: rule.style.clone(),
        ranges,
    }
}

fn match_line_with_filter_rules(
    line_number: usize,
    line_text: &str,
    rules: &[CompiledFilterRule],
) -> Option<FilterLineMatchResult> {
    for rule in rules {
        if !line_matches_filter_rule(line_text, rule) {
            continue;
        }

        let max_ranges = match rule.apply_to {
            FilterApplyTo::Line => 1,
            FilterApplyTo::Match => FILTER_MAX_RANGES_PER_LINE,
        };
        let ranges = collect_filter_rule_ranges(line_text, rule, max_ranges);

        return Some(build_filter_match_result(line_number, line_text, rule, ranges));
    }

    None
}

fn line_matches_any_filter_rule(line_text: &str, rules: &[CompiledFilterRule]) -> bool {
    rules.iter().any(|rule| line_matches_filter_rule(line_text, rule))
}

fn compute_kmp_lps(pattern: &[u8]) -> Vec<usize> {
    if pattern.is_empty() {
        return Vec::new();
    }

    let mut lps = vec![0usize; pattern.len()];
    let mut len = 0usize;
    let mut index = 1usize;

    while index < pattern.len() {
        if pattern[index] == pattern[len] {
            len += 1;
            lps[index] = len;
            index += 1;
        } else if len != 0 {
            len = lps[len - 1];
        } else {
            lps[index] = 0;
            index += 1;
        }
    }

    lps
}

fn kmp_find_all(haystack: &str, needle: &str) -> Vec<(usize, usize)> {
    if needle.is_empty() {
        return Vec::new();
    }

    let haystack_bytes = haystack.as_bytes();
    let needle_bytes = needle.as_bytes();

    let lps = compute_kmp_lps(needle_bytes);
    let mut matches = Vec::new();

    let mut haystack_index = 0usize;
    let mut needle_index = 0usize;

    while haystack_index < haystack_bytes.len() {
        if haystack_bytes[haystack_index] == needle_bytes[needle_index] {
            haystack_index += 1;
            needle_index += 1;

            if needle_index == needle_bytes.len() {
                let start = haystack_index - needle_index;
                matches.push((start, haystack_index));
                needle_index = lps[needle_index - 1];
            }
        } else if needle_index != 0 {
            needle_index = lps[needle_index - 1];
        } else {
            haystack_index += 1;
        }
    }

    matches
}

fn collect_regex_matches(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    byte_to_char: &[usize],
) -> Vec<SearchMatchResult> {
    let mut matches = Vec::new();

    for capture in regex.find_iter(text) {
        let start = capture.start();
        let end = capture.end();
        let line_index = find_line_index_by_offset(line_starts, start);
        let line_start = *line_starts.get(line_index).unwrap_or(&0usize);
        let start_char = *byte_to_char.get(start).unwrap_or(&0usize);
        let end_char = *byte_to_char.get(end).unwrap_or(&start_char);
        let line_start_char = *byte_to_char.get(line_start).unwrap_or(&0usize);

        matches.push(SearchMatchResult {
            start,
            end,
            start_char,
            end_char,
            text: capture.as_str().to_string(),
            line: line_index + 1,
            column: start_char.saturating_sub(line_start_char) + 1,
            line_text: get_line_text(text, line_starts, line_index),
        });
    }

    matches
}

fn collect_literal_matches(
    text: &str,
    needle: &str,
    line_starts: &[usize],
    byte_to_char: &[usize],
) -> Vec<SearchMatchResult> {
    if needle.is_empty() {
        return Vec::new();
    }

    let raw_matches = kmp_find_all(text, needle);
    let needle_len_bytes = needle.len();

    raw_matches
        .into_iter()
        .filter_map(|(start, _)| {
            let end = start.saturating_add(needle_len_bytes);
            let matched_text = text.get(start..end)?.to_string();
            let line_index = find_line_index_by_offset(line_starts, start);
            let line_start = *line_starts.get(line_index).unwrap_or(&0usize);
            let start_char = *byte_to_char.get(start).unwrap_or(&0usize);
            let end_char = *byte_to_char.get(end).unwrap_or(&start_char);
            let line_start_char = *byte_to_char.get(line_start).unwrap_or(&0usize);

            Some(SearchMatchResult {
                start,
                end,
                start_char,
                end_char,
                text: matched_text,
                line: line_index + 1,
                column: start_char.saturating_sub(line_start_char) + 1,
                line_text: get_line_text(text, line_starts, line_index),
            })
        })
        .collect()
}

fn count_regex_matches(text: &str, regex: &regex::Regex, line_starts: &[usize]) -> (usize, usize) {
    let mut total_matches = 0usize;
    let mut matched_lines = 0usize;
    let mut last_line_index: Option<usize> = None;

    for capture in regex.find_iter(text) {
        total_matches = total_matches.saturating_add(1);

        let line_index = find_line_index_by_offset(line_starts, capture.start());
        if last_line_index != Some(line_index) {
            matched_lines = matched_lines.saturating_add(1);
            last_line_index = Some(line_index);
        }
    }

    (total_matches, matched_lines)
}

fn count_literal_matches(text: &str, needle: &str, line_starts: &[usize]) -> (usize, usize) {
    if needle.is_empty() {
        return (0usize, 0usize);
    }

    let haystack_bytes = text.as_bytes();
    let needle_bytes = needle.as_bytes();

    if needle_bytes.is_empty() || haystack_bytes.is_empty() || needle_bytes.len() > haystack_bytes.len() {
        return (0usize, 0usize);
    }

    let lps = compute_kmp_lps(needle_bytes);
    let mut total_matches = 0usize;
    let mut matched_lines = 0usize;
    let mut last_line_index: Option<usize> = None;

    let mut haystack_index = 0usize;
    let mut needle_index = 0usize;

    while haystack_index < haystack_bytes.len() {
        if haystack_bytes[haystack_index] == needle_bytes[needle_index] {
            haystack_index += 1;
            needle_index += 1;

            if needle_index == needle_bytes.len() {
                let start = haystack_index - needle_index;
                total_matches = total_matches.saturating_add(1);

                let line_index = find_line_index_by_offset(line_starts, start);
                if last_line_index != Some(line_index) {
                    matched_lines = matched_lines.saturating_add(1);
                    last_line_index = Some(line_index);
                }

                needle_index = lps[needle_index - 1];
            }
        } else if needle_index != 0 {
            needle_index = lps[needle_index - 1];
        } else {
            haystack_index += 1;
        }
    }

    (total_matches, matched_lines)
}

fn normalize_search_offset(text: &str, start_offset: usize) -> usize {
    let mut offset = start_offset.min(text.len());

    while offset < text.len() && !text.is_char_boundary(offset) {
        offset += 1;
    }

    offset
}

fn build_match_result_from_offsets(
    text: &str,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start: usize,
    end: usize,
) -> Option<SearchMatchResult> {
    if start >= end || end > text.len() {
        return None;
    }

    if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return None;
    }

    let line_index = find_line_index_by_offset(line_starts, start);
    let line_start = *line_starts.get(line_index).unwrap_or(&0usize);
    let start_char = *byte_to_char.get(start).unwrap_or(&0usize);
    let end_char = *byte_to_char.get(end).unwrap_or(&start_char);
    let line_start_char = *byte_to_char.get(line_start).unwrap_or(&0usize);

    Some(SearchMatchResult {
        start,
        end,
        start_char,
        end_char,
        text: text.get(start..end).unwrap_or_default().to_string(),
        line: line_index + 1,
        column: start_char.saturating_sub(line_start_char) + 1,
        line_text: get_line_text(text, line_starts, line_index),
    })
}

fn collect_regex_matches_chunk(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    max_results: usize,
) -> (Vec<SearchMatchResult>, Option<usize>) {
    if max_results == 0 {
        return (Vec::new(), None);
    }

    let normalized_offset = normalize_search_offset(text, start_offset);
    let search_slice = text.get(normalized_offset..).unwrap_or_default();

    let mut results = Vec::new();
    let mut next_offset = None;

    for capture in regex.find_iter(search_slice) {
        let absolute_start = normalized_offset + capture.start();
        let absolute_end = normalized_offset + capture.end();

        if results.len() >= max_results {
            next_offset = Some(absolute_start);
            break;
        }

        if let Some(match_result) =
            build_match_result_from_offsets(text, line_starts, byte_to_char, absolute_start, absolute_end)
        {
            results.push(match_result);
        }
    }

    (results, next_offset)
}

fn collect_literal_matches_chunk(
    text: &str,
    needle: &str,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    max_results: usize,
) -> (Vec<SearchMatchResult>, Option<usize>) {
    if needle.is_empty() || max_results == 0 {
        return (Vec::new(), None);
    }

    let normalized_offset = normalize_search_offset(text, start_offset);
    let search_slice = text.get(normalized_offset..).unwrap_or_default();

    let mut results = Vec::new();
    let mut next_offset = None;

    for (relative_start, _) in search_slice.match_indices(needle) {
        let absolute_start = normalized_offset + relative_start;
        let absolute_end = absolute_start + needle.len();

        if results.len() >= max_results {
            next_offset = Some(absolute_start);
            break;
        }

        if let Some(match_result) =
            build_match_result_from_offsets(text, line_starts, byte_to_char, absolute_start, absolute_end)
        {
            results.push(match_result);
        }
    }

    (results, next_offset)
}

fn find_match_edge(
    text: &str,
    keyword: &str,
    mode: &str,
    case_sensitive: bool,
    reverse: bool,
) -> Result<Option<(usize, usize)>, String> {
    if keyword.is_empty() {
        return Ok(None);
    }

    match mode {
        "literal" => {
            if case_sensitive {
                let maybe_start = if reverse {
                    text.rfind(keyword)
                } else {
                    text.find(keyword)
                };

                Ok(maybe_start.map(|start| (start, start + keyword.len())))
            } else {
                let escaped = escape_regex_literal(keyword);
                let regex = RegexBuilder::new(&escaped)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| e.to_string())?;

                if reverse {
                    Ok(regex.find_iter(text).last().map(|capture| (capture.start(), capture.end())))
                } else {
                    Ok(regex.find(text).map(|capture| (capture.start(), capture.end())))
                }
            }
        }
        "wildcard" => {
            let regex_source = wildcard_to_regex_source(keyword);
            let regex = RegexBuilder::new(&regex_source)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            if reverse {
                Ok(regex.find_iter(text).last().map(|capture| (capture.start(), capture.end())))
            } else {
                Ok(regex.find(text).map(|capture| (capture.start(), capture.end())))
            }
        }
        "regex" => {
            let regex = RegexBuilder::new(keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            if reverse {
                Ok(regex.find_iter(text).last().map(|capture| (capture.start(), capture.end())))
            } else {
                Ok(regex.find(text).map(|capture| (capture.start(), capture.end())))
            }
        }
        _ => Err("Unsupported search mode".to_string()),
    }
}

#[tauri::command]
pub fn search_first_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    reverse: bool,
) -> Result<SearchFirstResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source_text: String = doc.rope.chunks().collect();
        let line_starts = build_line_starts(&source_text);
        let byte_to_char = build_byte_to_char_map(&source_text);

        let first_match = find_match_edge(&source_text, &keyword, &mode, case_sensitive, reverse)?
            .and_then(|(start, end)| {
                build_match_result_from_offsets(&source_text, &line_starts, &byte_to_char, start, end)
            });

        Ok(SearchFirstResultPayload {
            first_match,
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn search_in_document_chunk(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    start_offset: usize,
    max_results: usize,
) -> Result<SearchChunkResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source_text: String = doc.rope.chunks().collect();
        let line_starts = build_line_starts(&source_text);
        let byte_to_char = build_byte_to_char_map(&source_text);

        if keyword.is_empty() {
            return Ok(SearchChunkResultPayload {
                matches: Vec::new(),
                document_version: doc.document_version,
                next_offset: None,
            });
        }

        let effective_max = max_results.max(1);
        let (matches, next_offset) = match mode.as_str() {
            "literal" => {
                if case_sensitive {
                    collect_literal_matches_chunk(
                        &source_text,
                        &keyword,
                        &line_starts,
                        &byte_to_char,
                        start_offset,
                        effective_max,
                    )
                } else {
                    let escaped = escape_regex_literal(&keyword);
                    let regex = RegexBuilder::new(&escaped)
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| e.to_string())?;

                    collect_regex_matches_chunk(
                        &source_text,
                        &regex,
                        &line_starts,
                        &byte_to_char,
                        start_offset,
                        effective_max,
                    )
                }
            }
            "wildcard" => {
                let regex_source = wildcard_to_regex_source(&keyword);
                let regex = RegexBuilder::new(&regex_source)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                collect_regex_matches_chunk(
                    &source_text,
                    &regex,
                    &line_starts,
                    &byte_to_char,
                    start_offset,
                    effective_max,
                )
            }
            "regex" => {
                let regex = RegexBuilder::new(&keyword)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                collect_regex_matches_chunk(
                    &source_text,
                    &regex,
                    &line_starts,
                    &byte_to_char,
                    start_offset,
                    effective_max,
                )
            }
            _ => {
                return Err("Unsupported search mode".to_string());
            }
        };

        Ok(SearchChunkResultPayload {
            matches,
            document_version: doc.document_version,
            next_offset,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn search_count_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
) -> Result<SearchCountResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source_text: String = doc.rope.chunks().collect();
        let line_starts = build_line_starts(&source_text);

        if keyword.is_empty() {
            return Ok(SearchCountResultPayload {
                total_matches: 0,
                matched_lines: 0,
                document_version: doc.document_version,
            });
        }

        let (total_matches, matched_lines) = match mode.as_str() {
            "literal" => {
                if case_sensitive {
                    count_literal_matches(&source_text, &keyword, &line_starts)
                } else {
                    let escaped = escape_regex_literal(&keyword);
                    let regex = RegexBuilder::new(&escaped)
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| e.to_string())?;

                    count_regex_matches(&source_text, &regex, &line_starts)
                }
            }
            "wildcard" => {
                let regex_source = wildcard_to_regex_source(&keyword);
                let regex = RegexBuilder::new(&regex_source)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                count_regex_matches(&source_text, &regex, &line_starts)
            }
            "regex" => {
                let regex = RegexBuilder::new(&keyword)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                count_regex_matches(&source_text, &regex, &line_starts)
            }
            _ => {
                return Err("Unsupported search mode".to_string());
            }
        };

        Ok(SearchCountResultPayload {
            total_matches,
            matched_lines,
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn filter_count_in_document(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
) -> Result<FilterCountResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let compiled_rules = compile_filter_rules(rules)?;

        if compiled_rules.is_empty() {
            return Ok(FilterCountResultPayload {
                matched_lines: 0,
                document_version: doc.document_version,
            });
        }

        let mut matched_lines = 0usize;
        let total_lines = doc.rope.len_lines();

        for line_index in 0..total_lines {
            let line_slice = doc.rope.line(line_index);
            let line_text = normalize_rope_line_text(&line_slice.to_string());

            if line_matches_any_filter_rule(&line_text, &compiled_rules) {
                matched_lines = matched_lines.saturating_add(1);
            }
        }

        Ok(FilterCountResultPayload {
            matched_lines,
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn filter_in_document_chunk(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    start_line: usize,
    max_results: usize,
) -> Result<FilterChunkResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let compiled_rules = compile_filter_rules(rules)?;

        if compiled_rules.is_empty() {
            return Ok(FilterChunkResultPayload {
                matches: Vec::new(),
                document_version: doc.document_version,
                next_line: None,
            });
        }

        let effective_max = max_results.max(1);
        let total_lines = doc.rope.len_lines();
        let mut line_index = start_line.min(total_lines);
        let mut matches: Vec<FilterLineMatchResult> = Vec::new();
        let mut next_line = None;

        while line_index < total_lines {
            let line_number = line_index + 1;
            let line_slice = doc.rope.line(line_index);
            let line_text = normalize_rope_line_text(&line_slice.to_string());

            if let Some(filter_match) = match_line_with_filter_rules(line_number, &line_text, &compiled_rules) {
                if matches.len() >= effective_max {
                    next_line = Some(line_index);
                    break;
                }

                matches.push(filter_match);
            }

            line_index = line_index.saturating_add(1);
        }

        Ok(FilterChunkResultPayload {
            matches,
            document_version: doc.document_version,
            next_line,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn search_in_document(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
) -> Result<SearchResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source_text: String = doc.rope.chunks().collect();
        let line_starts = build_line_starts(&source_text);
        let byte_to_char = build_byte_to_char_map(&source_text);

        if keyword.is_empty() {
            return Ok(SearchResultPayload {
                matches: Vec::new(),
                document_version: doc.document_version,
            });
        }

        let matches = match mode.as_str() {
            "literal" => {
                if case_sensitive {
                    collect_literal_matches(&source_text, &keyword, &line_starts, &byte_to_char)
                } else {
                    let escaped = escape_regex_literal(&keyword);
                    let regex = RegexBuilder::new(&escaped)
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| e.to_string())?;

                    collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
                }
            }
            "wildcard" => {
                let regex_source = wildcard_to_regex_source(&keyword);
                let regex = RegexBuilder::new(&regex_source)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
            }
            "regex" => {
                let regex = RegexBuilder::new(&keyword)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
            }
            _ => {
                return Err("Unsupported search mode".to_string());
            }
        };

        Ok(SearchResultPayload {
            matches,
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn get_document_version(state: State<'_, AppState>, id: String) -> Result<u64, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(doc.document_version)
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn get_content_tree(
    state: State<'_, AppState>,
    id: String,
    file_type: String,
) -> Result<Vec<ContentTreeNode>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source = doc.rope.to_string();
        let content_type = parse_content_tree_file_type(&file_type)
            .ok_or_else(|| "Unsupported content type".to_string())?;

        let mut parser = Parser::new();
        parser
            .set_language(&get_content_tree_language(content_type))
            .map_err(|error| format!("Failed to configure content parser: {}", error))?;

        let tree = parser
            .parse(&source, None)
            .ok_or_else(|| "Failed to parse content tree".to_string())?;

        let root_node = tree.root_node();
        let mut cursor = root_node.walk();
        let named_children: Vec<_> = root_node.children(&mut cursor).filter(|node| node.is_named()).collect();

        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root_node
        };

        Ok(vec![build_tree_sitter_content_node(
            start_node,
            &source,
            content_type,
        )])
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn get_syntax_tokens(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<Vec<SyntaxToken>, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let len = doc.rope.len_lines();
        let start = start_line.min(len);
        let end = end_line.min(len);

        if start >= end {
            return Ok(Vec::new());
        }

        let start_char = doc.rope.line_to_char(start);
        let end_char = doc.rope.line_to_char(end);

        let start_byte = doc.rope.char_to_byte(start_char);
        let end_byte = doc.rope.char_to_byte(end_char);

        if start_byte >= end_byte {
            return Ok(Vec::new());
        }

        ensure_document_tree(&mut doc);

        if let Some(tree) = doc.tree.as_ref() {
            let mut leaves = Vec::new();
            collect_leaf_tokens(tree.root_node(), start_byte, end_byte, &mut leaves);
            Ok(build_tokens_with_gaps(&doc.rope, leaves, start_byte, end_byte))
        } else {
            Ok(vec![SyntaxToken {
                r#type: None,
                text: Some(doc.rope.byte_slice(start_byte..end_byte).to_string()),
                start_byte: Some(start_byte),
                end_byte: Some(end_byte),
            }])
        }
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub async fn open_file(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(&path);
    let file = File::open(&path_buf).map_err(|e| e.to_string())?;

    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let size = metadata.len();
    let large_file_mode = size > LARGE_FILE_THRESHOLD_BYTES as u64;

    let mmap = unsafe { Mmap::map(&file).map_err(|e| e.to_string())? };

    let encoding = if let Some((enc, _size)) = Encoding::for_bom(&mmap) {
        enc
    } else {
        let mut detector = EncodingDetector::new();
        if size as usize > ENCODING_DETECT_SAMPLE_BYTES {
            detector.feed(&mmap[..ENCODING_DETECT_SAMPLE_BYTES], true);
        } else {
            detector.feed(&mmap, true);
        }
        detector.guess(None, true)
    };

    let (cow, _, _malformed) = encoding.decode(&mmap);
    let rope = Rope::from_str(&cow);
    let line_count = rope.len_lines();

    let id = Uuid::new_v4().to_string();

    let mut doc = Document {
        rope,
        encoding,
        path: Some(path_buf.clone()),
        document_version: 0,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        parser: None,
        tree: None,
        language: None,
        syntax_dirty: false,
    };

    configure_document_syntax(&mut doc, !large_file_mode);

    state.documents.insert(id.clone(), doc);

    Ok(FileInfo {
        id,
        path: path.clone(),
        name: path_buf
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        encoding: encoding.name().to_string(),
        line_count,
        large_file_mode,
    })
}

#[tauri::command]
pub fn get_visible_lines_chunk(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<Vec<String>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let rope = &doc.rope;
        let len = rope.len_lines();

        let start = start_line.min(len);
        let end = end_line.min(len);

        if start >= end {
            return Ok(Vec::new());
        }

        let mut lines = Vec::with_capacity(end - start);
        for line_idx in start..end {
            let mut text = rope.line(line_idx).to_string();

            if text.ends_with('\n') {
                text.pop();
                if text.ends_with('\r') {
                    text.pop();
                }
            }

            lines.push(text);
        }

        Ok(lines)
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn get_visible_lines(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
) -> Result<String, String> {
    if let Some(doc) = state.documents.get(&id) {
        let rope = &doc.rope;
        let len = rope.len_lines();

        let start = start_line.min(len);
        let end = end_line.min(len);

        if start >= end {
            return Ok(String::new());
        }

        let start_char = rope.line_to_char(start);
        let end_char = rope.line_to_char(end);

        Ok(rope.slice(start_char..end_char).to_string())
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn close_file(state: State<'_, AppState>, id: String) {
    state.documents.remove(&id);
}

#[tauri::command]
pub async fn save_file(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(doc) = state.documents.get(&id) {
        if let Some(path) = &doc.path {
            let mut file = File::create(path).map_err(|e| e.to_string())?;
            let utf8_content: String = doc.rope.chunks().collect();
            let (bytes, _, _malformed) = doc.encoding.encode(&utf8_content);

            use std::io::Write;
            file.write_all(&bytes).map_err(|e| e.to_string())?;

            Ok(())
        } else {
            Err("No path associated with this file. Use Save As.".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub async fn save_file_as(state: State<'_, AppState>, id: String, path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if let Some(mut doc) = state.documents.get_mut(&id) {
        let mut file = File::create(&path_buf).map_err(|e| e.to_string())?;
        let utf8_content: String = doc.rope.chunks().collect();
        let (bytes, _, _malformed) = doc.encoding.encode(&utf8_content);

        use std::io::Write;
        file.write_all(&bytes).map_err(|e| e.to_string())?;

        doc.path = Some(path_buf);
        let enable_syntax = doc.rope.len_bytes() <= LARGE_FILE_THRESHOLD_BYTES;
        configure_document_syntax(&mut doc, enable_syntax);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn convert_encoding(state: State<'_, AppState>, id: String, new_encoding: String) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let label = new_encoding.as_bytes();
        let encoding = Encoding::for_label(label)
            .ok_or_else(|| format!("Unsupported encoding: {}", new_encoding))?;

        doc.encoding = encoding;
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn new_file(state: State<'_, AppState>) -> Result<FileInfo, String> {
    let id = Uuid::new_v4().to_string();
    let encoding = encoding_rs::UTF_8;

    let mut doc = Document {
        rope: Rope::new(),
        encoding,
        path: None,
        document_version: 0,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        parser: None,
        tree: None,
        language: None,
        syntax_dirty: false,
    };

    configure_document_syntax(&mut doc, true);

    state.documents.insert(id.clone(), doc);

    Ok(FileInfo {
        id,
        path: String::new(),
        name: "Untitled".to_string(),
        encoding: encoding.name().to_string(),
        line_count: 1,
        large_file_mode: false,
    })
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        result.push(DirEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn undo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if let Some(operation) = doc.undo_stack.pop() {
            let inverse = operation.inverse();
            apply_operation(&mut doc, &inverse)?;
            doc.redo_stack.push(operation);
            Ok(doc.rope.len_lines())
        } else {
            Err("No more undo steps".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn redo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if let Some(operation) = doc.redo_stack.pop() {
            apply_operation(&mut doc, &operation)?;
            doc.undo_stack.push(operation);
            Ok(doc.rope.len_lines())
        } else {
            Err("No more redo steps".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn edit_text(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    new_text: String,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let len_chars = doc.rope.len_chars();
        let start = start_char.min(len_chars);
        let end = end_char.min(len_chars).max(start);

        let old_text = doc.rope.slice(start..end).to_string();
        if old_text == new_text {
            return Ok(doc.rope.len_lines());
        }

        let operation = EditOperation {
            start_char: start,
            old_text,
            new_text,
        };

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn replace_line_range(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    new_text: String,
) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let len_lines = doc.rope.len_lines();
        let start = start_line.min(len_lines);
        let end = end_line.min(len_lines).max(start);

        if start >= end {
            return Ok(doc.rope.len_lines());
        }

        let start_char = doc.rope.line_to_char(start);
        let end_char = doc.rope.line_to_char(end);

        let old_text = doc.rope.slice(start_char..end_char).to_string();
        if old_text == new_text {
            return Ok(doc.rope.len_lines());
        }

        let operation = EditOperation {
            start_char,
            old_text,
            new_text,
        };

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn format_document(
    state: State<'_, AppState>,
    id: String,
    mode: String,
    file_path: Option<String>,
    file_name: Option<String>,
    tab_width: Option<u8>,
) -> Result<usize, String> {
    let format_mode = parse_format_mode(mode.as_str())
        .ok_or_else(|| "Unsupported format mode. Use beautify or minify".to_string())?;

    if let Some(mut doc) = state.documents.get_mut(&id) {
        let file_format = resolve_structured_format(
            file_path.as_deref(),
            file_name.as_deref(),
            &doc.path,
        )
        .ok_or_else(|| "Only JSON, YAML, XML, and TOML files are supported".to_string())?;

        let source = doc.rope.to_string();
        let normalized_tab_width = normalize_tab_width(tab_width.unwrap_or(DEFAULT_TAB_WIDTH));
        let formatted = format_structured_text(&source, file_format, format_mode, normalized_tab_width)?;

        if source == formatted {
            return Ok(doc.rope.len_lines());
        }

        let operation = EditOperation {
            start_char: 0,
            old_text: source,
            new_text: formatted,
        };

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();

        Ok(doc.rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}

