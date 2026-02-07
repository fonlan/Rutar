import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Settings } from 'lucide-react';
import { useCallback } from 'react';
import { FileTab, useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

const appWindow = getCurrentWindow();

export function TitleBar() {
    const tabs = useStore((state) => state.tabs);
    const activeTabId = useStore((state) => state.activeTabId);
    const setActiveTab = useStore((state) => state.setActiveTab);
    const closeTab = useStore((state) => state.closeTab);
    const toggleSettings = useStore((state) => state.toggleSettings);
    const addTab = useStore((state) => state.addTab);
    const settings = useStore((state) => state.settings);
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

    const handleMinimize = () => appWindow.minimize();
    const handleMaximize = () => appWindow.toggleMaximize();
    const handleClose = () => appWindow.close();

    const handleCloseTab = useCallback(async (tab: FileTab) => {
        const shouldCreateBlankTab = tabs.length === 1;

        closeTab(tab.id);

        try {
            await invoke('close_file', { id: tab.id });

            if (shouldCreateBlankTab) {
                const fileInfo = await invoke<FileTab>('new_file');
                addTab(fileInfo);
            }
        } catch (error) {
            console.error('Failed to close tab:', error);
        }
    }, [addTab, closeTab, tabs.length]);

    return (
        <div 
            className="flex h-9 w-full select-none items-center bg-background border-b relative"
            data-tauri-drag-region
            data-layout-region="titlebar"
        >
            {/* Tabs Container */}
            <div className="flex-1 flex overflow-x-auto no-scrollbar overflow-y-hidden h-full items-end pl-1 relative z-10 pointer-events-none">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "group flex items-center h-[calc(100%-2px)] min-w-[100px] max-w-[200px] px-3 border-t border-x rounded-t-sm cursor-pointer mr-1 relative overflow-hidden bg-muted transition-colors pointer-events-auto",
                            activeTabId === tab.id ? "bg-background border-border" : "border-transparent hover:bg-muted/80"
                        )}
                    >
                        {activeTabId === tab.id && <div className="absolute left-0 right-0 top-0 h-[3px] bg-blue-500" />}
                        <span className="truncate flex-1 text-[11px] font-medium">{tab.name}{tab.isDirty && '*'}</span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleCloseTab(tab);
                            }}
                            className="ml-2 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        
                        {activeTabId === tab.id && <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-background" />}
                    </div>
                ))}
            </div>

            {/* Window Controls */}
            <div className="flex items-center h-full bg-background relative z-20 px-1">
                <button 
                    type="button"
                    onClick={() => toggleSettings(true)}
                    className="h-8 w-8 hover:bg-accent flex items-center justify-center rounded-md transition-colors" 
                    title={tr('titleBar.settings')}
                >
                    <Settings className="w-4 h-4" />
                </button>
                <div className="w-[1px] h-4 bg-border mx-1"></div>
                <button 
                    type="button"
                    onClick={handleMinimize} 
                    className="h-8 w-8 hover:bg-accent flex items-center justify-center rounded-md transition-colors"
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button 
                    type="button"
                    onClick={handleMaximize} 
                    className="h-8 w-8 hover:bg-accent flex items-center justify-center rounded-md transition-colors"
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
                <button 
                    type="button"
                    onClick={handleClose} 
                    className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center rounded-md transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
