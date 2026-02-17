import {
    FilePlus, FolderOpen, FileUp, Save, SaveAll, Scissors, Copy, ClipboardPaste, 
    Undo, Redo, Search, Replace, Filter as FilterIcon, WrapText, ListTree, WandSparkles, Minimize2, Bookmark, ChevronDown, X, Text, PanelRightOpen
} from 'lucide-react';
import { message, open } from '@tauri-apps/plugin-dialog';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { openFilePath } from '@/lib/openFile';
import { addRecentFolderPath, removeRecentFilePath, removeRecentFolderPath } from '@/lib/recentPaths';
import { useStore, FileTab, isDiffTab, type DiffPanelSide } from '@/store/useStore';
import { t } from '@/i18n';
import { detectOutlineType, loadOutline } from '@/lib/outline';
import { detectStructuredFormatSyntaxKey, isStructuredFormatSupported } from '@/lib/structuredFormat';
import { confirmTabClose, saveTab } from '@/lib/tabClose';
import { isMarkdownTab } from '@/lib/markdown';
import { cn } from '@/lib/utils';

function dispatchEditorForceRefresh(
    tabId: string,
    lineCount?: number,
    options?: { preserveCaret?: boolean }
) {
    window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
            detail: {
                tabId,
                lineCount,
                preserveCaret: options?.preserveCaret ?? false,
            },
        })
    );
}

function dispatchSearchOpen(mode: 'find' | 'replace' | 'filter') {
    window.dispatchEvent(
        new CustomEvent('rutar:search-open', {
            detail: { mode },
        })
    );
}

function dispatchEditorPaste(tabId: string, text: string) {
    window.dispatchEvent(
        new CustomEvent('rutar:paste-text', {
            detail: { tabId, text },
        })
    );
}

function dispatchDiffPaste(diffTabId: string, panel: DiffPanelSide, text: string) {
    window.dispatchEvent(
        new CustomEvent('rutar:diff-paste-text', {
            detail: { diffTabId, panel, text },
        })
    );
}

function dispatchDiffHistoryAction(diffTabId: string, panel: DiffPanelSide, action: 'undo' | 'redo') {
    window.dispatchEvent(
        new CustomEvent('rutar:diff-history-action', {
            detail: { diffTabId, panel, action },
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

function getActiveEditorElement() {
    return document.querySelector('.editor-input-layer') as HTMLTextAreaElement | null;
}

function getDiffPanelEditorElement(panel: DiffPanelSide) {
    return document.querySelector(`textarea[data-diff-panel="${panel}"]`) as HTMLTextAreaElement | null;
}

function hasSelectionInEditorElement(element: HTMLTextAreaElement | null) {
    if (!element) {
        return false;
    }

    if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        return element.selectionEnd > element.selectionStart;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return false;
    }

    const range = selection.getRangeAt(0);
    return element.contains(range.commonAncestorContainer) && selection.toString().length > 0;
}

type RecentMenuKind = 'file' | 'folder' | null;

interface EditHistoryState {
    canUndo: boolean;
    canRedo: boolean;
    isDirty: boolean;
}

interface WordCountInfo {
    wordCount: number;
    characterCount: number;
    characterCountNoSpaces: number;
    lineCount: number;
    paragraphCount: number;
}

interface SaveFileBatchResultItem {
    id: string;
    success: boolean;
    error?: string;
}

interface SplitMenuItemContextState {
    path: string;
    x: number;
    y: number;
}

const DEFAULT_EDIT_HISTORY_STATE: EditHistoryState = {
    canUndo: false,
    canRedo: false,
    isDirty: false,
};

function pathBaseName(path: string) {
    const normalizedPath = path.trim().replace(/[\\/]+$/, '');
    const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
    return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

export function Toolbar() {
    const addTab = useStore((state) => state.addTab);
    const tabs = useStore((state) => state.tabs);
    const activeTabId = useStore((state) => state.activeTabId);
    const activeDiffPanelByTab = useStore((state) => state.activeDiffPanelByTab);
    const closeTab = useStore((state) => state.closeTab);
    const updateTab = useStore((state) => state.updateTab);
    const setFolder = useStore((state) => state.setFolder);
    const language = useStore((state) => state.settings.language);
    const tabWidth = useStore((state) => state.settings.tabWidth);
    const wordWrap = useStore((state) => state.settings.wordWrap);
    const showLineNumbers = useStore((state) => state.settings.showLineNumbers);
    const newFileLineEnding = useStore((state) => state.settings.newFileLineEnding);
    const updateSettings = useStore((state) => state.updateSettings);
    const toggleOutline = useStore((state) => state.toggleOutline);
    const outlineOpen = useStore((state) => state.outlineOpen);
    const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
    const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
    const toggleMarkdownPreview = useStore((state) => state.toggleMarkdownPreview);
    const markdownPreviewOpen = useStore((state) => state.markdownPreviewOpen);
    const setOutlineData = useStore((state) => state.setOutlineData);
    const recentFiles = useStore((state) => state.settings.recentFiles);
    const recentFolders = useStore((state) => state.settings.recentFolders);
    const activeRootTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
    const activeTab = activeRootTab && activeRootTab.tabType !== 'diff' ? activeRootTab : null;
    const activeDiffTab = activeRootTab && isDiffTab(activeRootTab) ? activeRootTab : null;
    const activeDiffPanel: DiffPanelSide | null = activeDiffTab
        ? activeDiffPanelByTab[activeDiffTab.id] ?? 'source'
        : null;
    const activeDiffPanelTabId = activeDiffTab
        ? (activeDiffPanel === 'target' ? activeDiffTab.diffPayload.targetTabId : activeDiffTab.diffPayload.sourceTabId)
        : null;
    const activeDiffPanelTab = activeDiffPanelTabId
        ? tabs.find((tab) => tab.id === activeDiffPanelTabId && tab.tabType !== 'diff') ?? null
        : null;
    const activeEditTab = activeTab ?? activeDiffPanelTab;
    const activeTabIdForActions = activeEditTab?.id ?? null;
    const activeTabLargeFileMode = !!activeEditTab?.largeFileMode;
    const canEdit = !!activeEditTab;
    const canFormat = !!activeTab && isStructuredFormatSupported(activeTab);
    const canOutline = !!activeTab && !!detectOutlineType(activeTab);
    const canMarkdownPreview = !!activeTab && isMarkdownTab(activeTab);
    const [canClipboardSelectionAction, setCanClipboardSelectionAction] = useState(false);
    const [editHistoryState, setEditHistoryState] = useState<EditHistoryState>(DEFAULT_EDIT_HISTORY_STATE);
    const [recentMenu, setRecentMenu] = useState<RecentMenuKind>(null);
    const openFileMenuRef = useRef<HTMLDivElement>(null);
    const openFolderMenuRef = useRef<HTMLDivElement>(null);
    const selectionChangeRafRef = useRef<number | null>(null);
    const tr = (key: Parameters<typeof t>[1]) => t(language, key);
    const filterTitle = tr('toolbar.filter');
    const formatBeautifyTitle = tr('toolbar.format.beautify');
    const formatMinifyTitle = tr('toolbar.format.minify');
    const formatUnsupportedMessage = tr('toolbar.format.unsupported');
    const formatFailedPrefix = tr('toolbar.format.failed');
    const noRecentFilesText = tr('toolbar.recent.noFiles');
    const noRecentFoldersText = tr('toolbar.recent.noFolders');
    const clearRecentFilesText = tr('toolbar.recent.clearFiles');
    const clearRecentFoldersText = tr('toolbar.recent.clearFolders');
    const removeRecentItemText = tr('bookmark.remove');
    const openContainingFolderText = tr('titleBar.openContainingFolder');
    const wordCountFailedPrefix = tr('toolbar.wordCount.failed');
    const canSaveActiveTab = !!activeTab && (editHistoryState.isDirty || !!activeTab.isDirty);
    const canSaveAnyTab = tabs.some((tab) => !!tab.isDirty);
    const canCutOrCopy = canEdit && canClipboardSelectionAction;
    const canUndo = canEdit && editHistoryState.canUndo;
    const canRedo = canEdit && editHistoryState.canRedo;
    const noActiveDocumentReason = tr('toolbar.disabled.noActiveDocument');
    const noUnsavedChangesReason = tr('toolbar.disabled.noUnsavedChanges');
    const noUnsavedDocumentsReason = tr('toolbar.disabled.noUnsavedDocuments');
    const noSelectedTextReason = tr('toolbar.disabled.noSelectedText');
    const noUndoHistoryReason = tr('toolbar.disabled.noUndoHistory');
    const noRedoHistoryReason = tr('toolbar.disabled.noRedoHistory');
    const notMarkdownReason = tr('preview.notMarkdown');
    const saveDisabledReason = !activeTab ? noActiveDocumentReason : !canSaveActiveTab ? noUnsavedChangesReason : undefined;
    const saveAllDisabledReason = !canSaveAnyTab ? noUnsavedDocumentsReason : undefined;
    const cutCopyDisabledReason = !activeEditTab ? noActiveDocumentReason : !canClipboardSelectionAction ? noSelectedTextReason : undefined;
    const undoDisabledReason = !activeEditTab ? noActiveDocumentReason : !editHistoryState.canUndo ? noUndoHistoryReason : undefined;
    const redoDisabledReason = !activeEditTab ? noActiveDocumentReason : !editHistoryState.canRedo ? noRedoHistoryReason : undefined;
    const previewDisabledReason = !activeTab ? noActiveDocumentReason : !canMarkdownPreview ? notMarkdownReason : undefined;

    const formatWordCountResult = useCallback((result: WordCountInfo) => {
        const lines = [
            `${tr('toolbar.wordCount.words')}：${result.wordCount}`,
            `${tr('toolbar.wordCount.characters')}：${result.characterCount}`,
            `${tr('toolbar.wordCount.charactersNoSpaces')}：${result.characterCountNoSpaces}`,
            `${tr('toolbar.wordCount.lines')}：${result.lineCount}`,
            `${tr('toolbar.wordCount.paragraphs')}：${result.paragraphCount}`,
        ];

        return lines.join('\n');
    }, [tr]);

    const refreshSelectionState = useCallback(() => {
        if (!activeTabIdForActions || activeTabLargeFileMode) {
            setCanClipboardSelectionAction(false);
            return;
        }

        const editor = activeDiffTab && activeDiffPanel
            ? getDiffPanelEditorElement(activeDiffPanel)
            : getActiveEditorElement();
        setCanClipboardSelectionAction(hasSelectionInEditorElement(editor));
    }, [activeDiffPanel, activeDiffTab, activeTabIdForActions, activeTabLargeFileMode]);

    const refreshEditHistoryState = useCallback(async (targetTabId?: string) => {
        const id = targetTabId ?? activeTabIdForActions;
        if (!id) {
            setEditHistoryState(DEFAULT_EDIT_HISTORY_STATE);
            return;
        }

        try {
            const historyState = await invoke<EditHistoryState>('get_edit_history_state', { id });
            const storeState = useStore.getState();
            const currentRootTab = storeState.tabs.find((tab) => tab.id === storeState.activeTabId);
            const currentEditTargetId = currentRootTab && isDiffTab(currentRootTab)
                ? (
                    (storeState.activeDiffPanelByTab[currentRootTab.id] ?? 'source') === 'target'
                        ? currentRootTab.diffPayload.targetTabId
                        : currentRootTab.diffPayload.sourceTabId
                )
                : currentRootTab && currentRootTab.tabType !== 'diff'
                    ? currentRootTab.id
                    : null;
            if (currentEditTargetId === id) {
                setEditHistoryState(historyState);
            }
            const currentTab = storeState.tabs.find((tab) => tab.id === id);
            if (currentTab && currentTab.isDirty !== historyState.isDirty) {
                updateTab(id, { isDirty: historyState.isDirty });
            }
        } catch (error) {
            console.warn('Failed to get edit history state:', error);
            const storeState = useStore.getState();
            const currentRootTab = storeState.tabs.find((tab) => tab.id === storeState.activeTabId);
            const currentEditTargetId = currentRootTab && isDiffTab(currentRootTab)
                ? (
                    (storeState.activeDiffPanelByTab[currentRootTab.id] ?? 'source') === 'target'
                        ? currentRootTab.diffPayload.targetTabId
                        : currentRootTab.diffPayload.sourceTabId
                )
                : currentRootTab && currentRootTab.tabType !== 'diff'
                    ? currentRootTab.id
                    : null;
            if (currentEditTargetId === id) {
                setEditHistoryState(DEFAULT_EDIT_HISTORY_STATE);
            }
        }
    }, [activeTabIdForActions, updateTab]);

    useEffect(() => {
        if (!activeTabIdForActions) {
            setEditHistoryState(DEFAULT_EDIT_HISTORY_STATE);
            setCanClipboardSelectionAction(false);
            return;
        }

        void refreshEditHistoryState(activeTabIdForActions);
        refreshSelectionState();
    }, [activeTabIdForActions, refreshEditHistoryState, refreshSelectionState]);

    useEffect(() => {
        if (!markdownPreviewOpen) {
            return;
        }

        if (!canMarkdownPreview) {
            toggleMarkdownPreview(false);
        }
    }, [canMarkdownPreview, markdownPreviewOpen, toggleMarkdownPreview]);

    useEffect(() => {
        const flushSelectionChange = () => {
            selectionChangeRafRef.current = null;
            refreshSelectionState();
        };

        const handleSelectionChange = () => {
            if (selectionChangeRafRef.current !== null) {
                return;
            }

            selectionChangeRafRef.current = window.requestAnimationFrame(flushSelectionChange);
        };

        const handleDocumentUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{ tabId?: string }>;
            if (!activeTabIdForActions || customEvent.detail?.tabId !== activeTabIdForActions) {
                return;
            }

            void refreshEditHistoryState(activeTabIdForActions);
            refreshSelectionState();
        };

        const handleForceRefresh = (event: Event) => {
            const customEvent = event as CustomEvent<{ tabId?: string }>;
            if (!activeTabIdForActions || customEvent.detail?.tabId !== activeTabIdForActions) {
                return;
            }

            void refreshEditHistoryState(activeTabIdForActions);
            refreshSelectionState();
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
        window.addEventListener('rutar:force-refresh', handleForceRefresh as EventListener);

        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
            window.removeEventListener('rutar:force-refresh', handleForceRefresh as EventListener);
            if (selectionChangeRafRef.current !== null) {
                window.cancelAnimationFrame(selectionChangeRafRef.current);
                selectionChangeRafRef.current = null;
            }
        };
    }, [activeTabIdForActions, refreshEditHistoryState, refreshSelectionState]);

    const recentFileItems = useMemo(
        () => recentFiles.map((path) => ({ path, name: pathBaseName(path) })),
        [recentFiles]
    );
    const recentFolderItems = useMemo(
        () => recentFolders.map((path) => ({ path, name: pathBaseName(path) })),
        [recentFolders]
    );

    const runStructuredFormat = useCallback(async (mode: 'beautify' | 'minify') => {
        if (!activeTab) {
            return;
        }

        if (!isStructuredFormatSupported(activeTab)) {
            await message(formatUnsupportedMessage, {
                title: tr('titleBar.settings'),
                kind: 'warning',
            });
            return;
        }

        const fileSyntax = detectStructuredFormatSyntaxKey(activeTab);
        if (!fileSyntax) {
            await message(formatUnsupportedMessage, {
                title: tr('titleBar.settings'),
                kind: 'warning',
            });
            return;
        }

        try {
            const newLineCount = await invoke<number>('format_document', {
                id: activeTab.id,
                mode,
                fileSyntax,
                filePath: activeTab.path,
                fileName: activeTab.name,
                tabWidth,
            });

            updateTab(activeTab.id, {
                lineCount: Math.max(1, newLineCount),
                isDirty: true,
            });

            dispatchEditorForceRefresh(activeTab.id, newLineCount);
            dispatchDocumentUpdated(activeTab.id);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await message(`${formatFailedPrefix} ${errorMessage}`, {
                title: tr('titleBar.settings'),
                kind: 'warning',
            });
        }
    }, [activeTab, formatFailedPrefix, formatUnsupportedMessage, tabWidth, tr, updateTab]);

    const handleFormatBeautify = useCallback(async () => {
        await runStructuredFormat('beautify');
    }, [runStructuredFormat]);

    const handleFormatMinify = useCallback(async () => {
        await runStructuredFormat('minify');
    }, [runStructuredFormat]);

    const persistTab = useCallback(async (tab: FileTab) => {
        return saveTab(tab, updateTab);
    }, [updateTab]);

    const handleNewFile = useCallback(async () => {
        try {
            const fileInfo = await invoke<FileTab>('new_file', { newFileLineEnding });
            addTab(fileInfo);
        } catch (e) {
            console.error('Failed to create new file:', e);
        }
    }, [addTab, newFileLineEnding]);

    const handleOpenFile = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
            });

            if (selected && typeof selected === 'string') {
                await openFilePath(selected);
                refreshSelectionState();
            }
        } catch (e) {
            console.error('Failed to open file:', e);
        }
    }, [refreshSelectionState]);

    const handleOpenFolder = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: true,
            });

            if (selected && typeof selected === 'string') {
                 const entries = await invoke<any[] | null>('read_dir_if_directory', { path: selected });
                 if (!entries) {
                    return;
                 }

                 setFolder(selected, entries);
                 addRecentFolderPath(selected);
            }
        } catch (e) {
            console.error('Failed to open folder:', e);
        }
    }, [setFolder]);

    const handleOpenRecentFile = useCallback(async (path: string) => {
        setRecentMenu(null);

        try {
            await openFilePath(path);
            if (activeTabIdForActions) {
                void refreshEditHistoryState(activeTabIdForActions);
            }
        } catch (error) {
            console.error('Failed to open recent file:', error);
        }
    }, [activeTabIdForActions, refreshEditHistoryState]);

    const handleOpenRecentFolder = useCallback(async (path: string) => {
        setRecentMenu(null);

        try {
            const entries = await invoke<any[] | null>('read_dir_if_directory', { path });
            if (!entries) {
                return;
            }

            setFolder(path, entries);
            addRecentFolderPath(path);
        } catch (error) {
            console.error('Failed to open recent folder:', error);
        }
    }, [setFolder]);

    const handleToggleRecentMenu = useCallback((kind: Exclude<RecentMenuKind, null>) => {
        setRecentMenu((current) => (current === kind ? null : kind));
    }, []);

    const handleRemoveRecentFile = useCallback((path: string) => {
        removeRecentFilePath(path);
    }, []);

    const handleRemoveRecentFolder = useCallback((path: string) => {
        removeRecentFolderPath(path);
    }, []);

    const handleOpenRecentFileContainingFolder = useCallback(async (path: string) => {
        try {
            await invoke('open_in_file_manager', { path });
        } catch (error) {
            console.error('Failed to open recent file directory:', error);
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (!activeTab) return;
        try {
            await persistTab(activeTab);
            await refreshEditHistoryState(activeTab.id);
            dispatchDocumentUpdated(activeTab.id);
        } catch (e) {
            console.error('Failed to save file:', e);
        }
    }, [activeTab, persistTab, refreshEditHistoryState]);

    const handleSaveAll = useCallback(async () => {
        const dirtyTabs = tabs.filter((tab) => tab.isDirty);
        const tabsWithPath = dirtyTabs.filter((tab) => !!tab.path);
        const tabsWithoutPath = dirtyTabs.filter((tab) => !tab.path);

        if (tabsWithPath.length > 0) {
            try {
                const results = await invoke<SaveFileBatchResultItem[]>('save_files', {
                    ids: tabsWithPath.map((tab) => tab.id),
                });

                for (const result of results) {
                    const tab = tabsWithPath.find((item) => item.id === result.id);
                    if (!tab) {
                        continue;
                    }

                    if (!result.success) {
                        console.error(`Failed to save ${tab.name}:`, result.error ?? 'Unknown error');
                        continue;
                    }

                    updateTab(tab.id, { isDirty: false });
                    await refreshEditHistoryState(tab.id);
                    dispatchDocumentUpdated(tab.id);
                }
            } catch (error) {
                console.error('Failed to batch save files:', error);
            }
        }

        for (const tab of tabsWithoutPath) {
            try {
                const saved = await persistTab(tab);
                if (!saved) {
                    continue;
                }
                await refreshEditHistoryState(tab.id);
                dispatchDocumentUpdated(tab.id);
            } catch (error) {
                console.error(`Failed to save ${tab.name}:`, error);
            }
        }
    }, [persistTab, refreshEditHistoryState, tabs, updateTab]);

    const handleCloseActiveTab = useCallback(async () => {
        if (!activeTab) return;

        const decision = await confirmTabClose(activeTab, language, false);
        if (decision === 'cancel') {
            return;
        }

        if (decision === 'save') {
            try {
                const saved = await persistTab(activeTab);
                if (!saved) {
                    return;
                }
            } catch (e) {
                console.error('Failed to save file before closing tab:', e);
                return;
            }
        }

        const shouldCreateBlankTab = tabs.length === 1;

        closeTab(activeTab.id);

        try {
            await invoke('close_file', { id: activeTab.id });

            if (shouldCreateBlankTab) {
                const fileInfo = await invoke<FileTab>('new_file', { newFileLineEnding });
                addTab(fileInfo);
            }
        } catch (e) {
            console.error('Failed to close tab:', e);
        }
    }, [activeTab, addTab, closeTab, language, newFileLineEnding, persistTab, tabs.length]);

    const handleUndo = useCallback(async () => {
        if (activeDiffTab && activeDiffPanel) {
            dispatchDiffHistoryAction(activeDiffTab.id, activeDiffPanel, 'undo');
            return;
        }

        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('undo', { id: activeTab.id });
            await refreshEditHistoryState(activeTab.id);
            const currentDirty = useStore.getState().tabs.find((tab) => tab.id === activeTab.id)?.isDirty ?? true;
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: currentDirty });
            dispatchEditorForceRefresh(activeTab.id, newLineCount, { preserveCaret: true });
            dispatchDocumentUpdated(activeTab.id);
        } catch (e) {
            console.warn(e);
        }
    }, [activeDiffPanel, activeDiffTab, activeTab, refreshEditHistoryState, updateTab]);

    const handleRedo = useCallback(async () => {
        if (activeDiffTab && activeDiffPanel) {
            dispatchDiffHistoryAction(activeDiffTab.id, activeDiffPanel, 'redo');
            return;
        }

        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('redo', { id: activeTab.id });
            await refreshEditHistoryState(activeTab.id);
            const currentDirty = useStore.getState().tabs.find((tab) => tab.id === activeTab.id)?.isDirty ?? true;
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: currentDirty });
            dispatchEditorForceRefresh(activeTab.id, newLineCount, { preserveCaret: true });
            dispatchDocumentUpdated(activeTab.id);
        } catch (e) {
            console.warn(e);
        }
    }, [activeDiffPanel, activeDiffTab, activeTab, refreshEditHistoryState, updateTab]);

    const handleClipboardAction = useCallback(async (action: 'cut' | 'copy' | 'paste') => {
        const editor = activeDiffTab && activeDiffPanel
            ? getDiffPanelEditorElement(activeDiffPanel)
            : getActiveEditorElement();
        if (editor && document.activeElement !== editor) {
            editor.focus();
        }

        const runExecCommand = (command: 'cut' | 'copy' | 'paste') => {
            try {
                return document.execCommand(command);
            } catch {
                return false;
            }
        };

        if (action === 'copy') {
            runExecCommand('copy');
            return;
        }

        if (action === 'cut') {
            runExecCommand('cut');
            return;
        }

        if (activeDiffTab && activeDiffPanel) {
            try {
                const clipboardText = await readClipboardText();
                dispatchDiffPaste(activeDiffTab.id, activeDiffPanel, clipboardText);
                return;
            } catch (error) {
                console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
            }
        }

        if (activeTab) {
            try {
                const clipboardText = await readClipboardText();
                dispatchEditorPaste(activeTab.id, clipboardText);
                return;
            } catch (error) {
                console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
            }
        }

        if (runExecCommand('paste')) {
            return;
        }

        console.warn('Paste command blocked. Use Ctrl+V in editor.');
    }, [activeDiffPanel, activeDiffTab, activeTab]);

    const handleFind = useCallback(() => {
        if (!activeTab) return;
        dispatchSearchOpen('find');
    }, [activeTab]);

    const handleReplace = useCallback(async () => {
        if (!activeTab) return;
        dispatchSearchOpen('replace');
    }, [activeTab]);

    const handleFilter = useCallback(() => {
        if (!activeTab) return;
        dispatchSearchOpen('filter');
    }, [activeTab]);

    const handleToggleWordWrap = useCallback(() => {
        updateSettings({ wordWrap: !wordWrap });
    }, [wordWrap, updateSettings]);

    const handleToggleLineNumbers = useCallback(() => {
        updateSettings({ showLineNumbers: !showLineNumbers });
    }, [showLineNumbers, updateSettings]);

    const handleToggleBookmarkSidebar = useCallback(() => {
        if (!activeTab) {
            return;
        }

        toggleBookmarkSidebar();
    }, [activeTab, toggleBookmarkSidebar]);

    const handleToggleOutline = useCallback(async () => {
        if (!activeTab) {
            await message(tr('outline.unsupportedType'), {
                title: tr('outline.title'),
                kind: 'warning',
            });
            return;
        }

        const outlineType = detectOutlineType(activeTab);
        if (!outlineType) {
            await message(tr('outline.unsupportedType'), {
                title: tr('outline.title'),
                kind: 'warning',
            });
            return;
        }

        if (outlineOpen) {
            toggleOutline(false);
            return;
        }

        try {
            const nodes = await loadOutline(activeTab, outlineType);
            setOutlineData({
                outlineType,
                nodes,
                error: null,
            });
            toggleOutline(true);
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            await message(`${tr('outline.parseFailed')} ${messageText}`, {
                title: tr('outline.title'),
                kind: 'warning',
            });
            setOutlineData({
                outlineType,
                nodes: [],
                error: messageText,
            });
        }
    }, [activeTab, outlineOpen, setOutlineData, toggleOutline, tr]);

    const handleWordCount = useCallback(async () => {
        if (!activeTab) {
            return;
        }

        try {
            const result = await invoke<WordCountInfo>('get_word_count_info', { id: activeTab.id });
            await message(formatWordCountResult(result), {
                title: tr('toolbar.wordCount.title'),
                kind: 'info',
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await message(`${wordCountFailedPrefix} ${errorMessage}`, {
                title: tr('toolbar.wordCount.title'),
                kind: 'warning',
            });
        }
    }, [activeTab, formatWordCountResult, tr, wordCountFailedPrefix]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && recentMenu) {
                setRecentMenu(null);
                return;
            }

            const key = event.key.toLowerCase();
            const code = event.code;
            const isKey = (letter: string) => key === letter || code === `Key${letter.toUpperCase()}`;

            if (event.altKey && !event.ctrlKey && !event.metaKey && isKey('l')) {
                event.preventDefault();
                handleToggleLineNumbers();
                return;
            }

            const withPrimaryModifier = event.ctrlKey || event.metaKey;
            if (!withPrimaryModifier) return;

            if (event.altKey) {
                if (isKey('f')) {
                    event.preventDefault();
                    void handleFormatBeautify();
                }

                if (isKey('m')) {
                    event.preventDefault();
                    void handleFormatMinify();
                }

                return;
            }

            if (isKey('n')) {
                event.preventDefault();
                void handleNewFile();
                return;
            }

            if (isKey('o')) {
                event.preventDefault();
                void handleOpenFile();
                return;
            }

            if (isKey('s')) {
                event.preventDefault();
                if (event.shiftKey) {
                    void handleSaveAll();
                } else {
                    void handleSave();
                }
                return;
            }

            if (isKey('w')) {
                event.preventDefault();
                void handleCloseActiveTab();
                return;
            }

            if (isKey('z') && !event.shiftKey) {
                event.preventDefault();
                void handleUndo();
                return;
            }

            if (isKey('y') || (isKey('z') && event.shiftKey)) {
                event.preventDefault();
                void handleRedo();
                return;
            }

            if (isKey('f') && !event.shiftKey) {
                event.preventDefault();
                handleFind();
                return;
            }

            if (isKey('h')) {
                event.preventDefault();
                void handleReplace();
                return;
            }

        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [
        handleFind,
        handleCloseActiveTab,
        handleNewFile,
        handleOpenFile,
        handleToggleLineNumbers,
        handleRedo,
        handleReplace,
        handleFilter,
        handleFormatBeautify,
        handleFormatMinify,
        handleSave,
        handleSaveAll,
        handleUndo,
        recentMenu,
    ]);

    useEffect(() => {
        if (!recentMenu) {
            return;
        }

        const handlePointerDown = (event: Event) => {
            const targetNode = event.target as Node | null;
            const root = recentMenu === 'file' ? openFileMenuRef.current : openFolderMenuRef.current;

            if (!root) {
                return;
            }

            if (!targetNode || !root.contains(targetNode)) {
                setRecentMenu(null);
            }
        };

        const handleTitleBarPointerDown = () => {
            setRecentMenu(null);
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('rutar:titlebar-pointerdown', handleTitleBarPointerDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('rutar:titlebar-pointerdown', handleTitleBarPointerDown);
        };
    }, [recentMenu]);

    return (
        <div
            className="flex items-center gap-0.5 p-1 border-b bg-background h-10 overflow-x-auto no-scrollbar overflow-y-hidden z-40"
            data-layout-region="toolbar"
        >
            {/* File Group */}
            <ToolbarBtn icon={FilePlus} title={tr('toolbar.newFile')} onClick={handleNewFile} />
            <ToolbarSplitMenu
                rootRef={openFileMenuRef}
                icon={FolderOpen}
                title={tr('toolbar.openFile')}
                menuTitle={tr('toolbar.openFile')}
                menuOpen={recentMenu === 'file'}
                onPrimaryClick={() => {
                    setRecentMenu(null);
                    void handleOpenFile();
                }}
                onMenuToggle={() => handleToggleRecentMenu('file')}
                emptyText={noRecentFilesText}
                clearText={clearRecentFilesText}
                removeItemText={removeRecentItemText}
                itemContextActionText={openContainingFolderText}
                items={recentFileItems}
                onItemClick={handleOpenRecentFile}
                onItemContextAction={handleOpenRecentFileContainingFolder}
                onItemRemove={handleRemoveRecentFile}
                onClear={() => {
                    updateSettings({ recentFiles: [] });
                    setRecentMenu(null);
                }}
            />
            <ToolbarSplitMenu
                rootRef={openFolderMenuRef}
                icon={FileUp}
                title={tr('toolbar.openFolder')}
                menuTitle={tr('toolbar.openFolder')}
                menuOpen={recentMenu === 'folder'}
                onPrimaryClick={() => {
                    setRecentMenu(null);
                    void handleOpenFolder();
                }}
                onMenuToggle={() => handleToggleRecentMenu('folder')}
                emptyText={noRecentFoldersText}
                clearText={clearRecentFoldersText}
                removeItemText={removeRecentItemText}
                items={recentFolderItems}
                onItemClick={handleOpenRecentFolder}
                onItemRemove={handleRemoveRecentFolder}
                onClear={() => {
                    updateSettings({ recentFolders: [] });
                    setRecentMenu(null);
                }}
            />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={Save}
                title={tr('toolbar.save')}
                onClick={handleSave}
                disabled={!canSaveActiveTab}
                disabledReason={saveDisabledReason}
            />
            <ToolbarBtn
                icon={SaveAll}
                title={tr('toolbar.saveAll')}
                onClick={handleSaveAll}
                disabled={!canSaveAnyTab}
                disabledReason={saveAllDisabledReason}
            />
            
            {/* Edit Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={Scissors}
                title={tr('toolbar.cut')}
                onClick={() => void handleClipboardAction('cut')}
                disabled={!canCutOrCopy}
                disabledReason={cutCopyDisabledReason}
            />
            <ToolbarBtn
                icon={Copy}
                title={tr('toolbar.copy')}
                onClick={() => void handleClipboardAction('copy')}
                disabled={!canCutOrCopy}
                disabledReason={cutCopyDisabledReason}
            />
            <ToolbarBtn icon={ClipboardPaste} title={tr('toolbar.paste')} onClick={() => void handleClipboardAction('paste')} disabled={!canEdit} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={Undo}
                title={tr('toolbar.undo')}
                onClick={handleUndo}
                disabled={!canUndo}
                disabledReason={undoDisabledReason}
            />
            <ToolbarBtn
                icon={Redo}
                title={tr('toolbar.redo')}
                onClick={handleRedo}
                disabled={!canRedo}
                disabledReason={redoDisabledReason}
            />
            
            {/* Search Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Search} title={tr('toolbar.find')} onClick={handleFind} disabled={!activeTab} />
            <ToolbarBtn icon={Replace} title={tr('toolbar.replace')} onClick={() => void handleReplace()} disabled={!activeTab} />
            <ToolbarBtn icon={FilterIcon} title={filterTitle} onClick={handleFilter} disabled={!activeTab} />

            {/* Format Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={WandSparkles}
                title={formatBeautifyTitle}
                onClick={() => void handleFormatBeautify()}
                disabled={!canFormat}
            />
            <ToolbarBtn
                icon={Minimize2}
                title={formatMinifyTitle}
                onClick={() => void handleFormatMinify()}
                disabled={!canFormat}
            />

            {/* View Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={WrapText}
                title={tr('toolbar.toggleWordWrap')}
                onClick={handleToggleWordWrap}
                active={!!wordWrap}
                disabled={!activeTab}
            />
            <ToolbarBtn
                icon={Bookmark}
                title={tr('toolbar.bookmarkSidebar')}
                onClick={handleToggleBookmarkSidebar}
                active={bookmarkSidebarOpen}
                disabled={!activeTab}
            />
            <ToolbarBtn
                icon={ListTree}
                title={tr('toolbar.outline')}
                onClick={() => void handleToggleOutline()}
                active={outlineOpen}
                disabled={!canOutline}
            />
            <ToolbarBtn
                icon={PanelRightOpen}
                title={tr('toolbar.preview')}
                onClick={() => toggleMarkdownPreview()}
                active={canMarkdownPreview && markdownPreviewOpen}
                disabled={!canMarkdownPreview}
                disabledReason={previewDisabledReason}
            />
            <ToolbarBtn
                icon={Text}
                title={tr('toolbar.wordCount')}
                onClick={() => void handleWordCount()}
                disabled={!activeTab}
                disabledReason={noActiveDocumentReason}
            />
        </div>
    )
}

function ToolbarBtn({ icon: Icon, title, onClick, disabled, active, disabledReason }: { icon: any, title: string, onClick?: () => void, disabled?: boolean, active?: boolean, disabledReason?: string }) {
    const resolvedTitle = disabled && disabledReason
        ? `${title} · ${disabledReason}`
        : title;

    return (
        <span title={resolvedTitle} className="inline-flex flex-shrink-0">
            <button
                type="button"
                className={`p-2 rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors ${active ? 'bg-accent text-accent-foreground' : ''}`}
                onMouseDown={(event) => {
                    if (!disabled) {
                        event.preventDefault();
                    }
                }}
                onClick={onClick}
                disabled={disabled}
            >
                <Icon className="w-4 h-4" />
            </button>
        </span>
    )
}

function ToolbarSplitMenu({
    rootRef,
    icon: Icon,
    title,
    menuTitle,
    menuOpen,
    onPrimaryClick,
    onMenuToggle,
    emptyText,
    clearText,
    removeItemText,
    itemContextActionText,
    items,
    onItemClick,
    onItemContextAction,
    onItemRemove,
    onClear,
}: {
    rootRef: RefObject<HTMLDivElement | null>;
    icon: any;
    title: string;
    menuTitle: string;
    menuOpen: boolean;
    onPrimaryClick: () => void;
    onMenuToggle: () => void;
    emptyText: string;
    clearText: string;
    removeItemText: string;
    itemContextActionText?: string;
    items: Array<{ path: string; name: string }>;
    onItemClick: (path: string) => void;
    onItemContextAction?: (path: string) => void;
    onItemRemove: (path: string) => void;
    onClear: () => void;
}) {
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({
        position: 'fixed',
        left: 0,
        top: 0,
        minWidth: 288,
        visibility: 'hidden',
    });
    const [itemContextMenu, setItemContextMenu] = useState<SplitMenuItemContextState | null>(null);
    const itemContextMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) {
            setItemContextMenu(null);
        }
    }, [menuOpen]);

    useEffect(() => {
        if (!itemContextMenu) {
            return;
        }

        const closeContextMenu = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (itemContextMenuRef.current && target && itemContextMenuRef.current.contains(target)) {
                return;
            }

            setItemContextMenu(null);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setItemContextMenu(null);
            }
        };
        const handleWindowBlur = () => {
            setItemContextMenu(null);
        };

        window.addEventListener('pointerdown', closeContextMenu);
        window.addEventListener('keydown', handleEscape);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            window.removeEventListener('pointerdown', closeContextMenu);
            window.removeEventListener('keydown', handleEscape);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [itemContextMenu]);

    useLayoutEffect(() => {
        if (!menuOpen) {
            setMenuStyle((currentStyle) => {
                if (currentStyle.visibility === 'hidden') {
                    return currentStyle;
                }

                return {
                    ...currentStyle,
                    visibility: 'hidden',
                };
            });
            return;
        }

        const updateMenuPosition = () => {
            const rootElement = rootRef.current;
            if (!rootElement) {
                return;
            }

            const rect = rootElement.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                left: rect.left,
                top: rect.bottom + 4,
                minWidth: Math.max(288, rect.width),
                visibility: 'visible',
            });
        };

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);

        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [menuOpen, rootRef]);

    return (
        <div ref={rootRef} className="relative flex items-center flex-shrink-0">
            <button
                type="button"
                className="py-2 pl-2 pr-1.5 rounded-l-md hover:bg-accent hover:text-accent-foreground transition-colors"
                title={title}
                onMouseDown={(event) => {
                    event.preventDefault();
                }}
                onClick={onPrimaryClick}
            >
                <Icon className="w-4 h-4" />
            </button>
            <button
                type="button"
                className={cn(
                    'py-2 pl-0.5 pr-1 -ml-0.5 rounded-r-md hover:bg-accent hover:text-accent-foreground transition-colors',
                    menuOpen && 'bg-accent text-accent-foreground'
                )}
                title={menuTitle}
                onMouseDown={(event) => {
                    event.preventDefault();
                }}
                onClick={onMenuToggle}
            >
                <ChevronDown className="w-3 h-3" />
            </button>

            {menuOpen && (
                <div style={menuStyle} className="z-50 rounded-md border border-border bg-popover p-1 shadow-lg">
                    {items.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</div>
                    ) : (
                        <>
                            {items.map((item) => (
                                <div
                                    key={item.path}
                                    className="group flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                                    title={item.path}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        setItemContextMenu(null);
                                        void onItemClick(item.path);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setItemContextMenu(null);
                                            void onItemClick(item.path);
                                        }
                                    }}
                                    onContextMenu={(event) => {
                                        if (!onItemContextAction || !itemContextActionText) {
                                            return;
                                        }

                                        event.preventDefault();
                                        event.stopPropagation();

                                        const menuWidth = 216;
                                        const menuHeight = 38;
                                        const viewportPadding = 8;
                                        const x = Math.max(
                                            viewportPadding,
                                            Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
                                        );
                                        const y = Math.max(
                                            viewportPadding,
                                            Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
                                        );

                                        setItemContextMenu({
                                            path: item.path,
                                            x,
                                            y,
                                        });
                                    }}
                                >
                                    <span className="flex min-w-0 flex-1 items-start gap-2 text-left">
                                        <span className="max-w-40 truncate text-foreground">{item.name}</span>
                                        <span className="flex-1 truncate text-muted-foreground">{item.path}</span>
                                    </span>
                                    <button
                                        type="button"
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 opacity-0 transition-colors group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                                        title={removeItemText}
                                        aria-label={removeItemText}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setItemContextMenu((current) => current?.path === item.path ? null : current);
                                            onItemRemove(item.path);
                                        }}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            <div className="my-1 h-px bg-border" />
                            <button
                                type="button"
                                className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                onClick={onClear}
                            >
                                {clearText}
                            </button>
                        </>
                    )}
                </div>
            )}

            {menuOpen && itemContextMenu && onItemContextAction && itemContextActionText && (
                <div
                    ref={itemContextMenuRef}
                    style={{
                        position: 'fixed',
                        left: itemContextMenu.x,
                        top: itemContextMenu.y,
                        minWidth: 216,
                    }}
                    className="z-[60] rounded-md border border-border bg-popover p-1 shadow-lg"
                >
                    <button
                        type="button"
                        className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={(event) => {
                            event.stopPropagation();
                            setItemContextMenu(null);
                            void onItemContextAction(itemContextMenu.path);
                        }}
                    >
                        {itemContextActionText}
                    </button>
                </div>
            )}
        </div>
    );
}
