//! Cross-file path-based search/replace engine.
//!
//! Unlike `search.rs` which operates on in-memory documents (keyed by doc id),
//! this module operates on filesystem paths. The target may be a single file,
//! a directory (non-recursive), or a glob pattern (e.g. `C:\\dir\\**\\*.txt`).

use dashmap::DashMap;
use encoding_rs::Encoding;
use globset::Glob;
use memmap2::Mmap;
use regex::{Regex, RegexBuilder};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use uuid::Uuid;
use walkdir::WalkDir;

use super::search::{
    decode_replace_escape_sequences, escape_regex_literal, wildcard_to_regex_source,
};

// ============================================================================
// Public payload types (camelCase to align with frontend)
// ============================================================================

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSearchMatch {
    pub file_path: String,
    pub line: usize,
    pub column: usize,
    pub match_start: usize,
    pub match_end: usize,
    pub line_text: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSearchFileError {
    pub file_path: String,
    pub error: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSearchStartPayload {
    pub session_id: String,
    pub total_files: usize,
    pub matches: Vec<PathSearchMatch>,
    pub completed: bool,
    pub file_errors: Vec<PathSearchFileError>,
    pub scanned_files: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSearchNextPayload {
    pub matches: Vec<PathSearchMatch>,
    pub completed: bool,
    pub file_errors: Vec<PathSearchFileError>,
    pub scanned_files: usize,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathReplacePreviewFile {
    pub file_path: String,
    pub match_count: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathReplacePreviewPayload {
    pub files: Vec<PathReplacePreviewFile>,
    pub total_matches: usize,
    pub total_files: usize,
    pub file_errors: Vec<PathSearchFileError>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathReplaceAppliedFile {
    pub file_path: String,
    pub match_count: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathReplaceApplyPayload {
    pub files_changed: Vec<PathReplaceAppliedFile>,
    pub total_matches_replaced: usize,
    pub file_errors: Vec<PathSearchFileError>,
}

// ============================================================================
// Limits / constants
// ============================================================================

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_LINE_PREVIEW_BYTES: usize = 2048;
const MAX_MATCHES_PER_LINE: usize = 256;
const SESSION_CACHE_MAX: usize = 16;

// ============================================================================
// Target expansion
// ============================================================================

pub fn expand_target_path(target: &str) -> Result<Vec<PathBuf>, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("target path is empty".to_string());
    }

    if contains_wildcard_chars(trimmed) {
        return expand_glob_target(trimmed);
    }

    let path = PathBuf::from(trimmed);
    let metadata =
        fs::metadata(&path).map_err(|error| format!("cannot stat target: {error}"))?;
    if metadata.is_file() {
        return Ok(vec![path]);
    }
    if metadata.is_dir() {
        let mut entries: Vec<PathBuf> = fs::read_dir(&path)
            .map_err(|error| format!("cannot read directory: {error}"))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_type()
                    .ok()
                    .map(|t| t.is_file())
                    .unwrap_or(false)
            })
            .map(|entry| entry.path())
            .collect();
        entries.sort();
        return Ok(entries);
    }
    Err("target path is neither file nor directory".to_string())
}

fn contains_wildcard_chars(s: &str) -> bool {
    s.contains('*') || s.contains('?') || s.contains('[')
}

fn expand_glob_target(target: &str) -> Result<Vec<PathBuf>, String> {
    let (base, _pattern_tail) = split_glob_base(target);
    let glob = Glob::new(target)
        .map_err(|error| format!("invalid glob pattern: {error}"))?
        .compile_matcher();
    let recursive = target.contains("**");

    let mut walker = WalkDir::new(&base).follow_links(false);
    if !recursive {
        walker = walker.max_depth(1);
    }

    let mut results = Vec::new();
    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if glob.is_match(path) {
            results.push(path.to_path_buf());
        }
    }
    results.sort();
    Ok(results)
}

fn split_glob_base(target: &str) -> (PathBuf, String) {
    let mut wildcard_byte_idx = target.len();
    for (i, ch) in target.char_indices() {
        if ch == '*' || ch == '?' || ch == '[' {
            wildcard_byte_idx = i;
            break;
        }
    }
    let prefix = &target[..wildcard_byte_idx];
    let last_sep = prefix.rfind(|c: char| c == '/' || c == '\\');

    let (base_str, tail) = match last_sep {
        Some(idx) => (&target[..idx], &target[idx + 1..]),
        None => ("", target),
    };

    let base = if base_str.is_empty() {
        PathBuf::from(".")
    } else {
        PathBuf::from(base_str)
    };
    (base, tail.to_string())
}

// ============================================================================
// Pattern building
// ============================================================================

fn build_regex(keyword: &str, mode: &str, case_sensitive: bool) -> Result<Regex, String> {
    if keyword.is_empty() {
        return Err("keyword is empty".to_string());
    }
    let source = match mode {
        "literal" => escape_regex_literal(keyword),
        "wildcard" => wildcard_to_regex_source(keyword),
        "regex" => keyword.to_string(),
        other => return Err(format!("unsupported search mode: {other}")),
    };
    RegexBuilder::new(&source)
        .case_insensitive(!case_sensitive)
        .multi_line(false)
        .build()
        .map_err(|error| format!("invalid pattern: {error}"))
}

// ============================================================================
// File reading
// ============================================================================

fn read_text_file(path: &Path) -> Result<String, String> {
    let file =
        File::open(path).map_err(|error| format!("cannot open file: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("cannot read metadata: {error}"))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "file too large ({} bytes, limit {} bytes)",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }
    if metadata.len() == 0 {
        return Ok(String::new());
    }
    let mmap =
        unsafe { Mmap::map(&file).map_err(|error| format!("cannot mmap file: {error}"))? };

    if is_binary_content(&mmap[..mmap.len().min(8192)]) {
        return Err("file appears to be binary".to_string());
    }

    let encoding = if let Some((enc, _)) = Encoding::for_bom(&mmap) {
        enc
    } else {
        let mut detector = chardetng::EncodingDetector::new();
        let sample_len = mmap.len().min(8192);
        detector.feed(&mmap[..sample_len], true);
        detector.guess(None, true)
    };
    let (cow, _, _malformed) = encoding.decode(&mmap);
    Ok(cow.into_owned())
}

fn is_binary_content(bytes: &[u8]) -> bool {
    bytes.iter().any(|&b| b == 0)
}

// ============================================================================
// Search within text
// ============================================================================

fn collect_matches_in_text(
    file_path: &Path,
    text: &str,
    regex: &Regex,
    capacity_left: &mut usize,
) -> Vec<PathSearchMatch> {
    let path_str = file_path.to_string_lossy().into_owned();
    let mut results = Vec::new();
    let mut line_number: usize = 0;

    for (line_start, line_text) in iter_lines_with_offsets(text) {
        line_number += 1;
        if *capacity_left == 0 {
            break;
        }

        let mut per_line = 0usize;
        for mat in regex.find_iter(line_text) {
            if *capacity_left == 0 || per_line >= MAX_MATCHES_PER_LINE {
                break;
            }
            let preview = clip_line_preview(line_text);
            let match_start = mat.start();
            let match_end = mat.end();
            let column = text[line_start..line_start + match_start].chars().count() + 1;

            results.push(PathSearchMatch {
                file_path: path_str.clone(),
                line: line_number,
                column,
                match_start,
                match_end,
                line_text: preview,
            });
            per_line += 1;
            *capacity_left = capacity_left.saturating_sub(1);
        }
    }

    results
}

fn iter_lines_with_offsets(text: &str) -> impl Iterator<Item = (usize, &str)> {
    let bytes = text.as_bytes();
    let mut cursor: Option<usize> = Some(0);

    std::iter::from_fn(move || {
        let start = cursor?;
        if start > bytes.len() {
            cursor = None;
            return None;
        }

        let mut newline_idx = start;
        while newline_idx < bytes.len() && bytes[newline_idx] != b'\n' {
            newline_idx += 1;
        }

        let mut line_end = newline_idx;
        if line_end > start && bytes[line_end - 1] == b'\r' {
            line_end -= 1;
        }
        let line = &text[start..line_end];

        if newline_idx < bytes.len() {
            cursor = Some(newline_idx + 1);
        } else {
            cursor = None;
        }

        Some((start, line))
    })
}

fn clip_line_preview(line: &str) -> String {
    if line.len() <= MAX_LINE_PREVIEW_BYTES {
        return line.to_string();
    }
    let mut end = MAX_LINE_PREVIEW_BYTES;
    while end > 0 && !line.is_char_boundary(end) {
        end -= 1;
    }
    let mut clipped = line[..end].to_string();
    clipped.push_str(" …");
    clipped
}

// ============================================================================
// Streaming sessions
// ============================================================================

struct PathSearchSession {
    files: Vec<PathBuf>,
    cursor: usize,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    file_errors: Vec<PathSearchFileError>,
}

fn sessions() -> &'static DashMap<String, PathSearchSession> {
    static MAP: OnceLock<DashMap<String, PathSearchSession>> = OnceLock::new();
    MAP.get_or_init(DashMap::new)
}

fn enforce_session_bound() {
    let cache = sessions();
    if cache.len() <= SESSION_CACHE_MAX {
        return;
    }
    let to_remove = cache.len().saturating_sub(SESSION_CACHE_MAX);
    let keys: Vec<String> = cache
        .iter()
        .take(to_remove)
        .map(|entry| entry.key().clone())
        .collect();
    for key in keys {
        cache.remove(&key);
    }
}

fn drain_chunk(session: &mut PathSearchSession, max_results: usize) -> Vec<PathSearchMatch> {
    let regex = match build_regex(&session.keyword, &session.mode, session.case_sensitive) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<PathSearchMatch> = Vec::new();
    let mut capacity_left = max_results;

    while session.cursor < session.files.len() && capacity_left > 0 {
        let path = session.files[session.cursor].clone();
        session.cursor += 1;
        match read_text_file(&path) {
            Ok(text) => {
                let mut file_matches =
                    collect_matches_in_text(&path, &text, &regex, &mut capacity_left);
                out.append(&mut file_matches);
            }
            Err(error) => {
                session.file_errors.push(PathSearchFileError {
                    file_path: path.to_string_lossy().into_owned(),
                    error,
                });
            }
        }
    }
    out
}

// ============================================================================
// IPC command implementations
// ============================================================================

pub fn path_search_start_impl(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    max_results: usize,
) -> Result<PathSearchStartPayload, String> {
    let _ = build_regex(&keyword, &mode, case_sensitive)?;
    let files = expand_target_path(&target)?;
    let total_files = files.len();
    let session_id = Uuid::new_v4().to_string();

    let mut session = PathSearchSession {
        files,
        cursor: 0,
        keyword,
        mode,
        case_sensitive,
        file_errors: Vec::new(),
    };

    let matches = drain_chunk(&mut session, max_results.max(1));
    let scanned_files = session.cursor;
    let completed = session.cursor >= session.files.len();
    let file_errors = session.file_errors.clone();

    sessions().insert(session_id.clone(), session);
    enforce_session_bound();

    Ok(PathSearchStartPayload {
        session_id,
        total_files,
        matches,
        completed,
        file_errors,
        scanned_files,
    })
}

pub fn path_search_next_impl(
    session_id: String,
    max_results: usize,
) -> Result<PathSearchNextPayload, String> {
    let cache = sessions();
    let mut entry = cache
        .get_mut(&session_id)
        .ok_or_else(|| "session not found".to_string())?;
    let pre_errors_len = entry.file_errors.len();
    let matches = drain_chunk(&mut entry, max_results.max(1));
    let completed = entry.cursor >= entry.files.len();
    let scanned_files = entry.cursor;
    let new_errors = entry.file_errors[pre_errors_len..].to_vec();
    Ok(PathSearchNextPayload {
        matches,
        completed,
        file_errors: new_errors,
        scanned_files,
    })
}

pub fn path_search_dispose_impl(session_id: String) -> bool {
    sessions().remove(&session_id).is_some()
}

pub fn path_replace_preview_impl(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
) -> Result<PathReplacePreviewPayload, String> {
    let regex = build_regex(&keyword, &mode, case_sensitive)?;
    let files = expand_target_path(&target)?;
    let total_files = files.len();

    let mut preview_files: Vec<PathReplacePreviewFile> = Vec::new();
    let mut total_matches: usize = 0;
    let mut file_errors: Vec<PathSearchFileError> = Vec::new();

    for path in &files {
        match read_text_file(path) {
            Ok(text) => {
                let count = count_matches_in_text(&text, &regex);
                if count > 0 {
                    total_matches += count;
                    preview_files.push(PathReplacePreviewFile {
                        file_path: path.to_string_lossy().into_owned(),
                        match_count: count,
                    });
                }
            }
            Err(error) => {
                file_errors.push(PathSearchFileError {
                    file_path: path.to_string_lossy().into_owned(),
                    error,
                });
            }
        }
    }

    Ok(PathReplacePreviewPayload {
        files: preview_files,
        total_matches,
        total_files,
        file_errors,
    })
}

pub fn path_replace_apply_impl(
    target: String,
    keyword: String,
    mode: String,
    case_sensitive: bool,
    replace_value: String,
    parse_escape_sequences: bool,
) -> Result<PathReplaceApplyPayload, String> {
    let regex = build_regex(&keyword, &mode, case_sensitive)?;
    let files = expand_target_path(&target)?;
    let effective_replace = if parse_escape_sequences {
        decode_replace_escape_sequences(&replace_value)
    } else {
        replace_value
    };

    let mut files_changed: Vec<PathReplaceAppliedFile> = Vec::new();
    let mut total_matches_replaced: usize = 0;
    let mut file_errors: Vec<PathSearchFileError> = Vec::new();

    for path in &files {
        match read_text_file(path) {
            Ok(text) => {
                let count = count_matches_in_text(&text, &regex);
                if count == 0 {
                    continue;
                }
                let replaced = regex.replace_all(&text, effective_replace.as_str()).into_owned();
                match fs::write(path, replaced.as_bytes()) {
                    Ok(()) => {
                        total_matches_replaced += count;
                        files_changed.push(PathReplaceAppliedFile {
                            file_path: path.to_string_lossy().into_owned(),
                            match_count: count,
                        });
                    }
                    Err(error) => {
                        file_errors.push(PathSearchFileError {
                            file_path: path.to_string_lossy().into_owned(),
                            error: format!("write failed: {error}"),
                        });
                    }
                }
            }
            Err(error) => {
                file_errors.push(PathSearchFileError {
                    file_path: path.to_string_lossy().into_owned(),
                    error,
                });
            }
        }
    }

    Ok(PathReplaceApplyPayload {
        files_changed,
        total_matches_replaced,
        file_errors,
    })
}

fn count_matches_in_text(text: &str, regex: &Regex) -> usize {
    let mut count: usize = 0;
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let line_matches = regex.find_iter(line).count();
        count = count.saturating_add(line_matches);
    }
    count
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "rutar-path-search-tests-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time after unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    #[test]
    fn expand_target_path_should_return_single_file_for_file_target() {
        let root = make_temp_root();
        let file = root.join("a.txt");
        fs::write(&file, "hello").unwrap();

        let result = expand_target_path(file.to_string_lossy().as_ref()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], file);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn expand_target_path_should_return_top_level_files_for_directory() {
        let root = make_temp_root();
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::write(root.join("b.md"), "b").unwrap();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub").join("c.txt"), "c").unwrap();

        let result = expand_target_path(root.to_string_lossy().as_ref()).unwrap();
        let names: Vec<String> = result
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"a.txt".to_string()));
        assert!(names.contains(&"b.md".to_string()));
        assert!(!names.contains(&"c.txt".to_string()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn expand_target_path_should_match_glob_wildcards() {
        let root = make_temp_root();
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        fs::write(root.join("c.md"), "c").unwrap();

        let pattern = format!("{}/*.txt", root.to_string_lossy());
        let result = expand_target_path(&pattern).unwrap();
        let names: Vec<String> = result
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"a.txt".to_string()));
        assert!(names.contains(&"b.txt".to_string()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn expand_target_path_should_match_glob_doublestar_recursively() {
        let root = make_temp_root();
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::write(root.join("nested").join("b.txt"), "b").unwrap();

        let pattern = format!("{}/**/*.txt", root.to_string_lossy());
        let result = expand_target_path(&pattern).unwrap();
        assert_eq!(result.len(), 2);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_search_start_impl_should_find_literal_matches_across_files() {
        let root = make_temp_root();
        fs::write(root.join("a.txt"), "hello world\nfoo bar\n").unwrap();
        fs::write(root.join("b.txt"), "another hello here\n").unwrap();

        let result = path_search_start_impl(
            root.to_string_lossy().into_owned(),
            "hello".to_string(),
            "literal".to_string(),
            true,
            100,
        )
        .unwrap();

        assert_eq!(result.total_files, 2);
        assert!(result.completed);
        assert_eq!(result.matches.len(), 2);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_search_start_impl_should_paginate_via_session_next() {
        let root = make_temp_root();
        for i in 0..5 {
            fs::write(root.join(format!("f{i}.txt")), "x\n").unwrap();
        }

        let start = path_search_start_impl(
            root.to_string_lossy().into_owned(),
            "x".to_string(),
            "literal".to_string(),
            true,
            2,
        )
        .unwrap();
        assert_eq!(start.matches.len(), 2);
        assert!(!start.completed);

        let next = path_search_next_impl(start.session_id.clone(), 10).unwrap();
        let combined_len = start.matches.len() + next.matches.len();
        assert_eq!(combined_len, 5);
        assert!(next.completed);

        assert!(path_search_dispose_impl(start.session_id));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_replace_apply_impl_should_replace_and_write() {
        let root = make_temp_root();
        let f = root.join("a.txt");
        fs::write(&f, "alpha beta alpha").unwrap();

        let result = path_replace_apply_impl(
            f.to_string_lossy().into_owned(),
            "alpha".to_string(),
            "literal".to_string(),
            true,
            "ALPHA".to_string(),
            false,
        )
        .unwrap();
        assert_eq!(result.total_matches_replaced, 2);
        assert_eq!(result.files_changed.len(), 1);
        let written = fs::read_to_string(&f).unwrap();
        assert_eq!(written, "ALPHA beta ALPHA");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_replace_preview_impl_should_report_files_and_counts() {
        let root = make_temp_root();
        fs::write(root.join("a.txt"), "x x x").unwrap();
        fs::write(root.join("b.txt"), "y").unwrap();

        let result = path_replace_preview_impl(
            root.to_string_lossy().into_owned(),
            "x".to_string(),
            "literal".to_string(),
            true,
        )
        .unwrap();
        assert_eq!(result.total_matches, 3);
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].match_count, 3);

        let _ = fs::remove_dir_all(root);
    }
}
