use dashmap::DashMap;
use regex::RegexBuilder;
use ropey::Rope;
use std::collections::BTreeSet;
use std::sync::{Arc, OnceLock};
use uuid::Uuid;

use super::editing::{apply_operation, create_edit_operation};
use super::FILTER_MAX_RANGES_PER_LINE;
use crate::state::AppState;
use crate::state::Document;
use tauri::State;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSegmentResult {
    pub(super) text: String,
    pub(super) is_primary_match: bool,
    pub(super) is_secondary_match: bool,
    pub(super) is_rule_match: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchResult {
    pub(super) start: usize,
    pub(super) end: usize,
    pub(super) start_char: usize,
    pub(super) end_char: usize,
    pub(super) text: String,
    pub(super) line: usize,
    pub(super) column: usize,
    pub(super) line_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) preview_segments: Option<Vec<PreviewSegmentResult>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPayload {
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFirstResultPayload {
    pub(super) first_match: Option<SearchMatchResult>,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunkResultPayload {
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_offset: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSessionStartResultPayload {
    pub(super) session_id: Option<String>,
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_offset: Option<usize>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSessionNextResultPayload {
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_offset: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSessionRestoreResultPayload {
    pub(super) restored: bool,
    pub(super) session_id: Option<String>,
    pub(super) document_version: u64,
    pub(super) next_offset: Option<usize>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCountResultPayload {
    pub(super) total_matches: usize,
    pub(super) matched_lines: usize,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceAllResultPayload {
    pub(super) replaced_count: usize,
    pub(super) line_count: usize,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceAllAndSearchChunkResultPayload {
    pub(super) replaced_count: usize,
    pub(super) line_count: usize,
    pub(super) document_version: u64,
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) next_offset: Option<usize>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceCurrentResultPayload {
    pub(super) replaced: bool,
    pub(super) line_count: usize,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceCurrentAndSearchChunkResultPayload {
    pub(super) replaced: bool,
    pub(super) line_count: usize,
    pub(super) document_version: u64,
    pub(super) matches: Vec<SearchMatchResult>,
    pub(super) next_offset: Option<usize>,
    pub(super) preferred_match: Option<SearchMatchResult>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultFilterStepPayload {
    pub(super) target_match: Option<SearchMatchResult>,
    pub(super) document_version: u64,
    pub(super) batch_start_offset: usize,
    pub(super) batch_matches: Vec<SearchMatchResult>,
    pub(super) next_offset: Option<usize>,
    pub(super) target_index_in_batch: Option<usize>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCursorStepResultPayload {
    pub(super) target_match: Option<SearchMatchResult>,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleInput {
    pub(super) keyword: String,
    pub(super) match_mode: String,
    pub(super) background_color: String,
    pub(super) text_color: String,
    pub(super) bold: bool,
    pub(super) italic: bool,
    pub(super) apply_to: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleGroupConfig {
    pub(super) name: String,
    pub(super) rules: Vec<FilterRuleInput>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleGroupsFilePayload {
    pub(super) filter_rule_groups: Vec<FilterRuleGroupConfig>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuleStyleResult {
    pub(super) background_color: String,
    pub(super) text_color: String,
    pub(super) bold: bool,
    pub(super) italic: bool,
    pub(super) apply_to: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterMatchRangeResult {
    pub(super) start_char: usize,
    pub(super) end_char: usize,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterLineMatchResult {
    pub(super) line: usize,
    pub(super) column: usize,
    pub(super) length: usize,
    pub(super) line_text: String,
    pub(super) rule_index: usize,
    pub(super) style: FilterRuleStyleResult,
    pub(super) ranges: Vec<FilterMatchRangeResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) preview_segments: Option<Vec<PreviewSegmentResult>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterChunkResultPayload {
    pub(super) matches: Vec<FilterLineMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_line: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSessionStartResultPayload {
    pub(super) session_id: Option<String>,
    pub(super) matches: Vec<FilterLineMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_line: Option<usize>,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSessionNextResultPayload {
    pub(super) matches: Vec<FilterLineMatchResult>,
    pub(super) document_version: u64,
    pub(super) next_line: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSessionRestoreResultPayload {
    pub(super) restored: bool,
    pub(super) session_id: Option<String>,
    pub(super) document_version: u64,
    pub(super) next_line: Option<usize>,
    pub(super) total_matched_lines: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterCountResultPayload {
    pub(super) matched_lines: usize,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterResultFilterStepPayload {
    pub(super) target_match: Option<FilterLineMatchResult>,
    pub(super) document_version: u64,
    pub(super) batch_start_line: usize,
    pub(super) batch_matches: Vec<FilterLineMatchResult>,
    pub(super) next_line: Option<usize>,
    pub(super) target_index_in_batch: Option<usize>,
    pub(super) total_matched_lines: usize,
}

#[derive(Clone)]
pub struct SearchResultFilterStepCacheEntry {
    pub(super) document_version: u64,
    pub(super) matches: Arc<Vec<SearchMatchResult>>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
}

#[derive(Clone)]
pub struct FilterResultFilterStepCacheEntry {
    pub(super) document_version: u64,
    pub(super) matches: Arc<Vec<FilterLineMatchResult>>,
    pub(super) total_matched_lines: usize,
}

#[derive(Clone)]
pub struct SearchSessionEntry {
    pub(super) document_id: String,
    pub(super) document_version: u64,
    pub(super) result_filter_keyword: Option<String>,
    pub(super) result_filter_case_sensitive: bool,
    pub(super) matches: Arc<Vec<SearchMatchResult>>,
    pub(super) next_index: usize,
}

#[derive(Clone)]
pub struct FilterSessionEntry {
    pub(super) document_id: String,
    pub(super) document_version: u64,
    pub(super) result_filter_keyword: Option<String>,
    pub(super) result_filter_case_sensitive: bool,
    pub(super) matches: Arc<Vec<FilterLineMatchResult>>,
    pub(super) next_index: usize,
}

#[derive(Clone)]
pub struct SearchCursorContextCacheEntry {
    pub(super) document_id: String,
    pub(super) source_text: Arc<String>,
    pub(super) line_starts: Arc<Vec<usize>>,
    pub(super) byte_to_char: Arc<Vec<usize>>,
}

pub(super) static SEARCH_RESULT_FILTER_STEP_CACHE: OnceLock<
    DashMap<String, SearchResultFilterStepCacheEntry>,
> = OnceLock::new();
pub(super) static FILTER_RESULT_FILTER_STEP_CACHE: OnceLock<
    DashMap<String, FilterResultFilterStepCacheEntry>,
> = OnceLock::new();
pub(super) static SEARCH_SESSION_CACHE: OnceLock<DashMap<String, SearchSessionEntry>> =
    OnceLock::new();
pub(super) static FILTER_SESSION_CACHE: OnceLock<DashMap<String, FilterSessionEntry>> =
    OnceLock::new();
pub(super) static SEARCH_CURSOR_CONTEXT_CACHE: OnceLock<
    DashMap<String, SearchCursorContextCacheEntry>,
> = OnceLock::new();

pub(super) fn search_result_filter_step_cache(
) -> &'static DashMap<String, SearchResultFilterStepCacheEntry> {
    SEARCH_RESULT_FILTER_STEP_CACHE.get_or_init(DashMap::new)
}

pub(super) fn filter_result_filter_step_cache(
) -> &'static DashMap<String, FilterResultFilterStepCacheEntry> {
    FILTER_RESULT_FILTER_STEP_CACHE.get_or_init(DashMap::new)
}

pub(super) fn search_session_cache() -> &'static DashMap<String, SearchSessionEntry> {
    SEARCH_SESSION_CACHE.get_or_init(DashMap::new)
}

pub(super) fn filter_session_cache() -> &'static DashMap<String, FilterSessionEntry> {
    FILTER_SESSION_CACHE.get_or_init(DashMap::new)
}

pub(super) fn search_cursor_context_cache(
) -> &'static DashMap<String, SearchCursorContextCacheEntry> {
    SEARCH_CURSOR_CONTEXT_CACHE.get_or_init(DashMap::new)
}

fn remove_search_sessions_by_document(document_id: &str) {
    let stale_session_ids = search_session_cache()
        .iter()
        .filter(|entry| entry.value().document_id == document_id)
        .map(|entry| entry.key().clone())
        .collect::<Vec<String>>();

    for session_id in stale_session_ids {
        search_session_cache().remove(&session_id);
    }
}

fn remove_filter_sessions_by_document(document_id: &str) {
    let stale_session_ids = filter_session_cache()
        .iter()
        .filter(|entry| entry.value().document_id == document_id)
        .map(|entry| entry.key().clone())
        .collect::<Vec<String>>();

    for session_id in stale_session_ids {
        filter_session_cache().remove(&session_id);
    }
}

fn build_search_cursor_context_cache_key(document_id: &str, document_version: u64) -> String {
    format!("{document_id}\u{1f}{document_version}")
}

fn remove_search_cursor_context_cache_by_document(document_id: &str) {
    let stale_cache_keys = search_cursor_context_cache()
        .iter()
        .filter(|entry| entry.value().document_id == document_id)
        .map(|entry| entry.key().clone())
        .collect::<Vec<String>>();

    for cache_key in stale_cache_keys {
        search_cursor_context_cache().remove(&cache_key);
    }
}

pub(super) fn dispose_search_session_impl(session_id: String) -> bool {
    search_session_cache().remove(&session_id).is_some()
}

pub(super) fn dispose_filter_session_impl(session_id: String) -> bool {
    filter_session_cache().remove(&session_id).is_some()
}

pub(super) fn find_line_index_by_offset(line_starts: &[usize], target_offset: usize) -> usize {
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

pub(super) fn build_line_starts(text: &str) -> Vec<usize> {
    let mut line_starts = vec![0usize];

    for (index, byte) in text.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            line_starts.push(index + 1);
        }
    }

    line_starts
}

pub(super) fn build_byte_to_char_map(text: &str) -> Vec<usize> {
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

pub(super) fn get_line_text(text: &str, line_starts: &[usize], line_index: usize) -> String {
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

pub(super) fn normalize_result_filter_keyword(value: Option<String>) -> Option<String> {
    value.and_then(|keyword| {
        let trimmed = keyword.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn collect_result_filter_ranges_by_char(
    line_text: &str,
    result_filter_keyword: Option<&str>,
    case_sensitive: bool,
) -> Vec<(usize, usize)> {
    let Some(keyword) = result_filter_keyword else {
        return Vec::new();
    };

    if keyword.is_empty() {
        return Vec::new();
    }

    let mut ranges_in_bytes = Vec::new();

    if case_sensitive {
        for (start, matched) in line_text.match_indices(keyword) {
            ranges_in_bytes.push((start, start + matched.len()));
        }
    } else {
        let escaped = escape_regex_literal(keyword);
        if let Ok(regex) = RegexBuilder::new(&escaped).case_insensitive(true).build() {
            for capture in regex.find_iter(line_text) {
                ranges_in_bytes.push((capture.start(), capture.end()));
            }
        }
    }

    if ranges_in_bytes.is_empty() {
        return Vec::new();
    }

    let byte_to_char = build_byte_to_char_map(line_text);

    ranges_in_bytes
        .into_iter()
        .filter_map(|(start, end)| {
            let start_char = *byte_to_char.get(start)?;
            let end_char = *byte_to_char.get(end)?;
            if end_char > start_char {
                Some((start_char, end_char))
            } else {
                None
            }
        })
        .collect()
}

fn merge_ranges_by_char(mut ranges: Vec<(usize, usize)>) -> Vec<(usize, usize)> {
    if ranges.is_empty() {
        return ranges;
    }

    ranges.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));

    let mut merged: Vec<(usize, usize)> = Vec::with_capacity(ranges.len());
    for (start, end) in ranges {
        if end <= start {
            continue;
        }

        if let Some(last) = merged.last_mut() {
            if start <= last.1 {
                if end > last.1 {
                    last.1 = end;
                }
                continue;
            }
        }

        merged.push((start, end));
    }

    merged
}

fn build_preview_segments_by_char(
    line_text: &str,
    primary_ranges: &[(usize, usize)],
    secondary_ranges: &[(usize, usize)],
    rule_ranges: &[(usize, usize)],
) -> Vec<PreviewSegmentResult> {
    if line_text.is_empty() {
        return Vec::new();
    }

    let chars: Vec<char> = line_text.chars().collect();
    let line_len = chars.len();
    let mut boundaries: BTreeSet<usize> = BTreeSet::from([0usize, line_len]);

    for (start, end) in primary_ranges
        .iter()
        .chain(secondary_ranges.iter())
        .chain(rule_ranges.iter())
    {
        let safe_start = (*start).min(line_len);
        let safe_end = (*end).min(line_len);
        boundaries.insert(safe_start);
        boundaries.insert(safe_end);
    }

    let sorted: Vec<usize> = boundaries.into_iter().collect();
    let mut segments = Vec::new();

    for window in sorted.windows(2) {
        let start = window[0];
        let end = window[1];

        if end <= start {
            continue;
        }

        let content: String = chars[start..end].iter().collect();
        if content.is_empty() {
            continue;
        }

        let is_primary_match = primary_ranges
            .iter()
            .any(|(range_start, range_end)| start >= *range_start && end <= *range_end);
        let is_secondary_match = secondary_ranges
            .iter()
            .any(|(range_start, range_end)| start >= *range_start && end <= *range_end);
        let is_rule_match = rule_ranges
            .iter()
            .any(|(range_start, range_end)| start >= *range_start && end <= *range_end);

        segments.push(PreviewSegmentResult {
            text: content,
            is_primary_match,
            is_secondary_match,
            is_rule_match,
        });
    }

    segments
}

fn build_search_match_preview_segments(
    match_result: &SearchMatchResult,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Vec<PreviewSegmentResult> {
    let line_text = match_result.line_text.as_str();

    let start = match_result.column.saturating_sub(1);
    let length = match_result
        .end_char
        .saturating_sub(match_result.start_char);
    let primary_range = if length > 0 {
        Some((start, start.saturating_add(length)))
    } else {
        None
    };

    let primary_ranges = primary_range.into_iter().collect::<Vec<(usize, usize)>>();
    let secondary_ranges = collect_result_filter_ranges_by_char(
        line_text,
        result_filter_keyword,
        result_filter_case_sensitive,
    );

    build_preview_segments_by_char(line_text, &primary_ranges, &secondary_ranges, &[])
}

fn build_filter_match_preview_segments(
    match_result: &FilterLineMatchResult,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Vec<PreviewSegmentResult> {
    let line_text = match_result.line_text.as_str();
    let secondary_ranges = collect_result_filter_ranges_by_char(
        line_text,
        result_filter_keyword,
        result_filter_case_sensitive,
    );

    let rule_ranges = if match_result.style.apply_to == "line" {
        vec![(0usize, line_text.chars().count())]
    } else {
        let ranges = match_result
            .ranges
            .iter()
            .filter_map(|range| {
                if range.end_char > range.start_char {
                    Some((range.start_char, range.end_char))
                } else {
                    None
                }
            })
            .collect::<Vec<(usize, usize)>>();

        merge_ranges_by_char(ranges)
    };

    build_preview_segments_by_char(line_text, &[], &secondary_ranges, &rule_ranges)
}

pub(super) fn matches_result_filter(
    line_text: &str,
    result_filter_keyword: Option<&str>,
    case_sensitive: bool,
) -> bool {
    let Some(keyword) = result_filter_keyword else {
        return true;
    };

    if case_sensitive {
        return line_text.contains(keyword);
    }

    line_text.to_lowercase().contains(&keyword.to_lowercase())
}

pub(super) fn escape_regex_literal(keyword: &str) -> String {
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

pub(super) fn wildcard_to_regex_source(keyword: &str) -> String {
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
pub(super) enum FilterMatchMode {
    Contains,
    Regex,
    Wildcard,
}

#[derive(Clone, Copy)]
pub(super) enum FilterApplyTo {
    Line,
    Match,
}

#[derive(Clone)]
pub struct CompiledFilterRule {
    pub(super) rule_index: usize,
    pub(super) keyword: String,
    pub(super) match_mode: FilterMatchMode,
    pub(super) regex: Option<regex::Regex>,
    pub(super) style: FilterRuleStyleResult,
    pub(super) apply_to: FilterApplyTo,
}

pub(super) fn parse_filter_match_mode(mode: &str) -> Result<FilterMatchMode, String> {
    match mode.trim().to_lowercase().as_str() {
        "contains" | "exist" | "exists" => Ok(FilterMatchMode::Contains),
        "regex" => Ok(FilterMatchMode::Regex),
        "wildcard" => Ok(FilterMatchMode::Wildcard),
        _ => Err("Unsupported filter match mode".to_string()),
    }
}

pub(super) fn parse_filter_apply_to(value: &str) -> Result<FilterApplyTo, String> {
    match value.trim().to_lowercase().as_str() {
        "line" => Ok(FilterApplyTo::Line),
        "match" => Ok(FilterApplyTo::Match),
        _ => Err("Unsupported filter apply target".to_string()),
    }
}

pub(super) fn compile_filter_rules(
    rules: Vec<FilterRuleInput>,
) -> Result<Vec<CompiledFilterRule>, String> {
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

pub(super) fn line_matches_filter_rule(line_text: &str, rule: &CompiledFilterRule) -> bool {
    match rule.match_mode {
        FilterMatchMode::Contains => line_text.contains(&rule.keyword),
        FilterMatchMode::Regex | FilterMatchMode::Wildcard => rule
            .regex
            .as_ref()
            .map(|regex| regex.is_match(line_text))
            .unwrap_or(false),
    }
}

pub(super) fn collect_filter_rule_ranges(
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

pub(super) fn normalize_rope_line_text(line_text: &str) -> String {
    line_text
        .trim_end_matches('\n')
        .trim_end_matches('\r')
        .to_string()
}

pub(super) fn build_filter_match_result(
    line_number: usize,
    line_text: &str,
    rule: &CompiledFilterRule,
    ranges_in_bytes: Vec<(usize, usize)>,
) -> FilterLineMatchResult {
    let byte_to_char = build_byte_to_char_map(line_text);
    let fallback_start_char = 0usize;
    let fallback_end_char = 0usize;

    let (column, length) = if let Some((first_start, first_end)) = ranges_in_bytes.first().copied()
    {
        let start_char = *byte_to_char
            .get(first_start)
            .unwrap_or(&fallback_start_char);
        let end_char = *byte_to_char.get(first_end).unwrap_or(&start_char);
        (
            start_char.saturating_add(1),
            end_char.saturating_sub(start_char),
        )
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
        preview_segments: None,
    }
}

pub(super) fn match_line_with_filter_rules(
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

        return Some(build_filter_match_result(
            line_number,
            line_text,
            rule,
            ranges,
        ));
    }

    None
}

pub(super) fn line_matches_any_filter_rule(line_text: &str, rules: &[CompiledFilterRule]) -> bool {
    rules
        .iter()
        .any(|rule| line_matches_filter_rule(line_text, rule))
}

pub(super) fn compute_kmp_lps(pattern: &[u8]) -> Vec<usize> {
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

pub(super) fn kmp_find_all(haystack: &str, needle: &str) -> Vec<(usize, usize)> {
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
            preview_segments: None,
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
                preview_segments: None,
            })
        })
        .collect()
}

fn count_regex_matches(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> (usize, usize) {
    let mut total_matches = 0usize;
    let mut matched_lines = 0usize;
    let mut last_line_index: Option<usize> = None;

    for capture in regex.find_iter(text) {
        let line_index = find_line_index_by_offset(line_starts, capture.start());
        let line_text = get_line_text(text, line_starts, line_index);
        if !matches_result_filter(
            &line_text,
            result_filter_keyword,
            result_filter_case_sensitive,
        ) {
            continue;
        }

        total_matches = total_matches.saturating_add(1);

        if last_line_index != Some(line_index) {
            matched_lines = matched_lines.saturating_add(1);
            last_line_index = Some(line_index);
        }
    }

    (total_matches, matched_lines)
}

fn count_literal_matches(
    text: &str,
    needle: &str,
    line_starts: &[usize],
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> (usize, usize) {
    if needle.is_empty() {
        return (0usize, 0usize);
    }

    let haystack_bytes = text.as_bytes();
    let needle_bytes = needle.as_bytes();

    if needle_bytes.is_empty()
        || haystack_bytes.is_empty()
        || needle_bytes.len() > haystack_bytes.len()
    {
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
                let line_index = find_line_index_by_offset(line_starts, start);
                let line_text = get_line_text(text, line_starts, line_index);
                if !matches_result_filter(
                    &line_text,
                    result_filter_keyword,
                    result_filter_case_sensitive,
                ) {
                    needle_index = lps[needle_index - 1];
                    continue;
                }

                total_matches = total_matches.saturating_add(1);

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
        preview_segments: None,
    })
}

fn collect_regex_matches_chunk(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    max_results: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
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

        if let Some(match_result) = build_match_result_from_offsets(
            text,
            line_starts,
            byte_to_char,
            absolute_start,
            absolute_end,
        ) {
            if !matches_result_filter(
                &match_result.line_text,
                result_filter_keyword,
                result_filter_case_sensitive,
            ) {
                continue;
            }

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
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
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

        if let Some(match_result) = build_match_result_from_offsets(
            text,
            line_starts,
            byte_to_char,
            absolute_start,
            absolute_end,
        ) {
            if !matches_result_filter(
                &match_result.line_text,
                result_filter_keyword,
                result_filter_case_sensitive,
            ) {
                continue;
            }

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
                    Ok(regex
                        .find_iter(text)
                        .last()
                        .map(|capture| (capture.start(), capture.end())))
                } else {
                    Ok(regex
                        .find(text)
                        .map(|capture| (capture.start(), capture.end())))
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
                Ok(regex
                    .find_iter(text)
                    .last()
                    .map(|capture| (capture.start(), capture.end())))
            } else {
                Ok(regex
                    .find(text)
                    .map(|capture| (capture.start(), capture.end())))
            }
        }
        "regex" => {
            let regex = RegexBuilder::new(keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            if reverse {
                Ok(regex
                    .find_iter(text)
                    .last()
                    .map(|capture| (capture.start(), capture.end())))
            } else {
                Ok(regex
                    .find(text)
                    .map(|capture| (capture.start(), capture.end())))
            }
        }
        _ => Err("Unsupported search mode".to_string()),
    }
}

fn line_column_to_search_offset(
    text: &str,
    line_starts: &[usize],
    line: usize,
    column: usize,
) -> usize {
    if text.is_empty() || line_starts.is_empty() {
        return 0;
    }

    let safe_line_index = line
        .saturating_sub(1)
        .min(line_starts.len().saturating_sub(1));
    let line_start = *line_starts.get(safe_line_index).unwrap_or(&0usize);
    let line_end = text
        .get(line_start..)
        .and_then(|slice| slice.find('\n').map(|relative| line_start + relative))
        .unwrap_or(text.len());

    let target_char_index = column.max(1).saturating_sub(1);
    if target_char_index == 0 {
        return line_start;
    }

    let Some(line_slice) = text.get(line_start..line_end) else {
        return line_start.min(text.len());
    };

    let mut current_char_index = 0usize;
    for (byte_offset, _) in line_slice.char_indices() {
        if current_char_index >= target_char_index {
            return line_start + byte_offset;
        }
        current_char_index = current_char_index.saturating_add(1);
    }

    line_end
}

fn resolve_search_cursor_offset(
    text: &str,
    line_starts: &[usize],
    cursor_line: Option<usize>,
    cursor_column: Option<usize>,
    step: i32,
) -> usize {
    if let Some(line) = cursor_line {
        return line_column_to_search_offset(text, line_starts, line, cursor_column.unwrap_or(1));
    }

    if step > 0 {
        0
    } else {
        text.len()
    }
}

fn find_previous_regex_match_filtered(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    byte_to_char: &[usize],
    before_offset: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Option<SearchMatchResult> {
    let normalized_before = normalize_search_offset(text, before_offset).min(text.len());
    if normalized_before == 0 {
        return None;
    }

    let search_slice = text.get(..normalized_before).unwrap_or_default();
    let mut candidate = None;

    for capture in regex.find_iter(search_slice) {
        let absolute_start = capture.start();
        let absolute_end = capture.end();
        let Some(match_result) = build_match_result_from_offsets(
            text,
            line_starts,
            byte_to_char,
            absolute_start,
            absolute_end,
        ) else {
            continue;
        };

        if matches_result_filter(
            &match_result.line_text,
            result_filter_keyword,
            result_filter_case_sensitive,
        ) {
            candidate = Some(match_result);
        }
    }

    candidate
}

fn find_next_regex_match_filtered(
    text: &str,
    regex: &regex::Regex,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Option<SearchMatchResult> {
    let normalized_start = normalize_search_offset(text, start_offset).min(text.len());
    let search_slice = text.get(normalized_start..).unwrap_or_default();

    for capture in regex.find_iter(search_slice) {
        let absolute_start = normalized_start + capture.start();
        let absolute_end = normalized_start + capture.end();
        let Some(match_result) = build_match_result_from_offsets(
            text,
            line_starts,
            byte_to_char,
            absolute_start,
            absolute_end,
        ) else {
            continue;
        };

        if matches_result_filter(
            &match_result.line_text,
            result_filter_keyword,
            result_filter_case_sensitive,
        ) {
            return Some(match_result);
        }
    }

    None
}

fn find_next_literal_match_filtered(
    text: &str,
    keyword: &str,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Option<SearchMatchResult> {
    if keyword.is_empty() {
        return None;
    }

    let normalized_start = normalize_search_offset(text, start_offset).min(text.len());
    let search_slice = text.get(normalized_start..).unwrap_or_default();

    for (relative_start, _) in search_slice.match_indices(keyword) {
        let absolute_start = normalized_start + relative_start;
        let absolute_end = absolute_start + keyword.len();
        let Some(match_result) = build_match_result_from_offsets(
            text,
            line_starts,
            byte_to_char,
            absolute_start,
            absolute_end,
        ) else {
            continue;
        };

        if matches_result_filter(
            &match_result.line_text,
            result_filter_keyword,
            result_filter_case_sensitive,
        ) {
            return Some(match_result);
        }
    }

    None
}

fn find_next_filtered_search_match(
    text: &str,
    keyword: &str,
    mode: &str,
    case_sensitive: bool,
    line_starts: &[usize],
    byte_to_char: &[usize],
    start_offset: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Result<Option<SearchMatchResult>, String> {
    if keyword.is_empty() {
        return Ok(None);
    }

    let next_match = match mode {
        "literal" => {
            if case_sensitive {
                find_next_literal_match_filtered(
                    text,
                    keyword,
                    line_starts,
                    byte_to_char,
                    start_offset,
                    result_filter_keyword,
                    result_filter_case_sensitive,
                )
            } else {
                let escaped = escape_regex_literal(keyword);
                let regex = RegexBuilder::new(&escaped)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| e.to_string())?;
                find_next_regex_match_filtered(
                    text,
                    &regex,
                    line_starts,
                    byte_to_char,
                    start_offset,
                    result_filter_keyword,
                    result_filter_case_sensitive,
                )
            }
        }
        "wildcard" => {
            let regex_source = wildcard_to_regex_source(keyword);
            let regex = RegexBuilder::new(&regex_source)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;
            find_next_regex_match_filtered(
                text,
                &regex,
                line_starts,
                byte_to_char,
                start_offset,
                result_filter_keyword,
                result_filter_case_sensitive,
            )
        }
        "regex" => {
            let regex = RegexBuilder::new(keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;
            find_next_regex_match_filtered(
                text,
                &regex,
                line_starts,
                byte_to_char,
                start_offset,
                result_filter_keyword,
                result_filter_case_sensitive,
            )
        }
        _ => {
            return Err("Unsupported search mode".to_string());
        }
    };

    Ok(next_match)
}

fn find_previous_filtered_search_match(
    text: &str,
    keyword: &str,
    mode: &str,
    case_sensitive: bool,
    line_starts: &[usize],
    byte_to_char: &[usize],
    before_offset: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Result<Option<SearchMatchResult>, String> {
    if keyword.is_empty() {
        return Ok(None);
    }

    let effective_before = normalize_search_offset(text, before_offset).min(text.len());
    if effective_before == 0 {
        return Ok(None);
    }

    match mode {
        "literal" => {
            if case_sensitive {
                let mut search_end = effective_before;
                while search_end > 0 {
                    let Some(search_slice) = text.get(..search_end) else {
                        break;
                    };
                    let Some(start) = search_slice.rfind(keyword) else {
                        break;
                    };
                    let end = start + keyword.len();

                    if let Some(match_result) =
                        build_match_result_from_offsets(text, line_starts, byte_to_char, start, end)
                    {
                        if matches_result_filter(
                            &match_result.line_text,
                            result_filter_keyword,
                            result_filter_case_sensitive,
                        ) {
                            return Ok(Some(match_result));
                        }
                    }

                    if start == 0 {
                        break;
                    }
                    search_end = start;
                }

                Ok(None)
            } else {
                let escaped = escape_regex_literal(keyword);
                let regex = RegexBuilder::new(&escaped)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| e.to_string())?;
                Ok(find_previous_regex_match_filtered(
                    text,
                    &regex,
                    line_starts,
                    byte_to_char,
                    effective_before,
                    result_filter_keyword,
                    result_filter_case_sensitive,
                ))
            }
        }
        "wildcard" => {
            let regex_source = wildcard_to_regex_source(keyword);
            let regex = RegexBuilder::new(&regex_source)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;
            Ok(find_previous_regex_match_filtered(
                text,
                &regex,
                line_starts,
                byte_to_char,
                effective_before,
                result_filter_keyword,
                result_filter_case_sensitive,
            ))
        }
        "regex" => {
            let regex = RegexBuilder::new(keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;
            Ok(find_previous_regex_match_filtered(
                text,
                &regex,
                line_starts,
                byte_to_char,
                effective_before,
                result_filter_keyword,
                result_filter_case_sensitive,
            ))
        }
        _ => Err("Unsupported search mode".to_string()),
    }
}

fn build_search_result_filter_step_cache_key(
    id: &str,
    document_version: u64,
    keyword: &str,
    mode: &str,
    case_sensitive: bool,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> String {
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}",
        id,
        document_version,
        mode,
        case_sensitive,
        keyword,
        result_filter_keyword.unwrap_or_default(),
        result_filter_case_sensitive,
    )
}

fn build_filter_result_filter_step_cache_key(
    id: &str,
    document_version: u64,
    rules: &[FilterRuleInput],
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> String {
    let rules_json = serde_json::to_string(rules).unwrap_or_default();

    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}",
        id,
        document_version,
        rules_json,
        result_filter_keyword.unwrap_or_default(),
        result_filter_case_sensitive,
    )
}

fn build_search_step_filtered_matches(
    doc: &Document,
    keyword: &str,
    mode: &str,
    case_sensitive: bool,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Result<Vec<SearchMatchResult>, String> {
    if keyword.is_empty() {
        return Ok(Vec::new());
    }

    let source_text: String = doc.rope.chunks().collect();
    let line_starts = build_line_starts(&source_text);
    let byte_to_char = build_byte_to_char_map(&source_text);

    let mut matches = match mode {
        "literal" => {
            if case_sensitive {
                collect_literal_matches(&source_text, keyword, &line_starts, &byte_to_char)
            } else {
                let escaped = escape_regex_literal(keyword);
                let regex = RegexBuilder::new(&escaped)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| e.to_string())?;

                collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
            }
        }
        "wildcard" => {
            let regex_source = wildcard_to_regex_source(keyword);
            let regex = RegexBuilder::new(&regex_source)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
        }
        "regex" => {
            let regex = RegexBuilder::new(keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            collect_regex_matches(&source_text, &regex, &line_starts, &byte_to_char)
        }
        _ => {
            return Err("Unsupported search mode".to_string());
        }
    };

    if result_filter_keyword.is_some() {
        matches.retain(|item| {
            matches_result_filter(
                &item.line_text,
                result_filter_keyword,
                result_filter_case_sensitive,
            )
        });
    }

    Ok(matches)
}

fn build_search_matches_chunk_with_preview(
    matches: &[SearchMatchResult],
    start_index: usize,
    max_results: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> (Vec<SearchMatchResult>, Option<usize>, usize) {
    if start_index >= matches.len() {
        return (Vec::new(), None, start_index);
    }

    let effective_max_results = max_results.max(1);
    let end_index = (start_index + effective_max_results).min(matches.len());
    let mut chunk = matches[start_index..end_index].to_vec();
    for item in &mut chunk {
        item.preview_segments = Some(build_search_match_preview_segments(
            item,
            result_filter_keyword,
            result_filter_case_sensitive,
        ));
    }

    let next_offset = matches.get(end_index).map(|item| item.start);
    (chunk, next_offset, end_index)
}

fn find_search_session_next_index_by_offset(
    matches: &[SearchMatchResult],
    next_offset: Option<usize>,
) -> usize {
    let Some(offset) = next_offset else {
        return matches.len();
    };

    matches
        .iter()
        .position(|item| item.start >= offset)
        .unwrap_or(matches.len())
}

fn build_filter_matches_chunk_with_preview(
    matches: &[FilterLineMatchResult],
    start_index: usize,
    max_results: usize,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> (Vec<FilterLineMatchResult>, Option<usize>, usize) {
    if start_index >= matches.len() {
        return (Vec::new(), None, start_index);
    }

    let effective_max_results = max_results.max(1);
    let end_index = (start_index + effective_max_results).min(matches.len());
    let mut chunk = matches[start_index..end_index].to_vec();
    for item in &mut chunk {
        item.preview_segments = Some(build_filter_match_preview_segments(
            item,
            result_filter_keyword,
            result_filter_case_sensitive,
        ));
    }

    let next_line = matches
        .get(end_index)
        .map(|item| item.line.saturating_sub(1));
    (chunk, next_line, end_index)
}

fn find_filter_session_next_index_by_line(
    matches: &[FilterLineMatchResult],
    next_line: Option<usize>,
) -> usize {
    let Some(start_line) = next_line else {
        return matches.len();
    };

    matches
        .iter()
        .position(|item| item.line.saturating_sub(1) >= start_line)
        .unwrap_or(matches.len())
}

fn replace_matches_by_char_ranges(
    source_text: &str,
    matches: &[SearchMatchResult],
    replace_value: &str,
) -> String {
    if matches.is_empty() {
        return source_text.to_string();
    }

    let mut rope = Rope::from_str(source_text);
    let replacement_char_count = replace_value.chars().count() as isize;
    let mut char_delta: isize = 0;

    for item in matches {
        let adjusted_start = (item.start_char as isize + char_delta).max(0) as usize;
        let adjusted_end =
            (item.end_char as isize + char_delta).max(adjusted_start as isize) as usize;

        let rope_len_chars = rope.len_chars();
        let start = adjusted_start.min(rope_len_chars);
        let end = adjusted_end.min(rope_len_chars).max(start);

        if start < end {
            rope.remove(start..end);
        }

        if !replace_value.is_empty() {
            rope.insert(start, replace_value);
        }

        let original_char_count = item.end_char.saturating_sub(item.start_char) as isize;
        char_delta += replacement_char_count - original_char_count;
    }

    rope.to_string()
}

fn build_filter_step_filtered_matches(
    doc: &Document,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<&str>,
    result_filter_case_sensitive: bool,
) -> Result<Vec<FilterLineMatchResult>, String> {
    let compiled_rules = compile_filter_rules(rules)?;
    if compiled_rules.is_empty() {
        return Ok(Vec::new());
    }

    let total_lines = doc.rope.len_lines();
    let mut results: Vec<FilterLineMatchResult> = Vec::new();

    for line_index in 0..total_lines {
        let line_number = line_index + 1;
        let line_slice = doc.rope.line(line_index);
        let line_text = normalize_rope_line_text(&line_slice.to_string());

        if !matches_result_filter(
            &line_text,
            result_filter_keyword,
            result_filter_case_sensitive,
        ) {
            continue;
        }

        if let Some(item) = match_line_with_filter_rules(line_number, &line_text, &compiled_rules) {
            results.push(item);
        }
    }

    Ok(results)
}

fn lower_bound_search_matches(matches: &[SearchMatchResult], target_start: usize) -> usize {
    let mut left = 0usize;
    let mut right = matches.len();

    while left < right {
        let middle = left + (right - left) / 2;
        if matches[middle].start < target_start {
            left = middle + 1;
        } else {
            right = middle;
        }
    }

    left
}

fn lower_bound_filter_matches(matches: &[FilterLineMatchResult], target_line: usize) -> usize {
    let mut left = 0usize;
    let mut right = matches.len();

    while left < right {
        let middle = left + (right - left) / 2;
        if matches[middle].line < target_line {
            left = middle + 1;
        } else {
            right = middle;
        }
    }

    left
}

fn select_replace_current_preferred_chunk_index(
    matches_len: usize,
    replaced_match_index: usize,
    max_results: usize,
) -> Option<usize> {
    if matches_len == 0 {
        return None;
    }

    let effective_max_results = max_results.max(1);
    let chunk_len = matches_len.min(effective_max_results);
    if chunk_len == 0 {
        return None;
    }

    Some(replaced_match_index.min(chunk_len - 1))
}

fn find_exact_search_match_index(
    matches: &[SearchMatchResult],
    start: usize,
    end: usize,
) -> Option<usize> {
    let mut index = lower_bound_search_matches(matches, start);

    while index < matches.len() && matches[index].start == start {
        if matches[index].end == end {
            return Some(index);
        }
        index += 1;
    }

    None
}

fn find_exact_filter_match_index(
    matches: &[FilterLineMatchResult],
    line: usize,
    column: Option<usize>,
) -> Option<usize> {
    let mut index = lower_bound_filter_matches(matches, line);

    while index < matches.len() && matches[index].line == line {
        if column.is_none() || Some(matches[index].column) == column {
            return Some(index);
        }
        index += 1;
    }

    None
}

pub(super) fn search_first_in_document_impl(
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
                build_match_result_from_offsets(
                    &source_text,
                    &line_starts,
                    &byte_to_char,
                    start,
                    end,
                )
            });

        Ok(SearchFirstResultPayload {
            first_match,
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn search_in_document_chunk_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
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
        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();
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
                        result_filter_keyword_ref,
                        case_sensitive,
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
                        result_filter_keyword_ref,
                        case_sensitive,
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
                    result_filter_keyword_ref,
                    case_sensitive,
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
                    result_filter_keyword_ref,
                    case_sensitive,
                )
            }
            _ => {
                return Err("Unsupported search mode".to_string());
            }
        };

        let mut matches_with_preview = matches;
        for item in matches_with_preview.iter_mut() {
            item.preview_segments = Some(build_search_match_preview_segments(
                item,
                result_filter_keyword_ref,
                case_sensitive,
            ));
        }

        Ok(SearchChunkResultPayload {
            matches: matches_with_preview,
            document_version: doc.document_version,
            next_offset,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn search_session_start_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    max_results: usize,
) -> Result<SearchSessionStartResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        remove_search_sessions_by_document(&id);
        if keyword.is_empty() {
            return Ok(SearchSessionStartResultPayload {
                session_id: None,
                matches: Vec::new(),
                document_version: doc.document_version,
                next_offset: None,
                total_matches: 0,
                total_matched_lines: 0,
            });
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive =
            result_filter_case_sensitive.unwrap_or(case_sensitive);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();
        let all_matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;
        let total_matches = all_matches.len();
        let total_matched_lines = all_matches
            .iter()
            .map(|item| item.line)
            .collect::<BTreeSet<usize>>()
            .len();
        let (matches, next_offset, next_index) = build_search_matches_chunk_with_preview(
            &all_matches,
            0,
            max_results,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        );

        if total_matches == 0 {
            return Ok(SearchSessionStartResultPayload {
                session_id: None,
                matches,
                document_version: doc.document_version,
                next_offset,
                total_matches,
                total_matched_lines,
            });
        }

        let session_id = Uuid::new_v4().to_string();
        search_session_cache().insert(
            session_id.clone(),
            SearchSessionEntry {
                document_id: id,
                document_version: doc.document_version,
                result_filter_keyword: normalized_result_filter_keyword,
                result_filter_case_sensitive: effective_result_filter_case_sensitive,
                matches: Arc::new(all_matches),
                next_index,
            },
        );

        Ok(SearchSessionStartResultPayload {
            session_id: Some(session_id),
            matches,
            document_version: doc.document_version,
            next_offset,
            total_matches,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn search_session_next_in_document_impl(
    state: State<'_, AppState>,
    session_id: String,
    max_results: usize,
) -> Result<SearchSessionNextResultPayload, String> {
    let (matches, next_offset, document_version, should_remove) = {
        let mut entry = search_session_cache()
            .get_mut(&session_id)
            .ok_or_else(|| "Search session not found".to_string())?;

        let Some(doc) = state.documents.get(&entry.document_id) else {
            return Err("Search session document not found".to_string());
        };

        if doc.document_version != entry.document_version {
            return Err("Search session expired due to document changes".to_string());
        }

        let (matches, next_offset, next_index) = build_search_matches_chunk_with_preview(
            entry.matches.as_slice(),
            entry.next_index,
            max_results,
            entry.result_filter_keyword.as_deref(),
            entry.result_filter_case_sensitive,
        );
        entry.next_index = next_index;
        let should_remove = next_index >= entry.matches.len();

        (matches, next_offset, entry.document_version, should_remove)
    };

    if should_remove {
        search_session_cache().remove(&session_id);
    }

    Ok(SearchSessionNextResultPayload {
        matches,
        document_version,
        next_offset,
    })
}

pub(super) fn search_session_restore_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    expected_document_version: Option<u64>,
    next_offset: Option<usize>,
) -> Result<SearchSessionRestoreResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        remove_search_sessions_by_document(&id);

        if keyword.is_empty() {
            return Ok(SearchSessionRestoreResultPayload {
                restored: true,
                session_id: None,
                document_version: doc.document_version,
                next_offset: None,
                total_matches: 0,
                total_matched_lines: 0,
            });
        }

        if let Some(expected_version) = expected_document_version {
            if expected_version != doc.document_version {
                return Ok(SearchSessionRestoreResultPayload {
                    restored: false,
                    session_id: None,
                    document_version: doc.document_version,
                    next_offset: None,
                    total_matches: 0,
                    total_matched_lines: 0,
                });
            }
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive =
            result_filter_case_sensitive.unwrap_or(case_sensitive);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();
        let all_matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;
        let total_matches = all_matches.len();
        let total_matched_lines = all_matches
            .iter()
            .map(|item| item.line)
            .collect::<BTreeSet<usize>>()
            .len();
        let next_index = find_search_session_next_index_by_offset(&all_matches, next_offset);
        let resolved_next_offset = all_matches.get(next_index).map(|item| item.start);

        if total_matches == 0 || next_index >= all_matches.len() {
            return Ok(SearchSessionRestoreResultPayload {
                restored: true,
                session_id: None,
                document_version: doc.document_version,
                next_offset: None,
                total_matches,
                total_matched_lines,
            });
        }

        let session_id = Uuid::new_v4().to_string();
        search_session_cache().insert(
            session_id.clone(),
            SearchSessionEntry {
                document_id: id,
                document_version: doc.document_version,
                result_filter_keyword: normalized_result_filter_keyword,
                result_filter_case_sensitive: effective_result_filter_case_sensitive,
                matches: Arc::new(all_matches),
                next_index,
            },
        );

        Ok(SearchSessionRestoreResultPayload {
            restored: true,
            session_id: Some(session_id),
            document_version: doc.document_version,
            next_offset: resolved_next_offset,
            total_matches,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn search_count_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
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

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let (total_matches, matched_lines) = match mode.as_str() {
            "literal" => {
                if case_sensitive {
                    count_literal_matches(
                        &source_text,
                        &keyword,
                        &line_starts,
                        normalized_result_filter_keyword.as_deref(),
                        case_sensitive,
                    )
                } else {
                    let escaped = escape_regex_literal(&keyword);
                    let regex = RegexBuilder::new(&escaped)
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| e.to_string())?;

                    count_regex_matches(
                        &source_text,
                        &regex,
                        &line_starts,
                        normalized_result_filter_keyword.as_deref(),
                        case_sensitive,
                    )
                }
            }
            "wildcard" => {
                let regex_source = wildcard_to_regex_source(&keyword);
                let regex = RegexBuilder::new(&regex_source)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                count_regex_matches(
                    &source_text,
                    &regex,
                    &line_starts,
                    normalized_result_filter_keyword.as_deref(),
                    case_sensitive,
                )
            }
            "regex" => {
                let regex = RegexBuilder::new(&keyword)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|e| e.to_string())?;

                count_regex_matches(
                    &source_text,
                    &regex,
                    &line_starts,
                    normalized_result_filter_keyword.as_deref(),
                    case_sensitive,
                )
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

pub(super) fn search_step_from_cursor_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    cursor_line: Option<usize>,
    cursor_column: Option<usize>,
    step: i32,
) -> Result<SearchCursorStepResultPayload, String> {
    if step == 0 {
        return Err("Step cannot be zero".to_string());
    }

    let doc = state
        .documents
        .get(&id)
        .ok_or_else(|| "Document not found".to_string())?;

    if keyword.is_empty() {
        return Ok(SearchCursorStepResultPayload {
            target_match: None,
            document_version: doc.document_version,
        });
    }

    let cache_key = build_search_cursor_context_cache_key(&id, doc.document_version);
    let (source_text, line_starts, byte_to_char) =
        if let Some(entry) = search_cursor_context_cache().get(&cache_key) {
            (
                entry.source_text.clone(),
                entry.line_starts.clone(),
                entry.byte_to_char.clone(),
            )
        } else {
            let source_text = Arc::new(doc.rope.chunks().collect::<String>());
            let line_starts = Arc::new(build_line_starts(source_text.as_str()));
            let byte_to_char = Arc::new(build_byte_to_char_map(source_text.as_str()));

            remove_search_cursor_context_cache_by_document(&id);
            search_cursor_context_cache().insert(
                cache_key,
                SearchCursorContextCacheEntry {
                    document_id: id.clone(),
                    source_text: source_text.clone(),
                    line_starts: line_starts.clone(),
                    byte_to_char: byte_to_char.clone(),
                },
            );

            (source_text, line_starts, byte_to_char)
        };
    let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
    let filter_case_sensitive = result_filter_case_sensitive.unwrap_or(case_sensitive);
    let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();
    let cursor_offset = resolve_search_cursor_offset(
        source_text.as_str(),
        &line_starts,
        cursor_line,
        cursor_column,
        step,
    );

    let mut target_match = if step > 0 {
        let forward_match = find_next_filtered_search_match(
            source_text.as_str(),
            &keyword,
            &mode,
            case_sensitive,
            &line_starts,
            &byte_to_char,
            cursor_offset.saturating_add(1),
            result_filter_keyword_ref,
            filter_case_sensitive,
        )?;

        if forward_match.is_some() {
            forward_match
        } else {
            find_next_filtered_search_match(
                source_text.as_str(),
                &keyword,
                &mode,
                case_sensitive,
                &line_starts,
                &byte_to_char,
                0,
                result_filter_keyword_ref,
                filter_case_sensitive,
            )?
        }
    } else {
        let backward_match = find_previous_filtered_search_match(
            source_text.as_str(),
            &keyword,
            &mode,
            case_sensitive,
            &line_starts,
            &byte_to_char,
            cursor_offset,
            result_filter_keyword_ref,
            filter_case_sensitive,
        )?;

        if backward_match.is_some() {
            backward_match
        } else {
            find_previous_filtered_search_match(
                source_text.as_str(),
                &keyword,
                &mode,
                case_sensitive,
                &line_starts,
                &byte_to_char,
                source_text.len(),
                result_filter_keyword_ref,
                filter_case_sensitive,
            )?
        }
    };

    if let Some(match_result) = target_match.as_mut() {
        match_result.preview_segments = Some(build_search_match_preview_segments(
            match_result,
            result_filter_keyword_ref,
            filter_case_sensitive,
        ));
    }

    Ok(SearchCursorStepResultPayload {
        target_match,
        document_version: doc.document_version,
    })
}

pub(super) fn step_result_filter_search_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    current_start: Option<usize>,
    current_end: Option<usize>,
    step: i32,
    max_results: usize,
) -> Result<SearchResultFilterStepPayload, String> {
    if step == 0 {
        return Err("Step cannot be zero".to_string());
    }

    let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
    let filter_case_sensitive = result_filter_case_sensitive.unwrap_or(case_sensitive);
    let _effective_max = max_results.max(1);

    if keyword.is_empty() {
        let document_version = state
            .documents
            .get(&id)
            .map(|doc| doc.document_version)
            .ok_or_else(|| "Document not found".to_string())?;

        return Ok(SearchResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_offset: 0,
            batch_matches: Vec::new(),
            next_offset: None,
            target_index_in_batch: None,
            total_matches: 0,
            total_matched_lines: 0,
        });
    }

    let (document_version, matches_arc, total_matches, total_matched_lines) = {
        let doc = state
            .documents
            .get(&id)
            .ok_or_else(|| "Document not found".to_string())?;
        let document_version = doc.document_version;
        let cache_key = build_search_result_filter_step_cache_key(
            &id,
            document_version,
            &keyword,
            &mode,
            case_sensitive,
            normalized_result_filter_keyword.as_deref(),
            filter_case_sensitive,
        );

        if let Some(entry) = search_result_filter_step_cache().get(&cache_key) {
            if entry.document_version == document_version {
                (
                    document_version,
                    entry.matches.clone(),
                    entry.total_matches,
                    entry.total_matched_lines,
                )
            } else {
                let computed_matches = build_search_step_filtered_matches(
                    &doc,
                    &keyword,
                    &mode,
                    case_sensitive,
                    normalized_result_filter_keyword.as_deref(),
                    filter_case_sensitive,
                )?;
                let total_matches = computed_matches.len();
                let total_matched_lines = computed_matches
                    .iter()
                    .map(|item| item.line)
                    .collect::<BTreeSet<_>>()
                    .len();
                let matches_arc = Arc::new(computed_matches);
                search_result_filter_step_cache().insert(
                    cache_key,
                    SearchResultFilterStepCacheEntry {
                        document_version,
                        matches: matches_arc.clone(),
                        total_matches,
                        total_matched_lines,
                    },
                );
                (
                    document_version,
                    matches_arc,
                    total_matches,
                    total_matched_lines,
                )
            }
        } else {
            let computed_matches = build_search_step_filtered_matches(
                &doc,
                &keyword,
                &mode,
                case_sensitive,
                normalized_result_filter_keyword.as_deref(),
                filter_case_sensitive,
            )?;
            let total_matches = computed_matches.len();
            let total_matched_lines = computed_matches
                .iter()
                .map(|item| item.line)
                .collect::<BTreeSet<_>>()
                .len();
            let matches_arc = Arc::new(computed_matches);
            search_result_filter_step_cache().insert(
                cache_key,
                SearchResultFilterStepCacheEntry {
                    document_version,
                    matches: matches_arc.clone(),
                    total_matches,
                    total_matched_lines,
                },
            );
            (
                document_version,
                matches_arc,
                total_matches,
                total_matched_lines,
            )
        }
    };

    let matches = matches_arc.as_ref();
    if matches.is_empty() {
        return Ok(SearchResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_offset: 0,
            batch_matches: Vec::new(),
            next_offset: None,
            target_index_in_batch: None,
            total_matches: 0,
            total_matched_lines: 0,
        });
    }

    let target_index = if step > 0 {
        if let (Some(start), Some(end)) = (current_start, current_end) {
            if let Some(current_index) = find_exact_search_match_index(matches, start, end) {
                Some((current_index + 1) % matches.len())
            } else {
                let next_index = lower_bound_search_matches(matches, end);
                if next_index < matches.len() {
                    Some(next_index)
                } else {
                    Some(0usize)
                }
            }
        } else {
            let boundary_end = current_end.unwrap_or(0usize);
            let next_index = lower_bound_search_matches(matches, boundary_end);
            if next_index < matches.len() {
                Some(next_index)
            } else {
                Some(0usize)
            }
        }
    } else if let (Some(start), Some(end)) = (current_start, current_end) {
        if let Some(current_index) = find_exact_search_match_index(matches, start, end) {
            if current_index == 0 {
                Some(matches.len().saturating_sub(1))
            } else {
                Some(current_index - 1)
            }
        } else {
            let first_at_or_after = lower_bound_search_matches(matches, start);
            if first_at_or_after == 0 {
                Some(matches.len().saturating_sub(1))
            } else {
                Some(first_at_or_after - 1)
            }
        }
    } else {
        let boundary_start = current_start.unwrap_or(usize::MAX);
        let first_at_or_after = lower_bound_search_matches(matches, boundary_start);
        if first_at_or_after == 0 {
            Some(matches.len().saturating_sub(1))
        } else {
            Some(first_at_or_after - 1)
        }
    };

    let Some(target_index) = target_index else {
        return Ok(SearchResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_offset: 0,
            batch_matches: Vec::new(),
            next_offset: None,
            target_index_in_batch: None,
            total_matches: 0,
            total_matched_lines: 0,
        });
    };

    let target_match = matches.get(target_index).cloned();
    let (batch_matches, next_offset, _) = build_search_matches_chunk_with_preview(
        matches,
        target_index,
        max_results,
        normalized_result_filter_keyword.as_deref(),
        filter_case_sensitive,
    );
    let batch_start_offset = batch_matches
        .first()
        .map(|item| item.start)
        .or_else(|| target_match.as_ref().map(|item| item.start))
        .unwrap_or(0);
    let target_index_in_batch = if target_match.is_some() {
        Some(0usize)
    } else {
        None
    };

    Ok(SearchResultFilterStepPayload {
        batch_start_offset,
        batch_matches,
        next_offset,
        target_match,
        document_version,
        target_index_in_batch,
        total_matches,
        total_matched_lines,
    })
}

pub(super) fn filter_count_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
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
        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let result_filter_case_sensitive = result_filter_case_sensitive.unwrap_or(true);

        for line_index in 0..total_lines {
            let line_slice = doc.rope.line(line_index);
            let line_text = normalize_rope_line_text(&line_slice.to_string());

            if !matches_result_filter(
                &line_text,
                normalized_result_filter_keyword.as_deref(),
                result_filter_case_sensitive,
            ) {
                continue;
            }

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

pub(super) fn filter_in_document_chunk_impl(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
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
        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();
        let result_filter_case_sensitive = result_filter_case_sensitive.unwrap_or(true);
        let mut line_index = start_line.min(total_lines);
        let mut matches: Vec<FilterLineMatchResult> = Vec::new();
        let mut next_line = None;

        while line_index < total_lines {
            let line_number = line_index + 1;
            let line_slice = doc.rope.line(line_index);
            let line_text = normalize_rope_line_text(&line_slice.to_string());

            if !matches_result_filter(
                &line_text,
                result_filter_keyword_ref,
                result_filter_case_sensitive,
            ) {
                line_index = line_index.saturating_add(1);
                continue;
            }

            if let Some(mut filter_match) =
                match_line_with_filter_rules(line_number, &line_text, &compiled_rules)
            {
                if matches.len() >= effective_max {
                    next_line = Some(line_index);
                    break;
                }

                filter_match.preview_segments = Some(build_filter_match_preview_segments(
                    &filter_match,
                    result_filter_keyword_ref,
                    result_filter_case_sensitive,
                ));

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

pub(super) fn filter_session_start_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    max_results: usize,
) -> Result<FilterSessionStartResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        remove_filter_sessions_by_document(&id);
        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive = result_filter_case_sensitive.unwrap_or(true);
        let all_matches = build_filter_step_filtered_matches(
            &doc,
            rules,
            normalized_result_filter_keyword.as_deref(),
            effective_result_filter_case_sensitive,
        )?;
        let total_matched_lines = all_matches.len();
        let (matches, next_line, next_index) = build_filter_matches_chunk_with_preview(
            &all_matches,
            0,
            max_results,
            normalized_result_filter_keyword.as_deref(),
            effective_result_filter_case_sensitive,
        );

        if total_matched_lines == 0 {
            return Ok(FilterSessionStartResultPayload {
                session_id: None,
                matches,
                document_version: doc.document_version,
                next_line,
                total_matched_lines,
            });
        }

        let session_id = Uuid::new_v4().to_string();
        filter_session_cache().insert(
            session_id.clone(),
            FilterSessionEntry {
                document_id: id,
                document_version: doc.document_version,
                result_filter_keyword: normalized_result_filter_keyword,
                result_filter_case_sensitive: effective_result_filter_case_sensitive,
                matches: Arc::new(all_matches),
                next_index,
            },
        );

        Ok(FilterSessionStartResultPayload {
            session_id: Some(session_id),
            matches,
            document_version: doc.document_version,
            next_line,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn filter_session_next_in_document_impl(
    state: State<'_, AppState>,
    session_id: String,
    max_results: usize,
) -> Result<FilterSessionNextResultPayload, String> {
    let (matches, next_line, document_version, should_remove) = {
        let mut entry = filter_session_cache()
            .get_mut(&session_id)
            .ok_or_else(|| "Filter session not found".to_string())?;

        let Some(doc) = state.documents.get(&entry.document_id) else {
            return Err("Filter session document not found".to_string());
        };

        if doc.document_version != entry.document_version {
            return Err("Filter session expired due to document changes".to_string());
        }

        let (matches, next_line, next_index) = build_filter_matches_chunk_with_preview(
            entry.matches.as_slice(),
            entry.next_index,
            max_results,
            entry.result_filter_keyword.as_deref(),
            entry.result_filter_case_sensitive,
        );
        entry.next_index = next_index;
        let should_remove = next_index >= entry.matches.len();

        (matches, next_line, entry.document_version, should_remove)
    };

    if should_remove {
        filter_session_cache().remove(&session_id);
    }

    Ok(FilterSessionNextResultPayload {
        matches,
        document_version,
        next_line,
    })
}

pub(super) fn filter_session_restore_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    expected_document_version: Option<u64>,
    next_line: Option<usize>,
) -> Result<FilterSessionRestoreResultPayload, String> {
    if let Some(doc) = state.documents.get(&id) {
        remove_filter_sessions_by_document(&id);

        if let Some(expected_version) = expected_document_version {
            if expected_version != doc.document_version {
                return Ok(FilterSessionRestoreResultPayload {
                    restored: false,
                    session_id: None,
                    document_version: doc.document_version,
                    next_line: None,
                    total_matched_lines: 0,
                });
            }
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive = result_filter_case_sensitive.unwrap_or(true);
        let all_matches = build_filter_step_filtered_matches(
            &doc,
            rules,
            normalized_result_filter_keyword.as_deref(),
            effective_result_filter_case_sensitive,
        )?;
        let total_matched_lines = all_matches.len();
        let next_index = find_filter_session_next_index_by_line(&all_matches, next_line);
        let resolved_next_line = all_matches
            .get(next_index)
            .map(|item| item.line.saturating_sub(1));

        if total_matched_lines == 0 || next_index >= all_matches.len() {
            return Ok(FilterSessionRestoreResultPayload {
                restored: true,
                session_id: None,
                document_version: doc.document_version,
                next_line: None,
                total_matched_lines,
            });
        }

        let session_id = Uuid::new_v4().to_string();
        filter_session_cache().insert(
            session_id.clone(),
            FilterSessionEntry {
                document_id: id,
                document_version: doc.document_version,
                result_filter_keyword: normalized_result_filter_keyword,
                result_filter_case_sensitive: effective_result_filter_case_sensitive,
                matches: Arc::new(all_matches),
                next_index,
            },
        );

        Ok(FilterSessionRestoreResultPayload {
            restored: true,
            session_id: Some(session_id),
            document_version: doc.document_version,
            next_line: resolved_next_line,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn step_result_filter_search_in_filter_document_impl(
    state: State<'_, AppState>,
    id: String,
    rules: Vec<FilterRuleInput>,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    current_line: Option<usize>,
    current_column: Option<usize>,
    step: i32,
    max_results: usize,
) -> Result<FilterResultFilterStepPayload, String> {
    if step == 0 {
        return Err("Step cannot be zero".to_string());
    }

    let _effective_max = max_results.max(1);
    let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
    let filter_case_sensitive = result_filter_case_sensitive.unwrap_or(true);

    let (document_version, matches_arc, total_matched_lines) = {
        let doc = state
            .documents
            .get(&id)
            .ok_or_else(|| "Document not found".to_string())?;
        let document_version = doc.document_version;
        let cache_key = build_filter_result_filter_step_cache_key(
            &id,
            document_version,
            &rules,
            normalized_result_filter_keyword.as_deref(),
            filter_case_sensitive,
        );

        if let Some(entry) = filter_result_filter_step_cache().get(&cache_key) {
            if entry.document_version == document_version {
                (
                    document_version,
                    entry.matches.clone(),
                    entry.total_matched_lines,
                )
            } else {
                let computed_matches = build_filter_step_filtered_matches(
                    &doc,
                    rules.clone(),
                    normalized_result_filter_keyword.as_deref(),
                    filter_case_sensitive,
                )?;
                let total_matched_lines = computed_matches.len();
                let matches_arc = Arc::new(computed_matches);
                filter_result_filter_step_cache().insert(
                    cache_key,
                    FilterResultFilterStepCacheEntry {
                        document_version,
                        matches: matches_arc.clone(),
                        total_matched_lines,
                    },
                );
                (document_version, matches_arc, total_matched_lines)
            }
        } else {
            let computed_matches = build_filter_step_filtered_matches(
                &doc,
                rules.clone(),
                normalized_result_filter_keyword.as_deref(),
                filter_case_sensitive,
            )?;
            let total_matched_lines = computed_matches.len();
            let matches_arc = Arc::new(computed_matches);
            filter_result_filter_step_cache().insert(
                cache_key,
                FilterResultFilterStepCacheEntry {
                    document_version,
                    matches: matches_arc.clone(),
                    total_matched_lines,
                },
            );
            (document_version, matches_arc, total_matched_lines)
        }
    };

    let matches = matches_arc.as_ref();
    if matches.is_empty() {
        return Ok(FilterResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_line: 0,
            batch_matches: Vec::new(),
            next_line: None,
            target_index_in_batch: None,
            total_matched_lines: 0,
        });
    }

    let boundary_line = current_line.unwrap_or(usize::MAX);
    let target_index = if step > 0 {
        if let Some(line) = current_line {
            if let Some(current_index) =
                find_exact_filter_match_index(matches, line, current_column)
            {
                Some((current_index + 1) % matches.len())
            } else {
                let next_index = lower_bound_filter_matches(matches, line.saturating_add(1));
                if next_index < matches.len() {
                    Some(next_index)
                } else {
                    Some(0usize)
                }
            }
        } else {
            let next_index = lower_bound_filter_matches(matches, boundary_line.saturating_add(1));
            if next_index < matches.len() {
                Some(next_index)
            } else {
                Some(0usize)
            }
        }
    } else if let Some(line) = current_line {
        if let Some(current_index) = find_exact_filter_match_index(matches, line, current_column) {
            if current_index == 0 {
                Some(matches.len().saturating_sub(1))
            } else {
                Some(current_index - 1)
            }
        } else {
            let first_at_or_after = lower_bound_filter_matches(matches, line);
            if first_at_or_after == 0 {
                Some(matches.len().saturating_sub(1))
            } else {
                Some(first_at_or_after - 1)
            }
        }
    } else {
        let first_at_or_after = lower_bound_filter_matches(matches, boundary_line);
        if first_at_or_after == 0 {
            Some(matches.len().saturating_sub(1))
        } else {
            Some(first_at_or_after - 1)
        }
    };

    let Some(target_index) = target_index else {
        return Ok(FilterResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_line: 0,
            batch_matches: Vec::new(),
            next_line: None,
            target_index_in_batch: None,
            total_matched_lines: 0,
        });
    };

    let target_match = matches.get(target_index).cloned();
    let (batch_matches, next_line, _) = build_filter_matches_chunk_with_preview(
        matches,
        target_index,
        max_results,
        normalized_result_filter_keyword.as_deref(),
        filter_case_sensitive,
    );
    let batch_start_line = batch_matches
        .first()
        .map(|item| item.line.saturating_sub(1))
        .or_else(|| {
            target_match
                .as_ref()
                .map(|item| item.line.saturating_sub(1))
        })
        .unwrap_or(0);
    let target_index_in_batch = if target_match.is_some() {
        Some(0usize)
    } else {
        None
    };

    Ok(FilterResultFilterStepPayload {
        batch_start_line,
        batch_matches,
        next_line,
        target_match,
        document_version,
        target_index_in_batch,
        total_matched_lines,
    })
}

pub(super) fn replace_all_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
) -> Result<ReplaceAllResultPayload, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if keyword.is_empty() {
            return Ok(ReplaceAllResultPayload {
                replaced_count: 0,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
            });
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive =
            result_filter_case_sensitive.unwrap_or(case_sensitive);

        let matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            normalized_result_filter_keyword.as_deref(),
            effective_result_filter_case_sensitive,
        )?;

        if matches.is_empty() {
            return Ok(ReplaceAllResultPayload {
                replaced_count: 0,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
            });
        }

        let source_text = doc.rope.to_string();
        let next_text = replace_matches_by_char_ranges(&source_text, &matches, &replace_value);
        let replaced_count = matches.len();

        if source_text != next_text {
            let operation = create_edit_operation(&mut doc, 0, source_text, next_text);

            apply_operation(&mut doc, &operation)?;
            doc.undo_stack.push(operation);
            doc.redo_stack.clear();
            remove_search_sessions_by_document(&id);
            remove_filter_sessions_by_document(&id);
        }

        Ok(ReplaceAllResultPayload {
            replaced_count,
            line_count: doc.rope.len_lines(),
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn replace_current_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    target_start: usize,
    target_end: usize,
) -> Result<ReplaceCurrentResultPayload, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if keyword.is_empty() {
            return Ok(ReplaceCurrentResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
            });
        }

        let matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            None,
            case_sensitive,
        )?;

        let target_match = matches
            .iter()
            .find(|item| item.start == target_start && item.end == target_end)
            .cloned();

        let Some(target_match) = target_match else {
            return Ok(ReplaceCurrentResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
            });
        };

        let replacement_text = if mode == "regex" {
            let regex = RegexBuilder::new(&keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            regex
                .replace(&target_match.text, replace_value.as_str())
                .to_string()
        } else {
            replace_value
        };

        if replacement_text == target_match.text {
            return Ok(ReplaceCurrentResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
            });
        }

        let operation = create_edit_operation(
            &mut doc,
            target_match.start_char,
            target_match.text,
            replacement_text,
        );

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();
        remove_search_sessions_by_document(&id);
        remove_filter_sessions_by_document(&id);

        Ok(ReplaceCurrentResultPayload {
            replaced: true,
            line_count: doc.rope.len_lines(),
            document_version: doc.document_version,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn replace_current_and_search_chunk_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    target_start: usize,
    target_end: usize,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    max_results: usize,
) -> Result<ReplaceCurrentAndSearchChunkResultPayload, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if keyword.is_empty() {
            return Ok(ReplaceCurrentAndSearchChunkResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                matches: Vec::new(),
                next_offset: None,
                preferred_match: None,
                total_matches: 0,
                total_matched_lines: 0,
            });
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive =
            result_filter_case_sensitive.unwrap_or(case_sensitive);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();

        let previous_matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;

        let Some(target_index) =
            find_exact_search_match_index(&previous_matches, target_start, target_end)
        else {
            return Ok(ReplaceCurrentAndSearchChunkResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                matches: Vec::new(),
                next_offset: None,
                preferred_match: None,
                total_matches: previous_matches.len(),
                total_matched_lines: previous_matches
                    .iter()
                    .map(|item| item.line)
                    .collect::<BTreeSet<usize>>()
                    .len(),
            });
        };

        let target_match = previous_matches[target_index].clone();
        let replacement_text = if mode == "regex" {
            let regex = RegexBuilder::new(&keyword)
                .case_insensitive(!case_sensitive)
                .build()
                .map_err(|e| e.to_string())?;

            regex
                .replace(&target_match.text, replace_value.as_str())
                .to_string()
        } else {
            replace_value
        };

        if replacement_text == target_match.text {
            return Ok(ReplaceCurrentAndSearchChunkResultPayload {
                replaced: false,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                matches: Vec::new(),
                next_offset: None,
                preferred_match: None,
                total_matches: previous_matches.len(),
                total_matched_lines: previous_matches
                    .iter()
                    .map(|item| item.line)
                    .collect::<BTreeSet<usize>>()
                    .len(),
            });
        }

        let operation = create_edit_operation(
            &mut doc,
            target_match.start_char,
            target_match.text,
            replacement_text,
        );

        apply_operation(&mut doc, &operation)?;
        doc.undo_stack.push(operation);
        doc.redo_stack.clear();
        remove_search_sessions_by_document(&id);
        remove_filter_sessions_by_document(&id);

        let refreshed_matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;

        let total_matches = refreshed_matches.len();
        let total_matched_lines = refreshed_matches
            .iter()
            .map(|item| item.line)
            .collect::<BTreeSet<usize>>()
            .len();
        let effective_max_results = max_results.max(1);
        let next_offset = refreshed_matches
            .get(effective_max_results)
            .map(|item| item.start);

        let mut matches = refreshed_matches
            .into_iter()
            .take(effective_max_results)
            .collect::<Vec<SearchMatchResult>>();
        for item in &mut matches {
            item.preview_segments = Some(build_search_match_preview_segments(
                item,
                result_filter_keyword_ref,
                effective_result_filter_case_sensitive,
            ));
        }
        let preferred_chunk_index = select_replace_current_preferred_chunk_index(
            total_matches,
            target_index,
            effective_max_results,
        );
        let preferred_match = preferred_chunk_index.and_then(|index| matches.get(index).cloned());

        Ok(ReplaceCurrentAndSearchChunkResultPayload {
            replaced: true,
            line_count: doc.rope.len_lines(),
            document_version: doc.document_version,
            matches,
            next_offset,
            preferred_match,
            total_matches,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn replace_all_and_search_chunk_in_document_impl(
    state: State<'_, AppState>,
    id: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    result_filter_keyword: Option<String>,
    result_filter_case_sensitive: Option<bool>,
    max_results: usize,
) -> Result<ReplaceAllAndSearchChunkResultPayload, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if keyword.is_empty() {
            return Ok(ReplaceAllAndSearchChunkResultPayload {
                replaced_count: 0,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                matches: Vec::new(),
                next_offset: None,
                total_matches: 0,
                total_matched_lines: 0,
            });
        }

        let normalized_result_filter_keyword =
            normalize_result_filter_keyword(result_filter_keyword);
        let effective_result_filter_case_sensitive =
            result_filter_case_sensitive.unwrap_or(case_sensitive);
        let result_filter_keyword_ref = normalized_result_filter_keyword.as_deref();

        let matches_before_replace = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;
        let replaced_count = matches_before_replace.len();

        if replaced_count == 0 {
            return Ok(ReplaceAllAndSearchChunkResultPayload {
                replaced_count: 0,
                line_count: doc.rope.len_lines(),
                document_version: doc.document_version,
                matches: Vec::new(),
                next_offset: None,
                total_matches: 0,
                total_matched_lines: 0,
            });
        }

        let source_text = doc.rope.to_string();
        let next_text =
            replace_matches_by_char_ranges(&source_text, &matches_before_replace, &replace_value);
        if source_text != next_text {
            let operation = create_edit_operation(&mut doc, 0, source_text, next_text);
            apply_operation(&mut doc, &operation)?;
            doc.undo_stack.push(operation);
            doc.redo_stack.clear();
            remove_search_sessions_by_document(&id);
            remove_filter_sessions_by_document(&id);
        }

        let refreshed_matches = build_search_step_filtered_matches(
            &doc,
            &keyword,
            &mode,
            case_sensitive,
            result_filter_keyword_ref,
            effective_result_filter_case_sensitive,
        )?;
        let total_matches = refreshed_matches.len();
        let total_matched_lines = refreshed_matches
            .iter()
            .map(|item| item.line)
            .collect::<BTreeSet<usize>>()
            .len();
        let effective_max_results = max_results.max(1);
        let next_offset = refreshed_matches
            .get(effective_max_results)
            .map(|item| item.start);
        let mut matches = refreshed_matches
            .into_iter()
            .take(effective_max_results)
            .collect::<Vec<SearchMatchResult>>();
        for item in &mut matches {
            item.preview_segments = Some(build_search_match_preview_segments(
                item,
                result_filter_keyword_ref,
                effective_result_filter_case_sensitive,
            ));
        }

        Ok(ReplaceAllAndSearchChunkResultPayload {
            replaced_count,
            line_count: doc.rope.len_lines(),
            document_version: doc.document_version,
            matches,
            next_offset,
            total_matches,
            total_matched_lines,
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn search_in_document_impl(
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_rule(keyword: &str, match_mode: &str, apply_to: &str) -> FilterRuleInput {
        FilterRuleInput {
            keyword: keyword.to_string(),
            match_mode: match_mode.to_string(),
            background_color: "#000000".to_string(),
            text_color: "#ffffff".to_string(),
            bold: false,
            italic: false,
            apply_to: apply_to.to_string(),
        }
    }

    fn make_search_match(
        start: usize,
        end: usize,
        line: usize,
        column: usize,
        line_text: &str,
    ) -> SearchMatchResult {
        SearchMatchResult {
            start,
            end,
            start_char: start,
            end_char: end,
            text: line_text
                .chars()
                .skip(column.saturating_sub(1))
                .take(end.saturating_sub(start))
                .collect::<String>(),
            line,
            column,
            line_text: line_text.to_string(),
            preview_segments: None,
        }
    }

    fn make_filter_match(line: usize, column: usize, line_text: &str) -> FilterLineMatchResult {
        FilterLineMatchResult {
            line,
            column,
            length: 4,
            line_text: line_text.to_string(),
            rule_index: 0,
            style: FilterRuleStyleResult {
                background_color: "#000000".to_string(),
                text_color: "#ffffff".to_string(),
                bold: false,
                italic: false,
                apply_to: "match".to_string(),
            },
            ranges: vec![FilterMatchRangeResult {
                start_char: column.saturating_sub(1),
                end_char: column.saturating_sub(1).saturating_add(4),
            }],
            preview_segments: None,
        }
    }

    #[test]
    fn find_line_index_by_offset_should_return_last_line_start_not_greater_than_offset() {
        let starts = vec![0usize, 3, 8];
        assert_eq!(find_line_index_by_offset(&starts, 0), 0);
        assert_eq!(find_line_index_by_offset(&starts, 2), 0);
        assert_eq!(find_line_index_by_offset(&starts, 3), 1);
        assert_eq!(find_line_index_by_offset(&starts, 7), 1);
        assert_eq!(find_line_index_by_offset(&starts, 99), 2);
    }

    #[test]
    fn build_line_starts_should_record_start_offset_for_each_line() {
        assert_eq!(build_line_starts(""), vec![0]);
        assert_eq!(build_line_starts("a\nb\n"), vec![0, 2, 4]);
        assert_eq!(build_line_starts("abc"), vec![0]);
    }

    #[test]
    fn line_column_to_search_offset_should_resolve_requested_line_and_column() {
        let text = "ab\nc你d\n";
        let line_starts = build_line_starts(text);

        assert_eq!(line_column_to_search_offset(text, &line_starts, 1, 1), 0);
        assert_eq!(line_column_to_search_offset(text, &line_starts, 1, 3), 2);
        assert_eq!(line_column_to_search_offset(text, &line_starts, 2, 2), 4);
    }

    #[test]
    fn build_byte_to_char_map_should_map_multibyte_utf8_bytes_to_char_indices() {
        let mapping = build_byte_to_char_map("a你b");
        assert_eq!(mapping.len(), "a你b".len() + 1);
        assert_eq!(mapping[0], 0);
        assert_eq!(mapping[1], 1);
        assert_eq!(mapping[2], 1);
        assert_eq!(mapping[3], 1);
        assert_eq!(mapping[4], 2);
        assert_eq!(mapping[5], 3);
    }

    #[test]
    fn get_line_text_should_strip_line_break_and_trailing_carriage_return() {
        let text = "a\r\nb\n";
        let starts = build_line_starts(text);
        assert_eq!(get_line_text(text, &starts, 0), "a");
        assert_eq!(get_line_text(text, &starts, 1), "b");
    }

    #[test]
    fn normalize_result_filter_keyword_should_trim_and_drop_empty_values() {
        assert_eq!(
            normalize_result_filter_keyword(Some("  abc  ".to_string())),
            Some("abc".to_string())
        );
        assert_eq!(
            normalize_result_filter_keyword(Some("   ".to_string())),
            None
        );
        assert_eq!(normalize_result_filter_keyword(None), None);
    }

    #[test]
    fn merge_ranges_by_char_should_sort_and_merge_overlapping_segments() {
        let merged = merge_ranges_by_char(vec![(5, 7), (1, 3), (2, 4), (8, 8), (10, 12)]);
        assert_eq!(merged, vec![(1, 4), (5, 7), (10, 12)]);
    }

    #[test]
    fn escape_regex_literal_should_escape_regex_metacharacters() {
        let escaped = escape_regex_literal(r".*+?^${}()|[]\");
        assert_eq!(escaped, r"\.\*\+\?\^\$\{\}\(\)\|\[\]\\");
    }

    #[test]
    fn wildcard_to_regex_source_should_translate_wildcards_and_escape_other_chars() {
        let regex_source = wildcard_to_regex_source("a*b?.txt");
        assert_eq!(regex_source, r"a.*b.\.txt");
    }

    #[test]
    fn parse_filter_match_mode_should_support_aliases_and_reject_unknown_modes() {
        assert!(matches!(
            parse_filter_match_mode("contains"),
            Ok(FilterMatchMode::Contains)
        ));
        assert!(matches!(
            parse_filter_match_mode("exists"),
            Ok(FilterMatchMode::Contains)
        ));
        assert!(matches!(
            parse_filter_match_mode("regex"),
            Ok(FilterMatchMode::Regex)
        ));
        assert!(matches!(
            parse_filter_match_mode("wildcard"),
            Ok(FilterMatchMode::Wildcard)
        ));
        assert!(parse_filter_match_mode("unknown").is_err());
    }

    #[test]
    fn parse_filter_apply_to_should_support_line_and_match() {
        assert!(matches!(
            parse_filter_apply_to("line"),
            Ok(FilterApplyTo::Line)
        ));
        assert!(matches!(
            parse_filter_apply_to("match"),
            Ok(FilterApplyTo::Match)
        ));
        assert!(parse_filter_apply_to("invalid").is_err());
    }

    #[test]
    fn compile_filter_rules_should_skip_empty_rules_and_compile_wildcard_regex() {
        let compiled = compile_filter_rules(vec![
            make_rule("", "contains", "line"),
            make_rule("warn*", "wildcard", "match"),
        ])
        .expect("rule compile should succeed");

        assert_eq!(compiled.len(), 1);
        assert!(matches!(compiled[0].match_mode, FilterMatchMode::Wildcard));
        assert!(matches!(compiled[0].apply_to, FilterApplyTo::Match));
        assert!(compiled[0].regex.is_some());
    }

    #[test]
    fn collect_filter_rule_ranges_should_respect_max_limit() {
        let compiled = compile_filter_rules(vec![make_rule("ab", "contains", "match")])
            .expect("rule compile should succeed");
        let ranges = collect_filter_rule_ranges("abxxabyyab", &compiled[0], 2);

        assert_eq!(ranges, vec![(0, 2), (4, 6)]);
    }

    #[test]
    fn select_replace_current_preferred_chunk_index_should_clamp_to_chunk_tail() {
        assert_eq!(
            select_replace_current_preferred_chunk_index(10, 6, 3),
            Some(2)
        );
        assert_eq!(
            select_replace_current_preferred_chunk_index(2, 1, 3),
            Some(1)
        );
    }

    #[test]
    fn select_replace_current_preferred_chunk_index_should_return_none_for_empty_matches() {
        assert_eq!(select_replace_current_preferred_chunk_index(0, 0, 3), None);
    }

    #[test]
    fn build_search_matches_chunk_with_preview_should_paginate_and_expose_next_offset() {
        let matches = vec![
            make_search_match(0, 4, 1, 1, "todo one"),
            make_search_match(10, 14, 2, 1, "todo two"),
            make_search_match(20, 24, 3, 1, "todo three"),
        ];

        let (chunk, next_offset, next_index) =
            build_search_matches_chunk_with_preview(&matches, 0, 2, Some("todo"), true);

        assert_eq!(chunk.len(), 2);
        assert_eq!(next_offset, Some(20));
        assert_eq!(next_index, 2);
        assert!(chunk.iter().all(|item| item.preview_segments.is_some()));
    }

    #[test]
    fn build_search_matches_chunk_with_preview_should_return_empty_when_start_exceeds_len() {
        let matches = vec![make_search_match(0, 4, 1, 1, "todo one")];

        let (chunk, next_offset, next_index) =
            build_search_matches_chunk_with_preview(&matches, 2, 3, None, false);

        assert!(chunk.is_empty());
        assert_eq!(next_offset, None);
        assert_eq!(next_index, 2);
    }

    #[test]
    fn find_next_filtered_search_match_should_return_first_match_after_offset() {
        let text = "todo one\nskip\ntodo two";
        let line_starts = build_line_starts(text);
        let byte_to_char = build_byte_to_char_map(text);

        let match_result = find_next_filtered_search_match(
            text,
            "todo",
            "literal",
            true,
            &line_starts,
            &byte_to_char,
            1,
            None,
            true,
        )
        .expect("forward search should succeed")
        .expect("match should exist");

        assert_eq!(match_result.line, 3);
        assert_eq!(match_result.column, 1);
    }

    #[test]
    fn find_previous_filtered_search_match_should_return_last_match_before_offset() {
        let text = "todo one\nskip\ntodo two";
        let line_starts = build_line_starts(text);
        let byte_to_char = build_byte_to_char_map(text);
        let second_match_start = text.find("todo two").expect("second match should exist");

        let match_result = find_previous_filtered_search_match(
            text,
            "todo",
            "literal",
            true,
            &line_starts,
            &byte_to_char,
            second_match_start,
            None,
            true,
        )
        .expect("reverse search should succeed")
        .expect("match should exist");

        assert_eq!(match_result.line, 1);
        assert_eq!(match_result.column, 1);
    }

    #[test]
    fn find_search_session_next_index_by_offset_should_return_expected_position() {
        let matches = vec![
            make_search_match(0, 4, 1, 1, "todo one"),
            make_search_match(10, 14, 2, 1, "todo two"),
            make_search_match(20, 24, 3, 1, "todo three"),
        ];

        assert_eq!(
            find_search_session_next_index_by_offset(&matches, Some(0)),
            0
        );
        assert_eq!(
            find_search_session_next_index_by_offset(&matches, Some(10)),
            1
        );
        assert_eq!(
            find_search_session_next_index_by_offset(&matches, Some(15)),
            2
        );
        assert_eq!(
            find_search_session_next_index_by_offset(&matches, Some(30)),
            3
        );
        assert_eq!(find_search_session_next_index_by_offset(&matches, None), 3);
    }

    #[test]
    fn build_filter_matches_chunk_with_preview_should_paginate_and_expose_next_line() {
        let matches = vec![
            make_filter_match(1, 1, "todo one"),
            make_filter_match(4, 1, "todo two"),
            make_filter_match(7, 1, "todo three"),
        ];

        let (chunk, next_line, next_index) =
            build_filter_matches_chunk_with_preview(&matches, 0, 2, Some("todo"), true);

        assert_eq!(chunk.len(), 2);
        assert_eq!(next_line, Some(6));
        assert_eq!(next_index, 2);
        assert!(chunk.iter().all(|item| item.preview_segments.is_some()));
    }

    #[test]
    fn build_filter_matches_chunk_with_preview_should_return_empty_when_start_exceeds_len() {
        let matches = vec![make_filter_match(2, 1, "todo one")];

        let (chunk, next_line, next_index) =
            build_filter_matches_chunk_with_preview(&matches, 3, 2, None, false);

        assert!(chunk.is_empty());
        assert_eq!(next_line, None);
        assert_eq!(next_index, 3);
    }

    #[test]
    fn find_filter_session_next_index_by_line_should_return_expected_position() {
        let matches = vec![
            make_filter_match(2, 1, "todo one"),
            make_filter_match(6, 1, "todo two"),
            make_filter_match(10, 1, "todo three"),
        ];

        assert_eq!(find_filter_session_next_index_by_line(&matches, Some(0)), 0);
        assert_eq!(find_filter_session_next_index_by_line(&matches, Some(1)), 0);
        assert_eq!(find_filter_session_next_index_by_line(&matches, Some(5)), 1);
        assert_eq!(find_filter_session_next_index_by_line(&matches, Some(9)), 2);
        assert_eq!(
            find_filter_session_next_index_by_line(&matches, Some(20)),
            3
        );
        assert_eq!(find_filter_session_next_index_by_line(&matches, None), 3);
    }

    #[test]
    fn dispose_search_session_impl_should_remove_existing_session() {
        search_session_cache().clear();
        search_session_cache().insert(
            "search-session-1".to_string(),
            SearchSessionEntry {
                document_id: "doc-1".to_string(),
                document_version: 1,
                result_filter_keyword: None,
                result_filter_case_sensitive: true,
                matches: Arc::new(Vec::new()),
                next_index: 0,
            },
        );

        assert!(dispose_search_session_impl("search-session-1".to_string()));
        assert!(!dispose_search_session_impl("search-session-1".to_string()));
    }

    #[test]
    fn dispose_filter_session_impl_should_remove_existing_session() {
        filter_session_cache().clear();
        filter_session_cache().insert(
            "filter-session-1".to_string(),
            FilterSessionEntry {
                document_id: "doc-1".to_string(),
                document_version: 1,
                result_filter_keyword: None,
                result_filter_case_sensitive: true,
                matches: Arc::new(Vec::new()),
                next_index: 0,
            },
        );

        assert!(dispose_filter_session_impl("filter-session-1".to_string()));
        assert!(!dispose_filter_session_impl("filter-session-1".to_string()));
    }
}
