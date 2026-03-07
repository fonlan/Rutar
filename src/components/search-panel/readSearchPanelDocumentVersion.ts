import { invoke } from '@tauri-apps/api/core';
import { buildDocumentVersionRequest } from './buildSearchPanelRunRequests';

interface ReadSearchPanelDocumentVersionOptions {
  activeTabId: string;
  warnLabel: string;
}

export async function readSearchPanelDocumentVersion({
  activeTabId,
  warnLabel,
}: ReadSearchPanelDocumentVersionOptions): Promise<number | null> {
  try {
    return await invoke<number>(
      'get_document_version',
      buildDocumentVersionRequest({
        activeTabId,
      })
    );
  } catch (error) {
    console.warn(warnLabel, error);
    return null;
  }
}
