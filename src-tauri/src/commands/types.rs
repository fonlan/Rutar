#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub(super) id: String,
    pub(super) path: String,
    pub(super) name: String,
    pub(super) encoding: String,
    pub(super) line_ending: String,
    pub(super) line_count: usize,
    pub(super) large_file_mode: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) syntax_override: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SyntaxToken {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) start_byte: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) end_byte: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFileAssociationStatus {
    pub(super) enabled: bool,
    pub(super) extensions: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub(super) name: String,
    pub(super) path: String,
    pub(super) is_dir: bool,
}
