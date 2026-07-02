import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RefreshCw } from 'lucide-react';
import { useFolderWatch } from '@/hooks/useFolderWatch';
import { useMouseGestures } from '@/hooks/useMouseGestures';
import { useSingleInstance } from '@/hooks/useSingleInstance';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { MarkdownToolbar } from '@/components/MarkdownToolbar';
import { t } from '@/i18n';
import { openFilePaths } from '@/lib/openFile';
import {
  type MouseGestureAction,
  type MouseGestureBinding,
  sanitizeMouseGestures,
} from '@/lib/mouseGestures';
import { sanitizeRecentTextHistory } from '@/lib/recentTextHistory';
import {
  confirmTabClose,
  saveTab,
  shouldEnableBulkTabCloseActions,
  type TabCloseDecision,
} from '@/lib/tabClose';
import {
  type FileTab,
  type AppLanguage,
  type AppTheme,
  type LineEnding,
  type TabIndentMode,
  type TranslationSettings,
  useStore,
  isDiffTab,
  defaultTranslationSettings,
} from '@/store/useStore';
import { detectOutlineType, loadOutline } from '@/lib/outline';
import { addRecentFolderPath, sanitizeRecentPathList } from '@/lib/recentPaths';
import { dispatchDocumentUpdated } from '@/lib/documentEvents';

let hasInitializedStartupTab = false;

function detectWindowsPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /windows/i.test(navigator.userAgent);
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sanitizePinnedTabPathList(paths: unknown): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  const uniquePaths: string[] = [];

  for (const item of paths) {
    if (typeof item !== 'string') {
      continue;
    }

    const normalizedPath = item.trim();
    if (!normalizedPath || uniquePaths.includes(normalizedPath)) {
      continue;
    }

    uniquePaths.push(normalizedPath);
  }

  return uniquePaths;
}

function normalizeLineEnding(value?: string): LineEnding {
  if (value === 'CRLF' || value === 'LF' || value === 'CR') {
    return value;
  }

  return detectWindowsPlatform() ? 'CRLF' : 'LF';
}

function normalizeTabIndentMode(value?: string): TabIndentMode {
  return value === 'spaces' ? 'spaces' : 'tabs';
}

function normalizeTranslationProxyServer(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const proxySettings = value as { proxyServer?: unknown; proxyUrl?: unknown };
  if (typeof proxySettings.proxyServer === 'string') {
    return proxySettings.proxyServer;
  }

  return typeof proxySettings.proxyUrl === 'string' ? proxySettings.proxyUrl : '';
}

function normalizeTranslationSettings(value: unknown): TranslationSettings {
  if (!value || typeof value !== 'object') {
    return defaultTranslationSettings;
  }

  const settings = value as Partial<TranslationSettings>;
  const targetLanguage = typeof settings.targetLanguage === 'string' && settings.targetLanguage.trim()
    ? settings.targetLanguage.trim()
    : defaultTranslationSettings.targetLanguage;

  return {
    engine: settings.engine === 'microsoft' ? 'microsoft' : 'google',
    targetLanguage,
    google: {
      proxyServer: normalizeTranslationProxyServer(settings.google),
    },
    microsoft: {
      proxyServer: normalizeTranslationProxyServer(settings.microsoft),
    },
  };
}

interface AppConfig {
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  tabIndentMode?: TabIndentMode;
  newFileLineEnding: LineEnding;
  wordWrap: boolean;
  minimap?: boolean;
  minimapAutohide?: boolean;
  doubleClickCloseTab: boolean;
  showLineNumbers: boolean;
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  rememberWindowState: boolean;
  recentFiles?: string[];
  recentFolders?: string[];
  recentSearchKeywords?: string[];
  recentReplaceValues?: string[];
  pinnedTabPaths?: string[];
  windowsFileAssociationExtensions: string[];
  mouseGesturesEnabled?: boolean;
  mouseGestures?: MouseGestureBinding[];
  translation?: unknown;
}

interface WindowsFileAssociationStatus {
  enabled: boolean;
  extensions: string[];
}

interface FolderTreeChangePayload {
  rootPath?: string;
  directoryPaths?: string[];
}
const Editor = lazy(async () => ({
  default: (await import('@/components/Editor')).Editor,
}));

const DiffEditor = lazy(async () => ({
  default: (await import('@/components/DiffEditor')).DiffEditor,
}));

const SettingsModal = lazy(async () => ({
  default: (await import('@/components/SettingsModal')).SettingsModal,
}));

const Sidebar = lazy(async () => ({
  default: (await import('@/components/Sidebar')).Sidebar,
}));

const OutlineSidebar = lazy(async () => ({
  default: (await import('@/components/OutlineSidebar')).OutlineSidebar,
}));

const BookmarkSidebar = lazy(async () => ({
  default: (await import('@/components/BookmarkSidebar')).BookmarkSidebar,
}));

const StatusBar = lazy(async () => ({
  default: (await import('@/components/StatusBar')).StatusBar,
}));

const SearchReplacePanel = lazy(async () => ({
  default: (await import('@/components/SearchReplacePanel')).SearchReplacePanel,
}));

const TabCloseConfirmModal = lazy(async () => ({
  default: (await import('@/components/TabCloseConfirmModal')).TabCloseConfirmModal,
}));

const GoToLineModal = lazy(async () => ({
  default: (await import('@/components/GoToLineModal')).GoToLineModal,
}));

const MarkdownPreviewPanel = lazy(async () => ({
  default: (await import('@/components/MarkdownPreviewPanel')).MarkdownPreviewPanel,
}));

function dispatchEditorForceRefresh(
  tabId: string,
  lineCount: number,
  options?: { preserveCaret?: boolean; preserveScroll?: boolean }
) {
  window.dispatchEvent(
    new CustomEvent('rutar:force-refresh', {
      detail: {
        tabId,
        lineCount,
        preserveCaret: options?.preserveCaret ?? false,
        preserveScroll: options?.preserveScroll ?? false,
      },
    })
  );
}


function dispatchNavigateToLine(tabId: string, line: number) {
  window.dispatchEvent(
    new CustomEvent('rutar:navigate-to-line', {
      detail: {
        tabId,
        line,
        column: 1,
      },
    })
  );
}

function dispatchGesturePreview(sequence: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:gesture-preview', {
      detail: {
        sequence,
      },
    })
  );
}

function isAppInForeground() {
  if (typeof document === 'undefined') {
    return true;
  }

  if (document.visibilityState === 'hidden') {
    return false;
  }

  if (typeof document.hasFocus !== 'function') {
    return true;
  }

  return document.hasFocus();
}

export const appTestUtils = {
  detectWindowsPlatform,
  areStringArraysEqual,
  normalizeLineEnding,
  dispatchEditorForceRefresh,
  dispatchDocumentUpdated,
  dispatchNavigateToLine,
  dispatchGesturePreview,
};

function App() {
  const activeTabId = useStore((state) => state.activeTabId);
  // Project active tab into a minimal snapshot so App skips re-renders when
  // unrelated tab fields change. Keep keys aligned with child component needs.
  const activeTab = useStore(
    useShallow((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) {
        return null;
      }
      return {
        id: tab.id,
        name: tab.name,
        path: tab.path,
        lineCount: tab.lineCount,
        largeFileMode: tab.largeFileMode,
        wordWrap: tab.wordWrap,
        syntaxOverride: tab.syntaxOverride,
        tabType: tab.tabType,
        diffPayload: tab.diffPayload,
      } as FileTab;
    }),
  );
  const settings = useStore(
    useShallow((state) => ({
      language: state.settings.language,
      theme: state.settings.theme,
      fontFamily: state.settings.fontFamily,
      fontSize: state.settings.fontSize,
      tabWidth: state.settings.tabWidth,
      tabIndentMode: state.settings.tabIndentMode,
      newFileLineEnding: state.settings.newFileLineEnding,
      wordWrap: state.settings.wordWrap,
      minimap: state.settings.minimap,
      minimapAutohide: state.settings.minimapAutohide,
      doubleClickCloseTab: state.settings.doubleClickCloseTab,
      showLineNumbers: state.settings.showLineNumbers,
      highlightCurrentLine: state.settings.highlightCurrentLine,
      singleInstanceMode: state.settings.singleInstanceMode,
      rememberWindowState: state.settings.rememberWindowState,
      recentFiles: state.settings.recentFiles,
      recentFolders: state.settings.recentFolders,
      recentSearchKeywords: state.settings.recentSearchKeywords,
      recentReplaceValues: state.settings.recentReplaceValues,
      pinnedTabPaths: state.settings.pinnedTabPaths,
      windowsFileAssociationEnabled: state.settings.windowsFileAssociationEnabled,
      windowsFileAssociationExtensions: state.settings.windowsFileAssociationExtensions,
      mouseGesturesEnabled: state.settings.mouseGesturesEnabled,
      mouseGestures: state.settings.mouseGestures,
      translation: state.settings.translation,
    })),
  );
  const updateSettings = useStore((state) => state.updateSettings);
  const setFolder = useStore((state) => state.setFolder);
  const folderPath = useStore((state) => state.folderPath);
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const outlineOpen = useStore((state) => state.outlineOpen);
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const markdownPreviewOpen = useStore((state) => state.markdownPreviewOpen);
  const outlineType = useStore((state) => state.outlineType);
  const outlineNodes = useStore((state) => state.outlineNodes);
  const outlineError = useStore((state) => state.outlineError);
  const setOutlineData = useStore((state) => state.setOutlineData);
  const [animateMarkdownPreviewOnOpen, setAnimateMarkdownPreviewOnOpen] = useState(false);
  const tabPanelStateRef = useRef<Record<string, {
    sidebarOpen: boolean;
    outlineOpen: boolean;
    bookmarkSidebarOpen: boolean;
    markdownPreviewOpen: boolean;
  }>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const hasOpenedPinnedTabsRef = useRef(false);
  const externalChangeCheckingTabIdsRef = useRef<Set<string>>(new Set());
  const suppressedExternalChangePromptTabIdsRef = useRef<Set<string>>(new Set());
  const appForegroundRef = useRef(isAppInForeground());
  const [configReady, setConfigReady] = useState(false);
  const isWindows = detectWindowsPlatform();

  const removeBootSplash = useCallback(() => {
    const splashElement = document.getElementById('boot-splash');
    splashElement?.remove();
  }, []);

  const closeTabsWithConfirm = useCallback(async (tabsToClose: FileTab[]) => {
    if (tabsToClose.length === 0) {
      return false;
    }

    const state = useStore.getState();
    const closableTabs: FileTab[] = [];
    const allowBulkActions = shouldEnableBulkTabCloseActions(tabsToClose, true);
    let bulkDecision: Extract<TabCloseDecision, 'save_all' | 'discard_all'> | null = null;

    for (const tab of tabsToClose) {
      let decision: TabCloseDecision | null = bulkDecision;
      if (!decision) {
        decision = await confirmTabClose(tab, state.settings.language, allowBulkActions);
      }

      if (decision === 'cancel') {
        return false;
      }

      if (decision === 'save_all' || decision === 'discard_all') {
        bulkDecision = decision;
      }

      if (decision === 'save' || decision === 'save_all') {
        const saved = await saveTab(tab, state.updateTab);
        if (!saved) {
          return false;
        }
      }

      closableTabs.push(tab);
    }

    if (closableTabs.length === 0) {
      return false;
    }

    const tabIds = closableTabs.map((tab) => tab.id);

    for (const tabId of tabIds) {
      state.closeTab(tabId);
    }

    try {
      await invoke('close_files', { ids: tabIds });
    } catch (error) {
      console.error('Failed to close tabs:', error);
    }

    return true;
  }, []);

  const executeMouseGestureAction = useCallback((action: MouseGestureAction) => {
    const state = useStore.getState();

    const ensureAtLeastOneTab = async () => {
      if (useStore.getState().tabs.length > 0) {
        return;
      }

      try {
        const fileInfo = await invoke<FileTab>('new_file', {
          newFileLineEnding: useStore.getState().settings.newFileLineEnding,
        });
        useStore.getState().addTab(fileInfo);
      } catch (error) {
        console.error('Failed to create startup file:', error);
      }
    };

    const closeByAction = async (mode: 'current' | 'others' | 'all') => {
      const latestState = useStore.getState();
      const activeId = latestState.activeTabId;

      if (!activeId) {
        return;
      }

      let targets: FileTab[] = [];

      if (mode === 'current') {
        const current = latestState.tabs.find((tab) => tab.id === activeId);
        if (!current) {
          return;
        }

        targets = [current];
      } else if (mode === 'others') {
        targets = latestState.tabs.filter((tab) => tab.id !== activeId);
      } else {
        targets = [...latestState.tabs];
      }

      if (targets.length === 0) {
        return;
      }

      const closed = await closeTabsWithConfirm(targets);
      if (closed && mode === 'current') {
        await ensureAtLeastOneTab();
      }
    };

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);

    switch (action) {
      case 'previousTab': {
        if (state.tabs.length <= 1) {
          return;
        }

        const currentIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
        const targetIndex = currentIndex <= 0 ? state.tabs.length - 1 : currentIndex - 1;
        state.setActiveTab(state.tabs[targetIndex].id);
        return;
      }
      case 'nextTab': {
        if (state.tabs.length <= 1) {
          return;
        }

        const currentIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
        const baseIndex = currentIndex < 0 ? 0 : currentIndex;
        const targetIndex = (baseIndex + 1) % state.tabs.length;
        state.setActiveTab(state.tabs[targetIndex].id);
        return;
      }
      case 'toTop':
        if (activeTab) {
          dispatchNavigateToLine(activeTab.id, 1);
        }
        return;
      case 'toBottom':
        if (activeTab) {
          dispatchNavigateToLine(activeTab.id, Math.max(1, activeTab.lineCount));
        }
        return;
      case 'closeCurrentTab':
        void closeByAction('current');
        return;
      case 'closeAllTabs':
        void closeByAction('all');
        return;
      case 'closeOtherTabs':
        void closeByAction('others');
        return;
      case 'quitApp':
        void getCurrentWindow().close().catch((error) => {
          console.error('Failed to close app window:', error);
        });
        return;
      case 'toggleSidebar':
        state.toggleSidebar();
        return;
      case 'toggleOutline':
        state.toggleOutline();
        return;
      case 'toggleBookmarkSidebar':
        state.toggleBookmarkSidebar();
        return;
      case 'toggleWordWrap':
        if (activeTab) {
          state.updateTab(activeTab.id, { wordWrap: !activeTab.wordWrap });
        }
        return;
      case 'openSettings':
        state.toggleSettings(true);
        return;
      default:
        return;
    }
  }, [closeTabsWithConfirm]);

  const openIncomingPaths = useCallback(async (paths: string[]) => {
    for (const incomingPath of paths) {
      try {
        const entries = await invoke<any[] | null>('read_dir_if_directory', { path: incomingPath });
        if (entries) {
          setFolder(incomingPath, entries);
          addRecentFolderPath(incomingPath);
          continue;
        }
      } catch (error) {
        console.error(`Failed to check incoming directory path: ${incomingPath}`, error);
      }

      try {
        await openFilePaths([incomingPath]);
      } catch (error) {
        console.error(`Failed to open incoming path: ${incomingPath}`, error);
      }
    }
  }, [setFolder]);

  const checkTabForExternalChange = useCallback(async (tabId: string | null | undefined) => {
    if (!tabId) {
      return;
    }

    if (!appForegroundRef.current) {
      return;
    }

    const snapshotTab = useStore
      .getState()
      .tabs
      .find((tab) => tab.id === tabId && !!tab.path);

    if (!snapshotTab || !snapshotTab.path) {
      return;
    }

    if (suppressedExternalChangePromptTabIdsRef.current.has(snapshotTab.id)) {
      return;
    }

    if (externalChangeCheckingTabIdsRef.current.has(snapshotTab.id)) {
      return;
    }

    externalChangeCheckingTabIdsRef.current.add(snapshotTab.id);

    try {
      let changed = false;
      try {
        changed = await invoke<boolean>('has_external_file_change', { id: snapshotTab.id });
      } catch (error) {
        console.error(`Failed to check external file change: ${snapshotTab.path}`, error);
        return;
      }

      if (!changed) {
        return;
      }

      const latestState = useStore.getState();
      const latestTab = latestState.tabs.find((item) => item.id === snapshotTab.id);
      if (!latestTab || !latestTab.path) {
        return;
      }

      const acknowledgeExternalChange = async () => {
        try {
          await invoke('acknowledge_external_file_change', { id: latestTab.id });
        } catch (error) {
          console.error(`Failed to acknowledge external change: ${latestTab.path}`, error);
        }
      };

      const fileName = latestTab.name || latestTab.path;
      const promptText = t(latestState.settings.language, 'app.externalFileChanged.prompt')
        .replace('{fileName}', fileName);
      const unsavedWarningText = t(
        latestState.settings.language,
        'app.externalFileChanged.unsavedWarning'
      );
      const messageText = latestTab.isDirty
        ? `${promptText}\n\n${unsavedWarningText}`
        : promptText;

      const shouldReload = await ask(messageText, {
        title: 'Rutar',
        kind: 'warning',
      });

      if (shouldReload) {
        try {
          const fileInfo = await invoke<FileTab>('reload_file_from_disk', { id: latestTab.id });
          useStore.getState().updateTab(latestTab.id, {
            name: fileInfo.name,
            path: fileInfo.path,
            encoding: fileInfo.encoding,
            lineEnding: fileInfo.lineEnding,
            lineCount: fileInfo.lineCount,
            largeFileMode: fileInfo.largeFileMode,
            syntaxOverride: fileInfo.syntaxOverride ?? null,
            isDirty: false,
          });

          if (useStore.getState().activeTabId === latestTab.id) {
            dispatchEditorForceRefresh(latestTab.id, Math.max(1, fileInfo.lineCount), {
              preserveCaret: true,
              preserveScroll: true,
            });
          }

          dispatchDocumentUpdated(latestTab.id);
        } catch (error) {
          console.error(`Failed to reload changed file: ${latestTab.path}`, error);

          let fileMissingAfterReloadFailure = false;
          try {
            const fileExists = await invoke<boolean>('path_exists', { path: latestTab.path });
            fileMissingAfterReloadFailure = fileExists === false;
          } catch (pathExistsError) {
            console.error(`Failed to check changed file existence: ${latestTab.path}`, pathExistsError);
          }

          if (fileMissingAfterReloadFailure) {
            await acknowledgeExternalChange();
          }
        }

        return;
      }

      suppressedExternalChangePromptTabIdsRef.current.add(latestTab.id);
      await acknowledgeExternalChange();
    } finally {
      externalChangeCheckingTabIdsRef.current.delete(snapshotTab.id);
    }
  }, []);

  useEffect(() => {
    const syncForegroundState = () => {
      const wasForeground = appForegroundRef.current;
      const isForeground = isAppInForeground();
      appForegroundRef.current = isForeground;

      if (wasForeground && !isForeground) {
        suppressedExternalChangePromptTabIdsRef.current.clear();
      }

      if (!wasForeground && isForeground) {
        void checkTabForExternalChange(useStore.getState().activeTabId);
      }
    };

    syncForegroundState();

    window.addEventListener('focus', syncForegroundState);
    window.addEventListener('blur', syncForegroundState);
    document.addEventListener('visibilitychange', syncForegroundState);

    return () => {
      window.removeEventListener('focus', syncForegroundState);
      window.removeEventListener('blur', syncForegroundState);
      document.removeEventListener('visibilitychange', syncForegroundState);
    };
  }, [checkTabForExternalChange]);

  useEffect(() => {
    let cancelled = false;

    const revealMainWindow = async () => {
      try {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });

        if (cancelled) {
          return;
        }

        await invoke('show_main_window_when_ready');
      } catch (error) {
        console.error('Failed to reveal main window after app shell ready:', error);
      } finally {
        if (!cancelled) {
          removeBootSplash();
        }
      }
    };

    void revealMainWindow();

    return () => {
      cancelled = true;
    };
  }, [removeBootSplash]);

  useEffect(() => {
    if (!isWindows) {
      return;
    }

    let cancelled = false;

    const loadWindowsContextMenuStatus = async () => {
      try {
        const enabled = await invoke<boolean>('is_windows_context_menu_registered');
        if (cancelled) {
          return;
        }

        updateSettings({ windowsContextMenuEnabled: enabled });
      } catch (error) {
        console.error('Failed to read Windows context menu status:', error);
      }
    };

    void loadWindowsContextMenuStatus();

    return () => {
      cancelled = true;
    };
  }, [isWindows, updateSettings]);

  useEffect(() => {
    if (!isWindows) {
      return;
    }

    let cancelled = false;

    const loadWindowsFileAssociationStatus = async () => {
      try {
        const status = await invoke<WindowsFileAssociationStatus>('get_windows_file_association_status', {
          extensions: settings.windowsFileAssociationExtensions,
        });

        if (cancelled) {
          return;
        }

        const extensionsChanged = !areStringArraysEqual(
          settings.windowsFileAssociationExtensions,
          status.extensions,
        );
        const enabledChanged = settings.windowsFileAssociationEnabled !== status.enabled;

        if (!extensionsChanged && !enabledChanged) {
          return;
        }

        updateSettings({
          windowsFileAssociationEnabled: status.enabled,
          ...(extensionsChanged
            ? { windowsFileAssociationExtensions: status.extensions }
            : {}),
        });
      } catch (error) {
        console.error('Failed to read Windows file association status:', error);
      }
    };

    void loadWindowsFileAssociationStatus();

    return () => {
      cancelled = true;
    };
  }, [
    isWindows,
    settings.windowsFileAssociationEnabled,
    settings.windowsFileAssociationExtensions,
    updateSettings,
  ]);

  useEffect(() => {
    let cancelled = false;

    const openStartupPaths = async () => {
      try {
        const startupPaths = await invoke<string[]>('get_startup_paths');
        if (cancelled || startupPaths.length === 0) {
          return;
        }

        await openIncomingPaths(startupPaths);
        if (cancelled) {
          return;
        }
      } catch (error) {
        console.error('Failed to load startup paths:', error);
      } finally {
        if (!cancelled) {
          await getCurrentWindow().emit('rutar://frontend-ready');
        }
      }
    };

    void openStartupPaths();

    return () => {
      cancelled = true;
    };
  }, [openIncomingPaths]);
  useFolderWatch(folderPath);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const setupFolderTreeChangeListener = async () => {
      try {
        const unsubscribe = await listen<FolderTreeChangePayload>('rutar://folder-tree-changed', (event) => {
          const payload = event.payload;
          const rootPath = typeof payload?.rootPath === 'string' ? payload.rootPath : null;
          const directoryPaths = Array.isArray(payload?.directoryPaths)
            ? payload.directoryPaths.filter((value): value is string => typeof value === 'string')
            : [];

          if (!rootPath || directoryPaths.length === 0) {
            return;
          }

          window.dispatchEvent(
            new CustomEvent<FolderTreeChangePayload>('rutar:folder-tree-changed', {
              detail: {
                rootPath,
                directoryPaths,
              },
            })
          );
        });
        if (disposed) {
          unsubscribe();
          return;
        }
        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to listen folder tree change event:', error);
      }
    };
    void setupFolderTreeChangeListener();
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
  useSingleInstance(openIncomingPaths);

  useEffect(() => {
    if (hasInitializedStartupTab) {
      return;
    }

    hasInitializedStartupTab = true;

    const ensureStartupTab = async () => {
      if (useStore.getState().tabs.length > 0) {
        return;
      }

      try {
        const fileInfo = await invoke<FileTab>('new_file', {
          newFileLineEnding: useStore.getState().settings.newFileLineEnding,
        });
        if (useStore.getState().tabs.length === 0) {
          useStore.getState().addTab(fileInfo);
        } else {
          await invoke('close_file', { id: fileInfo.id });
        }
      } catch (error) {
        console.error('Failed to create startup file:', error);
      }
    };

    void ensureStartupTab();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const setupDragDrop = async () => {
      try {
        const unsubscribe = await getCurrentWindow().onDragDropEvent((event) => {
          if (event.payload.type !== 'drop') {
            return;
          }

          void openFilePaths(event.payload.paths);
        });

        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to register drag drop listener:', error);
      }
    };

    void setupDragDrop();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const setupExternalChangeListener = async () => {
      try {
        const unsubscribe = await listen<{ id?: string }>('rutar://external-file-changed', (event) => {
          const changedTabId = typeof event.payload?.id === 'string' ? event.payload.id : null;
          if (!changedTabId) {
            return;
          }

          const currentActiveTabId = useStore.getState().activeTabId;
          if (changedTabId !== currentActiveTabId) {
            return;
          }

          void checkTabForExternalChange(changedTabId);
        });

        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to listen external file change event:', error);
      }
    };

    void setupExternalChangeListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [checkTabForExternalChange]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    void checkTabForExternalChange(activeTabId);
  }, [activeTabId, checkTabForExternalChange]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const setupCloseGuard = async () => {
      try {
        const unsubscribe = await getCurrentWindow().onCloseRequested(async (event) => {
          const state = useStore.getState();
          const dirtyTabs = state.tabs.filter((tab) => tab.isDirty);
          const allowBulkActions = shouldEnableBulkTabCloseActions(dirtyTabs, true);
          let bulkDecision: Extract<TabCloseDecision, 'save_all' | 'discard_all'> | null = null;

          for (const tab of dirtyTabs) {
            let decision: TabCloseDecision | null = bulkDecision;
            if (!decision) {
              decision = await confirmTabClose(tab, state.settings.language, allowBulkActions);
            }

            if (decision === 'cancel') {
              event.preventDefault();
              return;
            }

            if (decision === 'save_all' || decision === 'discard_all') {
              bulkDecision = decision;
            }

            if (decision === 'save' || decision === 'save_all') {
              const saved = await saveTab(tab, state.updateTab);
              if (!saved) {
                event.preventDefault();
                return;
              }
            }
          }
        });

        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to register close guard:', error);
      }
    };

    void setupCloseGuard();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const config = await invoke<AppConfig>('load_config');

        if (cancelled) {
          return;
        }

        updateSettings({
          language: config.language === 'en-US' ? 'en-US' : 'zh-CN',
          theme: config.theme === 'dark' ? 'dark' : 'light',
          fontFamily: config.fontFamily || 'Consolas, "Courier New", monospace',
          fontSize: Number.isFinite(config.fontSize) ? config.fontSize : 14,
          tabWidth: Number.isFinite(config.tabWidth) ? Math.min(8, Math.max(1, config.tabWidth)) : 4,
          tabIndentMode: normalizeTabIndentMode(config.tabIndentMode),
          newFileLineEnding: normalizeLineEnding(config.newFileLineEnding),
          wordWrap: !!config.wordWrap,
          minimap: config.minimap !== false,
          minimapAutohide: config.minimapAutohide !== false,
          doubleClickCloseTab: config.doubleClickCloseTab !== false,
          showLineNumbers: config.showLineNumbers !== false,
          highlightCurrentLine: config.highlightCurrentLine !== false,
          singleInstanceMode: config.singleInstanceMode !== false,
          rememberWindowState: config.rememberWindowState !== false,
          recentFiles: sanitizeRecentPathList(config.recentFiles),
          recentFolders: sanitizeRecentPathList(config.recentFolders),
          recentSearchKeywords: sanitizeRecentTextHistory(config.recentSearchKeywords),
          recentReplaceValues: sanitizeRecentTextHistory(config.recentReplaceValues),
          pinnedTabPaths: sanitizePinnedTabPathList(config.pinnedTabPaths),
          windowsFileAssociationExtensions: Array.isArray(config.windowsFileAssociationExtensions)
            ? config.windowsFileAssociationExtensions
            : [],
          mouseGesturesEnabled: config.mouseGesturesEnabled !== false,
          mouseGestures: sanitizeMouseGestures(config.mouseGestures),
          translation: normalizeTranslationSettings(config.translation),
        });
      } catch (error) {
        console.error('Failed to load config:', error);
      } finally {
        if (!cancelled) {
          setConfigReady(true);
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [updateSettings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  useEffect(() => {
    if (!configReady) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void invoke('save_config', {
        config: {
          language: settings.language,
          theme: settings.theme,
          fontFamily: settings.fontFamily,
          fontSize: settings.fontSize,
          tabWidth: settings.tabWidth,
          tabIndentMode: settings.tabIndentMode,
          newFileLineEnding: settings.newFileLineEnding,
          wordWrap: settings.wordWrap,
          minimap: settings.minimap,
          minimapAutohide: settings.minimapAutohide,
          doubleClickCloseTab: settings.doubleClickCloseTab,
          showLineNumbers: settings.showLineNumbers,
          highlightCurrentLine: settings.highlightCurrentLine,
          singleInstanceMode: settings.singleInstanceMode,
          rememberWindowState: settings.rememberWindowState,
          recentFiles: settings.recentFiles,
          recentFolders: settings.recentFolders,
          recentSearchKeywords: settings.recentSearchKeywords,
          recentReplaceValues: settings.recentReplaceValues,
          pinnedTabPaths: settings.pinnedTabPaths,
          windowsFileAssociationExtensions: settings.windowsFileAssociationExtensions,
          mouseGesturesEnabled: settings.mouseGesturesEnabled,
          mouseGestures: settings.mouseGestures,
          translation: settings.translation,
        },
      }).catch((error) => {
        console.error('Failed to save config:', error);
      });
    }, 200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    configReady,
    settings.fontFamily,
    settings.fontSize,
    settings.tabWidth,
    settings.tabIndentMode,
    settings.newFileLineEnding,
    settings.language,
    settings.theme,
    settings.wordWrap,
    settings.minimap,
    settings.minimapAutohide,
    settings.doubleClickCloseTab,
    settings.showLineNumbers,
    settings.highlightCurrentLine,
    settings.singleInstanceMode,
    settings.rememberWindowState,
    settings.recentFiles,
    settings.recentFolders,
    settings.recentSearchKeywords,
    settings.recentReplaceValues,
    settings.pinnedTabPaths,
    settings.windowsFileAssociationExtensions,
    settings.mouseGesturesEnabled,
    settings.mouseGestures,
    settings.translation,
  ]);

  useEffect(() => {
    if (!configReady || hasOpenedPinnedTabsRef.current) {
      return;
    }

    hasOpenedPinnedTabsRef.current = true;
    let cancelled = false;

    const openPinnedTabs = async () => {
      const pinnedPaths = settings.pinnedTabPaths;
      if (cancelled || pinnedPaths.length === 0) {
        return;
      }

      await openIncomingPaths(pinnedPaths);
    };

    void openPinnedTabs();

    return () => {
      cancelled = true;
    };
  }, [configReady, openIncomingPaths, settings.pinnedTabPaths]);

  useMouseGestures({
    enabled: settings.mouseGesturesEnabled,
    bindings: settings.mouseGestures,
    onAction: executeMouseGestureAction,
    onPreview: dispatchGesturePreview,
  });


  const activeFileTab = activeTab && !isDiffTab(activeTab) ? activeTab : null;
  const editorFallback = useMemo(
    () => (
      <div
        className="flex h-full w-full items-center justify-center bg-background"
        aria-live="polite"
        aria-busy="true"
        data-testid="rutar-editor-fallback"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{t(settings.language, 'editor.loading')}</span>
        </div>
      </div>
    ),
    [settings.language],
  );
  const handleMarkdownPreviewToggleIntent = useCallback((nextOpen: boolean) => {
    setAnimateMarkdownPreviewOnOpen(nextOpen);
  }, []);

  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;
    if (previousTabId) {
      tabPanelStateRef.current[previousTabId] = {
        sidebarOpen,
        outlineOpen,
        bookmarkSidebarOpen,
        markdownPreviewOpen,
      };
    }

    if (!activeTabId) {
      setAnimateMarkdownPreviewOnOpen(false);
      previousActiveTabIdRef.current = null;
      return;
    }

    const state = useStore.getState();
    const nextTabState = tabPanelStateRef.current[activeTabId];
    setAnimateMarkdownPreviewOnOpen(false);
    state.toggleSidebar(nextTabState?.sidebarOpen ?? state.sidebarOpen);
    state.toggleOutline(nextTabState?.outlineOpen ?? false);
    state.toggleMarkdownPreview(nextTabState?.markdownPreviewOpen ?? false);
    const toggleBookmarkSidebar = (state as {
      toggleBookmarkSidebar?: (open?: boolean) => void;
    }).toggleBookmarkSidebar;
    if (typeof toggleBookmarkSidebar === 'function') {
      toggleBookmarkSidebar(nextTabState?.bookmarkSidebarOpen ?? false);
    }
    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    tabPanelStateRef.current[activeTabId] = {
      sidebarOpen,
      outlineOpen,
      bookmarkSidebarOpen,
      markdownPreviewOpen,
    };
  }, [activeTabId, bookmarkSidebarOpen, markdownPreviewOpen, outlineOpen, sidebarOpen]);

  useEffect(() => {
    if (!activeFileTab || !outlineOpen) {
      return;
    }

    const outlineType = detectOutlineType(activeFileTab);
    if (outlineType) {
      return;
    }

    useStore.getState().toggleOutline(false);
    setOutlineData({
      outlineType: null,
      nodes: [],
      error: null,
    });
  }, [activeFileTab, outlineOpen, setOutlineData]);

  useEffect(() => {
    if (!outlineOpen || !activeFileTab) {
      return;
    }

    const outlineType = detectOutlineType(activeFileTab);
    if (!outlineType) {
      setOutlineData({
        outlineType: null,
        nodes: [],
        error: null,
      });
      return;
    }

    let cancelled = false;

    const refreshTree = async () => {
      try {
        const nodes = await loadOutline(activeFileTab, outlineType);
        if (cancelled) {
          return;
        }

        setOutlineData({
          outlineType,
          nodes,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const messageText = error instanceof Error ? error.message : String(error);
        setOutlineData({
          outlineType,
          nodes: [],
          error: messageText,
        });
      }
    };

    void refreshTree();

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId !== activeFileTab.id) {
        return;
      }

      void refreshTree();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [activeFileTab, outlineOpen, setOutlineData]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden" data-rutar-app-root="true">
      <TitleBar />
      <Toolbar onMarkdownPreviewToggleIntent={handleMarkdownPreviewToggleIntent} />
      <MarkdownToolbar />
      <Suspense fallback={null}>
        <SettingsModal />
        <TabCloseConfirmModal />
        <GoToLineModal />
        <SearchReplacePanel />
      </Suspense>

      <div className="flex-1 flex overflow-hidden relative">
        <Suspense fallback={null}>
          <Sidebar />
          <BookmarkSidebar />
          <OutlineSidebar
            nodes={outlineNodes}
            activeType={outlineType}
            parseError={outlineError}
          />
        </Suspense>

        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 flex overflow-hidden relative">
            <div className="min-w-0 flex-1 relative overflow-hidden" data-rutar-gesture-area="true">
              {activeTab ? (
                <Suspense fallback={editorFallback}>
                  {isDiffTab(activeTab) ? (
                    <DiffEditor key={activeTab.id} tab={activeTab} />
                  ) : (
                    <Editor tab={activeTab} />
                  )}
                </Suspense>
              ) : (
                editorFallback
              )}
            </div>
            <Suspense fallback={null}>
              <MarkdownPreviewPanel
                open={markdownPreviewOpen}
                tab={activeFileTab}
                animateOnOpen={animateMarkdownPreviewOnOpen}
              />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <StatusBar />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;
