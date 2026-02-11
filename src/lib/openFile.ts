import { invoke } from '@tauri-apps/api/core';
import { isReusableBlankTab } from '@/lib/tabUtils';
import { addRecentFilePath } from '@/lib/recentPaths';
import { FileTab, useStore } from '@/store/useStore';

const openingPaths = new Set<string>();
const pendingTabIdByPath = new Map<string, string>();

interface FileOpenLoadingEventDetail {
  path: string;
  tabId: string;
  status: 'start' | 'end';
}

interface OpenFileBatchResultItem {
  path: string;
  success: boolean;
  fileInfo?: FileTab;
  error?: string;
}

function pathBaseName(path: string) {
  const normalizedPath = path.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

function dispatchFileOpenLoading(detail: FileOpenLoadingEventDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<FileOpenLoadingEventDetail>('rutar:file-open-loading', {
      detail,
    })
  );
}

function startFileOpenLoading(path: string) {
  const existing = pendingTabIdByPath.get(path);
  if (existing) {
    return existing;
  }

  const tabId = `pending:${pathBaseName(path)}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  pendingTabIdByPath.set(path, tabId);
  dispatchFileOpenLoading({
    path,
    tabId,
    status: 'start',
  });

  return tabId;
}

function finishFileOpenLoading(path: string) {
  const tabId = pendingTabIdByPath.get(path);
  if (!tabId) {
    return;
  }

  pendingTabIdByPath.delete(path);
  dispatchFileOpenLoading({
    path,
    tabId,
    status: 'end',
  });
}

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

async function applyOpenedFileInfo(path: string, fileInfo: FileTab) {
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
}

export async function openFilePath(path: string) {
  if (openingPaths.has(path)) {
    return;
  }

  openingPaths.add(path);
  startFileOpenLoading(path);

  try {
    const fileInfo = await invoke<FileTab>('open_file', { path });
    await applyOpenedFileInfo(path, fileInfo);
  } finally {
    openingPaths.delete(path);
    finishFileOpenLoading(path);
  }
}

export async function openFilePaths(paths: string[]) {
  const pendingPaths: string[] = [];

  for (const path of paths) {
    if (openingPaths.has(path)) {
      continue;
    }

    openingPaths.add(path);
    pendingPaths.push(path);
  }

  if (pendingPaths.length === 0) {
    return;
  }

  pendingPaths.forEach((path) => {
    startFileOpenLoading(path);
  });

  try {
    const results = await invoke<OpenFileBatchResultItem[]>('open_files', {
      paths: pendingPaths,
    });

    for (const result of results) {
      if (!result.success || !result.fileInfo) {
        console.error(`Failed to open dropped path: ${result.path}`, result.error ?? 'Unknown error');
        continue;
      }

      try {
        await applyOpenedFileInfo(result.path, result.fileInfo);
      } catch (error) {
        console.error(`Failed to process opened path: ${result.path}`, error);
      } finally {
        finishFileOpenLoading(result.path);
      }
    }
  } finally {
    for (const path of pendingPaths) {
      openingPaths.delete(path);
      finishFileOpenLoading(path);
    }
  }

  for (const path of paths) {
    if (pendingPaths.includes(path)) {
      continue;
    }

    try {
      await openFilePath(path);
    } catch (error) {
      console.error(`Failed to open dropped path: ${path}`, error);
    }
  }
}
