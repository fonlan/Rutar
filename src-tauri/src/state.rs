use dashmap::DashMap;
use encoding_rs::Encoding;
use ropey::Rope;
use std::path::PathBuf;
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
    pub undo_stack: Vec<EditOperation>,
    pub redo_stack: Vec<EditOperation>,
    pub parser: Option<Parser>,
    pub tree: Option<Tree>,
    pub language: Option<Language>,
    pub syntax_dirty: bool,
}

pub struct AppState {
    pub documents: DashMap<String, Document>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            documents: DashMap::new(),
        }
    }
}
