import { invoke } from '@tauri-apps/api/core';
import { isReusableBlankTab } from '@/lib/tabUtils';
import { FileTab, useStore } from '@/store/useStore';

const openingPaths = new Set<string>();

function patchTabWithFileInfo(tabId: string, fileInfo: FileTab) {
  useStore.getState().updateTab(tabId, {
    id: fileInfo.id,
    name: fileInfo.name,
    path: fileInfo.path,
    encoding: fileInfo.encoding,
    lineEnding: fileInfo.lineEnding,
    lineCount: fileInfo.lineCount,
    largeFileMode: fileInfo.largeFileMode,
    syntaxOverride: fileInfo.syntaxOverride ?? null,
    isDirty: false,
  });
}

export async function openFilePath(path: string) {
  if (openingPaths.has(path)) {
    return;
  }

  openingPaths.add(path);

  try {
  const state = useStore.getState();
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing) {
    state.setActiveTab(existing.id);
    return;
  }

  const fileInfo = await invoke<FileTab>('open_file', { path });
  const latestState = useStore.getState();
  const activeTab = latestState.tabs.find((tab) => tab.id === latestState.activeTabId);

  if (activeTab && isReusableBlankTab(activeTab)) {
    patchTabWithFileInfo(activeTab.id, fileInfo);
    latestState.setActiveTab(fileInfo.id);
    await invoke('close_file', { id: activeTab.id });
    return;
  }

  latestState.addTab(fileInfo);
  } finally {
    openingPaths.delete(path);
  }
}

export async function openFilePaths(paths: string[]) {
  for (const path of paths) {
    try {
      await openFilePath(path);
    } catch (error) {
      console.error(`Failed to open dropped path: ${path}`, error);
    }
  }
}
