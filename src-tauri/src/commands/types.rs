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

#[derive(serde::Serialize, Clone)]
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
#[serde(rename_all = "camelCase")]
pub struct EditHistoryState {
    pub(super) can_undo: bool,
    pub(super) can_redo: bool,
    pub(super) is_dirty: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordCountInfo {
    pub(super) word_count: usize,
    pub(super) character_count: usize,
    pub(super) character_count_no_spaces: usize,
    pub(super) line_count: usize,
    pub(super) paragraph_count: usize,
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub(super) name: String,
    pub(super) path: String,
    pub(super) is_dir: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn syntax_token_serialization_should_skip_none_fields() {
        let token = SyntaxToken {
            r#type: Some("keyword".to_string()),
            text: None,
            start_byte: Some(3),
            end_byte: None,
        };

        let value = serde_json::to_value(token).expect("serialization should succeed");
        assert_eq!(value, json!({"type":"keyword","start_byte":3}));
    }

    #[test]
    fn file_info_serialization_should_use_camel_case_and_optional_field() {
        let info = FileInfo {
            id: "1".to_string(),
            path: "a.txt".to_string(),
            name: "a.txt".to_string(),
            encoding: "UTF-8".to_string(),
            line_ending: "LF".to_string(),
            line_count: 1,
            large_file_mode: false,
            syntax_override: Some("markdown".to_string()),
        };

        let value = serde_json::to_value(info).expect("serialization should succeed");
        assert_eq!(
            value,
            json!({
                "id":"1",
                "path":"a.txt",
                "name":"a.txt",
                "encoding":"UTF-8",
                "lineEnding":"LF",
                "lineCount":1,
                "largeFileMode":false,
                "syntaxOverride":"markdown"
            })
        );
    }

    #[test]
    fn edit_history_state_serialization_should_use_camel_case() {
        let state = EditHistoryState {
            can_undo: true,
            can_redo: false,
            is_dirty: true,
        };

        let value = serde_json::to_value(state).expect("serialization should succeed");
        assert_eq!(
            value,
            json!({
                "canUndo": true,
                "canRedo": false,
                "isDirty": true
            })
        );
    }
}
