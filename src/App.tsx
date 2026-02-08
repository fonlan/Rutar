import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { Editor } from '@/components/Editor';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { ContentTreeSidebar } from '@/components/ContentTreeSidebar';
import { BookmarkSidebar } from '@/components/BookmarkSidebar';
import { StatusBar } from '@/components/StatusBar';
import { SearchReplacePanel } from '@/components/SearchReplacePanel';
import { TabCloseConfirmModal } from '@/components/TabCloseConfirmModal';
import { openFilePaths } from '@/lib/openFile';
import { confirmTabClose, saveTab, type TabCloseDecision } from '@/lib/tabClose';
import { FileTab, useStore, AppLanguage, AppTheme } from '@/store/useStore';
import { t } from '@/i18n';
import { detectContentTreeType, loadContentTree } from '@/lib/contentTree';

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

interface AppConfig {
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  wordWrap: boolean;
  doubleClickCloseTab: boolean;
  highlightCurrentLine: boolean;
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
  const contentTreeOpen = useStore((state) => state.contentTreeOpen);
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const contentTreeType = useStore((state) => state.contentTreeType);
  const contentTreeNodes = useStore((state) => state.contentTreeNodes);
  const contentTreeError = useStore((state) => state.contentTreeError);
  const setContentTreeData = useStore((state) => state.setContentTreeData);
  const tabPanelStateRef = useRef<Record<string, {
    sidebarOpen: boolean;
    contentTreeOpen: boolean;
    bookmarkSidebarOpen: boolean;
  }>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const isWindows = detectWindowsPlatform();

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

        for (const startupPath of startupPaths) {
          if (cancelled) {
            return;
          }

          try {
            const entries = await invoke<any[]>('read_dir', { path: startupPath });
            if (cancelled) {
              return;
            }

            sortFolderEntries(entries);
            setFolder(startupPath, entries);
            continue;
          } catch {
          }

          try {
            await openFilePaths([startupPath]);
          } catch (error) {
            console.error(`Failed to open startup path: ${startupPath}`, error);
          }
        }
      } catch (error) {
        console.error('Failed to load startup paths:', error);
      }
    };

    void openStartupPaths();

    return () => {
      cancelled = true;
    };
  }, [setFolder]);

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
        const fileInfo = await invoke<FileTab>('new_file');
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
          wordWrap: !!config.wordWrap,
          doubleClickCloseTab: config.doubleClickCloseTab !== false,
          highlightCurrentLine: config.highlightCurrentLine !== false,
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
          wordWrap: settings.wordWrap,
          doubleClickCloseTab: settings.doubleClickCloseTab,
          highlightCurrentLine: settings.highlightCurrentLine,
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
    settings.language,
    settings.theme,
    settings.wordWrap,
    settings.doubleClickCloseTab,
    settings.highlightCurrentLine,
    settings.windowsFileAssociationExtensions,
  ]);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;
    if (previousTabId) {
      tabPanelStateRef.current[previousTabId] = {
        sidebarOpen,
        contentTreeOpen,
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
    state.toggleContentTree(nextTabState?.contentTreeOpen ?? false);
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
      contentTreeOpen,
      bookmarkSidebarOpen,
    };
  }, [activeTabId, bookmarkSidebarOpen, contentTreeOpen, sidebarOpen]);

  useEffect(() => {
    if (!activeTab || !contentTreeOpen) {
      return;
    }

    const treeType = detectContentTreeType(activeTab);
    if (treeType) {
      return;
    }

    useStore.getState().toggleContentTree(false);
    setContentTreeData({
      treeType: null,
      nodes: [],
      error: null,
    });
  }, [activeTab, contentTreeOpen, setContentTreeData]);

  useEffect(() => {
    if (!contentTreeOpen || !activeTab) {
      return;
    }

    const treeType = detectContentTreeType(activeTab);
    if (!treeType) {
      setContentTreeData({
        treeType: null,
        nodes: [],
        error: null,
      });
      return;
    }

    let cancelled = false;

    const refreshTree = async () => {
      try {
        const nodes = await loadContentTree(activeTab, treeType);
        if (cancelled) {
          return;
        }

        setContentTreeData({
          treeType,
          nodes,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const messageText = error instanceof Error ? error.message : String(error);
        setContentTreeData({
          treeType,
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
  }, [activeTab, contentTreeOpen, setContentTreeData]);

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
        <ContentTreeSidebar
          nodes={contentTreeNodes}
          activeType={contentTreeType}
          parseError={contentTreeError}
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
