use super::*;
use crate::state::FileFingerprint;
use std::path::PathBuf;

struct DiskFileSnapshot {
    rope: Rope,
    encoding: &'static Encoding,
    line_ending: LineEnding,
    line_count: usize,
    large_file_mode: bool,
    fingerprint: FileFingerprint,
}

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

pub(super) async fn open_file_impl(
    state: State<'_, AppState>,
    path: String,
) -> Result<FileInfo, String> {
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
            large_file_mode: existing.rope.len_bytes() > LARGE_FILE_THRESHOLD_BYTES,
            syntax_override: existing.syntax_override.clone(),
        });
    }

    let snapshot = read_disk_file_snapshot(&path_buf)?;

    let id = Uuid::new_v4().to_string();

    let mut doc = Document {
        rope: snapshot.rope,
        encoding: snapshot.encoding,
        saved_encoding: snapshot.encoding.name().to_string(),
        line_ending: snapshot.line_ending,
        saved_line_ending: snapshot.line_ending,
        path: Some(path_buf.clone()),
        syntax_override: None,
        document_version: 0,
        saved_document_version: 0,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
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
        large_file_mode: snapshot.large_file_mode,
        syntax_override: None,
    })
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

pub(super) fn close_file_impl(state: State<'_, AppState>, id: String) {
    state.documents.remove(&id);
}

pub(super) fn close_files_impl(state: State<'_, AppState>, ids: Vec<String>) {
    for id in ids {
        state.documents.remove(&id);
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
            doc.saved_document_version = doc.document_version;
            doc.saved_encoding = doc.encoding.name().to_string();
            doc.saved_line_ending = doc.line_ending;
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
        doc.saved_document_version = doc.document_version;
        doc.saved_encoding = doc.encoding.name().to_string();
        doc.saved_line_ending = doc.line_ending;
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

pub(super) fn convert_encoding_impl(
    state: State<'_, AppState>,
    id: String,
    new_encoding: String,
) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        let label = new_encoding.as_bytes();
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
        encoding,
        saved_encoding: encoding.name().to_string(),
        line_ending,
        saved_line_ending: line_ending,
        path: None,
        syntax_override: None,
        document_version: 0,
        saved_document_version: 0,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
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
        doc.rope = snapshot.rope;
        doc.encoding = snapshot.encoding;
        doc.saved_encoding = snapshot.encoding.name().to_string();
        doc.line_ending = snapshot.line_ending;
        doc.saved_line_ending = snapshot.line_ending;
        doc.document_version = 0;
        doc.saved_document_version = 0;
        doc.undo_stack.clear();
        doc.redo_stack.clear();
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

#[cfg(test)]
mod tests {
    use super::count_word_stats;
    use ropey::Rope;

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
}
