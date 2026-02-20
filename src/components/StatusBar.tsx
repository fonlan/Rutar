import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { invoke } from '@tauri-apps/api/core';
import { Globe, Zap } from 'lucide-react';
import { t } from '@/i18n';
import { detectSyntaxKeyFromTab, getSyntaxLabel, SYNTAX_OPTIONS } from '@/lib/syntax';
import { SyntaxKey } from '@/store/useStore';

type LineEnding = 'CRLF' | 'LF' | 'CR';
type EncodingOption = {
    value: string;
    label: string;
};
type LineEndingOption = {
    value: LineEnding;
    label: string;
};

const encodingOptions: EncodingOption[] = [
    { value: 'UTF-8', label: 'UTF-8' },
    { value: 'GBK', label: 'GBK' },
    { value: 'ANSI', label: 'ANSI' },
    { value: 'GB2312', label: 'GB2312' },
    { value: 'Big5', label: 'Big5' },
    { value: 'Shift_JIS', label: 'Shift_JIS' },
    { value: 'Windows-1252', label: 'Windows-1252' },
    { value: 'ISO-8859-1', label: 'ISO-8859-1' },
].sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' }));

const lineEndingOptions: LineEndingOption[] = [
    { value: 'CRLF', label: 'Win (CRLF)' },
    { value: 'LF', label: 'Linux (LF)' },
    { value: 'CR', label: 'Mac (CR)' },
];
lineEndingOptions.sort((a, b) => a.value.localeCompare(b.value, 'en', { numeric: true, sensitivity: 'base' }));

const syntaxOptions = [...SYNTAX_OPTIONS].sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' })
);

function dispatchDocumentUpdated(tabId: string) {
    window.dispatchEvent(
        new CustomEvent('rutar:document-updated', {
            detail: { tabId },
        })
    );
}

export function StatusBar() {
    const tabs = useStore((state) => state.tabs);
    const activeTabId = useStore((state) => state.activeTabId);
    const updateTab = useStore((state) => state.updateTab);
    const cursorPositionByTab = useStore((state) => state.cursorPositionByTab);
    const settings = useStore((state) => state.settings);
    const activeTab = tabs.find((tab) => tab.id === activeTabId && tab.tabType !== 'diff');
    const activeCursorPosition = activeTab ? cursorPositionByTab[activeTab.id] : null;
    const cursorLine = activeCursorPosition?.line ?? 1;
    const cursorColumn = activeCursorPosition?.column ?? 1;
    const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
    const gesturePreviewLabel = tr('settings.mouseGestures');
    const [gesturePreview, setGesturePreview] = useState('');

    useEffect(() => {
        const handleGesturePreview = (event: Event) => {
            const customEvent = event as CustomEvent<{ sequence?: string }>;
            setGesturePreview(customEvent.detail?.sequence ?? '');
        };

        window.addEventListener('rutar:gesture-preview', handleGesturePreview as EventListener);

        return () => {
            window.removeEventListener('rutar:gesture-preview', handleGesturePreview as EventListener);
        };
    }, []);

    if (!activeTab) return (
        <div
            className="h-6 bg-muted/50 border-t flex items-center px-3 text-[10px] text-muted-foreground select-none"
            data-layout-region="statusbar"
            onContextMenu={(event) => event.preventDefault()}
        >
            {tr('status.ready')}
        </div>
    );

    const handleEncodingChange = async (newEnc: string) => {
        try {
            await invoke('convert_encoding', { id: activeTab.id, newEncoding: newEnc });
            updateTab(activeTab.id, { encoding: newEnc, isDirty: true });
            dispatchDocumentUpdated(activeTab.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleLineEndingChange = async (newLineEnding: LineEnding) => {
        try {
            await invoke('set_line_ending', { id: activeTab.id, newLineEnding });
            updateTab(activeTab.id, { lineEnding: newLineEnding, isDirty: true });
            dispatchDocumentUpdated(activeTab.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSyntaxChange = async (nextSyntax: string) => {
        try {
            const syntaxOverride = nextSyntax === 'auto' ? null : (nextSyntax as SyntaxKey);
            await invoke('set_document_syntax', {
                id: activeTab.id,
                syntaxOverride,
            });

            updateTab(activeTab.id, { syntaxOverride });

            window.dispatchEvent(
                new CustomEvent('rutar:force-refresh', {
                    detail: {
                        tabId: activeTab.id,
                        lineCount: activeTab.lineCount,
                        preserveCaret: true,
                    },
                })
            );
        } catch (e) {
            console.error(e);
        }
    };

    const detectedSyntax = detectSyntaxKeyFromTab(activeTab);
    const currentSyntax = activeTab.syntaxOverride ?? null;
    const syntaxSelectValue = currentSyntax ?? 'auto';
    const autoSyntaxLabel = `Auto (${getSyntaxLabel(detectedSyntax)})`;
    const lineEndingSelectLabel = settings.language === 'zh-CN' ? '行尾符' : 'Line ending';
    const encodingSelectLabel = settings.language === 'zh-CN' ? '编码' : 'Encoding';
    const syntaxSelectLabel = settings.language === 'zh-CN' ? '语法' : 'Syntax';
    const statusSelectClassName =
        'statusbar-select border-none outline-none cursor-pointer appearance-none text-[10px] focus-visible:ring-1 focus-visible:ring-ring';
    const statusOptionClassName = 'statusbar-option';
    const activeEncodingValue =
        encodingOptions.find((option) => option.value.toLowerCase() === activeTab.encoding.toLowerCase())?.value ??
        activeTab.encoding;

    return (
        <div
            className="h-6 bg-muted/50 border-t flex items-center justify-between px-3 text-[10px] text-muted-foreground select-none"
            data-layout-region="statusbar"
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="flex items-center gap-4">
                {activeTab.largeFileMode && (
                    <>
                        <span className="flex items-center gap-1 text-orange-500 font-medium">
                            <Zap className="w-3 h-3" />
                            {tr('status.largeFileHighlightOff')}
                        </span>
                        <div className="w-[1px] h-3 bg-border" />
                    </>
                )}
                <span>{tr('status.lines')}: {activeTab.lineCount.toLocaleString()}</span>
                <div className="w-[1px] h-3 bg-border" />
                <span>{tr('status.cursor')}: {cursorLine}:{cursorColumn}</span>
                {settings.mouseGesturesEnabled && gesturePreview && (
                    <>
                        <div className="w-[1px] h-3 bg-border" />
                        <span>{gesturePreviewLabel}: {gesturePreview}</span>
                    </>
                )}
            </div>
            
            <div className="flex items-center gap-4">
                <div className="group flex items-center gap-1.5 cursor-pointer transition-colors hover:text-foreground focus-within:text-foreground">
                    <select
                        className={statusSelectClassName}
                        value={activeTab.lineEnding}
                        onChange={(e) => handleLineEndingChange(e.target.value as LineEnding)}
                        aria-label={lineEndingSelectLabel}
                        name="status-line-ending"
                    >
                        {lineEndingOptions.map((option) => (
                            <option key={option.value} value={option.value} className={statusOptionClassName}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="w-[1px] h-3 bg-border" />
                <div className="group flex items-center gap-1.5 cursor-pointer transition-colors hover:text-foreground focus-within:text-foreground">
                    <Globe className="w-3 h-3" />
                    <select 
                        className={statusSelectClassName}
                        value={activeEncodingValue}
                        onChange={(e) => handleEncodingChange(e.target.value)}
                        aria-label={encodingSelectLabel}
                        name="status-encoding"
                    >
                        {encodingOptions.map((option) => (
                            <option key={option.value} value={option.value} className={statusOptionClassName}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="w-[1px] h-3 bg-border" />
                <div className="group flex items-center gap-1.5 cursor-pointer transition-colors hover:text-foreground focus-within:text-foreground">
                    <select
                        className={statusSelectClassName}
                        value={syntaxSelectValue}
                        onChange={(e) => handleSyntaxChange(e.target.value)}
                        title={currentSyntax ? getSyntaxLabel(currentSyntax) : autoSyntaxLabel}
                        aria-label={syntaxSelectLabel}
                        name="status-syntax"
                    >
                        <option value="auto" className={statusOptionClassName}>
                            {autoSyntaxLabel}
                        </option>
                        {syntaxOptions.map((option) => (
                            <option key={option.value} value={option.value} className={statusOptionClassName}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
