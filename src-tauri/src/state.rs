use dashmap::DashMap;
use encoding_rs::Encoding;
use notify::RecommendedWatcher;
use ropey::Rope;
use std::path::PathBuf;
use std::sync::Mutex;
use tree_sitter::{Language, Parser, Tree};
use tree_sitter_md::{MarkdownParser, MarkdownTree};

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct FileFingerprint {
    pub size_bytes: u64,
    pub modified_unix_millis: Option<u128>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    CrLf,
    Lf,
    Cr,
}

impl LineEnding {
    pub fn from_label(label: &str) -> Option<Self> {
        match label.to_ascii_uppercase().as_str() {
            "CRLF" => Some(Self::CrLf),
            "LF" => Some(Self::Lf),
            "CR" => Some(Self::Cr),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::CrLf => "CRLF",
            Self::Lf => "LF",
            Self::Cr => "CR",
        }
    }
}

#[cfg(windows)]
pub fn default_line_ending() -> LineEnding {
    LineEnding::CrLf
}

#[cfg(not(windows))]
pub fn default_line_ending() -> LineEnding {
    LineEnding::Lf
}

#[derive(Clone)]
pub struct CursorSnapshot {
    pub line: usize,
    pub column: usize,
}

#[derive(Clone)]
pub struct EditOperation {
    pub operation_id: u64,
    pub start_char: usize,
    pub old_text: String,
    pub new_text: String,
    pub before_cursor: Option<CursorSnapshot>,
    pub after_cursor: Option<CursorSnapshot>,
}

impl EditOperation {
    pub fn inverse(&self) -> Self {
        Self {
            operation_id: self.operation_id,
            start_char: self.start_char,
            old_text: self.new_text.clone(),
            new_text: self.old_text.clone(),
            before_cursor: self.after_cursor.clone(),
            after_cursor: self.before_cursor.clone(),
        }
    }
}

pub enum DocumentParser {
    TreeSitter(Parser),
    Markdown(MarkdownParser),
}

pub enum DocumentTree {
    TreeSitter(Tree),
    Markdown(MarkdownTree),
}

pub struct Document {
    pub rope: Rope,
    pub saved_rope: Rope,
    pub encoding: &'static Encoding,
    pub saved_encoding: String,
    pub line_ending: LineEnding,
    pub saved_line_ending: LineEnding,
    pub path: Option<PathBuf>,
    pub syntax_override: Option<String>,
    pub document_version: u64,
    pub saved_document_version: u64,
    pub next_edit_operation_id: u64,
    pub undo_stack: Vec<EditOperation>,
    pub redo_stack: Vec<EditOperation>,
    pub saved_undo_depth: usize,
    pub saved_undo_operation_id: Option<u64>,
    pub parser: Option<DocumentParser>,
    pub tree: Option<DocumentTree>,
    pub language: Option<Language>,
    pub syntax_dirty: bool,
    pub saved_file_fingerprint: Option<FileFingerprint>,
}

impl Document {
    pub fn allocate_edit_operation_id(&mut self) -> u64 {
        let operation_id = self.next_edit_operation_id;
        self.next_edit_operation_id = self.next_edit_operation_id.saturating_add(1);
        operation_id
    }

    pub fn mark_saved_undo_checkpoint(&mut self) {
        self.saved_undo_depth = self.undo_stack.len();
        self.saved_undo_operation_id = self
            .undo_stack
            .last()
            .map(|operation| operation.operation_id);
    }

    pub fn has_unsaved_text_changes(&self) -> bool {
        self.saved_undo_depth != self.undo_stack.len()
            || self.saved_undo_operation_id
                != self
                    .undo_stack
                    .last()
                    .map(|operation| operation.operation_id)
    }
}

pub struct AppState {
    pub documents: DashMap<String, Document>,
    pub syntax_request_serials: DashMap<String, u64>,
    startup_paths: Mutex<Vec<String>>,
    folder_watch: Mutex<Option<FolderWatchState>>,
}

struct FolderWatchState {
    root_path: PathBuf,
    #[allow(dead_code)]
    watcher: RecommendedWatcher,
}

impl AppState {
    pub fn new(startup_paths: Vec<String>) -> Self {
        Self {
            documents: DashMap::new(),
            syntax_request_serials: DashMap::new(),
            startup_paths: Mutex::new(startup_paths),
            folder_watch: Mutex::new(None),
        }
    }

    pub fn take_startup_paths(&self) -> Vec<String> {
        let mut paths = self
            .startup_paths
            .lock()
            .expect("failed to lock startup paths");
        std::mem::take(&mut *paths)
    }

    pub fn watched_folder_path(&self) -> Option<PathBuf> {
        self.folder_watch
            .lock()
            .expect("failed to lock folder watch state")
            .as_ref()
            .map(|watch_state| watch_state.root_path.clone())
    }

    pub fn replace_folder_watch(&self, root_path: PathBuf, watcher: RecommendedWatcher) {
        let mut watch_state = self
            .folder_watch
            .lock()
            .expect("failed to lock folder watch state");
        *watch_state = Some(FolderWatchState { root_path, watcher });
    }

    pub fn clear_folder_watch(&self) {
        let mut watch_state = self
            .folder_watch
            .lock()
            .expect("failed to lock folder watch state");
        *watch_state = None;
    }
}

#[cfg(test)]
mod tests {
    use super::{default_line_ending, CursorSnapshot, Document, EditOperation};
    use encoding_rs::UTF_8;
    use ropey::Rope;

    fn make_document() -> Document {
        Document {
            rope: Rope::new(),
            saved_rope: Rope::new(),
            encoding: UTF_8,
            saved_encoding: UTF_8.name().to_string(),
            line_ending: default_line_ending(),
            saved_line_ending: default_line_ending(),
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
        }
    }

    #[test]
    fn undo_checkpoint_should_restore_clean_state_after_pop_to_saved_marker() {
        let mut document = make_document();
        assert!(!document.has_unsaved_text_changes());

        let first_operation = EditOperation {
            operation_id: document.allocate_edit_operation_id(),
            start_char: 0,
            old_text: String::new(),
            new_text: "a".to_string(),
            before_cursor: None,
            after_cursor: None,
        };
        document.undo_stack.push(first_operation);
        assert!(document.has_unsaved_text_changes());

        document.mark_saved_undo_checkpoint();
        assert!(!document.has_unsaved_text_changes());

        let second_operation = EditOperation {
            operation_id: document.allocate_edit_operation_id(),
            start_char: 1,
            old_text: String::new(),
            new_text: "b".to_string(),
            before_cursor: None,
            after_cursor: None,
        };
        document.undo_stack.push(second_operation);
        assert!(document.has_unsaved_text_changes());

        document.undo_stack.pop();
        assert!(!document.has_unsaved_text_changes());
    }

    #[test]
    fn undo_checkpoint_should_remain_dirty_for_branch_with_same_depth() {
        let mut document = make_document();

        let first_operation = EditOperation {
            operation_id: document.allocate_edit_operation_id(),
            start_char: 0,
            old_text: String::new(),
            new_text: "a".to_string(),
            before_cursor: None,
            after_cursor: None,
        };
        document.undo_stack.push(first_operation);

        let second_operation = EditOperation {
            operation_id: document.allocate_edit_operation_id(),
            start_char: 1,
            old_text: String::new(),
            new_text: "b".to_string(),
            before_cursor: None,
            after_cursor: None,
        };
        document.undo_stack.push(second_operation);

        document.mark_saved_undo_checkpoint();
        assert!(!document.has_unsaved_text_changes());

        document.undo_stack.pop();

        let branch_operation = EditOperation {
            operation_id: document.allocate_edit_operation_id(),
            start_char: 1,
            old_text: String::new(),
            new_text: "c".to_string(),
            before_cursor: None,
            after_cursor: None,
        };
        document.undo_stack.push(branch_operation);

        assert!(document.has_unsaved_text_changes());
    }

    #[test]
    fn inverse_operation_should_swap_cursor_snapshots() {
        let operation = EditOperation {
            operation_id: 1,
            start_char: 0,
            old_text: "a".to_string(),
            new_text: "b".to_string(),
            before_cursor: Some(CursorSnapshot { line: 2, column: 3 }),
            after_cursor: Some(CursorSnapshot { line: 4, column: 5 }),
        };

        let inverse = operation.inverse();
        let before = inverse
            .before_cursor
            .expect("inverse should keep after cursor as before snapshot");
        let after = inverse
            .after_cursor
            .expect("inverse should keep before cursor as after snapshot");

        assert_eq!(before.line, 4);
        assert_eq!(before.column, 5);
        assert_eq!(after.line, 2);
        assert_eq!(after.column, 3);
    }
}
