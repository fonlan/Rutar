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

interface CodeUnitDiff {
  start: number;
  end: number;
  newText: string;
}

const MAX_LINE_RANGE = 2147483647;

function normalizeEditorText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n");
  return normalized === "\n" ? "" : normalized;
}

function getEditableText(element: HTMLDivElement) {
  return normalizeEditorText(element.textContent || "");
}

function buildCodeUnitDiff(previousText: string, nextText: string): CodeUnitDiff | null {
  if (previousText === nextText) {
    return null;
  }

  let start = 0;
  const prevLen = previousText.length;
  const nextLen = nextText.length;

  while (
    start < prevLen &&
    start < nextLen &&
    previousText.charCodeAt(start) === nextText.charCodeAt(start)
  ) {
    start += 1;
  }

  let prevEnd = prevLen;
  let nextEnd = nextLen;

  while (
    prevEnd > start &&
    nextEnd > start &&
    previousText.charCodeAt(prevEnd - 1) === nextText.charCodeAt(nextEnd - 1)
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    end: prevEnd,
    newText: nextText.slice(start, nextEnd),
  };
}

function codeUnitOffsetToUnicodeScalarIndex(text: string, offset: number) {
  if (offset <= 0) return 0;

  let scalarIndex = 0;
  let consumedCodeUnits = 0;

  for (const ch of text) {
    const step = ch.length;
    if (consumedCodeUnits + step > offset) {
      break;
    }

    consumedCodeUnits += step;
    scalarIndex += 1;
  }

  return scalarIndex;
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
  const editTimeout = useRef<any>(null);

  const currentRequestVersion = useRef(0);
  const isComposingRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initializedRef = useRef(false);
  const suppressExternalReloadRef = useRef(false);

  const syncedTextRef = useRef('');
  const pendingTextRef = useRef('');

  const itemSize = useMemo(() => (settings.fontSize || 14) * 1.5, [settings.fontSize]);

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
      const text = token.text.replace(/\r\n/g, '\n');
      const linesInToken = text.split('\n');

      if (linesInToken.length === 1) {
        currentLine.push(token);
      } else {
        currentLine.push({ ...token, text: linesInToken[0] });
        lines.push([...currentLine]);

        for (let i = 1; i < linesInToken.length - 1; i += 1) {
          lines.push([{ ...token, text: linesInToken[i] }]);
        }

        currentLine = [{ ...token, text: linesInToken[linesInToken.length - 1] }];
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }, [tokens]);

  const fetchTokens = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;
      try {
        const result = await invoke<SyntaxToken[]>('get_syntax_tokens', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(result)) return;

        setTokens(result);
        setStartLine(start);
      } catch (e) {
        console.error('Fetch error:', e);
      }
    },
    [tab.id]
  );

  const syncVisibleTokens = useCallback(
    async (lineCount: number) => {
      const buffer = 50;
      const scrollTop = contentRef.current?.scrollTop ?? 0;
      const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
      const currentLine = Math.max(0, Math.floor(scrollTop / itemSize));
      const start = Math.max(0, currentLine - buffer);
      const end = Math.max(start + 1, Math.min(lineCount, currentLine + viewportLines + buffer));

      await fetchTokens(start, end);
    },
    [fetchTokens, height, itemSize]
  );

  const loadTextFromBackend = useCallback(async () => {
    const raw = await invoke<string>('get_visible_lines', {
      id: tab.id,
      startLine: 0,
      endLine: MAX_LINE_RANGE,
    });

    const normalized = normalizeEditorText(raw || '');
    if (contentRef.current) {
      contentRef.current.textContent = normalized;
    }

    syncedTextRef.current = normalized;
    pendingTextRef.current = normalized;
  }, [tab.id]);

  const flushPendingSync = useCallback(async () => {
    if (syncInFlightRef.current || isComposingRef.current) {
      return;
    }

    const baseText = syncedTextRef.current;
    const targetText = pendingTextRef.current;
    const diff = buildCodeUnitDiff(baseText, targetText);

    if (!diff) {
      return;
    }

    syncInFlightRef.current = true;

    try {
      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.start);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.end);

      const newLineCount = await invoke<number>('edit_text', {
        id: tab.id,
        startChar,
        endChar,
        newText: diff.newText,
      });

      syncedTextRef.current = targetText;
      suppressExternalReloadRef.current = true;
      updateTab(tab.id, { lineCount: newLineCount, isDirty: true });
      await syncVisibleTokens(newLineCount);
    } catch (e) {
      console.error('Edit sync error:', e);
    } finally {
      syncInFlightRef.current = false;

      if (pendingTextRef.current !== syncedTextRef.current && !isComposingRef.current) {
        void flushPendingSync();
      }
    }
  }, [tab.id, syncVisibleTokens, updateTab]);

  const queueTextSync = useCallback(
    (text: string) => {
      pendingTextRef.current = text;

      if (editTimeout.current) {
        clearTimeout(editTimeout.current);
      }

      editTimeout.current = setTimeout(() => {
        void flushPendingSync();
      }, 40);
    },
    [flushPendingSync]
  );

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const currentText = getEditableText(e.currentTarget);
      updateTab(tab.id, { isDirty: true });
      pendingTextRef.current = currentText;

      if (!isComposingRef.current) {
        queueTextSync(currentText);
      }
    },
    [tab.id, updateTab, queueTextSync]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLDivElement>) => {
      isComposingRef.current = false;
      const currentText = getEditableText(e.currentTarget);
      queueTextSync(currentText);
    },
    [queueTextSync]
  );

  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }) => {
      const buffer = 50;
      const start = Math.max(0, visibleStartIndex - buffer);
      const end = Math.min(tab.lineCount, visibleStopIndex + buffer);

      const cachedCount = lineTokens.length;
      const isOutside = tokens.length === 0 || start < startLine || end > startLine + cachedCount;

      if (isOutside) {
        if (requestTimeout.current) clearTimeout(requestTimeout.current);
        requestTimeout.current = setTimeout(() => fetchTokens(start, Math.max(start + 1, end)), 50);
      }
    },
    [startLine, lineTokens.length, tokens.length, fetchTokens, tab.lineCount]
  );

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
        if (
          cleanType.includes('keyword') ||
          [
            'fn',
            'let',
            'pub',
            'use',
            'mod',
            'struct',
            'enum',
            'impl',
            'trait',
            'where',
            'type',
            'match',
            'if',
            'else',
            'for',
            'while',
            'loop',
            'return',
            'break',
            'continue',
            'as',
            'move',
            'ref',
            'mut',
            'static',
            'unsafe',
            'extern',
            'crate',
            'self',
            'super',
          ].includes(cleanType)
        ) {
          typeClass += ' token-keyword';
        }
        if (cleanType.includes('comment')) typeClass += ' token-comment';
        if (cleanType.includes('number') || cleanType.includes('integer') || cleanType.includes('float')) {
          typeClass += ' token-number';
        }
        if (cleanType.includes('identifier') && !cleanType.includes('property')) {
          typeClass += ' token-identifier';
        }
        if (
          cleanType.includes('type') ||
          [
            'usize',
            'u8',
            'u16',
            'u32',
            'u64',
            'u128',
            'i8',
            'i16',
            'i32',
            'i64',
            'i128',
            'f32',
            'f64',
            'bool',
            'char',
            'str',
            'string',
            'option',
            'result',
            'vec',
            'box',
          ].includes(cleanType)
        ) {
          typeClass += ' token-type';
        }
      }

      return (
        <span key={key} className={typeClass}>
          {token.text}
        </span>
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    initializedRef.current = false;
    suppressExternalReloadRef.current = false;
    syncInFlightRef.current = false;
    pendingTextRef.current = '';
    syncedTextRef.current = '';

    const bootstrap = async () => {
      try {
        await loadTextFromBackend();
        if (cancelled) return;

        await syncVisibleTokens(Math.max(1, tab.lineCount));
        if (!cancelled) {
          initializedRef.current = true;
        }
      } catch (e) {
        console.error('Failed to load file text:', e);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      if (editTimeout.current) clearTimeout(editTimeout.current);
    };
  }, [tab.id, loadTextFromBackend, syncVisibleTokens]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    if (suppressExternalReloadRef.current) {
      suppressExternalReloadRef.current = false;
      return;
    }

    const syncExternalChange = async () => {
      try {
        await loadTextFromBackend();
        await syncVisibleTokens(Math.max(1, tab.lineCount));
      } catch (e) {
        console.error('Failed to sync external edit:', e);
      }
    };

    syncExternalChange();
  }, [tab.lineCount, loadTextFromBackend, syncVisibleTokens]);

  return (
    <div ref={containerRef} className="flex-1 w-full h-full overflow-hidden bg-background relative">
      <div
        ref={contentRef}
        contentEditable="plaintext-only"
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
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck={false}
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
              const lineTokensArr =
                relativeIndex >= 0 && relativeIndex < lineTokens.length ? lineTokens[relativeIndex] : [];

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
                  {lineTokensArr.length > 0 ? renderTokens(lineTokensArr) : <span className="opacity-10 italic">...</span>}
                </div>
              );
            }}
          </List>
        </div>
      )}
    </div>
  );
}


