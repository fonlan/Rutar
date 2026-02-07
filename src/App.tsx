import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { Editor } from '@/components/Editor';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { SearchReplacePanel } from '@/components/SearchReplacePanel';
import { FileTab, useStore, AppLanguage } from '@/store/useStore';
import { t } from '@/i18n';

let hasInitializedStartupTab = false;

interface AppConfig {
  language: AppLanguage;
  fontFamily: string;
  fontSize: number;
  wordWrap: boolean;
}

function App() {
  const { tabs = [], activeTabId = null, settings, updateSettings } = useStore();
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
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const config = await invoke<AppConfig>('load_config');

        if (cancelled) {
          return;
        }

        updateSettings({
          language: config.language === 'en-US' ? 'en-US' : 'zh-CN',
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
    if (!configReady) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void invoke('save_config', {
        config: {
          language: settings.language,
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
    settings.wordWrap,
  ]);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

    return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      <TitleBar />
      <Toolbar />
      <SettingsModal />
      <SearchReplacePanel />
      
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden relative bg-green-900/20">
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
