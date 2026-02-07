import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Toolbar } from '@/components/Toolbar';
import { Editor } from '@/components/Editor';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { SearchReplacePanel } from '@/components/SearchReplacePanel';
import { FileTab, useStore } from '@/store/useStore';

let hasInitializedStartupTab = false;

function App() {
  const { tabs = [], activeTabId = null } = useStore();

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
  
  const activeTab = tabs.find(t => t.id === activeTabId);

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
                    READY: Open a file or folder
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
