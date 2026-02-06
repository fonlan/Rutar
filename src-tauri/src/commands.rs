use crate::state::{AppState, Document};
use tauri::State;
use std::fs::File;
use std::path::PathBuf;
use memmap2::Mmap;
use chardetng::EncodingDetector;
use encoding_rs::Encoding;
use ropey::Rope;
use uuid::Uuid;
use tree_sitter::Parser;
use tree_sitter_javascript;
use tree_sitter_typescript;
use tree_sitter_rust;
use tree_sitter_python;
use tree_sitter_json;

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

#[tauri::command]
pub fn get_syntax_tokens(state: State<'_, AppState>, id: String, start_line: usize, end_line: usize) -> Result<Vec<SyntaxToken>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let rope = &doc.rope;
        let len = rope.len_lines();
        
        let start = start_line.min(len);
        let end = end_line.min(len);
        
        if start >= end {
            return Ok(Vec::new());
        }

        let start_char = rope.line_to_char(start);
        let end_char = rope.line_to_char(end);
        
        let text: String = rope.slice(start_char..end_char).to_string();
        let text_bytes = text.as_bytes();
        
        let language = get_language_from_path(&doc.path);
        let mut parser = Parser::new();
        
        if let Some(lang) = language {
            let _ = parser.set_language(&lang);
        }
        
        let tree = parser.parse(&text, None);
        let mut tokens = Vec::new();

        if let Some(tree) = tree {
            let root = tree.root_node();
            let mut last_pos = 0;
            
            fn collect_tokens(node: tree_sitter::Node, tokens: &mut Vec<SyntaxToken>, text_bytes: &[u8], last_pos: &mut usize) {
                let start = node.start_byte();
                let end = node.end_byte();
                
                if start > *last_pos {
                    let gap_text = String::from_utf8_lossy(&text_bytes[*last_pos..start]).to_string();
                    if !gap_text.is_empty() {
                        tokens.push(SyntaxToken {
                            r#type: None,
                            text: Some(gap_text),
                            start_byte: Some(*last_pos),
                            end_byte: Some(start),
                        });
                    }
                }
                *last_pos = start.max(*last_pos);

                if node.child_count() == 0 {
                    let text_slice = String::from_utf8_lossy(&text_bytes[start..end]).to_string();
                    if !text_slice.is_empty() {
                        tokens.push(SyntaxToken {
                            r#type: Some(node.kind().to_string()),
                            text: Some(text_slice),
                            start_byte: Some(start),
                            end_byte: Some(end),
                        });
                    }
                    *last_pos = end.max(*last_pos);
                } else {
                    let mut cursor = node.walk();
                    // 我们需要按顺序遍历所有子节点
                    let mut has_child = cursor.goto_first_child();
                    while has_child {
                        collect_tokens(cursor.node(), tokens, text_bytes, last_pos);
                        has_child = cursor.goto_next_sibling();
                    }
                    // 处理完子节点后，确保 last_pos 不落后于当前节点的 end
                    if *last_pos < end {
                        let remaining = String::from_utf8_lossy(&text_bytes[*last_pos..end]).to_string();
                        if !remaining.is_empty() {
                            tokens.push(SyntaxToken {
                                r#type: None,
                                text: Some(remaining),
                                start_byte: Some(*last_pos),
                                end_byte: Some(end),
                            });
                        }
                        *last_pos = end;
                    }
                }
            }
            
            collect_tokens(root, &mut tokens, text_bytes, &mut last_pos);
            
            // 处理最后的剩余部分
            if last_pos < text_bytes.len() {
                let remaining = String::from_utf8_lossy(&text_bytes[last_pos..]).to_string();
                if !remaining.is_empty() {
                    tokens.push(SyntaxToken {
                        r#type: None,
                        text: Some(remaining),
                        start_byte: Some(last_pos),
                        end_byte: Some(text_bytes.len()),
                    });
                }
            }
        } else {
            // 如果解析失败，将整个文本作为一个纯文本 token 返回
            let total_len = text.len();
            tokens.push(SyntaxToken {
                r#type: None,
                text: Some(text),
                start_byte: Some(0),
                end_byte: Some(total_len),
            });
        }
        
        Ok(tokens)
    } else {
        Err("Document not found".to_string())
    }
}

fn get_language_from_path(path: &Option<PathBuf>) -> Option<tree_sitter::Language> {
    if let Some(p) = path {
        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            return match ext.to_lowercase().as_str() {
                "js" | "jsx" | "mjs" => Some(tree_sitter_javascript::LANGUAGE.into()),
                "ts" | "tsx" | "mts" | "cts" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
                "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
                "py" => Some(tree_sitter_python::LANGUAGE.into()),
                "json" => Some(tree_sitter_json::LANGUAGE.into()),
                _ => None,
            };
        }
    }
    None
}

#[tauri::command]
pub async fn open_file(state: State<'_, AppState>, path: String) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(&path);
    let file = File::open(&path_buf).map_err(|e| e.to_string())?;
    
    // Check file size for large file mode (> 50MB)
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let size = metadata.len();
    let large_file_mode = size > 50 * 1024 * 1024;

    // Use mmap
    // Safety: The file is open and we assume no other process truncates it while we read.
    let mmap = unsafe { Mmap::map(&file).map_err(|e| e.to_string())? };

    // Detect encoding
    // 1. Check BOM
    let (encoding, _bom_size) = match Encoding::for_bom(&mmap) {
        Some((enc, size)) => (Some(enc), size),
        None => (None, 0),
    };
    
    let encoding = if let Some(enc) = encoding {
        enc
    } else {
        // 2. Use chardetng
        let mut detector = EncodingDetector::new();
        detector.feed(&mmap, true);
        detector.guess(None, true)
    };

    // Decode
    // We skip BOM if present (handled by decode logic usually, but let's be careful)
    // encoding_rs decode handles BOM stripping if the encoding matches? 
    // Actually, decode_with_bom_removal is what we want if we pass the whole thing.
    let (cow, _, _malformed) = encoding.decode(&mmap);
    
    // Create Rope
    let rope = Rope::from_str(&cow);
    let line_count = rope.len_lines();

    let id = Uuid::new_v4().to_string();
    
    let doc = Document {
        rope,
        encoding,
        path: Some(path_buf.clone()),
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        parser: None,
    };
    
    state.documents.insert(id.clone(), doc);
    
    Ok(FileInfo {
        id,
        path: path.clone(),
        name: path_buf.file_name().unwrap_or_default().to_string_lossy().to_string(),
        encoding: encoding.name().to_string(),
        line_count,
        large_file_mode,
    })
}

#[tauri::command]
pub fn get_visible_lines(state: State<'_, AppState>, id: String, start_line: usize, end_line: usize) -> Result<String, String> {
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

        // Get slice
        let slice = rope.slice(start_char..end_char);
        
        // Return as String
        Ok(slice.to_string())
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
            let rope = &doc.rope;
            let encoding = doc.encoding;

            // Collect all chunks into a single UTF-8 string
            let utf8_content: String = rope.chunks().collect();
            
            // Encode back to original encoding
            let (bytes, _, _malformed) = encoding.encode(&utf8_content);
            
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
        let rope = &doc.rope;
        let encoding = doc.encoding;

        let utf8_content: String = rope.chunks().collect();
        let (bytes, _, _malformed) = encoding.encode(&utf8_content);
        
        use std::io::Write;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        
        doc.path = Some(path_buf);
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
    
    let doc = Document {
        rope: Rope::new(),
        encoding,
        path: None,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
        parser: None,
    };
    
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
                name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
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
        if let Some(prev) = doc.undo_stack.pop() {
            let current = std::mem::replace(&mut doc.rope, prev);
            doc.redo_stack.push(current);
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
        if let Some(next) = doc.redo_stack.pop() {
            let current = std::mem::replace(&mut doc.rope, next);
            doc.undo_stack.push(current);
            Ok(doc.rope.len_lines())
        } else {
            Err("No more redo steps".to_string())
        }
    } else {
        Err("Document not found".to_string())
    }
}

#[tauri::command]
pub fn edit_text(state: State<'_, AppState>, id: String, start_char: usize, end_char: usize, new_text: String) -> Result<usize, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
        // Save current state to undo stack
        let old_rope = doc.rope.clone();
        doc.undo_stack.push(old_rope);
        doc.redo_stack.clear(); // Clear redo stack on new edit
        
        let rope = &mut doc.rope;
        let start = start_char.min(rope.len_chars());
        let end = end_char.min(rope.len_chars());
        
        if start < end {
            rope.remove(start..end);
        }
        
        if !new_text.is_empty() {
            rope.insert(start, &new_text);
        }
        
        Ok(rope.len_lines())
    } else {
        Err("Document not found".to_string())
    }
}
