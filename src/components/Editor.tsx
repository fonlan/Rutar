// @ts-nocheck
import { FixedSizeList as List } from 'react-window';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';

interface SyntaxToken {
  type?: string;
  text?: string;
  start_byte?: number;
  end_byte?: number;
}

export function Editor({ tab }: { tab: FileTab }) {
    const { settings = { fontSize: 14, fontFamily: 'monospace' }, updateTab } = useStore();
    const [tokens, setTokens] = useState<SyntaxToken[]>([]);
    const [startLine, setStartLine] = useState(0);
    const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();
    
    const contentRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<any>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const requestTimeout = useRef<any>(null);
    const currentRequestVersion = useRef(0);

    const handleScroll = () => {
        if (contentRef.current && listRef.current) {
            const listEl = listRef.current._outerRef;
            if (listEl) {
                listEl.scrollTop = contentRef.current.scrollTop;
                listEl.scrollLeft = contentRef.current.scrollLeft;
            }
        }
    };

    const lineTokens = useMemo(() => {
        const lines: SyntaxToken[][] = [];
        let currentLine: SyntaxToken[] = [];
        
        for (const token of tokens) {
            if (token.text === undefined || token.text === null) continue;
            // 严格按换行符切分，不进行 trim，保留原始空格
            const text = token.text.replace(/\r\n/g, '\n');
            const linesInToken = text.split('\n');
            
            if (linesInToken.length === 1) {
                currentLine.push(token);
            } else {
                // 处理当前 Token 中的第一部分，并结束当前行
                currentLine.push({ ...token, text: linesInToken[0] });
                lines.push([...currentLine]);
                
                // 处理中间的完整行
                for (let i = 1; i < linesInToken.length - 1; i++) {
                    lines.push([{ ...token, text: linesInToken[i] }]);
                }
                
                // 处理最后一部分，作为新一行的开头
                currentLine = [{ ...token, text: linesInToken[linesInToken.length - 1] }];
            }
        }
        
        // 最后一行
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        return lines;
    }, [tokens]);

    const fetchTokens = useCallback(async (start: number, end: number) => {
        const version = ++currentRequestVersion.current;
        try {
            const result = await invoke<SyntaxToken[]>('get_syntax_tokens', { 
                id: tab.id, 
                startLine: start, 
                endLine: end 
            });
            
            if (version !== currentRequestVersion.current) return;
            if (!Array.isArray(result)) return;

            setTokens(result);
            setStartLine(start);
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }, [tab.id]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        updateTab(tab.id, { isDirty: true });
    };

    const onItemsRendered = useCallback(({ visibleStartIndex, visibleStopIndex }) => {
        const BUFFER = 50;
        const start = Math.max(0, visibleStartIndex - BUFFER);
        const end = Math.min(tab.lineCount, visibleStopIndex + BUFFER);
        
        const cachedCount = lineTokens.length;
        const isOutside = tokens.length === 0 || start < startLine || end > (startLine + cachedCount);

        if (isOutside) {
            if (requestTimeout.current) clearTimeout(requestTimeout.current);
            requestTimeout.current = setTimeout(() => fetchTokens(start, end), 50);
        }
    }, [startLine, lineTokens.length, tokens.length, fetchTokens, tab.lineCount]);

    const renderTokens = useCallback((tokensArr: SyntaxToken[]) => {
        if (!tokensArr || tokensArr.length === 0) return null;
        return tokensArr.map((token, i) => {
            const key = `t-${i}`;
            if (token.text === undefined || token.text === null) return null;
            
            let typeClass = '';
            if (token.type) {
                const cleanType = token.type.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
                typeClass = `token-${cleanType}`;
                
                if (cleanType.includes('string')) typeClass += ' token-string';
                if (cleanType.includes('keyword') || ['fn', 'let', 'pub', 'use', 'mod', 'struct', 'enum', 'impl', 'trait', 'where', 'type', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'break', 'continue', 'as', 'move', 'ref', 'mut', 'static', 'unsafe', 'extern', 'crate', 'self', 'super'].includes(cleanType)) typeClass += ' token-keyword';
                if (cleanType.includes('comment')) typeClass += ' token-comment';
                if (cleanType.includes('number') || cleanType.includes('integer') || cleanType.includes('float')) typeClass += ' token-number';
                if (cleanType.includes('identifier') && !cleanType.includes('property')) typeClass += ' token-identifier';
                if (cleanType.includes('type') || ['usize', 'u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128', 'f32', 'f64', 'bool', 'char', 'str', 'string', 'option', 'result', 'vec', 'box'].includes(cleanType)) typeClass += ' token-type';
            }
            
            return (
                <span key={key} className={typeClass}>
                    {token.text}
                </span>
            );
        });
    }, []);

    const itemSize = useMemo(() => (settings.fontSize || 14) * 1.5, [settings.fontSize]);

    const fullText = useMemo(() => {
        return tokens.map(t => t.text || '').join('');
    }, [tokens]);

    useEffect(() => {
        fetchTokens(0, 150);
    }, [tab.id, fetchTokens]);

    useEffect(() => {
        if (contentRef.current && fullText !== contentRef.current.innerText) {
            contentRef.current.innerText = fullText;
        }
    }, [fullText]);

    return (
        <div
            ref={containerRef}
            className="flex-1 w-full h-full overflow-hidden bg-background relative"
        >
            <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                className="absolute inset-0 w-full h-full z-0 outline-none overflow-auto"
                style={{
                    fontFamily: settings.fontFamily,
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: '1.5',
                    whiteSpace: 'pre',
                    paddingLeft: '5rem',
                    caretColor: 'black',
                    color: 'transparent',
                }}
                onInput={handleInput}
                onScroll={handleScroll}
            />

            {width > 0 && height > 0 && (
                <div ref={backdropRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none overflow-hidden">
                    <List
                        ref={listRef}
                        height={height}
                        width={width}
                        itemCount={tab.lineCount}
                        itemSize={itemSize}
                        onItemsRendered={onItemsRendered}
                        overscanCount={20}
                        style={{ overflowX: 'auto' }}
                    >
                        {({ index, style }) => {
                            const relativeIndex = index - startLine;
                            const lineTokensArr = (relativeIndex >= 0 && relativeIndex < lineTokens.length) 
                                ? lineTokens[relativeIndex] 
                                : [];
                            
                            return (
                                <div
                                    style={{
                                        ...style,
                                        width: 'max-content',
                                        minWidth: '100%',
                                        fontFamily: settings.fontFamily,
                                        fontSize: `${settings.fontSize}px`,
                                        lineHeight: '1.5',
                                        whiteSpace: 'pre',
                                    }}
                                    className="px-4 hover:bg-muted/5 text-foreground group editor-line"
                                >
                                    <span
                                        className="inline-block text-muted-foreground/40 line-number w-12 text-right mr-4 border-r border-border/50 pr-2 group-hover:text-muted-foreground transition-colors"
                                        style={{ fontSize: `${Math.max(10, settings.fontSize - 2)}px` }}
                                    >
                                        {index + 1}
                                    </span>
                                    {lineTokensArr.length > 0 ? renderTokens(lineTokensArr) : (
                                        <span className="opacity-10 italic">...</span>
                                    )}
                                </div>
                            );
                        }}
                    </List>
                </div>
            )}
        </div>
    );
}
