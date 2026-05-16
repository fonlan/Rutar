export interface DispatchDocumentUpdatedOptions {
    skipEditorRefresh?: boolean;
}

export function dispatchDocumentUpdated(
    tabId: string,
    options?: DispatchDocumentUpdatedOptions,
) {
    const detail: { tabId: string; skipEditorRefresh?: boolean } = { tabId };
    if (options?.skipEditorRefresh) {
        detail.skipEditorRefresh = true;
    }
    const event = new CustomEvent('rutar:document-updated', { detail });
    window.dispatchEvent(event);
}
