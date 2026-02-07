import { useStore } from '@/store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { File, Folder, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openFilePath } from '@/lib/openFile';
import { useState, useCallback } from 'react';
import { t } from '@/i18n';

export function Sidebar() {
    const { folderPath, folderEntries, sidebarOpen } = useStore();

    if (!sidebarOpen || !folderPath) return null;

    return (
        <div className="w-60 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden">
            <div className="p-3 text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2 border-b">
                <FolderOpen className="w-3 h-3" />
                <span className="truncate">{folderPath.split(/[\\/]/).pop()}</span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                {folderEntries.map((entry) => (
                    <FileEntry key={entry.path} entry={entry} />
                ))}
            </div>
        </div>
    );
}

function FileEntry({ entry, level = 0 }: { entry: any, level?: number }) {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<any[]>([]);
    const { activeTabId, setActiveTab, tabs, settings } = useStore();
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

    const handleToggle = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (entry.is_dir) {
            if (!isOpen && children.length === 0) {
                try {
                    const result = await invoke<any[]>('read_dir', { path: entry.path });
                    // Sort: dirs first, then files
                    result.sort((a, b) => {
                        if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                        return a.is_dir ? -1 : 1;
                    });
                    setChildren(result);
                } catch (e) {
                    console.error(e);
                }
            }
            setIsOpen(!isOpen);
        } else {
            // Check if already open
            const existing = tabs.find(t => t.path === entry.path);
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
    }, [entry, isOpen, children.length, tabs, setActiveTab]);

    return (
        <div>
            <div 
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-accent hover:text-accent-foreground text-xs transition-colors group",
                    !entry.is_dir && activeTabId && tabs.find(t => t.id === activeTabId)?.path === entry.path && "bg-accent/50 text-accent-foreground border-l-2 border-primary pl-[calc(level*12px+6px)]"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={handleToggle}
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
                <span className="truncate flex-1">{entry.name}</span>
            </div>
            {isOpen && entry.is_dir && (
                <div className="overflow-hidden animate-in slide-in-from-left-1 duration-200">
                    {children.length > 0 ? (
                        children.map((child) => (
                            <FileEntry key={child.path} entry={child} level={level + 1} />
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
