import { invoke } from '@tauri-apps/api/core';
import { createMonacoTextSnapshotFromChunks } from '@/lib/monacoTextSnapshot';

export async function getDocumentText(tabId: string) {
  return invoke<string>('get_document_text', { id: tabId });
}

export async function getDocumentTextBootstrapSnapshot(tabId: string) {
  const chunks = await invoke<string[]>('get_document_text_chunks', { id: tabId });
  return createMonacoTextSnapshotFromChunks(chunks);
}
