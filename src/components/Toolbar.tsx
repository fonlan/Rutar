import { 
    FilePlus, FolderOpen, FileUp, Save, SaveAll, Scissors, Copy, ClipboardPaste, 
    Undo, Redo, Search, Replace, WrapText 
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useStore, FileTab } from '@/store/useStore';

export function Toolbar() {
    const { addTab, tabs, activeTabId, updateTab, setFolder } = useStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const handleNewFile = async () => {
        try {
            const fileInfo = await invoke<FileTab>('new_file');
            addTab(fileInfo);
        } catch (e) {
            console.error('Failed to create new file:', e);
        }
    };

    const handleOpenFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
            });

            if (selected && typeof selected === 'string') {
                 const fileInfo = await invoke<FileTab>('open_file', { path: selected });
                 addTab(fileInfo);
            }
        } catch (e) {
            console.error('Failed to open file:', e);
        }
    };

    const handleOpenFolder = async () => {
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
    };

    const handleSave = async () => {
        if (!activeTab) return;
        try {
            if (activeTab.path) {
                await invoke('save_file', { id: activeTab.id });
                updateTab(activeTab.id, { isDirty: false });
            } else {
                handleSaveAs();
            }
        } catch (e) {
            console.error('Failed to save file:', e);
        }
    };

    const handleSaveAs = async () => {
        if (!activeTab) return;
        try {
            const selected = await save({
                defaultPath: activeTab.name || 'Untitled.txt',
            });
            if (selected) {
                await invoke('save_file_as', { id: activeTab.id, path: selected });
                const name = selected.split(/[\\/]/).pop() || selected;
                updateTab(activeTab.id, { path: selected, name, isDirty: false });
            }
        } catch (e) {
            console.error('Failed to save file as:', e);
        }
    };

    const handleSaveAll = async () => {
        const dirtyTabs = tabs.filter(t => t.isDirty);
        for (const tab of dirtyTabs) {
            try {
                if (tab.path) {
                    await invoke('save_file', { id: tab.id });
                    updateTab(tab.id, { isDirty: false });
                }
            } catch (e) {
                console.error(`Failed to save ${tab.name}:`, e);
            }
        }
    };

    const handleUndo = async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('undo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
        } catch (e) {
            console.warn(e);
        }
    };

    const handleRedo = async () => {
        if (!activeTab) return;
        try {
            const newLineCount = await invoke<number>('redo', { id: activeTab.id });
            updateTab(activeTab.id, { lineCount: newLineCount, isDirty: true });
        } catch (e) {
            console.warn(e);
        }
    };

    return (
        <div className="flex items-center gap-0.5 p-1 border-b bg-background h-10 overflow-x-auto no-scrollbar overflow-y-hidden shadow-sm z-40">
            {/* File Group */}
            <ToolbarBtn icon={FilePlus} title="New File (Ctrl+N)" onClick={handleNewFile} />
            <ToolbarBtn icon={FolderOpen} title="Open File (Ctrl+O)" onClick={handleOpenFile} />
            <ToolbarBtn icon={FileUp} title="Open Folder" onClick={handleOpenFolder} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Save} title="Save (Ctrl+S)" onClick={handleSave} disabled={!activeTab} />
            <ToolbarBtn icon={SaveAll} title="Save All" onClick={handleSaveAll} disabled={tabs.length === 0} />
            
            {/* Edit Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Scissors} title="Cut" disabled={!activeTab} />
            <ToolbarBtn icon={Copy} title="Copy" disabled={!activeTab} />
            <ToolbarBtn icon={ClipboardPaste} title="Paste" disabled={!activeTab} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Undo} title="Undo (Ctrl+Z)" onClick={handleUndo} disabled={!activeTab} />
            <ToolbarBtn icon={Redo} title="Redo (Ctrl+Y)" onClick={handleRedo} disabled={!activeTab} />
            
            {/* Search Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={Search} title="Find (Ctrl+F)" disabled={!activeTab} />
            <ToolbarBtn icon={Replace} title="Replace (Ctrl+H)" disabled={!activeTab} />
            
            {/* View Group */}
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarBtn icon={WrapText} title="Toggle Word Wrap" disabled={!activeTab} />
        </div>
    )
}

function ToolbarBtn({ icon: Icon, title, onClick, disabled }: { icon: any, title: string, onClick?: () => void, disabled?: boolean }) {
    return (
        <button 
            type="button"
            className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-30 flex-shrink-0 transition-colors"
            title={title}
            onClick={onClick}
            disabled={disabled}
        >
            <Icon className="w-4 h-4" />
        </button>
    )
}
