use dashmap::DashMap;
use encoding_rs::Encoding;
use ropey::Rope;
use std::path::PathBuf;
use std::sync::Mutex;
use tree_sitter::{Language, Parser, Tree};

#[derive(Clone)]
pub struct EditOperation {
    pub start_char: usize,
    pub old_text: String,
    pub new_text: String,
}

impl EditOperation {
    pub fn inverse(&self) -> Self {
        Self {
            start_char: self.start_char,
            old_text: self.new_text.clone(),
            new_text: self.old_text.clone(),
        }
    }
}

pub struct Document {
    pub rope: Rope,
    pub encoding: &'static Encoding,
    pub path: Option<PathBuf>,
    pub document_version: u64,
    pub undo_stack: Vec<EditOperation>,
    pub redo_stack: Vec<EditOperation>,
    pub parser: Option<Parser>,
    pub tree: Option<Tree>,
    pub language: Option<Language>,
    pub syntax_dirty: bool,
}

pub struct AppState {
    pub documents: DashMap<String, Document>,
    startup_paths: Mutex<Vec<String>>,
}

impl AppState {
    pub fn new(startup_paths: Vec<String>) -> Self {
        Self {
            documents: DashMap::new(),
            startup_paths: Mutex::new(startup_paths),
        }
    }

    pub fn take_startup_paths(&self) -> Vec<String> {
        let mut paths = self
            .startup_paths
            .lock()
            .expect("failed to lock startup paths");
        std::mem::take(&mut *paths)
    }
}
