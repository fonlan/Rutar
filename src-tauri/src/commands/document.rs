use super::*;

pub(super) fn get_document_version_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<u64, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(doc.document_version)
    } else {
        Err("Document not found".to_string())
    }
}
