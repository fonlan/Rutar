use dashmap::DashMap;
use encoding_rs::Encoding;
use ropey::Rope;
use std::path::PathBuf;
use tree_sitter::Parser;

pub struct Document {
    pub rope: Rope,
    pub encoding: &'static Encoding,
    pub path: Option<PathBuf>,
    pub undo_stack: Vec<Rope>,
    pub redo_stack: Vec<Rope>,
    pub parser: Option<Parser>,
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
