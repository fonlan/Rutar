use super::*;

#[tauri::command]
pub fn undo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    editing::undo_impl(state, id)
}

#[tauri::command]
pub fn redo(state: State<'_, AppState>, id: String) -> Result<usize, String> {
    editing::redo_impl(state, id)
}

#[tauri::command]
pub fn get_edit_history_state(
    state: State<'_, AppState>,
    id: String,
) -> Result<EditHistoryState, String> {
    editing::get_edit_history_state_impl(state, id)
}

#[tauri::command]
pub fn edit_text(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    new_text: String,
) -> Result<usize, String> {
    editing::edit_text_impl(state, id, start_char, end_char, new_text)
}

#[tauri::command]
pub fn replace_line_range(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    new_text: String,
) -> Result<usize, String> {
    editing::replace_line_range_impl(state, id, start_line, end_line, new_text)
}

#[tauri::command]
pub fn cleanup_document(
    state: State<'_, AppState>,
    id: String,
    action: String,
) -> Result<usize, String> {
    editing::cleanup_document_impl(state, id, action)
}

#[tauri::command]
pub fn format_document(
    state: State<'_, AppState>,
    id: String,
    mode: String,
    file_syntax: Option<String>,
    file_path: Option<String>,
    file_name: Option<String>,
    tab_width: Option<u8>,
) -> Result<usize, String> {
    editing::format_document_impl(
        state,
        id,
        mode,
        file_syntax,
        file_path,
        file_name,
        tab_width,
    )
}

#[tauri::command]
pub fn toggle_line_comments(
    state: State<'_, AppState>,
    id: String,
    start_char: usize,
    end_char: usize,
    is_collapsed: bool,
    prefix: String,
) -> Result<editing::ToggleLineCommentsResultPayload, String> {
    editing::toggle_line_comments_impl(state, id, start_char, end_char, is_collapsed, prefix)
}

#[tauri::command]
pub fn convert_text_base64(text: String, action: String) -> Result<String, String> {
    editing::convert_text_base64_impl(text, action)
}

#[tauri::command]
pub fn find_matching_pair_offsets(
    text: String,
    offset: usize,
) -> Result<Option<editing::PairOffsetsResultPayload>, String> {
    editing::find_matching_pair_offsets_impl(text, offset)
}

#[tauri::command]
pub fn replace_rectangular_selection_text(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
    insert_text: String,
    collapse_to_start: bool,
) -> Result<editing::ReplaceRectangularSelectionResultPayload, String> {
    editing::replace_rectangular_selection_text_impl(
        text,
        start_line,
        end_line,
        start_column,
        end_column,
        insert_text,
        collapse_to_start,
    )
}

#[tauri::command]
pub fn get_rectangular_selection_text(
    text: String,
    start_line: usize,
    end_line: usize,
    start_column: usize,
    end_column: usize,
) -> Result<String, String> {
    editing::get_rectangular_selection_text_impl(
        text,
        start_line,
        end_line,
        start_column,
        end_column,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_text_base64_should_delegate_to_impl() {
        let source = "Hello, 世界".to_string();
        let via_command = convert_text_base64(source.clone(), "base64_encode".to_string())
            .expect("wrapper encode should succeed");
        let via_impl = editing::convert_text_base64_impl(source, "base64_encode".to_string())
            .expect("impl encode should succeed");
        assert_eq!(via_command, via_impl);

        let decoded_by_command =
            convert_text_base64(via_command.clone(), "base64_decode".to_string())
                .expect("wrapper decode should succeed");
        let decoded_by_impl =
            editing::convert_text_base64_impl(via_impl, "base64_decode".to_string())
                .expect("impl decode should succeed");
        assert_eq!(decoded_by_command, decoded_by_impl);
    }

    #[test]
    fn find_matching_pair_offsets_should_delegate_to_impl() {
        let text = "fn(a[1])".to_string();
        let via_command =
            find_matching_pair_offsets(text.clone(), 2).expect("wrapper should succeed");
        let via_impl =
            editing::find_matching_pair_offsets_impl(text, 2).expect("impl should succeed");

        match (via_command, via_impl) {
            (Some(left), Some(right)) => {
                assert_eq!(left.left_offset, right.left_offset);
                assert_eq!(left.right_offset, right.right_offset);
                assert_eq!(left.left_line, right.left_line);
                assert_eq!(left.left_column, right.left_column);
                assert_eq!(left.right_line, right.right_line);
                assert_eq!(left.right_column, right.right_column);
            }
            (None, None) => {}
            _ => panic!("wrapper and impl returned different option shapes"),
        }
    }

    #[test]
    fn rectangular_selection_wrappers_should_delegate_to_impl() {
        let text = "abcd\nefgh\nijkl".to_string();

        let selected_by_command = get_rectangular_selection_text(text.clone(), 0, 2, 1, 3)
            .expect("wrapper get selection should succeed");
        let selected_by_impl =
            editing::get_rectangular_selection_text_impl(text.clone(), 0, 2, 1, 3)
                .expect("impl get selection should succeed");
        assert_eq!(selected_by_command, selected_by_impl);

        let replaced_by_command =
            replace_rectangular_selection_text(text.clone(), 0, 1, 1, 3, "Z".to_string(), false)
                .expect("wrapper replace should succeed");
        let replaced_by_impl = editing::replace_rectangular_selection_text_impl(
            text,
            0,
            1,
            1,
            3,
            "Z".to_string(),
            false,
        )
        .expect("impl replace should succeed");
        assert_eq!(replaced_by_command.next_text, replaced_by_impl.next_text);
        assert_eq!(
            replaced_by_command.caret_offset,
            replaced_by_impl.caret_offset
        );
    }
}
