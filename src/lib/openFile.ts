import { invoke } from '@tauri-apps/api/core';
import { isReusableBlankTab } from '@/lib/tabUtils';
import { addRecentFilePath } from '@/lib/recentPaths';
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
    const fileInfo = await invoke<FileTab>('open_file', { path });
    const latestState = useStore.getState();
    const existedTab = latestState.tabs.find((tab) => tab.id === fileInfo.id);

    if (existedTab) {
      latestState.setActiveTab(fileInfo.id);
      addRecentFilePath(path);
      return;
    }

    const activeTab = latestState.tabs.find((tab) => tab.id === latestState.activeTabId);

    if (activeTab && isReusableBlankTab(activeTab)) {
      patchTabWithFileInfo(activeTab.id, fileInfo);
      latestState.setActiveTab(fileInfo.id);
      await invoke('close_file', { id: activeTab.id });
      addRecentFilePath(path);
      return;
    }

    latestState.addTab(fileInfo);
    addRecentFilePath(path);
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
