import { 
    FilePlus, FolderOpen, FileUp, Save, SaveAll, Scissors, Copy, ClipboardPaste, 
    Undo, Redo, Search, Replace, WrapText 
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import { useStore, FileTab } from '@/store/useStore';

const MAX_LINE_RANGE = 2147483647;

function dispatchEditorForceRefresh(tabId: string, lineCount?: number) {
    window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
            detail: { tabId, lineCount },
        })
    );
}

function getActiveEditorElement() {
    return document.querySelector('.editor-input-layer') as HTMLDivElement | null;
}

export function Toolbar() {
    const {
        addTab,
        tabs,
        activeTabId,
        updateTab,
        setFolder,
        setActiveTab,
        settings,
        updateSettings,
    } = useStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const canEdit = !!activeTab && !activeTab.largeFileMode;
    const lastFindRef = useRef('');
    const lastReplaceRef = useRef('');

    const saveTab = useCallback(async (tab: FileTab) => {
        if (tab.path) {
            await invoke('save_file', { id: tab.id });
            updateTab(tab.id, { isDirty: false });
            return true;
        }

        const selected = await save({
            defaultPath: tab.name || 'Untitled.txt',
        });

        if (!selected) {
            return false;
        }

        await invoke('save_file_as', { id: tab.id, path: selected });
        const name = selected.split(/[\\/]/).pop() || selected;
        updateTab(tab.id, { path: selected, name, isDirty: false });
        return true;
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
                 const existing = tabs.find((tab) => tab.path === selected);
                 if (existing) {
                    setActiveTab(existing.id);
                    return;
                 }

                 const fileInfo = await invoke<FileTab>('open_file', { path: selected });
                 addTab(fileInfo);
            }
        } catch (e) {
            console.error('Failed to open file:', e);
        }
    }, [addTab, setActiveTab, tabs]);

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
            await saveTab(activeTab);
        } catch (e) {
            console.error('Failed to save file:', e);
        }
    }, [activeTab, saveTab]);

    const handleSaveAll = useCallback(async () => {
        const dirtyTabs = tabs.filter(t => t.isDirty);
        for (const tab of dirtyTabs) {
            try {
                await saveTab(tab);
            } catch (e) {
                console.error(`Failed to save ${tab.name}:`, e);
            }
        }
    }, [saveTab, tabs]);

    const handleUndo = useCallback(async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('undo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
            dispatchEditorForceRefresh(activeTab.id, newLineCount);
        } catch (e) {
            console.warn(e);
        }
    }, [activeTab, updateTab]);

    const handleRedo = useCallback(async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('redo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
            dispatchEditorForceRefresh(activeTab.id, newLineCount);
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

        if (runExecCommand('paste')) {
            return;
        }

        console.warn('Paste command blocked. Use Ctrl+V in editor.');
    }, []);

    const handleFind = useCallback(() => {
        if (!activeTab) return;

        const keyword = window.prompt('Find', lastFindRef.current);
        if (keyword === null) return;

        const normalizedKeyword = keyword.trim();
        if (!normalizedKeyword) return;
        lastFindRef.current = normalizedKeyword;

        const editor = getActiveEditorElement();
        if (editor && document.activeElement !== editor) {
            editor.focus();
        }

        const finder = (window as Window & {
            find?: (
                text: string,
                caseSensitive?: boolean,
                backwards?: boolean,
                wrapAround?: boolean,
                wholeWord?: boolean,
                searchInFrames?: boolean,
                showDialog?: boolean,
            ) => boolean;
        }).find;

        if (typeof finder === 'function') {
            const found = finder(normalizedKeyword, false, false, true, false, false, false);
            if (!found) {
                finder(normalizedKeyword, false, false, false, false, false, false);
            }
        }
    }, [activeTab]);

    const handleReplace = useCallback(async () => {
        if (!activeTab || activeTab.largeFileMode) return;

        const findText = window.prompt('Find text', lastFindRef.current);
        if (findText === null) return;
        if (!findText) return;

        const replaceText = window.prompt('Replace with', lastReplaceRef.current);
        if (replaceText === null) return;

        lastFindRef.current = findText;
        lastReplaceRef.current = replaceText;

        try {
            const rawText = await invoke<string>('get_visible_lines', {
                id: activeTab.id,
                startLine: 0,
                endLine: MAX_LINE_RANGE,
            });

            const sourceText = rawText || '';
            const replacedText = sourceText.split(findText).join(replaceText);
            if (replacedText === sourceText) {
                return;
            }

            const newLineCount = await invoke<number>('replace_line_range', {
                id: activeTab.id,
                startLine: 0,
                endLine: MAX_LINE_RANGE,
                newText: replacedText,
            });

            updateTab(activeTab.id, {
                lineCount: Math.max(1, newLineCount),
                isDirty: true,
            });
            dispatchEditorForceRefresh(activeTab.id, Math.max(1, newLineCount));
        } catch (e) {
            console.error('Replace failed:', e);
        }
    }, [activeTab, updateTab]);

    const handleToggleWordWrap = useCallback(() => {
        updateSettings({ wordWrap: !settings.wordWrap });
    }, [settings.wordWrap, updateSettings]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const withPrimaryModifier = event.ctrlKey || event.metaKey;
            if (!withPrimaryModifier || event.altKey) return;

            const key = event.key.toLowerCase();

            if (key === 'n') {
                event.preventDefault();
                void handleNewFile();
                return;
            }

            if (key === 'o') {
                event.preventDefault();
                void handleOpenFile();
                return;
            }

            if (key === 's') {
                event.preventDefault();
                if (event.shiftKey) {
                    void handleSaveAll();
                } else {
                    void handleSave();
                }
                return;
            }

            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                void handleUndo();
                return;
            }

            if (key === 'y' || (key === 'z' && event.shiftKey)) {
                event.preventDefault();
                void handleRedo();
                return;
            }

            if (key === 'f') {
                event.preventDefault();
                handleFind();
                return;
            }

            if (key === 'h') {
                event.preventDefault();
                void handleReplace();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        handleFind,
        handleNewFile,
        handleOpenFile,
        handleRedo,
        handleReplace,
        handleSave,
        handleSaveAll,
        handleUndo,
    ]);

    return (
        <div className="flex items-center gap-0.5 p-1 border-b bg-background h-10 overflow-x-auto no-scrollbar overflow-y-hidden shadow-sm z-40">
            {/* File Group */}
            <ToolbarBtn icon={FilePlus} title="New File (Ctrl+N)" onClick={handleNewFile} />
            <ToolbarBtn icon={FolderOpen} title="Open File (Ctrl+O)" onClick={handleOpenFile} />
            <ToolbarBtn icon={FileUp} title="Open Folder" onClick={handleOpenFolder} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Save} title="Save (Ctrl+S)" onClick={handleSave} disabled={!activeTab} />
            <ToolbarBtn icon={SaveAll} title="Save All (Ctrl+Shift+S)" onClick={handleSaveAll} disabled={tabs.length === 0} />
            
            {/* Edit Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Scissors} title="Cut" onClick={() => void handleClipboardAction('cut')} disabled={!canEdit} />
            <ToolbarBtn icon={Copy} title="Copy" onClick={() => void handleClipboardAction('copy')} disabled={!activeTab} />
            <ToolbarBtn icon={ClipboardPaste} title="Paste" onClick={() => void handleClipboardAction('paste')} disabled={!canEdit} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Undo} title="Undo (Ctrl+Z)" onClick={handleUndo} disabled={!canEdit} />
            <ToolbarBtn icon={Redo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={handleRedo} disabled={!canEdit} />
            
            {/* Search Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Search} title="Find (Ctrl+F)" onClick={handleFind} disabled={!activeTab} />
            <ToolbarBtn icon={Replace} title="Replace (Ctrl+H)" onClick={() => void handleReplace()} disabled={!canEdit} />
            
            {/* View Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn
                icon={WrapText}
                title="Toggle Word Wrap"
                onClick={handleToggleWordWrap}
                active={!!settings.wordWrap}
                disabled={!activeTab}
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
