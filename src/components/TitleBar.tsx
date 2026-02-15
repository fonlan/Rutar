import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    Braces,
    FileCode2,
    FileJson,
    FileText,
    Minus,
    Pin,
    PinOff,
    LoaderCircle,
    Settings,
    Square,
    Terminal,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent,
} from 'react';
import { FileTab, type SyntaxKey, useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { confirmTabClose, saveTab, type TabCloseDecision } from '@/lib/tabClose';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';

const appWindow = getCurrentWindow();
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

interface TabContextMenuState {
    tabId: string;
    x: number;
    y: number;
}

interface TabPathTooltipState {
    text: string;
    x: number;
    topY: number;
    bottomY: number;
    placement: 'top' | 'bottom';
}

interface TabFileIconConfig {
    Icon: LucideIcon;
    className: string;
}

interface PendingOpenTab {
    id: string;
    path: string;
    name: string;
}

interface FileOpenLoadingEventDetail {
    path: string;
    tabId: string;
    status: 'start' | 'end';
}

interface LineDiffComparisonResult {
    alignedSourceLines: string[];
    alignedTargetLines: string[];
    alignedSourcePresent: boolean[];
    alignedTargetPresent: boolean[];
    diffLineNumbers: number[];
    sourceDiffLineNumbers: number[];
    targetDiffLineNumbers: number[];
    sourceLineCount: number;
    targetLineCount: number;
    alignedLineCount: number;
}

const defaultTabFileIconConfig: TabFileIconConfig = {
    Icon: FileText,
    className: 'text-muted-foreground',
};

const tabFileIconConfigBySyntaxKey: Partial<Record<SyntaxKey, TabFileIconConfig>> = {
    javascript: { Icon: FileCode2, className: 'text-yellow-500' },
    typescript: { Icon: FileCode2, className: 'text-blue-500' },
    rust: { Icon: FileCode2, className: 'text-orange-500' },
    python: { Icon: FileCode2, className: 'text-sky-500' },
    json: { Icon: FileJson, className: 'text-amber-500' },
    ini: { Icon: Braces, className: 'text-amber-600' },
    html: { Icon: FileCode2, className: 'text-orange-500' },
    css: { Icon: FileCode2, className: 'text-pink-500' },
    bash: { Icon: Terminal, className: 'text-green-500' },
    toml: { Icon: Braces, className: 'text-slate-500' },
    yaml: { Icon: Braces, className: 'text-purple-500' },
    xml: { Icon: Braces, className: 'text-teal-500' },
    c: { Icon: FileCode2, className: 'text-blue-500' },
    cpp: { Icon: FileCode2, className: 'text-indigo-500' },
    go: { Icon: FileCode2, className: 'text-cyan-500' },
    java: { Icon: FileCode2, className: 'text-red-500' },
    csharp: { Icon: FileCode2, className: 'text-violet-500' },
    php: { Icon: FileCode2, className: 'text-indigo-400' },
    kotlin: { Icon: FileCode2, className: 'text-fuchsia-500' },
    swift: { Icon: FileCode2, className: 'text-orange-500' },
};

function getTabFileIconConfig(tab: Pick<FileTab, 'name' | 'path' | 'syntaxOverride'>): TabFileIconConfig {
    const syntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
    return tabFileIconConfigBySyntaxKey[syntaxKey] ?? defaultTabFileIconConfig;
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

function pathBaseName(path: string) {
    const normalizedPath = path.trim().replace(/[\\/]+$/, '');
    const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
    return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

function isRegularFileTab(tab?: FileTab | null): tab is FileTab {
    return !!tab && tab.tabType !== 'diff';
}

export function TitleBar() {
    const isReleaseBuild = import.meta.env.PROD;
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
    const [tabPathTooltip, setTabPathTooltip] = useState<TabPathTooltipState | null>(null);
    const [compareSourceTabId, setCompareSourceTabId] = useState<string | null>(null);
    const [pendingOpenTabs, setPendingOpenTabs] = useState<PendingOpenTab[]>([]);
    const tabContextMenuRef = useRef<HTMLDivElement>(null);
    const tabPathTooltipRef = useRef<HTMLDivElement>(null);
    const tabDragStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
    const suppressNextTabClickRef = useRef(false);
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
    const alwaysOnTopTitle = isAlwaysOnTop
        ? tr('titleBar.disableAlwaysOnTop')
        : tr('titleBar.enableAlwaysOnTop');
    const contextMenuTab = tabContextMenu
        ? tabs.find((tab) => tab.id === tabContextMenu.tabId) ?? null
        : null;
    const contextMenuTabDirectory = contextMenuTab?.path
        ? getParentDirectoryPath(contextMenuTab.path)
        : null;
    const compareSourceTab = compareSourceTabId
        ? tabs.find((tab) => tab.id === compareSourceTabId) ?? null
        : null;
    const canSetCompareSource = isRegularFileTab(contextMenuTab);
    const canCompareWithSelectedSource =
        isRegularFileTab(contextMenuTab)
        && isRegularFileTab(compareSourceTab)
        && contextMenuTab.id !== compareSourceTab.id;
    const setCompareSourceLabel = settings.language === 'zh-CN'
        ? '设为对比源标签页'
        : 'Set as compare source';
    const clearCompareSourceLabel = settings.language === 'zh-CN'
        ? '清除对比源标签页'
        : 'Clear compare source';
    const compareWithSourceLabel = compareSourceTab
        ? (
            settings.language === 'zh-CN'
                ? `与“${compareSourceTab.name}”对比`
                : `Compare with "${compareSourceTab.name}"`
        )
        : (
            settings.language === 'zh-CN'
                ? '与已选源标签页对比'
                : 'Compare with selected source'
        );
    const compareSourceHintLabel = compareSourceTab
        ? (
            settings.language === 'zh-CN'
                ? `已选源：${compareSourceTab.name}`
                : `Source: ${compareSourceTab.name}`
        )
        : (
            settings.language === 'zh-CN'
                ? '未选择对比源'
                : 'No compare source selected'
        );

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

            try {
                await invoke('close_files', { ids: tabIds });
            } catch (error) {
                console.error('Failed to close tabs:', error);
            }
        },
        [closeTab, settings.language, updateTab]
    );

    const handleCloseTab = useCallback(async (tab: FileTab) => {
        const shouldCreateBlankTab = tabs.length === 1;

        try {
            await closeTabs([tab], false);

            if (shouldCreateBlankTab && useStore.getState().tabs.length === 0) {
                const fileInfo = await invoke<FileTab>('new_file', {
                    newFileLineEnding: settings.newFileLineEnding,
                });
                addTab(fileInfo);
            }
        } catch (error) {
            console.error('Failed to close tab:', error);
        }
    }, [addTab, closeTabs, tabs.length]);

    const clearTabDragStart = useCallback(() => {
        tabDragStartRef.current = null;
    }, []);

    const handleTabPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }

        tabDragStartRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        };
    }, []);

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
            const fileInfo = await invoke<FileTab>('new_file', {
                newFileLineEnding: settings.newFileLineEnding,
            });
            addTab(fileInfo);
        } catch (error) {
            console.error('Failed to create tab after closing all tabs:', error);
        }
    }, [addTab, closeTabs, settings.newFileLineEnding, tabs]);

    const handleSetCompareSource = useCallback((tab: FileTab | null) => {
        if (!isRegularFileTab(tab)) {
            return;
        }

        if (compareSourceTabId === tab.id) {
            setCompareSourceTabId(null);
            return;
        }

        setCompareSourceTabId(tab.id);
    }, [compareSourceTabId]);

    const handleCreateDiffTab = useCallback(async (targetTab: FileTab | null) => {
        if (!isRegularFileTab(targetTab) || !isRegularFileTab(compareSourceTab)) {
            return;
        }

        if (targetTab.id === compareSourceTab.id) {
            return;
        }

        const existingTab = tabs.find(
            (tab) =>
                tab.tabType === 'diff'
                && tab.diffPayload
                && tab.diffPayload.sourceTabId === compareSourceTab.id
                && tab.diffPayload.targetTabId === targetTab.id
        );

        if (existingTab) {
            setActiveTab(existingTab.id);
            return;
        }

        try {
            const lineDiff = await invoke<LineDiffComparisonResult>('compare_documents_by_line', {
                sourceId: compareSourceTab.id,
                targetId: targetTab.id,
            });
            const diffTabName = settings.language === 'zh-CN'
                ? `对比: ${compareSourceTab.name} <> ${targetTab.name}`
                : `Diff: ${compareSourceTab.name} <> ${targetTab.name}`;

            addTab({
                id: `diff:${compareSourceTab.id}:${targetTab.id}:${Date.now()}`,
                name: diffTabName,
                path: '',
                encoding: compareSourceTab.encoding || 'UTF-8',
                lineEnding: compareSourceTab.lineEnding,
                lineCount: Math.max(1, lineDiff.alignedLineCount),
                largeFileMode: false,
                syntaxOverride: 'plain_text',
                isDirty: false,
                tabType: 'diff',
                diffPayload: {
                    sourceTabId: compareSourceTab.id,
                    targetTabId: targetTab.id,
                    sourceName: compareSourceTab.name,
                    targetName: targetTab.name,
                    sourcePath: compareSourceTab.path,
                    targetPath: targetTab.path,
                    alignedSourceLines: lineDiff.alignedSourceLines,
                    alignedTargetLines: lineDiff.alignedTargetLines,
                    alignedSourcePresent: lineDiff.alignedSourcePresent,
                    alignedTargetPresent: lineDiff.alignedTargetPresent,
                    diffLineNumbers: lineDiff.diffLineNumbers,
                    sourceDiffLineNumbers: lineDiff.sourceDiffLineNumbers,
                    targetDiffLineNumbers: lineDiff.targetDiffLineNumbers,
                    sourceLineCount: Math.max(1, lineDiff.sourceLineCount),
                    targetLineCount: Math.max(1, lineDiff.targetLineCount),
                    alignedLineCount: Math.max(1, lineDiff.alignedLineCount),
                },
            });
        } catch (error) {
            console.error('Failed to create diff tab:', error);
        }
    }, [addTab, compareSourceTab, setActiveTab, settings.language, tabs]);

    const handleTabContextMenu = useCallback((event: MouseEvent<HTMLDivElement>, tab: FileTab) => {
        event.preventDefault();
        event.stopPropagation();
        setTabPathTooltip(null);

        const menuWidth = 248;
        const menuHeight = 332;
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

    const handleTabPathTooltipEnter = useCallback((event: MouseEvent<HTMLDivElement>, tab: FileTab) => {
        const normalizedPath = tab.path?.trim();

        if (!normalizedPath) {
            setTabPathTooltip(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const viewportPadding = 8;
        const tooltipOffset = 6;
        const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
        const availableAbove = rect.top - viewportPadding;
        const placement = availableBelow >= availableAbove ? 'bottom' : 'top';
        const centerX = rect.left + rect.width / 2;

        setTabPathTooltip({
            text: normalizedPath,
            x: centerX,
            topY: Math.max(viewportPadding, rect.top - tooltipOffset),
            bottomY: Math.max(viewportPadding, Math.min(window.innerHeight - viewportPadding, rect.bottom + tooltipOffset)),
            placement,
        });
    }, []);

    const handleTabPathTooltipLeave = useCallback(() => {
        setTabPathTooltip(null);
    }, []);

    const adjustTabPathTooltipPosition = useCallback(() => {
        setTabPathTooltip((previous) => {
            if (!previous) {
                return previous;
            }

            const viewportPadding = 8;
            const clampedX = Math.max(viewportPadding, Math.min(window.innerWidth - viewportPadding, previous.x));
            const clampedBottomY = Math.max(
                viewportPadding,
                Math.min(window.innerHeight - viewportPadding, previous.bottomY)
            );
            const clampedTopY = Math.max(viewportPadding, Math.min(window.innerHeight - viewportPadding, previous.topY));

            return {
                ...previous,
                x: clampedX,
                bottomY: clampedBottomY,
                topY: clampedTopY,
            };
        });
    }, []);

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

    const handleTabsContainerContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
        if (!isReleaseBuild) {
            return;
        }

        event.preventDefault();
        setTabContextMenu(null);
        setTabPathTooltip(null);
    }, [isReleaseBuild]);

    useEffect(() => {
        const DRAG_THRESHOLD_PX = 6;

        const handleWindowPointerMove = (event: PointerEvent) => {
            const dragStart = tabDragStartRef.current;

            if (!dragStart) {
                return;
            }

            if (event.pointerId !== dragStart.pointerId) {
                return;
            }

            if ((event.buttons & 1) !== 1) {
                clearTabDragStart();
                return;
            }

            const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);

            if (distance < DRAG_THRESHOLD_PX) {
                return;
            }

            suppressNextTabClickRef.current = true;
            clearTabDragStart();
            void appWindow.startDragging().catch((error) => {
                console.error('Failed to drag window from tab:', error);
            });
        };

        const handleWindowPointerEnd = () => {
            clearTabDragStart();
        };

        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerEnd);
        window.addEventListener('pointercancel', handleWindowPointerEnd);
        window.addEventListener('blur', handleWindowPointerEnd);

        return () => {
            window.removeEventListener('pointermove', handleWindowPointerMove);
            window.removeEventListener('pointerup', handleWindowPointerEnd);
            window.removeEventListener('pointercancel', handleWindowPointerEnd);
            window.removeEventListener('blur', handleWindowPointerEnd);
        };
    }, [clearTabDragStart]);

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

    useEffect(() => {
        if (!compareSourceTabId) {
            return;
        }

        if (!tabs.some((tab) => tab.id === compareSourceTabId && tab.tabType !== 'diff')) {
            setCompareSourceTabId(null);
        }
    }, [compareSourceTabId, tabs]);

    useEffect(() => {
        if (!tabPathTooltip) {
            return;
        }

        const tooltipPath = tabPathTooltip.text.trim();
        const hasMatchingTab = tabs.some((tab) => tab.path.trim() === tooltipPath);

        if (!hasMatchingTab) {
            setTabPathTooltip(null);
        }
    }, [tabPathTooltip, tabs]);

    useLayoutEffect(() => {
        if (!tabPathTooltip || !tabPathTooltipRef.current) {
            return;
        }

        const viewportPadding = 8;
        const tooltipRect = tabPathTooltipRef.current.getBoundingClientRect();
        let nextX = tabPathTooltip.x;
        let nextPlacement = tabPathTooltip.placement;

        const overflowLeft = viewportPadding - tooltipRect.left;
        const overflowRight = tooltipRect.right - (window.innerWidth - viewportPadding);

        if (overflowLeft > 0) {
            nextX += overflowLeft;
        }

        if (overflowRight > 0) {
            nextX -= overflowRight;
        }

        if (
            nextPlacement === 'bottom'
            && tooltipRect.bottom > window.innerHeight - viewportPadding
            && tabPathTooltip.topY > viewportPadding
        ) {
            nextPlacement = 'top';
        } else if (
            nextPlacement === 'top'
            && tooltipRect.top < viewportPadding
            && tabPathTooltip.bottomY < window.innerHeight - viewportPadding
        ) {
            nextPlacement = 'bottom';
        }

        const clampedX = Math.max(viewportPadding, Math.min(window.innerWidth - viewportPadding, nextX));

        if (clampedX !== tabPathTooltip.x || nextPlacement !== tabPathTooltip.placement) {
            setTabPathTooltip((previous) => {
                if (!previous) {
                    return previous;
                }

                return {
                    ...previous,
                    x: clampedX,
                    placement: nextPlacement,
                };
            });
        }
    }, [tabPathTooltip]);

    useEffect(() => {
        if (!tabPathTooltip) {
            return;
        }

        const handleViewportChange = () => {
            adjustTabPathTooltipPosition();
        };

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [adjustTabPathTooltipPosition, tabPathTooltip]);

    useEffect(() => {
        const handleFileOpenLoading = (event: Event) => {
            const customEvent = event as CustomEvent<FileOpenLoadingEventDetail>;
            const detail = customEvent.detail;
            if (!detail?.tabId || !detail.path) {
                return;
            }

            if (detail.status === 'start') {
                setPendingOpenTabs((current) => {
                    if (current.some((item) => item.id === detail.tabId)) {
                        return current;
                    }

                    return [
                        ...current,
                        {
                            id: detail.tabId,
                            path: detail.path,
                            name: pathBaseName(detail.path),
                        },
                    ];
                });
                return;
            }

            setPendingOpenTabs((current) => current.filter((item) => item.id !== detail.tabId));
        };

        window.addEventListener('rutar:file-open-loading', handleFileOpenLoading as EventListener);

        return () => {
            window.removeEventListener('rutar:file-open-loading', handleFileOpenLoading as EventListener);
        };
    }, []);

    const displayTabs = useMemo(() => {
        const existingPaths = new Set(
            tabs
                .map((tab) => tab.path)
                .filter((path): path is string => !!path)
        );

        const visiblePendingTabs = pendingOpenTabs.filter((item) => !existingPaths.has(item.path));
        return [...tabs, ...visiblePendingTabs];
    }, [pendingOpenTabs, tabs]);

    return (
        <div
            className="flex h-9 w-full select-none items-stretch bg-background relative"
            data-tauri-drag-region
            data-layout-region="titlebar"
            onPointerDown={() => {
                window.dispatchEvent(new Event('rutar:titlebar-pointerdown'));
            }}
        >
            {/* Tabs Container */}
            <div
                onWheel={handleTabsWheel}
                onContextMenu={handleTabsContainerContextMenu}
                data-tauri-drag-region
                className="flex-1 flex overflow-x-auto no-scrollbar overflow-y-hidden h-full relative z-10"
            >
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border z-10" />
                {displayTabs.map((tab) => {
                    const tabFileIconConfig = getTabFileIconConfig(tab);
                    const TabFileIcon = tabFileIconConfig.Icon;
                    const isPendingTab = tab.id.startsWith('pending:');

                    return (
                        <div
                            key={tab.id}
                            onPointerDown={handleTabPointerDown}
                            onClick={() => {
                                if (isPendingTab) {
                                    return;
                                }

                                if (suppressNextTabClickRef.current) {
                                    suppressNextTabClickRef.current = false;
                                    return;
                                }

                                setActiveTab(tab.id);
                            }}
                            onDoubleClick={(event) => {
                                if (isPendingTab) {
                                    return;
                                }

                                handleTabDoubleClick(event, tab as FileTab);
                            }}
                            onMouseEnter={(event) => {
                                if (isPendingTab) {
                                    return;
                                }

                                handleTabPathTooltipEnter(event, tab as FileTab);
                            }}
                            onMouseLeave={handleTabPathTooltipLeave}
                            onContextMenu={(event) => {
                                if (isPendingTab) {
                                    event.preventDefault();
                                    return;
                                }

                                handleTabContextMenu(event, tab as FileTab);
                            }}
                            className={cn(
                                "group flex items-center h-full min-w-[100px] max-w-[200px] px-3 border-x rounded-none cursor-pointer relative overflow-visible bg-muted transition-colors pointer-events-auto z-0",
                                activeTabId === tab.id ? "bg-background border-border z-20" : "border-border dark:border-white/15",
                                !isPendingTab && 'hover:bg-muted/80',
                                isPendingTab && 'opacity-80'
                            )}
                            style={noDragStyle}
                        >
                            {activeTabId === tab.id && <div className="absolute -left-px -right-px top-0 h-[3px] bg-blue-500" />}
                            {isPendingTab ? (
                                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                            ) : (
                                <TabFileIcon
                                    className={cn('mr-1.5 h-3.5 w-3.5 shrink-0', tabFileIconConfig.className)}
                                />
                            )}
                            <span className="truncate flex-1 text-[11px] font-medium">
                                {tab.name}
                                {'isDirty' in tab && tab.isDirty ? '*' : ''}
                            </span>
                            {!isPendingTab && (
                                <button
                                    type="button"
                                    style={noDragStyle}
                                    draggable={false}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void handleCloseTab(tab as FileTab);
                                    }}
                                    className="ml-2 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded-none p-0.5"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}

                        </div>
                    );
                })}
            </div>

            {tabPathTooltip && (
                <div
                    ref={tabPathTooltipRef}
                    className="pointer-events-none fixed z-[85] max-w-[min(80vw,640px)] rounded-md border border-border bg-background/95 px-2 py-1 text-[11px] leading-4 text-foreground shadow-xl backdrop-blur-sm whitespace-pre-wrap break-all"
                    style={{
                        left: tabPathTooltip.x,
                        top: tabPathTooltip.placement === 'top' ? tabPathTooltip.topY : tabPathTooltip.bottomY,
                        transform: tabPathTooltip.placement === 'top'
                            ? 'translate(-50%, -100%)'
                            : 'translateX(-50%)',
                    }}
                >
                    {tabPathTooltip.text}
                </div>
            )}

            {tabContextMenu && (
                <div
                    ref={tabContextMenuRef}
                    className="fixed z-[80] min-w-44 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
                    style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
                >
                    <div className="px-3 py-1 text-[11px] text-muted-foreground">
                        {compareSourceHintLabel}
                    </div>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setTabContextMenu(null);
                            handleSetCompareSource(contextMenuTab);
                        }}
                        disabled={!canSetCompareSource}
                    >
                        {compareSourceTabId && contextMenuTab?.id === compareSourceTabId
                            ? clearCompareSourceLabel
                            : setCompareSourceLabel}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setTabContextMenu(null);
                            void handleCreateDiffTab(contextMenuTab);
                        }}
                        disabled={!canCompareWithSelectedSource}
                    >
                        {compareWithSourceLabel}
                    </button>
                    <div className="my-1 h-px bg-border" />
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
