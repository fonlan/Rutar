use super::*;
use std::path::PathBuf;

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

pub(super) async fn open_file_impl(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
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
    let line_ending = detect_line_ending(&cow);
    let normalized_content = text_utils::normalize_to_lf(&cow);
    let rope = Rope::from_str(&normalized_content);
    let line_count = rope.len_lines();

    let id = Uuid::new_v4().to_string();

    let mut doc = Document {
        rope,
        encoding,
        saved_encoding: encoding.name().to_string(),
        line_ending,
        saved_line_ending: line_ending,
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
        line_ending: line_ending.label().to_string(),
        line_count,
        large_file_mode,
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

pub(super) async fn save_file_impl(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        if let Some(path) = &doc.path {
            let mut file = File::create(path).map_err(|e| e.to_string())?;
            let persist_content = build_persist_content(&doc);
            let (bytes, _, _malformed) = doc.encoding.encode(&persist_content);

            use std::io::Write;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            doc.saved_document_version = doc.document_version;
            doc.saved_encoding = doc.encoding.name().to_string();
            doc.saved_line_ending = doc.line_ending;

            Ok(())
        } else {
            Err("No path associated with this file. Use Save As.".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) async fn save_file_as_impl(state: State<'_, AppState>, id: String, path: String) -> Result<(), String> {
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
        let enable_syntax = doc.rope.len_bytes() <= LARGE_FILE_THRESHOLD_BYTES;
        configure_document_syntax(&mut doc, enable_syntax);
        Ok(())
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn convert_encoding_impl(state: State<'_, AppState>, id: String, new_encoding: String) -> Result<(), String> {
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

pub(super) fn set_line_ending_impl(state: State<'_, AppState>, id: String, new_line_ending: String) -> Result<(), String> {
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

    Ok(result)
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
