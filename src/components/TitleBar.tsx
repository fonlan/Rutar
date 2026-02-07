import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Pin, PinOff, Settings, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
    const alwaysOnTopTitle = isAlwaysOnTop ? 'Disable Always on Top' : 'Enable Always on Top';

    const handleMinimize = () => appWindow.minimize();
    const handleMaximize = () => appWindow.toggleMaximize();
    const handleClose = () => appWindow.close();

    useEffect(() => {
        let isMounted = true;

        const syncAlwaysOnTopState = async () => {
            try {
                const pinned = await appWindow.isAlwaysOnTop();
                if (isMounted) {
                    setIsAlwaysOnTop(pinned);
                }
            } catch (error) {
                console.error('Failed to query always on top state:', error);
            }
        };

        void syncAlwaysOnTopState();

        return () => {
            isMounted = false;
        };
    }, []);

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

    const handleToggleAlwaysOnTop = useCallback(async () => {
        const nextValue = !isAlwaysOnTop;

        try {
            await appWindow.setAlwaysOnTop(nextValue);
            setIsAlwaysOnTop(nextValue);
        } catch (error) {
            console.error('Failed to toggle always on top:', error);
        }
    }, [isAlwaysOnTop]);

    return (
        <div 
            className="flex h-9 w-full select-none items-stretch bg-background relative"
            data-tauri-drag-region
            data-layout-region="titlebar"
        >
            {/* Tabs Container */}
            <div className="flex-1 flex overflow-x-auto no-scrollbar overflow-y-hidden h-full relative z-10 pointer-events-none">
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border z-10" />
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "group flex items-center h-full min-w-[100px] max-w-[200px] px-3 border-x rounded-none cursor-pointer mr-1 relative overflow-visible bg-muted transition-colors pointer-events-auto z-0",
                            activeTabId === tab.id ? "bg-background border-border z-20" : "border-transparent hover:bg-muted/80"
                        )}
                    >
                        {activeTabId === tab.id && <div className="absolute -left-px -right-px top-0 h-[3px] bg-blue-500" />}
                        <span className="truncate flex-1 text-[11px] font-medium">{tab.name}{tab.isDirty && '*'}</span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleCloseTab(tab);
                            }}
                            className="ml-2 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded-none p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        
                    </div>
                ))}
            </div>

            {/* Window Controls */}
            <div className="flex items-center h-full bg-background border-b border-border relative z-20 px-1">
                <button
                    type="button"
                    onClick={() => void handleToggleAlwaysOnTop()}
                    className={cn(
                        'h-8 w-8 hover:bg-accent flex items-center justify-center rounded-md transition-colors',
                        isAlwaysOnTop && 'bg-accent text-accent-foreground'
                    )}
                    title={alwaysOnTopTitle}
                >
                    {isAlwaysOnTop ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
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
