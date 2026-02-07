use crate::state::{AppState, Document, EditOperation};
use chardetng::EncodingDetector;
use encoding_rs::Encoding;
use memmap2::Mmap;
use regex::RegexBuilder;
use ropey::Rope;
use std::fs::{self, File};
use std::path::PathBuf;
use tauri::State;
use tree_sitter::{InputEdit, Language, Parser, Point};
use tree_sitter_bash;
use tree_sitter_c;
use tree_sitter_cpp;
use tree_sitter_css;
use tree_sitter_go;
use tree_sitter_html;
use tree_sitter_javascript;
use tree_sitter_java;
use tree_sitter_json;
use tree_sitter_python;
use tree_sitter_rust;
use tree_sitter_toml_ng;
use tree_sitter_typescript;
use tree_sitter_xml;
use tree_sitter_yaml;
use uuid::Uuid;

const LARGE_FILE_THRESHOLD_BYTES: usize = 50 * 1024 * 1024;
const ENCODING_DETECT_SAMPLE_BYTES: usize = 1024 * 1024;
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_FONT_FAMILY: &str = "Consolas, \"Courier New\", monospace";
const DEFAULT_FONT_SIZE: u32 = 14;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    language: String,
    font_family: String,
    font_size: u32,
    word_wrap: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialAppConfig {
    language: Option<String>,
    font_family: Option<String>,
    font_size: Option<u32>,
    word_wrap: Option<bool>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.to_string(),
            font_family: DEFAULT_FONT_FAMILY.to_string(),
            font_size: DEFAULT_FONT_SIZE,
            word_wrap: false,
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

#[derive(Debug)]
struct LeafToken {
    kind: String,
    start_byte: usize,
    end_byte: usize,
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

fn normalize_app_config(config: AppConfig) -> AppConfig {
    AppConfig {
        language: normalize_language(Some(config.language.as_str())),
        font_family: if config.font_family.trim().is_empty() {
            DEFAULT_FONT_FAMILY.to_string()
        } else {
            config.font_family
        },
        font_size: config.font_size.clamp(8, 72),
        word_wrap: config.word_wrap,
    }
}

fn config_file_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA")
        .map_err(|_| "Failed to locate APPDATA directory".to_string())?;
    Ok(PathBuf::from(app_data).join("Rutar").join("config.json"))
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

    if let Some(font_family) = partial.font_family {
        if !font_family.trim().is_empty() {
            config.font_family = font_family;
        }
    }

    if let Some(font_size) = partial.font_size {
        config.font_size = font_size.clamp(8, 72);
    }

    if let Some(word_wrap) = partial.word_wrap {
        config.word_wrap = word_wrap;
    }

    Ok(config)
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let normalized = normalize_app_config(config);
    let path = config_file_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, format!("{}\n", content)).map_err(|e| e.to_string())?;

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

    for entry in entries {
        if let Ok(entry) = entry {
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

