use dashmap::DashMap;
use encoding_rs::Encoding;
use ropey::Rope;
use std::path::PathBuf;
use std::sync::Mutex;
use tree_sitter::{Language, Parser, Tree};

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
    pub saved_encoding: String,
    pub line_ending: LineEnding,
    pub saved_line_ending: LineEnding,
    pub path: Option<PathBuf>,
    pub syntax_override: Option<String>,
    pub document_version: u64,
    pub saved_document_version: u64,
    pub undo_stack: Vec<EditOperation>,
    pub redo_stack: Vec<EditOperation>,
    pub parser: Option<Parser>,
    pub tree: Option<Tree>,
    pub language: Option<Language>,
    pub syntax_dirty: bool,
    pub saved_file_fingerprint: Option<FileFingerprint>,
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
