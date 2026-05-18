import { useStore, type FolderEntry } from '@/store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { File, Folder, ChevronRight, ChevronDown, FolderOpen, X, Search, Replace, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openFilePath } from '@/lib/openFile';
import { useState, useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '@/i18n';
import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';

const SIDEBAR_MIN_WIDTH = 140;
const SIDEBAR_MAX_WIDTH = 600;
const INVALID_ENTRY_NAME_CHARACTERS = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_WINDOWS_BASENAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
]);

type FileTreeContextMenuState = {
    entry: FolderEntry;
    x: number;
    y: number;
};

interface FolderTreeChangePayload {
    rootPath?: string;
    directoryPaths?: string[];
}

function getParentPath(path: string) {
    const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (separatorIndex < 0) {
        return null;
    }

    const parentPath = path.slice(0, separatorIndex);
    if (/^[a-zA-Z]:$/.test(parentPath)) {
        return `${parentPath}\\`;
    }

    if (!parentPath && path.startsWith('/')) {
        return '/';
    }

    return parentPath || null;
}

function normalizeComparablePath(path: string) {
    let normalized = path.replace(/\\/g, '/');
    while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }

    return normalized.toLowerCase();
}

function replacePathPrefix(path: string, oldPath: string, newPath: string) {
    const normalizedPath = normalizeComparablePath(path);
    const normalizedOldPath = normalizeComparablePath(oldPath);

    if (normalizedPath === normalizedOldPath) {
        return newPath;
    }

    if (!normalizedPath.startsWith(`${normalizedOldPath}/`)) {
        return path;
    }

    return `${newPath}${path.slice(oldPath.length)}`;
}

function dispatchFolderTreeChanged(rootPath: string | null, directoryPaths: string[]) {
    if (!rootPath || directoryPaths.length === 0) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<FolderTreeChangePayload>('rutar:folder-tree-changed', {
            detail: {
                rootPath,
                directoryPaths,
            },
        })
    );
}

function validateEntryName(
    nextName: string,
    currentEntry: FolderEntry,
    siblingEntries: FolderEntry[],
    tr: (key: Parameters<typeof t>[1]) => string
) {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
        return tr('sidebar.renameInvalidEmpty');
    }

    if (trimmedName === '.' || trimmedName === '..') {
        return tr('sidebar.renameInvalidReserved');
    }

    if (trimmedName.endsWith(' ') || trimmedName.endsWith('.')) {
        return tr('sidebar.renameInvalidEnding');
    }

    if (INVALID_ENTRY_NAME_CHARACTERS.test(trimmedName)) {
        return tr('sidebar.renameInvalidChars');
    }

    const baseName = trimmedName.split('.')[0]?.toUpperCase() ?? '';
    if (RESERVED_WINDOWS_BASENAMES.has(baseName)) {
        return tr('sidebar.renameInvalidReserved');
    }

    const duplicateEntry = siblingEntries.some((entry) => (
        entry.path !== currentEntry.path && entry.name.toLowerCase() === trimmedName.toLowerCase()
    ));

    return duplicateEntry ? tr('sidebar.renameDuplicate') : null;
}

function updateTabsForRenamedPath(oldPath: string, renamedEntry: FolderEntry) {
    const state = useStore.getState();

    for (const tab of state.tabs) {
        const nextTabPath = replacePathPrefix(tab.path, oldPath, renamedEntry.path);
        const nextDiffPayload = tab.diffPayload
            ? {
                ...tab.diffPayload,
                sourcePath: replacePathPrefix(tab.diffPayload.sourcePath, oldPath, renamedEntry.path),
                targetPath: replacePathPrefix(tab.diffPayload.targetPath, oldPath, renamedEntry.path),
            }
            : undefined;
        const hasPathChange = nextTabPath !== tab.path;
        const hasDiffPayloadChange = !!nextDiffPayload && (
            nextDiffPayload.sourcePath !== tab.diffPayload?.sourcePath ||
            nextDiffPayload.targetPath !== tab.diffPayload?.targetPath
        );

        if (!hasPathChange && !hasDiffPayloadChange) {
            continue;
        }

        state.updateTab(tab.id, {
            ...(hasPathChange ? { path: nextTabPath, name: nextTabPath === renamedEntry.path ? renamedEntry.name : tab.name } : {}),
            ...(hasDiffPayloadChange ? { diffPayload: nextDiffPayload } : {}),
        });
    }
}

export function Sidebar() {
    const folderPath = useStore((state) => state.folderPath);
    const folderEntries = useStore((state) => state.folderEntries);
    const setFolder = useStore((state) => state.setFolder);
    const sidebarOpen = useStore((state) => state.sidebarOpen);
    const sidebarWidth = useStore((state) => state.sidebarWidth);
    const setSidebarWidth = useStore((state) => state.setSidebarWidth);
    const toggleSidebar = useStore((state) => state.toggleSidebar);
    const language = useStore((state) => state.settings.language);
    const tr = (key: Parameters<typeof t>[1]) => t(language, key);
    const [contextMenu, setContextMenu] = useState<FileTreeContextMenuState | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const { containerRef, previewIndicatorRef, isResizing, startResize } = useResizableSidebarWidth({
        width: sidebarWidth,
        minWidth: SIDEBAR_MIN_WIDTH,
        maxWidth: SIDEBAR_MAX_WIDTH,
        onWidthChange: setSidebarWidth,
        liveResize: false,
    });

    const refreshRootEntries = useCallback(async () => {
        if (!folderPath) {
            return;
        }

        try {
            const result = await invoke<FolderEntry[] | null>('read_dir_if_directory', { path: folderPath });
            if (result === null) {
                setFolder(null, []);
                return;
            }

            setFolder(folderPath, result);
        } catch (error) {
            console.error('Failed to refresh root folder tree:', error);
        }
    }, [folderPath, setFolder]);

    useEffect(() => {
        if (!folderPath) {
            return;
        }

        const handleFolderTreeChanged = (event: Event) => {
            const payload = (event as CustomEvent<FolderTreeChangePayload>).detail;
            if (payload?.rootPath !== folderPath) {
                return;
            }

            if (!payload.directoryPaths?.includes(folderPath)) {
                return;
            }

            void refreshRootEntries();
        };

        window.addEventListener('rutar:folder-tree-changed', handleFolderTreeChanged as EventListener);
        return () => {
            window.removeEventListener('rutar:folder-tree-changed', handleFolderTreeChanged as EventListener);
        };
    }, [folderPath, refreshRootEntries]);

    useEffect(() => {
        if (!contextMenu) {
            return;
        }

        const closeContextMenu = () => setContextMenu(null);
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeContextMenu();
            }
        };

        window.addEventListener('pointerdown', closeContextMenu);
        window.addEventListener('resize', closeContextMenu);
        window.addEventListener('scroll', closeContextMenu, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', closeContextMenu);
            window.removeEventListener('resize', closeContextMenu);
            window.removeEventListener('scroll', closeContextMenu, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu]);

    const handleEntryContextMenu = useCallback((event: MouseEvent, entry: FolderEntry) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            entry,
            x: event.clientX,
            y: event.clientY,
        });
    }, []);

    const openSearchPanelForEntry = useCallback((entry: FolderEntry, mode: 'find' | 'replace') => {
        setContextMenu(null);
        window.dispatchEvent(
            new CustomEvent('rutar:search-open', {
                detail: {
                    mode,
                    targetPath: entry.path,
                    includeSubdirectories: entry.is_dir,
                },
            })
        );
    }, []);

    const handleRenameAction = useCallback((entry: FolderEntry) => {
        setContextMenu(null);
        setRenamingPath(entry.path);
    }, []);

    const handleRenameCommitted = useCallback((oldPath: string, renamedEntry: FolderEntry) => {
        updateTabsForRenamedPath(oldPath, renamedEntry);

        const parentPath = getParentPath(oldPath);
        dispatchFolderTreeChanged(folderPath, parentPath ? [parentPath] : []);
    }, [folderPath]);

    const handleDeleteAction = useCallback(async (entry: FolderEntry) => {
        setContextMenu(null);
        const confirmed = await ask(
            tr('sidebar.deleteConfirm').replace('{name}', entry.name),
            {
                title: 'Rutar',
                kind: 'warning',
            }
        );

        if (!confirmed) {
            return;
        }

        try {
            await invoke('delete_path', { path: entry.path });
            const parentPath = getParentPath(entry.path);
            dispatchFolderTreeChanged(folderPath, parentPath ? [parentPath] : []);
        } catch (error) {
            window.alert(`${tr('sidebar.deleteFailed')}${error instanceof Error ? error.message : String(error)}`);
        }
    }, [folderPath, tr]);

    if (!sidebarOpen || !folderPath) return null;

    return (
        <div
            ref={containerRef}
            className="relative shrink-0 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden"
            style={{ width: `${sidebarWidth}px` }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="p-3 text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2 border-b">
                <FolderOpen className="w-3 h-3" />
                <span className="truncate">{folderPath.split(/[\\/]/).pop()}</span>
                <button
                    type="button"
                    className="ml-auto inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title={tr('sidebar.close')}
                    aria-label={tr('sidebar.close')}
                    onClick={() => toggleSidebar(false)}
                >
                    <X className="w-3 h-3" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                {folderEntries.map((entry) => (
                    <FileEntry
                        key={entry.path}
                        entry={entry}
                        siblings={folderEntries}
                        renamingPath={renamingPath}
                        onCancelRename={() => setRenamingPath(null)}
                        onContextMenu={handleEntryContextMenu}
                        onRenameCommitted={handleRenameCommitted}
                    />
                ))}
            </div>
            {contextMenu && (
                <div
                    role="menu"
                    className="fixed z-[120] min-w-[150px] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onContextMenu={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => openSearchPanelForEntry(contextMenu.entry, 'find')}
                    >
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        {tr('sidebar.context.search')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => openSearchPanelForEntry(contextMenu.entry, 'replace')}
                    >
                        <Replace className="h-3.5 w-3.5 text-muted-foreground" />
                        {tr('sidebar.context.replace')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => handleRenameAction(contextMenu.entry)}
                    >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        {tr('sidebar.context.rename')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
                        onClick={() => void handleDeleteAction(contextMenu.entry)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {tr('sidebar.context.delete')}
                    </button>
                </div>
            )}
            <div
                ref={previewIndicatorRef}
                aria-hidden="true"
                className={cn(
                    'pointer-events-none fixed bottom-auto top-0 z-[80] w-px bg-primary/70 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]',
                    isResizing ? 'opacity-100' : 'opacity-0'
                )}
            />
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize file tree sidebar"
                onPointerDown={startResize}
                className={cn(
                    'absolute top-0 right-[-3px] h-full w-1.5 cursor-col-resize touch-none transition-colors',
                    isResizing ? 'bg-primary/40' : 'hover:bg-primary/25'
                )}
            />
        </div>
    );
}

interface FileEntryProps {
    entry: FolderEntry;
    siblings: FolderEntry[];
    level?: number;
    renamingPath: string | null;
    onCancelRename: () => void;
    onContextMenu: (event: MouseEvent, entry: FolderEntry) => void;
    onRenameCommitted: (oldPath: string, renamedEntry: FolderEntry) => void;
}

function FileEntry({
    entry,
    siblings,
    level = 0,
    renamingPath,
    onCancelRename,
    onContextMenu,
    onRenameCommitted,
}: FileEntryProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FolderEntry[]>([]);
    const [hasLoadedChildren, setHasLoadedChildren] = useState(false);
    const [renameDraft, setRenameDraft] = useState(entry.name);
    const [renameError, setRenameError] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const renameCommitInFlightRef = useRef(false);
    const setActiveTab = useStore((state) => state.setActiveTab);
    const isActiveFile = useStore((state) =>
      !entry.is_dir
        ? state.tabs.some((tab) => tab.id === state.activeTabId && tab.path === entry.path)
        : false,
    );
    const language = useStore((state) => state.settings.language);
    const tr = (key: Parameters<typeof t>[1]) => t(language, key);
    const isRenaming = renamingPath === entry.path;

    const loadChildren = useCallback(async () => {
        const result = await invoke<FolderEntry[]>('read_dir', { path: entry.path });
        setChildren(result);
        setHasLoadedChildren(true);
    }, [entry.path]);

    const handleToggle = useCallback(async (event?: { stopPropagation?: () => void }) => {
        event?.stopPropagation?.();
        if (entry.is_dir) {
            if (!isOpen && !hasLoadedChildren) {
                try {
                    await loadChildren();
                } catch (e) {
                    console.error(e);
                }
            }
            setIsOpen(!isOpen);
        } else {
            // Check if already open
            const existing = useStore.getState().tabs.find((t) => t.path === entry.path);
            if (existing) {
                setActiveTab(existing.id);
            } else {
                try {
                    await openFilePath(entry.path);
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }, [entry, hasLoadedChildren, isOpen, loadChildren, setActiveTab]);

    useEffect(() => {
        if (!isRenaming) {
            return;
        }

        setRenameDraft(entry.name);
        setRenameError(null);
        window.requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        });
    }, [entry.name, isRenaming]);

    const keepRenameFocus = useCallback(() => {
        window.setTimeout(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }, 0);
    }, []);

    const commitRename = useCallback(async () => {
        if (!isRenaming || renameCommitInFlightRef.current) {
            return;
        }

        const nextName = renameDraft.trim();
        if (nextName === entry.name) {
            onCancelRename();
            return;
        }

        const validationError = validateEntryName(nextName, entry, siblings, tr);
        if (validationError) {
            setRenameError(validationError);
            keepRenameFocus();
            return;
        }

        renameCommitInFlightRef.current = true;
        try {
            const renamedEntry = await invoke<FolderEntry>('rename_path', {
                path: entry.path,
                newName: nextName,
            });
            onRenameCommitted(entry.path, renamedEntry);
            onCancelRename();
        } catch (error) {
            setRenameError(`${tr('sidebar.renameFailed')}${error instanceof Error ? error.message : String(error)}`);
            keepRenameFocus();
        } finally {
            renameCommitInFlightRef.current = false;
        }
    }, [entry, isRenaming, keepRenameFocus, onCancelRename, onRenameCommitted, renameDraft, siblings, tr]);

    const handleRenameBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
        event.preventDefault();
        void commitRename();
    }, [commitRename]);

    const handleRenameKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void commitRename();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            onCancelRename();
        }
    }, [commitRename, onCancelRename]);

    useEffect(() => {
        if (!entry.is_dir || !isOpen) {
            return;
        }

        const handleFolderTreeChanged = (event: Event) => {
            const payload = (event as CustomEvent<FolderTreeChangePayload>).detail;
            if (!payload?.directoryPaths?.includes(entry.path)) {
                return;
            }

            void loadChildren().catch((error) => {
                console.error('Failed to refresh folder tree node:', error);
            });
        };

        window.addEventListener('rutar:folder-tree-changed', handleFolderTreeChanged as EventListener);
        return () => {
            window.removeEventListener('rutar:folder-tree-changed', handleFolderTreeChanged as EventListener);
        };
    }, [entry.is_dir, entry.path, isOpen, loadChildren]);


    return (
        <div>
            <div 
                className={cn(
                    "group flex items-center gap-1.5 px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    isRenaming ? "cursor-text" : "cursor-pointer",
                    isActiveFile && "bg-accent/50 text-accent-foreground border-l-2 border-primary pl-[calc(level*12px+6px)]"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={(event) => {
                    if (isRenaming) {
                        event.stopPropagation();
                        return;
                    }
                    void handleToggle(event);
                }}
                onContextMenu={(event) => onContextMenu(event, entry)}
                onKeyDown={(event) => {
                    if (isRenaming) {
                        return;
                    }

                    if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }

                    event.preventDefault();
                    void handleToggle();
                }}
                role="button"
                tabIndex={0}
                aria-expanded={entry.is_dir ? isOpen : undefined}
                aria-current={isActiveFile ? 'page' : undefined}
            >
                {entry.is_dir ? (
                    <>
                        <span className="w-4 h-4 flex items-center justify-center">
                            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </span>
                        <Folder className={cn("w-4 h-4 text-blue-500/80", isOpen && "fill-blue-500/20")} />
                    </>
                ) : (
                    <>
                        <div className="w-4" />
                        <File className="w-4 h-4 text-muted-foreground/60" />
                    </>
                )}
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        value={renameDraft}
                        onChange={(event) => {
                            setRenameDraft(event.target.value);
                            setRenameError(null);
                        }}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                            "h-5 min-w-0 flex-1 rounded border bg-background px-1 text-xs outline-none",
                            renameError ? "border-destructive focus-visible:ring-1 focus-visible:ring-destructive" : "border-input focus-visible:ring-1 focus-visible:ring-ring"
                        )}
                        aria-label={tr('sidebar.context.rename')}
                        aria-invalid={!!renameError}
                        title={renameError ?? entry.name}
                        spellCheck={false}
                    />
                ) : (
                    <span className="truncate flex-1">{entry.name}</span>
                )}
            </div>
            {isRenaming && renameError && (
                <div
                    className="px-2 pb-1 text-[10px] text-destructive"
                    style={{ paddingLeft: `${level * 12 + 32}px` }}
                >
                    {renameError}
                </div>
            )}
            {isOpen && entry.is_dir && (
                <div className="overflow-hidden animate-in slide-in-from-left-1 duration-200">
                    {children.length > 0 ? (
                        children.map((child) => (
                            <FileEntry
                                key={child.path}
                                entry={child}
                                siblings={children}
                                level={level + 1}
                                renamingPath={renamingPath}
                                onCancelRename={onCancelRename}
                                onContextMenu={onContextMenu}
                                onRenameCommitted={onRenameCommitted}
                            />
                        ))
                ) : (
                        <div 
                            className="py-1 text-[10px] text-muted-foreground italic"
                            style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
                        >
                            {tr('sidebar.empty')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
