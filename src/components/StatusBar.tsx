import { useStore } from '@/store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { Globe, Zap } from 'lucide-react';

export function StatusBar() {
    const { tabs, activeTabId, updateTab } = useStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    if (!activeTab) return (
        <div
            className="h-6 bg-muted/50 border-t flex items-center px-3 text-[10px] text-muted-foreground select-none"
            data-layout-region="statusbar"
        >
            Rutar Ready
        </div>
    );

    const encodings = [
        'UTF-8',
        'GBK',
        'Shift_JIS',
        'Windows-1252',
        'ISO-8859-1'
    ];

    const handleEncodingChange = async (newEnc: string) => {
        try {
            await invoke('convert_encoding', { id: activeTab.id, newEncoding: newEnc });
            updateTab(activeTab.id, { encoding: newEnc, isDirty: true });
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div
            className="h-6 bg-muted/50 border-t flex items-center justify-between px-3 text-[10px] text-muted-foreground select-none"
            data-layout-region="statusbar"
        >
            <div className="flex items-center gap-4">
                {activeTab.largeFileMode && (
                    <>
                        <span className="flex items-center gap-1 text-orange-500 font-medium">
                            <Zap className="w-3 h-3" />
                            Highlight Off (Large File)
                        </span>
                        <div className="w-[1px] h-3 bg-border" />
                    </>
                )}
                <span>Lines: {activeTab.lineCount.toLocaleString()}</span>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 group cursor-pointer hover:text-foreground transition-colors">
                    <Globe className="w-3 h-3" />
                    <select 
                        className="bg-transparent border-none outline-none cursor-pointer appearance-none text-[10px]"
                        value={activeTab.encoding}
                        onChange={(e) => handleEncodingChange(e.target.value)}
                    >
                        {encodings.map(enc => (
                            <option key={enc} value={enc} className="bg-background text-foreground">{enc}</option>
                        ))}
                    </select>
                </div>
                <div className="w-[1px] h-3 bg-border" />
                <span className="font-medium uppercase">{activeTab.name.split('.').pop() || 'txt'}</span>
            </div>
        </div>
    );
}
