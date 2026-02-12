import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { t } from '@/i18n';
import { openFilePaths } from '@/lib/openFile';
import { type MouseGestureAction, type MouseGestureBinding, sanitizeMouseGestures } from '@/lib/mouseGestures';
import { confirmTabClose, saveTab, type TabCloseDecision } from '@/lib/tabClose';
import { FileTab, useStore, AppLanguage, AppTheme, LineEnding } from '@/store/useStore';
import { MarkdownPreviewPanel } from '@/components/MarkdownPreviewPanel';
import { detectOutlineType, loadOutline } from '@/lib/outline';
import { addRecentFolderPath, sanitizeRecentPathList } from '@/lib/recentPaths';

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

function normalizeLineEnding(value?: string): LineEnding {
  if (value === 'CRLF' || value === 'LF' || value === 'CR') {
    return value;
  }

  return detectWindowsPlatform() ? 'CRLF' : 'LF';
}

interface AppConfig {
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  newFileLineEnding: LineEnding;
  wordWrap: boolean;
  doubleClickCloseTab: boolean;
  showLineNumbers: boolean;
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  rememberWindowState: boolean;
  recentFiles?: string[];
  recentFolders?: string[];
  windowsFileAssociationExtensions: string[];
  mouseGesturesEnabled?: boolean;
  mouseGestures?: MouseGestureBinding[];
}

interface WindowsFileAssociationStatus {
  enabled: boolean;
  extensions: string[];
}

const Editor = lazy(async () => ({
  default: (await import('@/components/Editor')).Editor,
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

function dispatchEditorForceRefresh(tabId: string, lineCount: number) {
  window.dispatchEvent(
    new CustomEvent('rutar:force-refresh', {
      detail: {
        tabId,
        lineCount,
        preserveCaret: false,
      },
    })
  );
}

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
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

function App() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const setFolder = useStore((state) => state.setFolder);
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const outlineOpen = useStore((state) => state.outlineOpen);
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const markdownPreviewOpen = useStore((state) => state.markdownPreviewOpen);
  const outlineType = useStore((state) => state.outlineType);
  const outlineNodes = useStore((state) => state.outlineNodes);
  const outlineError = useStore((state) => state.outlineError);
  const setOutlineData = useStore((state) => state.setOutlineData);
  const tabPanelStateRef = useRef<Record<string, {
    sidebarOpen: boolean;
    outlineOpen: boolean;
    bookmarkSidebarOpen: boolean;
    markdownPreviewOpen: boolean;
  }>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const externalChangeCheckingTabIdsRef = useRef<Set<string>>(new Set());
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
    let bulkDecision: Extract<TabCloseDecision, 'save_all' | 'discard_all'> | null = null;

    for (const tab of tabsToClose) {
      let decision: TabCloseDecision | null = bulkDecision;
      if (!decision) {
        decision = await confirmTabClose(tab, state.settings.language, true);
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
        state.updateSettings({ wordWrap: !state.settings.wordWrap });
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

    const snapshotTab = useStore
      .getState()
      .tabs
      .find((tab) => tab.id === tabId && !!tab.path);

    if (!snapshotTab || !snapshotTab.path) {
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
            dispatchEditorForceRefresh(latestTab.id, Math.max(1, fileInfo.lineCount));
          }

          dispatchDocumentUpdated(latestTab.id);
        } catch (error) {
          console.error(`Failed to reload changed file: ${latestTab.path}`, error);
        }

        return;
      }

      try {
        await invoke('acknowledge_external_file_change', { id: latestTab.id });
      } catch (error) {
        console.error(`Failed to acknowledge external change: ${latestTab.path}`, error);
      }
    } finally {
      externalChangeCheckingTabIdsRef.current.delete(snapshotTab.id);
    }
  }, []);

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
      }
    };

    void openStartupPaths();

    return () => {
      cancelled = true;
    };
  }, [openIncomingPaths]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const setupSingleInstanceOpenListener = async () => {
      try {
        const unsubscribe = await listen<string[]>('rutar://open-paths', async (event) => {
          const paths = Array.isArray(event.payload) ? event.payload : [];
          if (paths.length === 0) {
            return;
          }

          await openIncomingPaths(paths);
        });

        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to listen single-instance open event:', error);
      }
    };

    void setupSingleInstanceOpenListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [openIncomingPaths]);

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
          let bulkDecision: Extract<TabCloseDecision, 'save_all' | 'discard_all'> | null = null;

          for (const tab of dirtyTabs) {
            let decision: TabCloseDecision | null = bulkDecision;
            if (!decision) {
              decision = await confirmTabClose(tab, state.settings.language, true);
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
          newFileLineEnding: normalizeLineEnding(config.newFileLineEnding),
          wordWrap: !!config.wordWrap,
          doubleClickCloseTab: config.doubleClickCloseTab !== false,
          showLineNumbers: config.showLineNumbers !== false,
          highlightCurrentLine: config.highlightCurrentLine !== false,
          singleInstanceMode: config.singleInstanceMode !== false,
          rememberWindowState: config.rememberWindowState !== false,
          recentFiles: sanitizeRecentPathList(config.recentFiles),
          recentFolders: sanitizeRecentPathList(config.recentFolders),
          windowsFileAssociationExtensions: Array.isArray(config.windowsFileAssociationExtensions)
            ? config.windowsFileAssociationExtensions
            : [],
          mouseGesturesEnabled: config.mouseGesturesEnabled !== false,
          mouseGestures: sanitizeMouseGestures(config.mouseGestures),
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
          newFileLineEnding: settings.newFileLineEnding,
          wordWrap: settings.wordWrap,
          doubleClickCloseTab: settings.doubleClickCloseTab,
          showLineNumbers: settings.showLineNumbers,
          highlightCurrentLine: settings.highlightCurrentLine,
          singleInstanceMode: settings.singleInstanceMode,
          rememberWindowState: settings.rememberWindowState,
          recentFiles: settings.recentFiles,
          recentFolders: settings.recentFolders,
          windowsFileAssociationExtensions: settings.windowsFileAssociationExtensions,
          mouseGesturesEnabled: settings.mouseGesturesEnabled,
          mouseGestures: settings.mouseGestures,
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
    settings.newFileLineEnding,
    settings.language,
    settings.theme,
    settings.wordWrap,
    settings.doubleClickCloseTab,
    settings.showLineNumbers,
    settings.highlightCurrentLine,
    settings.singleInstanceMode,
    settings.rememberWindowState,
    settings.recentFiles,
    settings.recentFolders,
    settings.windowsFileAssociationExtensions,
    settings.mouseGesturesEnabled,
    settings.mouseGestures,
  ]);

  useEffect(() => {
    if (!settings.mouseGesturesEnabled) {
      return;
    }

    const gestureAreaSelector = '[data-rutar-app-root="true"]';
    const gestureByPattern = new Map<string, MouseGestureAction>();

    for (const binding of settings.mouseGestures) {
      if (!binding.pattern) {
        continue;
      }

      gestureByPattern.set(binding.pattern, binding.action);
    }

    if (gestureByPattern.size === 0) {
      return;
    }

    const state = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      trailLastX: 0,
      trailLastY: 0,
      sequence: '',
      movedEnough: false,
      suppressNextContextMenu: false,
      clearTrailTimer: null as number | null,
      clearPreviewTimer: null as number | null,
    };

    const directionThreshold = 18;
    const gestureDistanceThreshold = 6;
    const trailPointDistanceThreshold = 1.5;
    const finalizeDirectionThreshold = 8;

    const resolveGestureAction = (sequence: string): MouseGestureAction | undefined => {
      let candidate = sequence;

      while (candidate.length > 0) {
        const matched = gestureByPattern.get(candidate);
        if (matched) {
          return matched;
        }

        candidate = candidate.slice(0, -1);
      }

      return undefined;
    };

    const trailCanvas = document.createElement('canvas');
    trailCanvas.style.position = 'fixed';
    trailCanvas.style.left = '0';
    trailCanvas.style.top = '0';
    trailCanvas.style.width = '100vw';
    trailCanvas.style.height = '100vh';
    trailCanvas.style.pointerEvents = 'none';
    trailCanvas.style.zIndex = '9999';
    trailCanvas.style.opacity = '1';

    const trailContext = trailCanvas.getContext('2d');

    const syncTrailCanvasSize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      trailCanvas.width = Math.floor(window.innerWidth * dpr);
      trailCanvas.height = Math.floor(window.innerHeight * dpr);

      if (trailContext) {
        trailContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        trailContext.lineCap = 'round';
        trailContext.lineJoin = 'round';
        trailContext.lineWidth = 2.5;
        trailContext.strokeStyle = document.documentElement.classList.contains('dark')
          ? 'rgba(96, 165, 250, 0.95)'
          : 'rgba(37, 99, 235, 0.9)';
      }
    };

    const clearTrail = () => {
      if (!trailContext) {
        return;
      }

      trailContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const scheduleTrailClear = () => {
      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
      }

      state.clearTrailTimer = window.setTimeout(() => {
        clearTrail();
        state.clearTrailTimer = null;
      }, 180);
    };

    const clearGesturePreview = () => {
      dispatchGesturePreview('');
    };

    const scheduleGesturePreviewClear = () => {
      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
      }

      state.clearPreviewTimer = window.setTimeout(() => {
        clearGesturePreview();
        state.clearPreviewTimer = null;
      }, 180);
    };

    const drawTrailSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!trailContext) {
        return;
      }

      trailContext.beginPath();
      trailContext.moveTo(fromX, fromY);
      trailContext.lineTo(toX, toY);
      trailContext.stroke();
    };

    syncTrailCanvasSize();
    document.body.appendChild(trailCanvas);

    const reset = () => {
      state.active = false;
      state.pointerId = -1;
      state.startX = 0;
      state.startY = 0;
      state.lastX = 0;
      state.lastY = 0;
      state.trailLastX = 0;
      state.trailLastY = 0;
      state.sequence = '';
      state.movedEnough = false;
    };

    const appendDirection = (dx: number, dy: number, threshold: number) => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < threshold && absDy < threshold) {
        return false;
      }

      const direction = absDx >= absDy ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      if (!state.sequence.endsWith(direction)) {
        state.sequence += direction;
        dispatchGesturePreview(state.sequence);
      }

      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const pointerType = event.pointerType?.toLowerCase();
      if (pointerType && pointerType !== 'mouse') {
        return;
      }

      if (event.button !== 2 && (event.buttons & 2) !== 2) {
        return;
      }

      const target = event.target instanceof Element
        ? event.target
        : event.composedPath().find((entry) => entry instanceof Element) as Element | undefined;
      if (!target?.closest(gestureAreaSelector)) {
        return;
      }

      state.active = true;
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.trailLastX = event.clientX;
      state.trailLastY = event.clientY;
      state.sequence = '';
      state.movedEnough = false;
      clearGesturePreview();

      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
        state.clearTrailTimer = null;
      }

      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
        state.clearPreviewTimer = null;
      }

      clearTrail();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      const trailDx = event.clientX - state.trailLastX;
      const trailDy = event.clientY - state.trailLastY;
      if (Math.hypot(trailDx, trailDy) >= trailPointDistanceThreshold) {
        drawTrailSegment(state.trailLastX, state.trailLastY, event.clientX, event.clientY);
        state.trailLastX = event.clientX;
        state.trailLastY = event.clientY;
      }

      const totalDx = event.clientX - state.startX;
      const totalDy = event.clientY - state.startY;
      if (!state.movedEnough && Math.hypot(totalDx, totalDy) >= gestureDistanceThreshold) {
        state.movedEnough = true;
      }

      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;

      if (appendDirection(dx, dy, directionThreshold)) {
        state.lastX = event.clientX;
        state.lastY = event.clientY;
      }
    };

    const finalizeGesture = (clientX: number, clientY: number) => {
      appendDirection(clientX - state.lastX, clientY - state.lastY, finalizeDirectionThreshold);

      const pattern = state.sequence;
      const wasGestureAttempt = state.movedEnough || pattern.length > 0;
      const action = pattern ? resolveGestureAction(pattern) : undefined;

      if (action) {
        state.suppressNextContextMenu = true;
        executeMouseGestureAction(action);
      } else if (wasGestureAttempt) {
        state.suppressNextContextMenu = true;
      }

      scheduleTrailClear();

      if (pattern.length > 0) {
        scheduleGesturePreviewClear();
      } else {
        clearGesturePreview();
      }

      reset();

      return {
        actionMatched: !!action,
        wasGestureAttempt,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      const { actionMatched, wasGestureAttempt } = finalizeGesture(event.clientX, event.clientY);
      if (actionMatched || wasGestureAttempt) {
        event.preventDefault();
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      scheduleTrailClear();
      clearGesturePreview();
      reset();
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (state.active) {
        const { actionMatched, wasGestureAttempt } = finalizeGesture(event.clientX, event.clientY);
        if (actionMatched || wasGestureAttempt || state.suppressNextContextMenu) {
          state.suppressNextContextMenu = false;
          event.preventDefault();
        }
        return;
      }

      if (!state.suppressNextContextMenu) {
        return;
      }

      state.suppressNextContextMenu = false;
      event.preventDefault();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('resize', syncTrailCanvasSize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('resize', syncTrailCanvasSize);

      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
      }

      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
      }

      clearGesturePreview();

      trailCanvas.remove();
    };
  }, [executeMouseGestureAction, settings.mouseGestures, settings.mouseGesturesEnabled]);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const editorFallback = <div className="h-full w-full bg-background" aria-hidden="true" />;

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
      previousActiveTabIdRef.current = null;
      return;
    }

    const state = useStore.getState();
    const nextTabState = tabPanelStateRef.current[activeTabId];
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
    if (!activeTab || !outlineOpen) {
      return;
    }

    const outlineType = detectOutlineType(activeTab);
    if (outlineType) {
      return;
    }

    useStore.getState().toggleOutline(false);
    setOutlineData({
      outlineType: null,
      nodes: [],
      error: null,
    });
  }, [activeTab, outlineOpen, setOutlineData]);

  useEffect(() => {
    if (!outlineOpen || !activeTab) {
      return;
    }

    const outlineType = detectOutlineType(activeTab);
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
        const nodes = await loadOutline(activeTab, outlineType);
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
      if (customEvent.detail?.tabId !== activeTab.id) {
        return;
      }

      void refreshTree();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [activeTab, outlineOpen, setOutlineData]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden" data-rutar-app-root="true">
      <TitleBar />
      <Toolbar />
      <Suspense fallback={null}>
        <SettingsModal />
        <TabCloseConfirmModal />
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
                  <Editor key={activeTab.id} tab={activeTab} />
                </Suspense>
              ) : (
                editorFallback
              )}
            </div>
            <MarkdownPreviewPanel open={markdownPreviewOpen} tab={activeTab ?? null} />
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
