use dashmap::DashMap;
use regex::RegexBuilder;
use std::collections::BTreeSet;
use std::sync::{Arc, OnceLock};

use super::FILTER_MAX_RANGES_PER_LINE;
use crate::state::AppState;
use crate::state::Document;
use tauri::State;

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
pub struct SearchCountResultPayload {
    pub(super) total_matches: usize,
    pub(super) matched_lines: usize,
    pub(super) document_version: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultFilterStepPayload {
    pub(super) target_match: Option<SearchMatchResult>,
    pub(super) document_version: u64,
    pub(super) batch_start_offset: usize,
    pub(super) target_index_in_batch: Option<usize>,
    pub(super) total_matches: usize,
    pub(super) total_matched_lines: usize,
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

pub(super) static SEARCH_RESULT_FILTER_STEP_CACHE: OnceLock<DashMap<String, SearchResultFilterStepCacheEntry>> =
    OnceLock::new();
pub(super) static FILTER_RESULT_FILTER_STEP_CACHE: OnceLock<DashMap<String, FilterResultFilterStepCacheEntry>> =
    OnceLock::new();

pub(super) fn search_result_filter_step_cache() -> &'static DashMap<String, SearchResultFilterStepCacheEntry> {
    SEARCH_RESULT_FILTER_STEP_CACHE.get_or_init(DashMap::new)
}

pub(super) fn filter_result_filter_step_cache() -> &'static DashMap<String, FilterResultFilterStepCacheEntry> {
    FILTER_RESULT_FILTER_STEP_CACHE.get_or_init(DashMap::new)
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

pub(super) fn matches_result_filter(line_text: &str, result_filter_keyword: Option<&str>, case_sensitive: bool) -> bool {
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

pub(super) fn compile_filter_rules(rules: Vec<FilterRuleInput>) -> Result<Vec<CompiledFilterRule>, String> {
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
        FilterMatchMode::Regex | FilterMatchMode::Wildcard => {
            rule.regex.as_ref().map(|regex| regex.is_match(line_text)).unwrap_or(false)
        }
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
    line_text.trim_end_matches('\n').trim_end_matches('\r').to_string()
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

        return Some(build_filter_match_result(line_number, line_text, rule, ranges));
    }

    None
}

pub(super) fn line_matches_any_filter_rule(line_text: &str, rules: &[CompiledFilterRule]) -> bool {
    rules.iter().any(|rule| line_matches_filter_rule(line_text, rule))
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

        if let Some(match_result) =
            build_match_result_from_offsets(text, line_starts, byte_to_char, absolute_start, absolute_end)
        {
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

        if let Some(match_result) =
            build_match_result_from_offsets(text, line_starts, byte_to_char, absolute_start, absolute_end)
        {
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

fn find_exact_search_match_index(matches: &[SearchMatchResult], start: usize, end: usize) -> Option<usize> {
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
        let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
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
                        normalized_result_filter_keyword.as_deref(),
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

                collect_regex_matches_chunk(
                    &source_text,
                    &regex,
                    &line_starts,
                    &byte_to_char,
                    start_offset,
                    effective_max,
                    normalized_result_filter_keyword.as_deref(),
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
                    normalized_result_filter_keyword.as_deref(),
                    case_sensitive,
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

        let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
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
                (document_version, matches_arc, total_matches, total_matched_lines)
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
            (document_version, matches_arc, total_matches, total_matched_lines)
        }
    };

    let matches = matches_arc.as_ref();
    if matches.is_empty() {
        return Ok(SearchResultFilterStepPayload {
            target_match: None,
            document_version,
            batch_start_offset: 0,
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
            target_index_in_batch: None,
            total_matches: 0,
            total_matched_lines: 0,
        });
    };

    let target_match = matches.get(target_index).cloned();

    Ok(SearchResultFilterStepPayload {
        batch_start_offset: target_match
            .as_ref()
            .map(|item| item.start)
            .unwrap_or(0),
        target_match,
        document_version,
        target_index_in_batch: Some(0),
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
        let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
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
        let normalized_result_filter_keyword = normalize_result_filter_keyword(result_filter_keyword);
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
                normalized_result_filter_keyword.as_deref(),
                result_filter_case_sensitive,
            ) {
                line_index = line_index.saturating_add(1);
                continue;
            }

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
            target_index_in_batch: None,
            total_matched_lines: 0,
        });
    }

    let boundary_line = current_line.unwrap_or(usize::MAX);
    let target_index = if step > 0 {
        if let Some(line) = current_line {
            if let Some(current_index) = find_exact_filter_match_index(matches, line, current_column) {
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
            target_index_in_batch: None,
            total_matched_lines: 0,
        });
    };

    let target_match = matches.get(target_index).cloned();

    Ok(FilterResultFilterStepPayload {
        batch_start_line: target_match
            .as_ref()
            .map(|item| item.line.saturating_sub(1))
            .unwrap_or(0),
        target_match,
        document_version,
        target_index_in_batch: Some(0),
        total_matched_lines,
    })
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


