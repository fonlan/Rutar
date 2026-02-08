import {
    FilePlus, FolderOpen, FileUp, Save, SaveAll, Scissors, Copy, ClipboardPaste, 
    Undo, Redo, Search, Replace, Filter as FilterIcon, WrapText, ListTree, WandSparkles, Minimize2, Bookmark
} from 'lucide-react';
import { message, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect } from 'react';
import { openFilePath } from '@/lib/openFile';
import { useStore, FileTab } from '@/store/useStore';
import { t } from '@/i18n';
import { detectContentTreeType, loadContentTree } from '@/lib/contentTree';
import { toolbarFormatMessages } from '@/lib/i18nToolbarFormat';
import { isStructuredFormatSupported } from '@/lib/structuredFormat';
import { confirmTabClose, saveTab } from '@/lib/tabClose';

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

function getActiveEditorElement() {
    return document.querySelector('.editor-input-layer') as HTMLDivElement | null;
}

export function Toolbar() {
    const addTab = useStore((state) => state.addTab);
    const tabs = useStore((state) => state.tabs);
    const activeTabId = useStore((state) => state.activeTabId);
    const closeTab = useStore((state) => state.closeTab);
    const updateTab = useStore((state) => state.updateTab);
    const setFolder = useStore((state) => state.setFolder);
    const language = useStore((state) => state.settings.language);
    const tabWidth = useStore((state) => state.settings.tabWidth);
    const wordWrap = useStore((state) => state.settings.wordWrap);
    const updateSettings = useStore((state) => state.updateSettings);
    const toggleContentTree = useStore((state) => state.toggleContentTree);
    const contentTreeOpen = useStore((state) => state.contentTreeOpen);
    const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
    const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
    const setContentTreeData = useStore((state) => state.setContentTreeData);
    const activeTab = tabs.find(t => t.id === activeTabId);
    const canEdit = !!activeTab;
    const canFormat = !!activeTab && isStructuredFormatSupported(activeTab);
    const tr = (key: Parameters<typeof t>[1]) => t(language, key);
    const filterTitle = language === 'en-US' ? 'Filter' : '过滤';

    const formatMessages = toolbarFormatMessages[language];

    const runStructuredFormat = useCallback(async (mode: 'beautify' | 'minify') => {
        if (!activeTab) {
            return;
        }

        if (!isStructuredFormatSupported(activeTab)) {
            await message(formatMessages.unsupported, {
                title: tr('titleBar.settings'),
                kind: 'warning',
            });
            return;
        }

        try {
            const newLineCount = await invoke<number>('format_document', {
                id: activeTab.id,
                mode,
                filePath: activeTab.path,
                fileName: activeTab.name,
                tabWidth,
            });

            updateTab(activeTab.id, {
                lineCount: Math.max(1, newLineCount),
                isDirty: true,
            });

            dispatchEditorForceRefresh(activeTab.id, newLineCount);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await message(`${formatMessages.failed} ${errorMessage}`, {
                title: tr('titleBar.settings'),
                kind: 'warning',
            });
        }
    }, [activeTab, formatMessages.failed, formatMessages.unsupported, tabWidth, tr, updateTab]);

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
            const fileInfo = await invoke<FileTab>('new_file');
            addTab(fileInfo);
        } catch (e) {
            console.error('Failed to create new file:', e);
        }
    }, [addTab]);

    const handleOpenFile = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
            });

            if (selected && typeof selected === 'string') {
                await openFilePath(selected);
            }
        } catch (e) {
            console.error('Failed to open file:', e);
        }
    }, []);

    const handleOpenFolder = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: true,
            });

            if (selected && typeof selected === 'string') {
                 const entries = await invoke<any[]>('read_dir', { path: selected });
                 // Sort entries
                 entries.sort((a, b) => {
                    if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                    return a.is_dir ? -1 : 1;
                 });
                 setFolder(selected, entries);
            }
        } catch (e) {
            console.error('Failed to open folder:', e);
        }
    }, [setFolder]);

    const handleSave = useCallback(async () => {
        if (!activeTab) return;
        try {
            await persistTab(activeTab);
        } catch (e) {
            console.error('Failed to save file:', e);
        }
    }, [activeTab, persistTab]);

    const handleSaveAll = useCallback(async () => {
        const dirtyTabs = tabs.filter(t => t.isDirty);
        for (const tab of dirtyTabs) {
            try {
                await persistTab(tab);
            } catch (e) {
                console.error(`Failed to save ${tab.name}:`, e);
            }
        }
    }, [persistTab, tabs]);

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
                const fileInfo = await invoke<FileTab>('new_file');
                addTab(fileInfo);
            }
        } catch (e) {
            console.error('Failed to close tab:', e);
        }
    }, [activeTab, addTab, closeTab, language, persistTab, tabs.length]);

    const handleUndo = useCallback(async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('undo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
            dispatchEditorForceRefresh(activeTab.id, newLineCount, { preserveCaret: true });
        } catch (e) {
            console.warn(e);
        }
    }, [activeTab, updateTab]);

    const handleRedo = useCallback(async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('redo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
            dispatchEditorForceRefresh(activeTab.id, newLineCount, { preserveCaret: true });
        } catch (e) {
            console.warn(e);
        }
    }, [activeTab, updateTab]);

    const handleClipboardAction = useCallback(async (action: 'cut' | 'copy' | 'paste') => {
        const editor = getActiveEditorElement();
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

        if (activeTab && navigator.clipboard?.readText) {
            try {
                const clipboardText = await navigator.clipboard.readText();
                dispatchEditorPaste(activeTab.id, clipboardText);
                return;
            } catch (error) {
                console.warn('Failed to read clipboard text:', error);
            }
        }

        if (runExecCommand('paste')) {
            return;
        }

        console.warn('Paste command blocked. Use Ctrl+V in editor.');
    }, [activeTab]);

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

    const handleToggleBookmarkSidebar = useCallback(() => {
        if (!activeTab) {
            return;
        }

        toggleBookmarkSidebar();
    }, [activeTab, toggleBookmarkSidebar]);

    const handleToggleContentTree = useCallback(async () => {
        if (!activeTab) {
            await message(tr('contentTree.unsupportedType'), {
                title: tr('contentTree.title'),
                kind: 'warning',
            });
            return;
        }

        const treeType = detectContentTreeType(activeTab);
        if (!treeType) {
            await message(tr('contentTree.unsupportedType'), {
                title: tr('contentTree.title'),
                kind: 'warning',
            });
            return;
        }

        if (contentTreeOpen) {
            toggleContentTree(false);
            return;
        }

        try {
            const nodes = await loadContentTree(activeTab, treeType);
            setContentTreeData({
                treeType,
                nodes,
                error: null,
            });
            toggleContentTree(true);
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            await message(`${tr('contentTree.parseFailed')} ${messageText}`, {
                title: tr('contentTree.title'),
                kind: 'warning',
            });
            setContentTreeData({
                treeType,
                nodes: [],
                error: messageText,
            });
        }
    }, [activeTab, contentTreeOpen, setContentTreeData, toggleContentTree, tr]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const withPrimaryModifier = event.ctrlKey || event.metaKey;
            if (!withPrimaryModifier) return;

            const key = event.key.toLowerCase();
            const code = event.code;
            const isKey = (letter: string) => key === letter || code === `Key${letter.toUpperCase()}`;

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
        handleRedo,
        handleReplace,
        handleFilter,
        handleFormatBeautify,
        handleFormatMinify,
        handleSave,
        handleSaveAll,
        handleUndo,
    ]);

    return (
        <div
            className="flex items-center gap-0.5 p-1 border-b bg-background h-10 overflow-x-auto no-scrollbar overflow-y-hidden z-40"
            data-layout-region="toolbar"
        >
            {/* File Group */}
            <ToolbarBtn icon={FilePlus} title={tr('toolbar.newFile')} onClick={handleNewFile} />
            <ToolbarBtn icon={FolderOpen} title={tr('toolbar.openFile')} onClick={handleOpenFile} />
            <ToolbarBtn icon={FileUp} title={tr('toolbar.openFolder')} onClick={handleOpenFolder} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Save} title={tr('toolbar.save')} onClick={handleSave} disabled={!activeTab} />
            <ToolbarBtn icon={SaveAll} title={tr('toolbar.saveAll')} onClick={handleSaveAll} disabled={tabs.length === 0} />
            
            {/* Edit Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Scissors} title={tr('toolbar.cut')} onClick={() => void handleClipboardAction('cut')} disabled={!canEdit} />
            <ToolbarBtn icon={Copy} title={tr('toolbar.copy')} onClick={() => void handleClipboardAction('copy')} disabled={!activeTab} />
            <ToolbarBtn icon={ClipboardPaste} title={tr('toolbar.paste')} onClick={() => void handleClipboardAction('paste')} disabled={!canEdit} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Undo} title={tr('toolbar.undo')} onClick={handleUndo} disabled={!canEdit} />
            <ToolbarBtn icon={Redo} title={tr('toolbar.redo')} onClick={handleRedo} disabled={!canEdit} />
            
            {/* Search Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Search} title={tr('toolbar.find')} onClick={handleFind} disabled={!activeTab} />
            <ToolbarBtn icon={Replace} title={tr('toolbar.replace')} onClick={() => void handleReplace()} disabled={!canEdit} />
            <ToolbarBtn icon={FilterIcon} title={filterTitle} onClick={handleFilter} disabled={!activeTab} />

            {/* Format Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={WandSparkles}
                title={formatMessages.beautify}
                onClick={() => void handleFormatBeautify()}
                disabled={!canFormat}
            />
            <ToolbarBtn
                icon={Minimize2}
                title={formatMessages.minify}
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
                title={tr('toolbar.contentTree')}
                onClick={() => void handleToggleContentTree()}
                active={contentTreeOpen}
            />
        </div>
    )
}

function ToolbarBtn({ icon: Icon, title, onClick, disabled, active }: { icon: any, title: string, onClick?: () => void, disabled?: boolean, active?: boolean }) {
    return (
        <button 
            type="button"
            className={`p-2 rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-30 flex-shrink-0 transition-colors ${active ? 'bg-accent text-accent-foreground' : ''}`}
            title={title}
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
    )
}
