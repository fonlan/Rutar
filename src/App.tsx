import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { Editor } from '@/components/Editor';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { OutlineSidebar } from '@/components/OutlineSidebar';
import { BookmarkSidebar } from '@/components/BookmarkSidebar';
import { StatusBar } from '@/components/StatusBar';
import { SearchReplacePanel } from '@/components/SearchReplacePanel';
import { TabCloseConfirmModal } from '@/components/TabCloseConfirmModal';
import { openFilePaths } from '@/lib/openFile';
import { confirmTabClose, saveTab, type TabCloseDecision } from '@/lib/tabClose';
import { FileTab, useStore, AppLanguage, AppTheme, LineEnding } from '@/store/useStore';
import { t } from '@/i18n';
import { detectOutlineType, loadOutline } from '@/lib/outline';
import { addRecentFolderPath, sanitizeRecentPathList } from '@/lib/recentPaths';

let hasInitializedStartupTab = false;

function sortFolderEntries(entries: any[]) {
  entries.sort((a, b) => {
    if (a.is_dir === b.is_dir) {
      return a.name.localeCompare(b.name);
    }

    return a.is_dir ? -1 : 1;
  });
}

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
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  recentFiles?: string[];
  recentFolders?: string[];
  windowsFileAssociationExtensions: string[];
}

interface WindowsFileAssociationStatus {
  enabled: boolean;
  extensions: string[];
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
  const outlineType = useStore((state) => state.outlineType);
  const outlineNodes = useStore((state) => state.outlineNodes);
  const outlineError = useStore((state) => state.outlineError);
  const setOutlineData = useStore((state) => state.setOutlineData);
  const tabPanelStateRef = useRef<Record<string, {
    sidebarOpen: boolean;
    outlineOpen: boolean;
    bookmarkSidebarOpen: boolean;
  }>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const isWindows = detectWindowsPlatform();

  const openIncomingPaths = useCallback(async (paths: string[]) => {
    for (const incomingPath of paths) {
      try {
        const entries = await invoke<any[]>('read_dir', { path: incomingPath });
        sortFolderEntries(entries);
        setFolder(incomingPath, entries);
        addRecentFolderPath(incomingPath);
        continue;
      } catch {
      }

      try {
        await openFilePaths([incomingPath]);
      } catch (error) {
        console.error(`Failed to open incoming path: ${incomingPath}`, error);
      }
    }
  }, [setFolder]);

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

    const preventDefaultDrop = (event: DragEvent) => {
      event.preventDefault();
    };

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

    window.addEventListener('dragover', preventDefaultDrop);
    window.addEventListener('drop', preventDefaultDrop);
    void setupDragDrop();

    return () => {
      disposed = true;
      window.removeEventListener('dragover', preventDefaultDrop);
      window.removeEventListener('drop', preventDefaultDrop);
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

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
          highlightCurrentLine: config.highlightCurrentLine !== false,
          singleInstanceMode: config.singleInstanceMode !== false,
          recentFiles: sanitizeRecentPathList(config.recentFiles),
          recentFolders: sanitizeRecentPathList(config.recentFolders),
          windowsFileAssociationExtensions: Array.isArray(config.windowsFileAssociationExtensions)
            ? config.windowsFileAssociationExtensions
            : [],
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
          highlightCurrentLine: settings.highlightCurrentLine,
          singleInstanceMode: settings.singleInstanceMode,
          recentFiles: settings.recentFiles,
          recentFolders: settings.recentFolders,
          windowsFileAssociationExtensions: settings.windowsFileAssociationExtensions,
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
    settings.highlightCurrentLine,
    settings.singleInstanceMode,
    settings.recentFiles,
    settings.recentFolders,
    settings.windowsFileAssociationExtensions,
  ]);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;
    if (previousTabId) {
      tabPanelStateRef.current[previousTabId] = {
        sidebarOpen,
        outlineOpen,
        bookmarkSidebarOpen,
      };
    }

    if (!activeTabId) {
      previousActiveTabIdRef.current = null;
      return;
    }

    const state = useStore.getState();
    const nextTabState = tabPanelStateRef.current[activeTabId];
    state.toggleSidebar(nextTabState?.sidebarOpen ?? false);
    state.toggleOutline(nextTabState?.outlineOpen ?? false);
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
    };
  }, [activeTabId, bookmarkSidebarOpen, outlineOpen, sidebarOpen]);

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
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      <TitleBar />
      <Toolbar />
      <SettingsModal />
      <TabCloseConfirmModal />
      <SearchReplacePanel />
      
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        <BookmarkSidebar />
        <OutlineSidebar
          nodes={outlineNodes}
          activeType={outlineType}
          parseError={outlineError}
        />
        
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative overflow-hidden">
            {activeTab ? (
                <Editor key={activeTab.id} tab={activeTab} />
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground select-none text-sm">
                    {tr('app.readyOpenHint')}
                </div>
            )}
          </div>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}

export default App;
