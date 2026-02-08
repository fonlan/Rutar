import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Pin, PinOff, Settings, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import { FileTab, useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { confirmTabClose, saveTab, type TabCloseDecision } from '@/lib/tabClose';

const appWindow = getCurrentWindow();

interface TabContextMenuState {
    tabId: string;
    x: number;
    y: number;
}

function getParentDirectoryPath(filePath: string): string | null {
    const normalizedPath = filePath.trim();

    if (!normalizedPath) {
        return null;
    }

    const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));

    if (separatorIndex < 0) {
        return null;
    }

    if (separatorIndex === 0) {
        return normalizedPath[0];
    }

    if (separatorIndex === 2 && /^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
        return normalizedPath.slice(0, 3);
    }

    return normalizedPath.slice(0, separatorIndex);
}

export function TitleBar() {
    const tabs = useStore((state) => state.tabs);
    const activeTabId = useStore((state) => state.activeTabId);
    const setActiveTab = useStore((state) => state.setActiveTab);
    const closeTab = useStore((state) => state.closeTab);
    const updateTab = useStore((state) => state.updateTab);
    const toggleSettings = useStore((state) => state.toggleSettings);
    const addTab = useStore((state) => state.addTab);
    const settings = useStore((state) => state.settings);
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
    const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState | null>(null);
    const tabContextMenuRef = useRef<HTMLDivElement>(null);
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
    const alwaysOnTopTitle = isAlwaysOnTop ? 'Disable Always on Top' : 'Enable Always on Top';
    const contextMenuTab = tabContextMenu
        ? tabs.find((tab) => tab.id === tabContextMenu.tabId) ?? null
        : null;
    const contextMenuTabDirectory = contextMenuTab?.path
        ? getParentDirectoryPath(contextMenuTab.path)
        : null;

    const copyToClipboard = useCallback(async (text: string) => {
        if (!navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.error('Failed to write clipboard text:', error);
        }
    }, []);

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

    const closeTabs = useCallback(
        async (tabsToClose: FileTab[], allowAllActions: boolean) => {
            if (tabsToClose.length === 0) {
                return;
            }

            const closableTabs: FileTab[] = [];
            let bulkDecision: Extract<TabCloseDecision, 'save_all' | 'discard_all'> | null = null;
            for (const tab of tabsToClose) {
                let decision: TabCloseDecision | null = bulkDecision;

                if (!decision) {
                    decision = await confirmTabClose(tab, settings.language, allowAllActions);
                }

                if (decision === 'cancel') {
                    return;
                }

                if (decision === 'save_all' || decision === 'discard_all') {
                    bulkDecision = decision;
                }

                if (decision === 'save' || decision === 'save_all') {
                    try {
                        const saved = await saveTab(tab, updateTab);
                        if (!saved) {
                            return;
                        }
                    } catch (error) {
                        console.error('Failed to save file before closing tab:', error);
                        return;
                    }
                }

                closableTabs.push(tab);
            }

            if (closableTabs.length === 0) {
                return;
            }

            const tabIds = closableTabs.map((tab) => tab.id);

            tabIds.forEach((id) => closeTab(id));

            const closeResults = await Promise.allSettled(
                tabIds.map((id) => invoke('close_file', { id }))
            );

            closeResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error('Failed to close tab ' + tabIds[index] + ':', result.reason);
                }
            });
        },
        [closeTab, settings.language, updateTab]
    );

    const handleCloseTab = useCallback(async (tab: FileTab) => {
        const shouldCreateBlankTab = tabs.length === 1;

        try {
            await closeTabs([tab], false);

            if (shouldCreateBlankTab && useStore.getState().tabs.length === 0) {
                const fileInfo = await invoke<FileTab>('new_file');
                addTab(fileInfo);
            }
        } catch (error) {
            console.error('Failed to close tab:', error);
        }
    }, [addTab, closeTabs, tabs.length]);

    const handleTabDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>, tab: FileTab) => {
        event.preventDefault();
        event.stopPropagation();

        if (!settings.doubleClickCloseTab) {
            return;
        }

        void handleCloseTab(tab);
    }, [handleCloseTab, settings.doubleClickCloseTab]);

    const handleCloseOtherTabs = useCallback(async (tab: FileTab) => {
        const tabsToClose = tabs
            .filter((currentTab) => currentTab.id !== tab.id);

        if (tabsToClose.length === 0) {
            return;
        }

        setActiveTab(tab.id);
        await closeTabs(tabsToClose, true);
        setActiveTab(tab.id);
    }, [closeTabs, setActiveTab, tabs]);

    const handleCloseAllTabs = useCallback(async () => {
        const tabsToClose = tabs;

        if (tabsToClose.length === 0) {
            return;
        }

        await closeTabs(tabsToClose, true);

        if (useStore.getState().tabs.length > 0) {
            return;
        }

        try {
            const fileInfo = await invoke<FileTab>('new_file');
            addTab(fileInfo);
        } catch (error) {
            console.error('Failed to create tab after closing all tabs:', error);
        }
    }, [addTab, closeTabs, tabs]);

    const handleTabContextMenu = useCallback((event: MouseEvent<HTMLDivElement>, tab: FileTab) => {
        event.preventDefault();
        event.stopPropagation();

        const menuWidth = 176;
        const menuHeight = 212;
        const viewportPadding = 8;

        const boundedX = Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding);
        const boundedY = Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding);

        setActiveTab(tab.id);
        setTabContextMenu({
            tabId: tab.id,
            x: Math.max(viewportPadding, boundedX),
            y: Math.max(viewportPadding, boundedY),
        });
    }, [setActiveTab]);

    const handleToggleAlwaysOnTop = useCallback(async () => {
        const nextValue = !isAlwaysOnTop;

        try {
            await appWindow.setAlwaysOnTop(nextValue);
            setIsAlwaysOnTop(nextValue);
        } catch (error) {
            console.error('Failed to toggle always on top:', error);
        }
    }, [isAlwaysOnTop]);

    const handleTabsWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
        const tabsContainer = event.currentTarget;
        const maxScrollLeft = tabsContainer.scrollWidth - tabsContainer.clientWidth;

        if (maxScrollLeft <= 0) {
            return;
        }

        const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

        if (dominantDelta === 0) {
            return;
        }

        let normalizedDelta = dominantDelta;

        if (event.deltaMode === 1) {
            normalizedDelta *= 16;
        } else if (event.deltaMode === 2) {
            normalizedDelta *= tabsContainer.clientWidth;
        }

        event.preventDefault();
        tabsContainer.scrollLeft = Math.max(0, Math.min(maxScrollLeft, tabsContainer.scrollLeft + normalizedDelta));
    }, []);

    useEffect(() => {
        if (!tabContextMenu) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;

            if (tabContextMenuRef.current && target && !tabContextMenuRef.current.contains(target)) {
                setTabContextMenu(null);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setTabContextMenu(null);
            }
        };

        const handleWindowBlur = () => {
            setTabContextMenu(null);
        };

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [tabContextMenu]);

    useEffect(() => {
        if (!tabContextMenu) {
            return;
        }

        if (!tabs.some((tab) => tab.id === tabContextMenu.tabId)) {
            setTabContextMenu(null);
        }
    }, [tabContextMenu, tabs]);

    return (
        <div
            className="flex h-9 w-full select-none items-stretch bg-background relative"
            data-tauri-drag-region
            data-layout-region="titlebar"
        >
            {/* Tabs Container */}
            <div
                onWheel={handleTabsWheel}
                data-tauri-drag-region
                className="flex-1 flex overflow-x-auto no-scrollbar overflow-y-hidden h-full relative z-10"
            >
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border z-10" />
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        data-tauri-drag-region
                        onClick={() => setActiveTab(tab.id)}
                        onDoubleClick={(event) => handleTabDoubleClick(event, tab)}
                        onContextMenu={(event) => handleTabContextMenu(event, tab)}
                        className={cn(
                            "group flex items-center h-full min-w-[100px] max-w-[200px] px-3 border-x rounded-none cursor-pointer mr-1 relative overflow-visible bg-muted transition-colors pointer-events-auto z-0",
                            activeTabId === tab.id ? "bg-background border-border z-20" : "border-transparent hover:bg-muted/80"
                        )}
                    >
                        {activeTabId === tab.id && <div className="absolute -left-px -right-px top-0 h-[3px] bg-blue-500" />}
                        <span className="truncate flex-1 text-[11px] font-medium">{tab.name}{tab.isDirty && '*'}</span>
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.stopPropagation();
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                            }}
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

            {tabContextMenu && (
                <div
                    ref={tabContextMenuRef}
                    className="fixed z-[80] min-w-44 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
                    style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
                >
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                            const fileName = contextMenuTab?.name;
                            setTabContextMenu(null);

                            if (!fileName) {
                                return;
                            }

                            void copyToClipboard(fileName);
                        }}
                    >
                        {tr('titleBar.copyFileName')}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setTabContextMenu(null);

                            if (!contextMenuTabDirectory) {
                                return;
                            }

                            void copyToClipboard(contextMenuTabDirectory);
                        }}
                        disabled={!contextMenuTabDirectory}
                    >
                        {tr('titleBar.copyDirectory')}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            const filePath = contextMenuTab?.path;
                            setTabContextMenu(null);

                            if (!filePath) {
                                return;
                            }

                            void copyToClipboard(filePath);
                        }}
                        disabled={!contextMenuTab?.path}
                    >
                        {tr('titleBar.copyPath')}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            const filePath = contextMenuTab?.path;
                            setTabContextMenu(null);

                            if (!filePath) {
                                return;
                            }

                            void invoke('open_in_file_manager', { path: filePath }).catch((error) => {
                                console.error('Failed to open file directory:', error);
                            });
                        }}
                        disabled={!contextMenuTab?.path}
                    >
                        {tr('titleBar.openContainingFolder')}
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setTabContextMenu(null);
                            if (!contextMenuTab) {
                                return;
                            }
                            void handleCloseOtherTabs(contextMenuTab);
                        }}
                        disabled={tabs.length <= 1}
                    >
                        {tr('titleBar.closeOtherTabs')}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                            setTabContextMenu(null);
                            void handleCloseAllTabs();
                        }}
                    >
                        {tr('titleBar.closeAllTabs')}
                    </button>
                </div>
            )}

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
    );
}
