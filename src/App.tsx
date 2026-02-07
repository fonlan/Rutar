import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { Editor } from '@/components/Editor';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { ContentTreeSidebar } from '@/components/ContentTreeSidebar';
import { StatusBar } from '@/components/StatusBar';
import { SearchReplacePanel } from '@/components/SearchReplacePanel';
import { openFilePaths } from '@/lib/openFile';
import { FileTab, useStore, AppLanguage, AppTheme } from '@/store/useStore';
import { t } from '@/i18n';
import { detectContentTreeType, loadContentTree } from '@/lib/contentTree';

let hasInitializedStartupTab = false;

interface AppConfig {
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  wordWrap: boolean;
}

function App() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const contentTreeOpen = useStore((state) => state.contentTreeOpen);
  const contentTreeType = useStore((state) => state.contentTreeType);
  const contentTreeNodes = useStore((state) => state.contentTreeNodes);
  const contentTreeError = useStore((state) => state.contentTreeError);
  const setContentTreeData = useStore((state) => state.setContentTreeData);
  const [configReady, setConfigReady] = useState(false);

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
          wordWrap: !!config.wordWrap,
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
          wordWrap: settings.wordWrap,
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
    settings.language,
    settings.theme,
    settings.wordWrap,
  ]);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

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
      <SearchReplacePanel />
      
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
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
