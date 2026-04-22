use super::*;
use crate::state::FileFingerprint;
use notify::{
    event::{ModifyKind, RenameMode},
    Event, EventKind, RecursiveMode, Watcher,
};
use std::collections::BTreeSet;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderTreeChangeEventPayload {
    root_path: String,
    directory_paths: Vec<String>,
}

struct DiskFileSnapshot {
    rope: Rope,
    encoding: &'static Encoding,
    line_ending: LineEnding,
    line_count: usize,
    large_file_mode: bool,
    fingerprint: FileFingerprint,
}

const DOCUMENT_TEXT_SNAPSHOT_CHUNK_BYTES: usize = 64 * 1024;

fn build_file_fingerprint(metadata: &std::fs::Metadata) -> FileFingerprint {
    let modified_unix_millis = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());

    FileFingerprint {
        size_bytes: metadata.len(),
        modified_unix_millis,
    }
}

pub(super) fn has_external_file_change_by_snapshot(
    path: &PathBuf,
    saved_fingerprint: Option<FileFingerprint>,
) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(_) => return saved_fingerprint.is_some(),
    };

    let current_fingerprint = build_file_fingerprint(&metadata);
    saved_fingerprint != Some(current_fingerprint)
}

fn read_disk_file_snapshot(path: &PathBuf) -> Result<DiskFileSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let size = metadata.len();
    let large_file_mode = size > LARGE_FILE_THRESHOLD_BYTES as u64;
    let fingerprint = build_file_fingerprint(&metadata);

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
    let line_ending = detect_line_ending(&cow);
    let normalized_content = text_utils::normalize_to_lf(&cow);
    let rope = Rope::from_str(&normalized_content);
    let line_count = rope.len_lines();

    Ok(DiskFileSnapshot {
        rope,
        encoding,
        line_ending,
        line_count,
        large_file_mode,
        fingerprint,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileBatchResultItem {
    pub path: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_info: Option<FileInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn detect_line_ending(text: &str) -> LineEnding {
    let bytes = text.as_bytes();
    let mut crlf_count = 0usize;
    let mut lf_count = 0usize;
    let mut cr_count = 0usize;

    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' => {
                if index + 1 < bytes.len() && bytes[index + 1] == b'\n' {
                    crlf_count += 1;
                    index += 2;
                } else {
                    cr_count += 1;
                    index += 1;
                }
            }
            b'\n' => {
                lf_count += 1;
                index += 1;
            }
            _ => {
                index += 1;
            }
        }
    }

    if crlf_count >= lf_count && crlf_count >= cr_count && crlf_count > 0 {
        LineEnding::CrLf
    } else if lf_count >= cr_count && lf_count > 0 {
        LineEnding::Lf
    } else if cr_count > 0 {
        LineEnding::Cr
    } else {
        default_line_ending()
    }
}

fn build_persist_content(doc: &Document) -> String {
    let utf8_content: String = doc.rope.chunks().collect();
    let normalized = text_utils::normalize_to_lf(&utf8_content);

    match doc.line_ending {
        LineEnding::CrLf => normalized.replace('\n', "\r\n"),
        LineEnding::Lf => normalized,
        LineEnding::Cr => normalized.replace('\n', "\r"),
    }
}

fn measure_document_size_bytes(
    rope: &Rope,
    encoding: &'static Encoding,
    line_ending: LineEnding,
) -> u64 {
    let utf8_content: String = rope.chunks().collect();
    let persisted_content = match line_ending {
        LineEnding::CrLf => utf8_content.replace('\n', "\r\n"),
        LineEnding::Lf => utf8_content,
        LineEnding::Cr => utf8_content.replace('\n', "\r"),
    };
    let (encoded, _, _) = encoding.encode(&persisted_content);
    encoded.len() as u64
}

fn configure_document_syntax(doc: &mut Document, enable_syntax: bool) {
    if !enable_syntax {
        doc.language = None;
        doc.parser = None;
        doc.tree = None;
        doc.syntax_dirty = false;
        return;
    }

    doc.language = syntax::resolve_document_language(&doc.path, doc.syntax_override.as_deref());
    doc.parser = syntax::create_parser(doc.language.clone());
    doc.tree = None;
    doc.syntax_dirty = doc.parser.is_some();
}

fn resolve_new_file_line_ending(preferred: Option<&str>) -> LineEnding {
    if let Some(line_ending) = preferred.and_then(LineEnding::from_label) {
        return line_ending;
    }

    if let Ok(config) = config::load_config_impl() {
        if let Some(line_ending) = LineEnding::from_label(config.new_file_line_ending.as_str()) {
            return line_ending;
        }
    }

    default_line_ending()
}

fn is_cjk_script_char(ch: char) -> bool {
    matches!(
        ch,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2A6DF}'
            | '\u{2A700}'..='\u{2B73F}'
            | '\u{2B740}'..='\u{2B81F}'
            | '\u{2B820}'..='\u{2CEAF}'
            | '\u{2F800}'..='\u{2FA1F}'
            | '\u{3040}'..='\u{309F}'
            | '\u{30A0}'..='\u{30FF}'
            | '\u{31F0}'..='\u{31FF}'
            | '\u{1100}'..='\u{11FF}'
            | '\u{3130}'..='\u{318F}'
            | '\u{AC00}'..='\u{D7AF}'
    )
}

fn is_latin_like_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '\'' || ch == '-'
}

fn count_word_stats(rope: &Rope) -> WordCountInfo {
    let mut word_count = 0usize;
    let mut character_count = 0usize;
    let mut character_count_no_spaces = 0usize;
    let mut paragraph_count = 0usize;

    let mut in_latin_word = false;
    let mut in_paragraph = false;

    for chunk in rope.chunks() {
        for ch in chunk.chars() {
            character_count = character_count.saturating_add(1);

            let is_whitespace = ch.is_whitespace();
            if !is_whitespace {
                character_count_no_spaces = character_count_no_spaces.saturating_add(1);
            }

            if ch == '\n' || ch == '\r' {
                if in_paragraph {
                    paragraph_count = paragraph_count.saturating_add(1);
                    in_paragraph = false;
                }
            } else if !is_whitespace {
                in_paragraph = true;
            }

            if is_whitespace {
                in_latin_word = false;
                continue;
            }

            if is_cjk_script_char(ch) {
                word_count = word_count.saturating_add(1);
                in_latin_word = false;
                continue;
            }

            if is_latin_like_word_char(ch) {
                if !in_latin_word {
                    word_count = word_count.saturating_add(1);
                    in_latin_word = true;
                }
                continue;
            }

            in_latin_word = false;
        }
    }

    if in_paragraph {
        paragraph_count = paragraph_count.saturating_add(1);
    }

    WordCountInfo {
        word_count,
        character_count,
        character_count_no_spaces,
        line_count: rope.len_lines(),
        paragraph_count,
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedIndentation {
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<usize>,
}

fn gcd_usize(mut left: usize, mut right: usize) -> usize {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }

    left
}

fn infer_space_indent_width(space_indent_counts: &[usize]) -> Option<usize> {
    let mut non_zero = space_indent_counts
        .iter()
        .copied()
        .filter(|value| *value > 0);
    let first = non_zero.next()?;
    let mut gcd = first;

    for value in non_zero {
        gcd = gcd_usize(gcd, value);
    }

    if (2..=8).contains(&gcd) {
        return Some(gcd);
    }

    let mut best_candidate = None::<(usize, usize)>;
    for candidate in [4usize, 2, 8, 3] {
        let score = space_indent_counts
            .iter()
            .filter(|value| **value % candidate == 0)
            .count();

        if score == 0 {
            continue;
        }

        if best_candidate
            .map(|(_, best_score)| score > best_score)
            .unwrap_or(true)
        {
            best_candidate = Some((candidate, score));
        }
    }

    if let Some((candidate, score)) = best_candidate {
        if score * 2 >= space_indent_counts.len() {
            return Some(candidate);
        }
    }

    None
}

fn detect_indentation_from_rope(rope: &Rope, max_lines: usize) -> Option<DetectedIndentation> {
    let safe_max_lines = max_lines.max(1);
    let sampled_line_count = rope.len_lines().min(safe_max_lines);
    let mut tab_prefixed_line_count = 0usize;
    let mut space_indent_counts = Vec::new();

    for line_index in 0..sampled_line_count {
        let line = rope.line(line_index).to_string();
        let content = line.trim_end_matches(['\r', '\n']);
        if content.is_empty() {
            continue;
        }

        let trimmed_start = content.trim_start_matches([' ', '\t']);
        if trimmed_start.is_empty() || trimmed_start.len() == content.len() {
            continue;
        }

        let indent = &content[..content.len() - trimmed_start.len()];
        let has_tabs = indent.contains('\t');
        let has_spaces = indent.contains(' ');

        match (has_tabs, has_spaces) {
            (true, false) => {
                tab_prefixed_line_count = tab_prefixed_line_count.saturating_add(1);
            }
            (false, true) => {
                let space_count = indent.chars().count();
                if space_count > 0 {
                    space_indent_counts.push(space_count);
                }
            }
            _ => {
                continue;
            }
        }
    }

    let space_prefixed_line_count = space_indent_counts.len();
    if tab_prefixed_line_count == 0 && space_prefixed_line_count == 0 {
        return None;
    }

    if tab_prefixed_line_count > space_prefixed_line_count {
        return Some(DetectedIndentation {
            mode: "tabs".to_string(),
            width: None,
        });
    }

    if space_prefixed_line_count > tab_prefixed_line_count {
        return Some(DetectedIndentation {
            mode: "spaces".to_string(),
            width: infer_space_indent_width(&space_indent_counts),
        });
    }

    None
}

fn open_file_by_path_impl(state: &State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(&path);

    if let Some(existing) = state
        .documents
        .iter()
        .find(|entry| entry.path.as_ref() == Some(&path_buf))
    {
        return Ok(FileInfo {
            id: existing.key().clone(),
            path: path.clone(),
            name: path_buf
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            encoding: existing.encoding.name().to_string(),
            line_ending: existing.line_ending.label().to_string(),
            line_count: existing.rope.len_lines(),
            size_bytes: measure_document_size_bytes(
                &existing.rope,
                existing.encoding,
                existing.line_ending,
            ),
            large_file_mode: existing.rope.len_bytes() > LARGE_FILE_THRESHOLD_BYTES,
            syntax_override: existing.syntax_override.clone(),
        });
    }

    let snapshot = read_disk_file_snapshot(&path_buf)?;
    let size_bytes =
        measure_document_size_bytes(&snapshot.rope, snapshot.encoding, snapshot.line_ending);

    let id = Uuid::new_v4().to_string();

    let mut doc = Document {
        rope: snapshot.rope.clone(),
        saved_rope: snapshot.rope,
        encoding: snapshot.encoding,
        saved_encoding: snapshot.encoding.name().to_string(),
        line_ending: snapshot.line_ending,
        saved_line_ending: snapshot.line_ending,
        path: Some(path_buf.clone()),
        syntax_override: None,
        document_version: 0,
        saved_document_version: 0,
        next_edit_operation_id: 1,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        saved_undo_depth: 0,
        saved_undo_operation_id: None,
        parser: None,
        tree: None,
        language: None,
        syntax_dirty: false,
        saved_file_fingerprint: Some(snapshot.fingerprint),
    };

    configure_document_syntax(&mut doc, !snapshot.large_file_mode);

    state.documents.insert(id.clone(), doc);

    Ok(FileInfo {
        id,
        path: path.clone(),
        name: path_buf
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        encoding: snapshot.encoding.name().to_string(),
        line_ending: snapshot.line_ending.label().to_string(),
        line_count: snapshot.line_count,
        size_bytes,
        large_file_mode: snapshot.large_file_mode,
        syntax_override: None,
    })
}

pub(super) async fn open_file_impl(
    state: State<'_, AppState>,
    path: String,
) -> Result<FileInfo, String> {
    open_file_by_path_impl(&state, path)
}

pub(super) async fn open_files_impl(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Vec<OpenFileBatchResultItem> {
    paths
        .into_iter()
        .map(|path| match open_file_by_path_impl(&state, path.clone()) {
            Ok(file_info) => OpenFileBatchResultItem {
                path,
                success: true,
                file_info: Some(file_info),
                error: None,
            },
            Err(error) => OpenFileBatchResultItem {
                path,
                success: false,
                file_info: None,
                error: Some(error),
            },
        })
        .collect()
}

pub(super) fn get_visible_lines_chunk_impl(
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

pub(super) fn get_bookmark_line_previews_impl(
    state: State<'_, AppState>,
    id: String,
    lines: Vec<usize>,
) -> Result<Vec<String>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let rope = &doc.rope;
        let len = rope.len_lines();
        let mut previews = Vec::with_capacity(lines.len());

        for line_number in lines {
            if line_number == 0 || line_number > len {
                previews.push(String::new());
                continue;
            }

            let line_idx = line_number - 1;
            let mut text = rope.line(line_idx).to_string();

            if text.ends_with('\n') {
                text.pop();
                if text.ends_with('\r') {
                    text.pop();
                }
            }

            previews.push(text);
        }

        Ok(previews)
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn get_visible_lines_impl(
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

pub(super) fn get_document_text_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(doc.rope.to_string())
    } else {
        Err("Document not found".to_string())
    }
}

fn build_document_text_chunks(rope: &Rope) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for rope_chunk in rope.chunks() {
        if current.is_empty() && rope_chunk.len() >= DOCUMENT_TEXT_SNAPSHOT_CHUNK_BYTES {
            chunks.push(rope_chunk.to_string());
            continue;
        }

        if !current.is_empty()
            && current.len() + rope_chunk.len() > DOCUMENT_TEXT_SNAPSHOT_CHUNK_BYTES
        {
            chunks.push(std::mem::take(&mut current));
        }

        current.push_str(rope_chunk);
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

pub(super) fn get_document_text_chunks_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(build_document_text_chunks(&doc.rope))
    } else {
        Err("Document not found".to_string())
    }
}

fn markdown_preview_options() -> markdown::Options {
    let mut options = markdown::Options::gfm();
    options.compile.allow_dangerous_html = true;
    options.compile.allow_dangerous_protocol = true;
    options
}

fn render_markdown_preview_html(source: &str) -> Result<String, String> {
    markdown::to_html_with_options(source, &markdown_preview_options())
        .map_err(|error| error.to_string())
}

pub(super) async fn render_markdown_preview_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let rope = state
        .documents
        .get(&id)
        .map(|doc| doc.rope.clone())
        .ok_or_else(|| "Document not found".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let source: String = rope.chunks().collect();
        render_markdown_preview_html(&source)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn close_file_impl(state: State<'_, AppState>, id: String) {
    state.documents.remove(&id);
    state.syntax_request_serials.remove(&id);
}

pub(super) fn close_files_impl(state: State<'_, AppState>, ids: Vec<String>) {
    for id in ids {
        state.documents.remove(&id);
        state.syntax_request_serials.remove(&id);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileBatchResultItem {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn save_file_by_id(state: &State<'_, AppState>, id: &str) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(id) {
        if let Some(path) = doc.path.clone() {
            let mut file = File::create(&path).map_err(|e| e.to_string())?;
            let persist_content = build_persist_content(&doc);
            let (bytes, _, _malformed) = doc.encoding.encode(&persist_content);

            use std::io::Write;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            doc.saved_rope = doc.rope.clone();
            doc.saved_document_version = doc.document_version;
            doc.saved_encoding = doc.encoding.name().to_string();
            doc.saved_line_ending = doc.line_ending;
            doc.mark_saved_undo_checkpoint();
            doc.saved_file_fingerprint = fs::metadata(&path)
                .ok()
                .map(|metadata| build_file_fingerprint(&metadata));

            Ok(())
        } else {
            Err("No path associated with this file. Use Save As.".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) async fn save_files_impl(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Vec<SaveFileBatchResultItem> {
    ids.into_iter()
        .map(|id| match save_file_by_id(&state, id.as_str()) {
            Ok(()) => SaveFileBatchResultItem {
                id,
                success: true,
                error: None,
            },
            Err(error) => SaveFileBatchResultItem {
                id,
                success: false,
                error: Some(error),
            },
        })
        .collect()
}

pub(super) async fn save_file_impl(state: State<'_, AppState>, id: String) -> Result<(), String> {
    save_file_by_id(&state, id.as_str())
}

pub(super) async fn save_file_as_impl(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if let Some(mut doc) = state.documents.get_mut(&id) {
        let mut file = File::create(&path_buf).map_err(|e| e.to_string())?;
        let persist_content = build_persist_content(&doc);
        let (bytes, _, _malformed) = doc.encoding.encode(&persist_content);

        use std::io::Write;
        file.write_all(&bytes).map_err(|e| e.to_string())?;

        doc.path = Some(path_buf);
        doc.saved_rope = doc.rope.clone();
        doc.saved_document_version = doc.document_version;
        doc.saved_encoding = doc.encoding.name().to_string();
        doc.saved_line_ending = doc.line_ending;
        doc.mark_saved_undo_checkpoint();
        if let Some(path) = &doc.path {
            doc.saved_file_fingerprint = fs::metadata(path)
                .ok()
                .map(|metadata| build_file_fingerprint(&metadata));
        }
        let enable_syntax = doc.rope.len_bytes() <= LARGE_FILE_THRESHOLD_BYTES;
        configure_document_syntax(&mut doc, enable_syntax);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

fn normalize_encoding_label(label: &str) -> &str {
    if label.eq_ignore_ascii_case("ansi") {
        return "windows-1252";
    }

    label
}

pub(super) fn convert_encoding_impl(
    state: State<'_, AppState>,
    id: String,
    new_encoding: String,
) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let normalized_label = normalize_encoding_label(new_encoding.trim());
        let label = normalized_label.as_bytes();
        let encoding = Encoding::for_label(label)
            .ok_or_else(|| format!("Unsupported encoding: {}", new_encoding))?;

        if doc.encoding.name() == encoding.name() {
            return Ok(());
        }

        doc.encoding = encoding;
        doc.document_version = doc.document_version.saturating_add(1);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn set_line_ending_impl(
    state: State<'_, AppState>,
    id: String,
    new_line_ending: String,
) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let line_ending = LineEnding::from_label(&new_line_ending)
            .ok_or_else(|| format!("Unsupported line ending: {}", new_line_ending))?;

        if doc.line_ending == line_ending {
            return Ok(());
        }

        doc.line_ending = line_ending;
        doc.document_version = doc.document_version.saturating_add(1);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn set_document_syntax_impl(
    state: State<'_, AppState>,
    id: String,
    syntax_override: Option<String>,
) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let normalized = syntax::normalize_syntax_override(syntax_override.as_deref())?;
        doc.syntax_override = normalized;
        let enable_syntax = doc.rope.len_bytes() <= LARGE_FILE_THRESHOLD_BYTES;
        configure_document_syntax(&mut doc, enable_syntax);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn new_file_impl(
    state: State<'_, AppState>,
    new_file_line_ending: Option<String>,
) -> Result<FileInfo, String> {
    let id = Uuid::new_v4().to_string();
    let encoding = encoding_rs::UTF_8;
    let line_ending = resolve_new_file_line_ending(new_file_line_ending.as_deref());

    let mut doc = Document {
        rope: Rope::new(),
        saved_rope: Rope::new(),
        encoding,
        saved_encoding: encoding.name().to_string(),
        line_ending,
        saved_line_ending: line_ending,
        path: None,
        syntax_override: None,
        document_version: 0,
        saved_document_version: 0,
        next_edit_operation_id: 1,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        saved_undo_depth: 0,
        saved_undo_operation_id: None,
        parser: None,
        tree: None,
        language: None,
        syntax_dirty: false,
        saved_file_fingerprint: None,
    };

    configure_document_syntax(&mut doc, true);

    state.documents.insert(id.clone(), doc);

    Ok(FileInfo {
        id,
        path: String::new(),
        name: "Untitled".to_string(),
        encoding: encoding.name().to_string(),
        line_ending: line_ending.label().to_string(),
        line_count: 1,
        size_bytes: 0,
        large_file_mode: false,
        syntax_override: None,
    })
}

pub(super) fn has_external_file_change_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let (path, saved_fingerprint) = if let Some(doc) = state.documents.get(&id) {
        let Some(path) = &doc.path else {
            return Ok(false);
        };

        (path.clone(), doc.saved_file_fingerprint)
    } else {
        return Err("Document not found".to_string());
    };

    Ok(has_external_file_change_by_snapshot(
        &path,
        saved_fingerprint,
    ))
}

pub(super) fn acknowledge_external_file_change_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let Some(path) = &doc.path else {
            return Ok(());
        };

        doc.saved_file_fingerprint = fs::metadata(path)
            .ok()
            .map(|metadata| build_file_fingerprint(&metadata));
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn reload_file_from_disk_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<FileInfo, String> {
    let path = if let Some(doc) = state.documents.get(&id) {
        doc.path
            .clone()
            .ok_or_else(|| "No path associated with this file".to_string())?
    } else {
        return Err("Document not found".to_string());
    };

    let snapshot = read_disk_file_snapshot(&path)?;

    if let Some(mut doc) = state.documents.get_mut(&id) {
        doc.rope = snapshot.rope.clone();
        doc.saved_rope = snapshot.rope;
        doc.encoding = snapshot.encoding;
        doc.saved_encoding = snapshot.encoding.name().to_string();
        doc.line_ending = snapshot.line_ending;
        doc.saved_line_ending = snapshot.line_ending;
        doc.document_version = 0;
        doc.saved_document_version = 0;
        doc.next_edit_operation_id = 1;
        doc.undo_stack.clear();
        doc.redo_stack.clear();
        doc.saved_undo_depth = 0;
        doc.saved_undo_operation_id = None;
        doc.saved_file_fingerprint = Some(snapshot.fingerprint);
        configure_document_syntax(&mut doc, !snapshot.large_file_mode);

        Ok(FileInfo {
            id,
            path: path.to_string_lossy().to_string(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            encoding: snapshot.encoding.name().to_string(),
            line_ending: snapshot.line_ending.label().to_string(),
            line_count: snapshot.line_count,
            size_bytes: measure_document_size_bytes(
                &doc.rope,
                snapshot.encoding,
                snapshot.line_ending,
            ),
            large_file_mode: snapshot.large_file_mode,
            syntax_override: doc.syntax_override.clone(),
        })
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn read_dir_impl(path: String) -> Result<Vec<DirEntry>, String> {
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

    result.sort_by(|left, right| {
        if left.is_dir != right.is_dir {
            return if left.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }

        let left_lower = left.name.to_lowercase();
        let right_lower = right.name.to_lowercase();
        left_lower
            .cmp(&right_lower)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(result)
}

pub(super) fn read_dir_if_directory_impl(path: String) -> Result<Option<Vec<DirEntry>>, String> {
    if !PathBuf::from(&path).is_dir() {
        return Ok(None);
    }

    read_dir_impl(path).map(Some)
}

pub(super) fn path_exists_impl(path: String) -> bool {
    PathBuf::from(path).exists()
}

pub(super) fn open_in_file_manager_impl(path: String) -> Result<(), String> {
    let target_path = PathBuf::from(path);

    if !target_path.exists() {
        return Err("Path does not exist".to_string());
    }

    let directory = if target_path.is_dir() {
        target_path
    } else {
        target_path
            .parent()
            .map(|value| value.to_path_buf())
            .ok_or_else(|| "Failed to resolve parent directory".to_string())?
    };

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening file manager is not supported on this platform".to_string())
}

fn should_emit_folder_refresh_for_event_kind(event_kind: &EventKind) -> bool {
    matches!(
        event_kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Name(
                RenameMode::Any
                    | RenameMode::Both
                    | RenameMode::From
                    | RenameMode::To
                    | RenameMode::Other
            ))
    )
}

fn collect_folder_refresh_directories(root_path: &std::path::Path, event: &Event) -> Vec<PathBuf> {
    if !should_emit_folder_refresh_for_event_kind(&event.kind) {
        return Vec::new();
    }

    let mut directories = BTreeSet::new();

    for changed_path in &event.paths {
        let refresh_directory = if changed_path == root_path {
            Some(root_path.to_path_buf())
        } else {
            changed_path.parent().map(|path| path.to_path_buf())
        };

        let Some(refresh_directory) = refresh_directory else {
            continue;
        };

        if refresh_directory.starts_with(root_path) {
            directories.insert(refresh_directory);
        }
    }

    directories.into_iter().collect()
}

pub(super) fn watch_folder_tree_impl(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(&path);

    if !root_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    if state
        .watched_folder_path()
        .as_ref()
        .map(|current_path| current_path == &root_path)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let root_path_for_callback = root_path.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let event = match result {
            Ok(event) => event,
            Err(error) => {
                eprintln!("failed to watch folder tree event: {error}");
                return;
            }
        };

        let refresh_directories =
            collect_folder_refresh_directories(root_path_for_callback.as_path(), &event);
        if refresh_directories.is_empty() {
            return;
        }

        let Some(window) = app.get_webview_window("main") else {
            return;
        };

        let payload = FolderTreeChangeEventPayload {
            root_path: root_path_for_callback.to_string_lossy().to_string(),
            directory_paths: refresh_directories
                .into_iter()
                .map(|directory| directory.to_string_lossy().to_string())
                .collect(),
        };

        if let Err(error) = window.emit("rutar://folder-tree-changed", payload) {
            eprintln!("failed to emit folder tree change event: {error}");
        }
    })
    .map_err(|error| error.to_string())?;

    watcher
        .watch(root_path.as_path(), RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    state.replace_folder_watch(root_path, watcher);
    Ok(())
}

pub(super) fn clear_folder_tree_watch_impl(state: State<'_, AppState>) {
    state.clear_folder_watch();
}

pub(super) async fn get_word_count_info_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<WordCountInfo, String> {
    let rope = state
        .documents
        .get(&id)
        .map(|doc| doc.rope.clone())
        .ok_or_else(|| "Document not found".to_string())?;

    tauri::async_runtime::spawn_blocking(move || count_word_stats(&rope))
        .await
        .map_err(|error| error.to_string())
}

pub(super) async fn get_document_size_bytes_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<u64, String> {
    let (rope, encoding, line_ending) = state
        .documents
        .get(&id)
        .map(|doc| (doc.rope.clone(), doc.encoding, doc.line_ending))
        .ok_or_else(|| "Document not found".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        measure_document_size_bytes(&rope, encoding, line_ending)
    })
    .await
    .map_err(|error| error.to_string())
}

pub(super) fn detect_document_indentation_impl(
    state: State<'_, AppState>,
    id: String,
    max_lines: Option<usize>,
) -> Result<Option<DetectedIndentation>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let max_lines = max_lines.unwrap_or(2000).clamp(1, 20_000);
        Ok(detect_indentation_from_rope(&doc.rope, max_lines))
    } else {
        Err("Document not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_document_text_chunks, collect_folder_refresh_directories, count_word_stats,
        detect_indentation_from_rope, measure_document_size_bytes, normalize_encoding_label,
        render_markdown_preview_html, DOCUMENT_TEXT_SNAPSHOT_CHUNK_BYTES,
    };
    use crate::state::LineEnding;
    use encoding_rs::Encoding;
    use notify::{event::CreateKind, event::DataChange, event::ModifyKind, Event, EventKind};
    use ropey::Rope;
    use std::path::Path;

    #[test]
    fn word_count_should_treat_cjk_characters_individually() {
        let rope = Rope::from_str("你好 world");
        let result = count_word_stats(&rope);

        assert_eq!(result.word_count, 3);
        assert_eq!(result.character_count, 8);
        assert_eq!(result.character_count_no_spaces, 7);
        assert_eq!(result.line_count, 1);
        assert_eq!(result.paragraph_count, 1);
    }

    #[test]
    fn word_count_should_skip_blank_paragraphs() {
        let rope = Rope::from_str("first line\n\nsecond line\n");
        let result = count_word_stats(&rope);

        assert_eq!(result.word_count, 4);
        assert_eq!(result.line_count, 4);
        assert_eq!(result.paragraph_count, 2);
    }

    #[test]
    fn normalize_encoding_label_should_map_ansi_alias() {
        assert_eq!(normalize_encoding_label("ANSI"), "windows-1252");
        assert_eq!(normalize_encoding_label("ansi"), "windows-1252");
    }

    #[test]
    fn normalize_encoding_label_should_keep_non_alias_labels() {
        assert_eq!(normalize_encoding_label("GB2312"), "GB2312");
        assert_eq!(normalize_encoding_label("Big5"), "Big5");
    }

    #[test]
    fn encoding_for_label_should_support_gb2312_big5_and_ansi_alias() {
        let gb2312 = Encoding::for_label(normalize_encoding_label("GB2312").as_bytes())
            .expect("GB2312 should be supported");
        assert_eq!(gb2312.name(), "GBK");

        let big5 = Encoding::for_label(normalize_encoding_label("Big5").as_bytes())
            .expect("Big5 should be supported");
        assert_eq!(big5.name(), "Big5");

        let ansi = Encoding::for_label(normalize_encoding_label("ANSI").as_bytes())
            .expect("ANSI alias should map to windows-1252");
        assert_eq!(ansi.name(), "windows-1252");
    }

    #[test]
    fn indentation_detection_should_prefer_tabs_when_tab_prefix_lines_dominate() {
        let rope = Rope::from_str("\tdef foo():\n\t\tpass\n    value = 1\n");
        let result = detect_indentation_from_rope(&rope, 2000);

        assert_eq!(result.as_ref().map(|item| item.mode.as_str()), Some("tabs"));
        assert_eq!(result.and_then(|item| item.width), None);
    }

    #[test]
    fn indentation_detection_should_infer_space_width_from_prefix_counts() {
        let rope = Rope::from_str("def foo():\n    if ok:\n        pass\n    return\n");
        let result = detect_indentation_from_rope(&rope, 2000)
            .expect("space-indented content should be detected");

        assert_eq!(result.mode, "spaces");
        assert_eq!(result.width, Some(4));
    }

    #[test]
    fn indentation_detection_should_return_none_for_evenly_mixed_tab_and_space_prefixes() {
        let rope = Rope::from_str("\tfirst\n  second\n");
        let result = detect_indentation_from_rope(&rope, 2000);

        assert!(result.is_none());
    }

    #[test]
    fn document_text_chunks_should_reconstruct_original_text() {
        let repeated = "abcd".repeat((DOCUMENT_TEXT_SNAPSHOT_CHUNK_BYTES / 4) + 32);
        let source = format!("{repeated}\nsecond line\nthird line");
        let rope = Rope::from_str(&source);

        let chunks = build_document_text_chunks(&rope);
        let reconstructed: String = chunks.concat();

        assert!(chunks.len() >= 2);
        assert_eq!(reconstructed, source);
    }

    #[test]
    fn measure_document_size_bytes_should_respect_line_endings_and_encoding() {
        let rope = Rope::from_str("你\nA");
        let utf8_bytes = measure_document_size_bytes(&rope, encoding_rs::UTF_8, LineEnding::Lf);
        let gbk = Encoding::for_label(b"GBK").expect("GBK should resolve");
        let gbk_crlf_bytes = measure_document_size_bytes(&rope, gbk, LineEnding::CrLf);

        assert_eq!(utf8_bytes, 5);
        assert_eq!(gbk_crlf_bytes, 5);
    }

    #[test]
    fn markdown_preview_render_should_support_gfm_and_inline_html() {
        let html = render_markdown_preview_html(
            r##"- [x] done

<font color="#ff0000">Red</font>

| a | b |
| - | - |
| 1 | 2 |
"##,
        )
        .expect("markdown preview render should succeed");

        assert!(html.contains("type=\"checkbox\""));
        assert!(html.contains("disabled"));
        assert!(html.contains("done"));
        assert!(html.contains(r##"<font color="#ff0000">Red</font>"##));
        assert!(html.contains("<table>"));
    }

    #[test]
    fn markdown_preview_render_should_keep_markdown_image_tags() {
        let html = render_markdown_preview_html("![Preview](./images/pic.png)")
            .expect("markdown image render should succeed");

        assert!(html.contains("<img"), "html should contain image tag: {html}");
        assert!(
            html.contains(r#"src="./images/pic.png""#),
            "html should keep relative image src: {html}"
        );
        assert!(
            html.contains(r#"alt="Preview""#),
            "html should keep image alt text: {html}"
        );
    }

    #[test]
    fn markdown_preview_render_should_keep_inline_html_images() {
        let html = render_markdown_preview_html(r#"<img src="./images/pic.png" alt="Preview">"#)
            .expect("inline html image render should succeed");

        assert!(html.contains("<img"), "html should contain image tag: {html}");
        assert!(
            html.contains(r#"src="./images/pic.png""#),
            "html should keep inline html image src: {html}"
        );
        assert!(
            html.contains(r#"alt="Preview""#),
            "html should keep inline html alt text: {html}"
        );
    }

    #[test]
    fn markdown_preview_render_should_keep_data_url_images() {
        let html = render_markdown_preview_html("![Inline](data:image/png;base64,Zm9v)")
            .expect("data url image render should succeed");

        assert!(html.contains("<img"), "html should contain image tag: {html}");
        assert!(
            html.contains(r#"src="data:image/png;base64,Zm9v""#),
            "html should keep data url image src: {html}"
        );
    }

    #[test]
    fn folder_refresh_directories_should_return_parent_directories_for_create_events() {
        let root_path = Path::new("C:\\repo");
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![
                root_path.join("src").join("main.ts"),
                root_path.join("README.md"),
            ],
            attrs: Default::default(),
        };

        let directories = collect_folder_refresh_directories(root_path, &event);

        assert_eq!(
            directories,
            vec![root_path.to_path_buf(), root_path.join("src")]
        );
    }

    #[test]
    fn folder_refresh_directories_should_ignore_non_name_modify_events() {
        let root_path = Path::new("C:\\repo");
        let event = Event {
            kind: EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            paths: vec![root_path.join("src").join("main.ts")],
            attrs: Default::default(),
        };

        let directories = collect_folder_refresh_directories(root_path, &event);

        assert!(directories.is_empty());
    }
}
