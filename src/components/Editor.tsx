// @ts-nocheck
import { VariableSizeList as List } from 'react-window';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { t } from '@/i18n';

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

interface EditorSegmentState {
  startLine: number;
  endLine: number;
  text: string;
}

interface SearchHighlightState {
  line: number;
  column: number;
  length: number;
  id: number;
}

const MAX_LINE_RANGE = 2147483647;
const DEFAULT_FETCH_BUFFER_LINES = 50;
const LARGE_FILE_FETCH_BUFFER_LINES = 200;
const HUGE_EDITABLE_FETCH_BUFFER_LINES = 100;
const LARGE_FILE_FETCH_DEBOUNCE_MS = 12;
const HUGE_EDITABLE_FETCH_DEBOUNCE_MS = 24;
const NORMAL_FILE_FETCH_DEBOUNCE_MS = 50;
const LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD = 20000;
const LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS = 160;
const NORMAL_EDIT_SYNC_DEBOUNCE_MS = 40;
const HUGE_EDITABLE_WINDOW_UNLOCK_MS = 260;
const LARGE_FILE_EDIT_INTENT_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Tab']);
const EMPTY_LINE_PLACEHOLDER = '\u200B';

function normalizeEditorText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n");
  return normalized === "\n" ? "" : normalized;
}

function normalizeLineText(value: string) {
  return (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeEditableLineText(value: string) {
  return normalizeLineText((value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
}

function normalizeSegmentText(value: string) {
  return normalizeEditorText((value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
}

function isLargeModeEditIntent(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.isComposing) {
    return false;
  }

  const key = event.key;
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const hasModifier = hasPrimaryModifier || event.altKey;

  if (!hasModifier && key.length === 1) {
    return true;
  }

  if (!hasModifier && LARGE_FILE_EDIT_INTENT_KEYS.has(key)) {
    return true;
  }

  if (hasPrimaryModifier && !event.altKey) {
    const normalized = key.toLowerCase();
    if (normalized === 'v' || normalized === 'x') {
      return true;
    }
  }

  return false;
}

function getEditableText(element: HTMLDivElement) {
  return normalizeEditorText(element.textContent || "");
}

function setCaretToLineStart(element: HTMLDivElement, line: number) {
  const content = normalizeEditorText(getEditableText(element));
  if (element.textContent !== content) {
    element.textContent = content;
  }

  const targetLine = Math.max(1, Math.floor(line));

  let currentLine = 1;
  let targetOffset = 0;

  if (targetLine > 1) {
    for (let index = 0; index < content.length; index += 1) {
      if (content[index] === '\n') {
        currentLine += 1;
        if (currentLine === targetLine) {
          targetOffset = index + 1;
          break;
        }
      }
    }
  }

  let textNode = element.firstChild as Text | null;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = document.createTextNode(content);
    element.replaceChildren(textNode);
  }

  const safeOffset = Math.min(targetOffset, textNode.textContent?.length ?? 0);

  if (!textNode) {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStart(textNode, safeOffset);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function getCaretLineInElement(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return null;
  }

  const caretRange = range.cloneRange();
  caretRange.selectNodeContents(element);
  caretRange.setEnd(range.startContainer, range.startOffset);

  const textBeforeCaret = caretRange.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return textBeforeCaret.split('\n').length;
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

function alignToDevicePixel(value: number) {
  if (typeof window === 'undefined') {
    return Math.max(1, Math.round(value));
  }

  const dpr = window.devicePixelRatio || 1;
  const cssPixelStep = 1 / dpr;
  const aligned = Math.round(value / cssPixelStep) * cssPixelStep;

  return Math.max(cssPixelStep, Number(aligned.toFixed(4)));
}

function alignScrollOffset(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (typeof window === 'undefined') {
    return Math.round(value);
  }

  const dpr = window.devicePixelRatio || 1;
  const cssPixelStep = 1 / dpr;
  return Number((Math.round(value / cssPixelStep) * cssPixelStep).toFixed(4));
}

function isPointerOnScrollbar(element: HTMLElement, clientX: number, clientY: number) {
  const verticalScrollbarWidth = element.offsetWidth - element.clientWidth;
  const horizontalScrollbarHeight = element.offsetHeight - element.clientHeight;

  if (verticalScrollbarWidth <= 0 && horizontalScrollbarHeight <= 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const onVerticalScrollbar = verticalScrollbarWidth > 0 && clientX >= rect.right - verticalScrollbarWidth;
  const onHorizontalScrollbar =
    horizontalScrollbarHeight > 0 && clientY >= rect.bottom - horizontalScrollbarHeight;

  return onVerticalScrollbar || onHorizontalScrollbar;
}

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
}

export function Editor({ tab }: { tab: FileTab }) {
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const [tokens, setTokens] = useState<SyntaxToken[]>([]);
  const [startLine, setStartLine] = useState(0);
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [plainStartLine, setPlainStartLine] = useState(0);
  const [editableSegment, setEditableSegment] = useState<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });
  const [activeLineNumber, setActiveLineNumber] = useState(1);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlightState | null>(null);
  const [contentTreeFlashLine, setContentTreeFlashLine] = useState<number | null>(null);
  const [showLargeModeEditPrompt, setShowLargeModeEditPrompt] = useState(false);
  const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const requestTimeout = useRef<any>(null);
  const editTimeout = useRef<any>(null);
  const isScrollbarDragRef = useRef(false);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());

  const currentRequestVersion = useRef(0);
  const isComposingRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initializedRef = useRef(false);
  const suppressExternalReloadRef = useRef(false);
  const largeModePromptOpenRef = useRef(false);
  const pendingSyncRequestedRef = useRef(false);
  const hugeWindowLockedRef = useRef(false);
  const hugeWindowFollowScrollOnUnlockRef = useRef(false);
  const hugeWindowUnlockTimerRef = useRef<any>(null);
  const contentTreeFlashTimerRef = useRef<any>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const editableSegmentRef = useRef<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });

  const syncedTextRef = useRef('');

  const fontSize = settings.fontSize || 14;
  const wordWrap = !!settings.wordWrap;
  const highlightCurrentLine = settings.highlightCurrentLine !== false;
  const renderedFontSizePx = useMemo(() => alignToDevicePixel(fontSize), [fontSize]);
  const lineHeightPx = useMemo(() => alignToDevicePixel(renderedFontSizePx * 1.5), [renderedFontSizePx]);
  const itemSize = lineHeightPx;
  const contentPaddingLeft = '4.5rem';
  const horizontalOverflowMode = wordWrap ? 'hidden' : 'scroll';
  const isLargeReadOnlyMode = false;
  const usePlainLineRendering = tab.largeFileMode || tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const isHugeEditableMode = tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const largeFetchBuffer = isHugeEditableMode
    ? HUGE_EDITABLE_FETCH_BUFFER_LINES
    : tab.largeFileMode
    ? LARGE_FILE_FETCH_BUFFER_LINES
    : DEFAULT_FETCH_BUFFER_LINES;
  const hugeEditablePaddingTop = `${alignScrollOffset(Math.max(0, editableSegment.startLine) * itemSize)}px`;
  const hugeEditablePaddingBottom = `${alignScrollOffset(
    Math.max(0, tab.lineCount - editableSegment.endLine) * itemSize
  )}px`;

  const getListItemSize = useCallback(
    (index: number) => {
      if (!wordWrap) {
        return itemSize;
      }

      return rowHeightsRef.current.get(index) ?? itemSize;
    },
    [itemSize, wordWrap]
  );

  const measureRenderedLineHeight = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (!wordWrap || !element) {
        return;
      }

      const measuredHeight = Math.max(itemSize, alignToDevicePixel(element.scrollHeight));
      const previousHeight = rowHeightsRef.current.get(index);

      if (previousHeight !== undefined && Math.abs(previousHeight - measuredHeight) < 0.5) {
        return;
      }

      rowHeightsRef.current.set(index, measuredHeight);
      listRef.current?.resetAfterIndex?.(index);
    },
    [itemSize, wordWrap]
  );

  useEffect(() => {
    if (!wordWrap) {
      return;
    }

    rowHeightsRef.current.clear();
    listRef.current?.resetAfterIndex?.(0, true);
  }, [lineHeightPx, renderedFontSizePx, settings.fontFamily, tab.id, width, wordWrap]);

  const fetchPlainLines = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(lines)) return;

        setPlainLines(lines.map(normalizeLineText));
        setPlainStartLine(start);
      } catch (e) {
        console.error('Fetch visible lines error:', e);
      }
    },
    [tab.id]
  );

  const fetchEditableSegment = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(lines)) return;

        const normalizedLines = lines.map(normalizeEditableLineText);
        const text = normalizedLines.join('\n');
        const segment = {
          startLine: start,
          endLine: end,
          text,
        };

        editableSegmentRef.current = segment;
        setEditableSegment(segment);
        if (!isScrollbarDragRef.current) {
          pendingRestoreScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? contentRef.current?.scrollTop ?? 0;
        }

        if (contentRef.current) {
          contentRef.current.textContent = text;
        }

        syncedTextRef.current = text;
        pendingSyncRequestedRef.current = false;
      } catch (e) {
        console.error('Fetch editable segment error:', e);
      }
    },
    [tab.id]
  );

  useEffect(() => {
    if (!isHugeEditableMode) {
      pendingRestoreScrollTopRef.current = null;
      return;
    }

    const targetScrollTop = pendingRestoreScrollTopRef.current;
    if (targetScrollTop === null) {
      return;
    }

    pendingRestoreScrollTopRef.current = null;

    const alignedTop = alignScrollOffset(targetScrollTop);
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
        scrollContainerRef.current.scrollTop = alignedTop;
      }

      const listEl = listRef.current?._outerRef;
      if (listEl && Math.abs(listEl.scrollTop - alignedTop) > 0.001) {
        listEl.scrollTop = alignedTop;
      }
    });
  }, [editableSegment.endLine, editableSegment.startLine, isHugeEditableMode]);

  const handleScroll = () => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;

    if (!isLargeReadOnlyMode && scrollElement && listRef.current) {
      const listEl = listRef.current._outerRef;
      if (listEl) {
        const scrollTop = scrollElement.scrollTop;
        const scrollLeft = scrollElement.scrollLeft;

        if (isScrollbarDragRef.current) {
          if (Math.abs(listEl.scrollTop - scrollTop) > 0.001) {
            listEl.scrollTop = scrollTop;
          }

          if (Math.abs(listEl.scrollLeft - scrollLeft) > 0.001) {
            listEl.scrollLeft = scrollLeft;
          }

          return;
        }

        const alignedTop = alignScrollOffset(scrollTop);
        const alignedLeft = alignScrollOffset(scrollLeft);

        if (Math.abs(scrollElement.scrollTop - alignedTop) > 0.001) {
          scrollElement.scrollTop = alignedTop;
        }

        if (Math.abs(scrollElement.scrollLeft - alignedLeft) > 0.001) {
          scrollElement.scrollLeft = alignedLeft;
        }

        if (Math.abs(listEl.scrollTop - alignedTop) > 0.001) {
          listEl.scrollTop = alignedTop;
        }

        if (Math.abs(listEl.scrollLeft - alignedLeft) > 0.001) {
          listEl.scrollLeft = alignedLeft;
        }
      }
    }
  };

  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isLargeReadOnlyMode || !contentRef.current) {
        return;
      }

      const editorElement = contentRef.current;
      if (!isPointerOnScrollbar(editorElement, event.clientX, event.clientY)) {
        return;
      }

      isScrollbarDragRef.current = true;
      editorElement.style.userSelect = 'none';
      editorElement.style.webkitUserSelect = 'none';
    },
    [isLargeReadOnlyMode]
  );

  const handleHugeScrollablePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHugeEditableMode || !scrollContainerRef.current) {
      return;
    }

    if (!isPointerOnScrollbar(scrollContainerRef.current, event.clientX, event.clientY)) {
      return;
    }

    isScrollbarDragRef.current = true;
    if (contentRef.current) {
      contentRef.current.style.userSelect = 'none';
      contentRef.current.style.webkitUserSelect = 'none';
    }
  }, [isHugeEditableMode]);

  const handleLargeModePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLargeReadOnlyMode) {
        return;
      }

      if (document.activeElement !== event.currentTarget) {
        event.currentTarget.focus();
      }
    },
    [isLargeReadOnlyMode]
  );

  const handleReadOnlyListPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isLargeReadOnlyMode) {
      return;
    }

    const listElement = listRef.current?._outerRef as HTMLDivElement | undefined;
    if (!listElement) {
      return;
    }

    if (!isPointerOnScrollbar(listElement, event.clientX, event.clientY)) {
      return;
    }

    isScrollbarDragRef.current = true;
  }, [isLargeReadOnlyMode]);

  const handleLargeModeEditIntent = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isLargeReadOnlyMode || !isLargeModeEditIntent(event)) {
        return;
      }

      if (largeModePromptOpenRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      largeModePromptOpenRef.current = true;
      setShowLargeModeEditPrompt(true);
    },
    [isLargeReadOnlyMode]
  );

  const handleKeepReadOnlyMode = useCallback(() => {
    largeModePromptOpenRef.current = false;
    setShowLargeModeEditPrompt(false);
  }, []);

  const handleEnterEditableMode = useCallback(() => {
    largeModePromptOpenRef.current = false;
    setShowLargeModeEditPrompt(false);
  }, []);

  const lineTokens = useMemo(() => {
    if (usePlainLineRendering) {
      return [];
    }

    const lines: SyntaxToken[][] = [];
    let currentLine: SyntaxToken[] = [];

    for (const token of tokens) {
      if (token.text === undefined || token.text === null) continue;
      const text = token.text.replace(/\r\n/g, '\n');
      const firstNewlineIndex = text.indexOf('\n');

      if (firstNewlineIndex === -1) {
        currentLine.push(token);
      } else {
        const linesInToken = text.split('\n');
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
  }, [tokens, usePlainLineRendering]);

  const editableSegmentLines = useMemo(() => {
    if (!isHugeEditableMode) {
      return [];
    }

    if (editableSegment.endLine <= editableSegment.startLine) {
      return [];
    }

    return editableSegment.text.split('\n');
  }, [editableSegment.endLine, editableSegment.startLine, editableSegment.text, isHugeEditableMode]);

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
    async (lineCount: number, visibleRange?: { start: number; stop: number }) => {
      if (isHugeEditableMode && hugeWindowLockedRef.current) {
        hugeWindowFollowScrollOnUnlockRef.current = true;
        return;
      }

      const buffer = largeFetchBuffer;
      let start = 0;
      let end = 1;

      if (visibleRange) {
        start = Math.max(0, visibleRange.start - buffer);
        end = Math.max(start + 1, Math.min(lineCount, visibleRange.stop + buffer));
      } else {
        const scrollTop = isHugeEditableMode
          ? scrollContainerRef.current?.scrollTop ?? 0
          : usePlainLineRendering
          ? listRef.current?._outerRef?.scrollTop ?? 0
          : contentRef.current?.scrollTop ?? 0;
        const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
        const currentLine = Math.max(0, Math.floor(scrollTop / itemSize));
        start = Math.max(0, currentLine - buffer);
        end = Math.max(start + 1, Math.min(lineCount, currentLine + viewportLines + buffer));
      }

      if (isHugeEditableMode) {
        await fetchEditableSegment(start, end);
        return;
      }

      if (usePlainLineRendering) {
        await fetchPlainLines(start, end);
        return;
      }

      await fetchTokens(start, end);
    },
    [
      fetchEditableSegment,
      fetchTokens,
      fetchPlainLines,
      height,
      isHugeEditableMode,
      itemSize,
      largeFetchBuffer,
      hugeWindowLockedRef,
      hugeWindowFollowScrollOnUnlockRef,
      usePlainLineRendering,
    ]
  );

  const endScrollbarDragSelectionGuard = useCallback(() => {
    if (!isScrollbarDragRef.current) {
      return;
    }

    isScrollbarDragRef.current = false;

    if (contentRef.current) {
      contentRef.current.style.userSelect = 'text';
      contentRef.current.style.webkitUserSelect = 'text';
    }

    if (isLargeReadOnlyMode) {
      void syncVisibleTokens(Math.max(1, tab.lineCount));
    }
  }, [isLargeReadOnlyMode, syncVisibleTokens, tab.lineCount]);

  const releaseHugeEditableWindowLock = useCallback(() => {
    hugeWindowLockedRef.current = false;

    if (!isHugeEditableMode) {
      hugeWindowFollowScrollOnUnlockRef.current = false;
      return;
    }

    if (!hugeWindowFollowScrollOnUnlockRef.current) {
      return;
    }

    hugeWindowFollowScrollOnUnlockRef.current = false;
    void syncVisibleTokens(Math.max(1, tab.lineCount));
  }, [isHugeEditableMode, syncVisibleTokens, tab.lineCount]);

  const scheduleHugeEditableWindowUnlock = useCallback(() => {
    if (!isHugeEditableMode) {
      return;
    }

    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
    }

    hugeWindowUnlockTimerRef.current = setTimeout(() => {
      hugeWindowUnlockTimerRef.current = null;
      releaseHugeEditableWindowLock();
    }, HUGE_EDITABLE_WINDOW_UNLOCK_MS);
  }, [isHugeEditableMode, releaseHugeEditableWindowLock]);

  const loadTextFromBackend = useCallback(async () => {
    if (isHugeEditableMode) {
      const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
      const start = 0;
      const end = Math.max(start + 1, Math.min(tab.lineCount, viewportLines + largeFetchBuffer));
      await fetchEditableSegment(start, end);
      return;
    }

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
    pendingSyncRequestedRef.current = false;
  }, [fetchEditableSegment, height, isHugeEditableMode, itemSize, largeFetchBuffer, tab.id, tab.lineCount]);

  const updateActiveLineFromSelection = useCallback(() => {
    if (!highlightCurrentLine || !contentRef.current) {
      return;
    }

    const localLine = getCaretLineInElement(contentRef.current);
    if (localLine === null) {
      return;
    }

    const absoluteLine = isHugeEditableMode
      ? editableSegmentRef.current.startLine + localLine
      : localLine;
    const safeLine = Math.max(1, Math.min(Math.max(1, tab.lineCount), Math.floor(absoluteLine)));

    setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
  }, [highlightCurrentLine, isHugeEditableMode, tab.lineCount]);

  const syncActiveLineAfterInteraction = useCallback(() => {
    window.requestAnimationFrame(() => {
      updateActiveLineFromSelection();
    });
  }, [updateActiveLineFromSelection]);

  const flushPendingSync = useCallback(async () => {
    if (syncInFlightRef.current || isComposingRef.current || !contentRef.current) {
      return;
    }

    const baseText = syncedTextRef.current;
    const targetText = normalizeSegmentText(getEditableText(contentRef.current));
    pendingSyncRequestedRef.current = false;

    if (isHugeEditableMode) {
      const segment = editableSegmentRef.current;
      if (segment.endLine <= segment.startLine) {
        return;
      }

      hugeWindowLockedRef.current = true;

      if (baseText === targetText) {
        syncedTextRef.current = targetText;
        scheduleHugeEditableWindowUnlock();
        return;
      }

      syncInFlightRef.current = true;

      try {
        const newLineCount = await invoke<number>('replace_line_range', {
          id: tab.id,
          startLine: segment.startLine,
          endLine: segment.endLine,
          newText: targetText,
        });

        const newLineCountSafe = Math.max(1, newLineCount);
        const currentScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
        const currentLine = Math.max(0, Math.floor(currentScrollTop / itemSize));
        const buffer = largeFetchBuffer;
        const nextStart = Math.max(0, currentLine - buffer);
        const nextEnd = Math.max(nextStart + 1, Math.min(newLineCountSafe, currentLine + viewportLines + buffer));

        const nextSegment: EditorSegmentState = {
          startLine: nextStart,
          endLine: nextEnd,
          text: targetText,
        };

        editableSegmentRef.current = nextSegment;
        setEditableSegment(nextSegment);
        syncedTextRef.current = targetText;
        suppressExternalReloadRef.current = true;
        updateTab(tab.id, { lineCount: newLineCountSafe, isDirty: true });
        dispatchDocumentUpdated(tab.id);

        if (contentRef.current) {
          const alignedTop = alignScrollOffset(currentScrollTop);
          if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
            scrollContainerRef.current.scrollTop = alignedTop;
          }
        }
      } catch (e) {
        console.error('Large segment sync error:', e);
      } finally {
        syncInFlightRef.current = false;
        scheduleHugeEditableWindowUnlock();

        if (pendingSyncRequestedRef.current && !isComposingRef.current) {
          void flushPendingSync();
        }
      }

      return;
    }

    const diff = buildCodeUnitDiff(baseText, targetText);

    if (!diff) {
      syncedTextRef.current = targetText;
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
      dispatchDocumentUpdated(tab.id);
      await syncVisibleTokens(newLineCount);
    } catch (e) {
      console.error('Edit sync error:', e);
    } finally {
      syncInFlightRef.current = false;

      if (pendingSyncRequestedRef.current && !isComposingRef.current) {
        void flushPendingSync();
      }
    }
  }, [
    height,
    isHugeEditableMode,
    itemSize,
    largeFetchBuffer,
    scheduleHugeEditableWindowUnlock,
    syncVisibleTokens,
    tab.id,
    updateTab,
  ]);

  const queueTextSync = useCallback(
    () => {
      pendingSyncRequestedRef.current = true;

      if (isHugeEditableMode) {
        hugeWindowLockedRef.current = true;
      }

      if (editTimeout.current) {
        clearTimeout(editTimeout.current);
      }

      const debounceMs =
        tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD
          ? LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS
          : NORMAL_EDIT_SYNC_DEBOUNCE_MS;

      editTimeout.current = setTimeout(() => {
        void flushPendingSync();
      }, debounceMs);
    },
    [flushPendingSync, isHugeEditableMode, tab.lineCount]
  );

  const handleInput = useCallback(
    () => {
      if (!tab.isDirty) {
        updateTab(tab.id, { isDirty: true });
      }

      if (!isComposingRef.current) {
        queueTextSync();
      }
    },
    [tab.id, tab.isDirty, updateTab, queueTextSync]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;

    if (isHugeEditableMode) {
      hugeWindowLockedRef.current = true;
    }
  }, [isHugeEditableMode]);

  const handleCompositionEnd = useCallback(
    () => {
      isComposingRef.current = false;
      queueTextSync();
    },
    [queueTextSync]
  );

  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }) => {
      if (isLargeReadOnlyMode && isScrollbarDragRef.current) {
        return;
      }

      if (isHugeEditableMode && (pendingSyncRequestedRef.current || syncInFlightRef.current || isComposingRef.current)) {
        return;
      }

      const buffer = largeFetchBuffer;
      const start = Math.max(0, visibleStartIndex - buffer);
      const end = Math.min(tab.lineCount, visibleStopIndex + buffer);

      const cachedCount = isHugeEditableMode
        ? Math.max(0, editableSegment.endLine - editableSegment.startLine)
        : usePlainLineRendering
        ? plainLines.length
        : lineTokens.length;
      const cachedStart = isHugeEditableMode
        ? editableSegment.startLine
        : usePlainLineRendering
        ? plainStartLine
        : startLine;
      const hasNoCache = isHugeEditableMode
        ? editableSegment.endLine <= editableSegment.startLine
        : usePlainLineRendering
        ? plainLines.length === 0
        : tokens.length === 0;
      const isOutside = hasNoCache || start < cachedStart || end > cachedStart + cachedCount;

      if (isOutside) {
        if (requestTimeout.current) clearTimeout(requestTimeout.current);
        const debounceMs = isHugeEditableMode
          ? HUGE_EDITABLE_FETCH_DEBOUNCE_MS
          : tab.largeFileMode
          ? LARGE_FILE_FETCH_DEBOUNCE_MS
          : NORMAL_FILE_FETCH_DEBOUNCE_MS;
        requestTimeout.current = setTimeout(
          () => syncVisibleTokens(tab.lineCount, {
            start: visibleStartIndex,
            stop: visibleStopIndex,
          }),
          debounceMs
        );
      }
    },
    [
      editableSegment.endLine,
      editableSegment.startLine,
      isLargeReadOnlyMode,
      isHugeEditableMode,
      isComposingRef,
      largeFetchBuffer,
      usePlainLineRendering,
      plainLines.length,
      plainStartLine,
      lineTokens.length,
      pendingSyncRequestedRef,
      tokens.length,
      syncInFlightRef,
      startLine,
      syncVisibleTokens,
      tab.lineCount,
      tab.largeFileMode,
    ]
  );

  const renderTokens = useCallback((tokensArr: SyntaxToken[]) => {
    if (!tokensArr || tokensArr.length === 0) return null;

    return tokensArr.map((token, i) => {
      const key = `t-${i}`;
      if (token.text === undefined || token.text === null) return null;
      const typeClass = getTokenTypeClass(token);

      return (
        <span key={key} className={typeClass}>
          {token.text}
        </span>
      );
    });
  }, []);

  const renderPlainLine = useCallback((text: string) => {
    if (!text) {
      return null;
    }

    return <span>{text}</span>;
  }, []);

  const getLineHighlightRange = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!searchHighlight || searchHighlight.length <= 0 || searchHighlight.line !== lineNumber) {
        return null;
      }

      const start = Math.max(0, searchHighlight.column - 1);
      const end = Math.min(lineTextLength, start + searchHighlight.length);

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [searchHighlight]
  );

  const renderHighlightedPlainLine = useCallback(
    (text: string, lineNumber: number) => {
      const safeText = text || '';
      const range = getLineHighlightRange(lineNumber, safeText.length);

      if (!range) {
        return renderPlainLine(safeText);
      }

      const before = safeText.slice(0, range.start);
      const matchText = safeText.slice(range.start, range.end);
      const after = safeText.slice(range.end);

      return (
        <span>
          {before}
          <mark className="rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70">
            {matchText}
          </mark>
          {after}
        </span>
      );
    },
    [getLineHighlightRange, renderPlainLine]
  );

  const getTokenTypeClass = useCallback((token: SyntaxToken) => {
    let typeClass = '';
    if (token.type) {
      const cleanType = token.type.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const text = (token.text || '').trim();
      const cleanText = text.toLowerCase();
      const trimmedType = cleanType.replace(/^_+/, '');
      const normalizedType = trimmedType.replace(/_+/g, '_');
      typeClass = `token-${cleanType}`;

      if (cleanType.includes('string')) typeClass += ' token-string';
      if (
        cleanType.includes('keyword') ||
        normalizedType.includes('keyword') ||
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
          'const',
          'var',
          'function',
          'async',
          'await',
          'yield',
          'class',
          'extends',
          'implements',
          'interface',
          'namespace',
          'module',
          'package',
          'import',
          'export',
          'from',
          'default',
          'switch',
          'case',
          'do',
          'try',
          'catch',
          'finally',
          'throw',
          'throws',
          'new',
          'typeof',
          'instanceof',
          'void',
          'delete',
          'this',
          'def',
          'lambda',
          'pass',
          'raise',
          'except',
          'elif',
          'global',
          'nonlocal',
          'del',
          'assert',
          'is',
          'in',
          'not',
          'and',
          'or',
          'typedef',
        ].includes(cleanType) ||
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
          'const',
          'var',
          'function',
          'async',
          'await',
          'yield',
          'class',
          'extends',
          'implements',
          'interface',
          'namespace',
          'module',
          'package',
          'import',
          'export',
          'from',
          'default',
          'switch',
          'case',
          'do',
          'try',
          'catch',
          'finally',
          'throw',
          'throws',
          'new',
          'typeof',
          'instanceof',
          'void',
          'delete',
          'this',
          'def',
          'lambda',
          'pass',
          'raise',
          'except',
          'elif',
          'global',
          'nonlocal',
          'del',
          'assert',
          'is',
          'in',
          'not',
          'and',
          'or',
          'typedef',
        ].includes(normalizedType)
      ) {
        typeClass += ' token-keyword';
      }
      if (cleanType.includes('comment')) typeClass += ' token-comment';
      if (
        cleanType.includes('number') ||
        cleanType.includes('integer') ||
        cleanType.includes('float') ||
        cleanType.includes('decimal') ||
        cleanType.includes('hex') ||
        cleanType.includes('octal') ||
        cleanType.includes('binary')
      ) {
        typeClass += ' token-number';
      }

      if (cleanType.includes('literal') || normalizedType.includes('literal')) {
        if (/^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)) {
          typeClass += ' token-number';
        } else if (cleanText.length > 0) {
          typeClass += ' token-constant';
        }
      }

      if (cleanType.includes('scalar') || normalizedType.includes('scalar')) {
        if (cleanType.includes('boolean') || ['true', 'false', 'yes', 'no'].includes(cleanText)) {
          typeClass += ' token-boolean token-constant';
        } else if (
          cleanType.includes('int') ||
          cleanType.includes('float') ||
          /^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)
        ) {
          typeClass += ' token-number';
        } else {
          typeClass += ' token-string';
        }
      }
      if (
        (cleanType.includes('identifier') && !cleanType.includes('property')) ||
        cleanType === 'name' ||
        cleanType.endsWith('_name') ||
        normalizedType === 'name' ||
        normalizedType.endsWith('_name')
      ) {
        typeClass += ' token-identifier';
      }
      if (
        cleanType.includes('type') ||
        cleanType.includes('class') ||
        cleanType.includes('interface') ||
        cleanType.includes('enum') ||
        cleanType.includes('struct') ||
        cleanType.includes('trait') ||
        cleanType.includes('module') ||
        cleanType.includes('namespace') ||
        normalizedType.includes('class') ||
        normalizedType.includes('interface') ||
        normalizedType.includes('enum') ||
        normalizedType.includes('struct') ||
        normalizedType.includes('trait') ||
        normalizedType.includes('module') ||
        normalizedType.includes('namespace') ||
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

      if (
        (cleanType.includes('key') && !cleanType.includes('keyword')) ||
        cleanType.includes('property') ||
        cleanType.includes('field') ||
        cleanType.includes('member') ||
        normalizedType.includes('key') ||
        normalizedType.includes('property') ||
        normalizedType.includes('field') ||
        normalizedType.includes('member')
      ) {
        typeClass += ' token-property';
      }

      if (cleanType.includes('date') || cleanType.includes('time')) {
        typeClass += ' token-string';
      }

      if (
        cleanType.includes('function') ||
        cleanType.includes('method') ||
        cleanType.includes('call') ||
        cleanType.includes('constructor') ||
        normalizedType.includes('function') ||
        normalizedType.includes('method') ||
        normalizedType.includes('call') ||
        normalizedType.includes('constructor')
      ) {
        typeClass += ' token-function';
      }

      if (cleanType.includes('regex') || normalizedType.includes('regex')) {
        typeClass += ' token-regex';
      }

      if (cleanType.includes('escape') || normalizedType.includes('escape')) {
        typeClass += ' token-escape';
      }

      if (
        cleanType.includes('annotation') ||
        cleanType.includes('decorator') ||
        cleanType.includes('attribute') ||
        normalizedType.includes('annotation') ||
        normalizedType.includes('decorator') ||
        normalizedType.includes('attribute')
      ) {
        typeClass += ' token-attribute_item';
      }

      if (
        cleanType.includes('tag') ||
        normalizedType.includes('tag') ||
        ['stag', 'etag', 'emptyelemtag', 'doctype'].includes(cleanType) ||
        ['stag', 'etag', 'emptyelemtag', 'doctype'].includes(normalizedType)
      ) {
        typeClass += ' token-tag';
      }

      if (
        cleanType.includes('directive') ||
        cleanType.includes('preproc') ||
        normalizedType.includes('directive') ||
        normalizedType.includes('preproc') ||
        [
          'define',
          'ifdef',
          'ifndef',
          'if',
          'elif',
          'else',
          'endif',
          'include',
          'pragma',
          'line',
          'error',
        ].includes(normalizedType) ||
        cleanText.startsWith('#')
      ) {
        typeClass += ' token-preprocessor';
      }

      if (cleanType.includes('error') || normalizedType.includes('error')) {
        typeClass += ' token-error';
      }

      if (
        cleanType.includes('constant') ||
        normalizedType.includes('constant') ||
        cleanType.includes('boolean') ||
        [
          'true',
          'false',
          'null',
          'nullptr',
          'none',
          'nil',
          'undefined',
          'yes',
          'no',
        ].includes(cleanType) ||
        [
          'true',
          'false',
          'null',
          'nullptr',
          'none',
          'nil',
          'undefined',
          'yes',
          'no',
        ].includes(normalizedType) ||
        ['true', 'false', 'null', 'nullptr', 'none', 'nil', 'undefined', 'yes', 'no'].includes(
          cleanText
        )
      ) {
        typeClass += ' token-boolean token-constant';
      }

      if (
        cleanType.includes('charref') ||
        cleanType.includes('entityref') ||
        normalizedType.includes('charref') ||
        normalizedType.includes('entityref')
      ) {
        typeClass += ' token-constant';
      }

      if (
        cleanType.includes('punctuation') ||
        cleanType.includes('delimiter') ||
        cleanType.includes('bracket') ||
        normalizedType.includes('punctuation') ||
        normalizedType.includes('delimiter') ||
        normalizedType.includes('bracket')
      ) {
        typeClass += ' token-punctuation';
      }

      if (cleanType.includes('operator') || normalizedType.includes('operator')) {
        typeClass += ' token-operator';
      }

      if (
        /^(if|ifdef|ifndef|elif|else|endif|define|include|pragma|line|error)$/i.test(normalizedType)
      ) {
        typeClass += ' token-preprocessor';
      }

      if (/^_+$/.test(cleanType) && text.length > 0) {
        if (
          /^(=|==|===|!=|!==|<=|>=|<|>|\||\|\||\+|\+\+|\*|\?|,|\.|:|-|--|\/|%|!|&|&&|\^|~|->|=>)$/.test(
            text
          )
        ) {
          typeClass += ' token-operator';
        } else {
          typeClass += ' token-punctuation';
        }
      }

      if (/^_+[a-z]+$/.test(cleanType) && text.length > 0 && !typeClass.includes('token-preprocessor')) {
        if (/^#/.test(text)) {
          typeClass += ' token-preprocessor';
        }
      }
    }

    return typeClass;
  }, []);

  const renderHighlightedTokens = useCallback(
    (tokensArr: SyntaxToken[], lineNumber: number) => {
      if (!tokensArr || tokensArr.length === 0) return null;

      const lineText = tokensArr.map((token) => token.text ?? '').join('');
      const range = getLineHighlightRange(lineNumber, lineText.length);

      if (!range) {
        return renderTokens(tokensArr);
      }

      let cursor = 0;
      const rendered: React.ReactNode[] = [];

      tokensArr.forEach((token, tokenIndex) => {
        if (token.text === undefined || token.text === null) {
          return;
        }

        const tokenText = token.text;
        const tokenLength = tokenText.length;
        const tokenStart = cursor;
        const tokenEnd = tokenStart + tokenLength;
        const typeClass = getTokenTypeClass(token);

        if (tokenLength === 0) {
          rendered.push(
            <span key={`t-empty-${tokenIndex}`} className={typeClass}>
              {tokenText}
            </span>
          );
          return;
        }

        const overlapStart = Math.max(tokenStart, range.start);
        const overlapEnd = Math.min(tokenEnd, range.end);

        if (overlapStart >= overlapEnd) {
          rendered.push(
            <span key={`t-full-${tokenIndex}`} className={typeClass}>
              {tokenText}
            </span>
          );
          cursor = tokenEnd;
          return;
        }

        const beforeLength = overlapStart - tokenStart;
        const matchLength = overlapEnd - overlapStart;
        const afterLength = tokenEnd - overlapEnd;

        if (beforeLength > 0) {
          rendered.push(
            <span key={`t-before-${tokenIndex}`} className={typeClass}>
              {tokenText.slice(0, beforeLength)}
            </span>
          );
        }

        rendered.push(
          <mark
            key={`t-match-${tokenIndex}`}
            className="rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70"
          >
            <span className={typeClass}>
              {tokenText.slice(beforeLength, beforeLength + matchLength)}
            </span>
          </mark>
        );

        if (afterLength > 0) {
          rendered.push(
            <span key={`t-after-${tokenIndex}`} className={typeClass}>
              {tokenText.slice(beforeLength + matchLength)}
            </span>
          );
        }

        cursor = tokenEnd;
      });

      return rendered;
    },
    [getLineHighlightRange, getTokenTypeClass, renderTokens]
  );

  useEffect(() => {
    if (isLargeReadOnlyMode) {
      initializedRef.current = false;
      suppressExternalReloadRef.current = false;
      syncInFlightRef.current = false;
      pendingSyncRequestedRef.current = false;
      hugeWindowLockedRef.current = false;
      hugeWindowFollowScrollOnUnlockRef.current = false;
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
      syncedTextRef.current = '';
      setTokens([]);
      setStartLine(0);
      editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
      setEditableSegment({ startLine: 0, endLine: 0, text: '' });

      void syncVisibleTokens(Math.max(1, tab.lineCount));
      return;
    }

    let cancelled = false;

    initializedRef.current = false;
    suppressExternalReloadRef.current = false;
    syncInFlightRef.current = false;
    pendingSyncRequestedRef.current = false;
    hugeWindowLockedRef.current = false;
    hugeWindowFollowScrollOnUnlockRef.current = false;
    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
      hugeWindowUnlockTimerRef.current = null;
    }
    syncedTextRef.current = '';
    editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
    setEditableSegment({ startLine: 0, endLine: 0, text: '' });

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
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    };
  }, [tab.id, loadTextFromBackend, syncVisibleTokens, tab.lineCount, isLargeReadOnlyMode]);

  useEffect(() => {
    if (isLargeReadOnlyMode) {
      void syncVisibleTokens(Math.max(1, tab.lineCount));
      return;
    }

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
  }, [tab.lineCount, loadTextFromBackend, syncVisibleTokens, isLargeReadOnlyMode]);

  useEffect(() => {
    if (!usePlainLineRendering) {
      setPlainLines([]);
      setPlainStartLine(0);
    }

    if (!isHugeEditableMode) {
      editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
      setEditableSegment({ startLine: 0, endLine: 0, text: '' });
      hugeWindowLockedRef.current = false;
      hugeWindowFollowScrollOnUnlockRef.current = false;
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    }

    if (!isLargeReadOnlyMode) {
      largeModePromptOpenRef.current = false;
      setShowLargeModeEditPrompt(false);
    }
  }, [isHugeEditableMode, isLargeReadOnlyMode, tab.id, usePlainLineRendering]);

  useEffect(() => {
    if (!isHugeEditableMode || !scrollContainerRef.current) {
      return;
    }

    const scrollTop = scrollContainerRef.current.scrollTop;
    if (contentRef.current && Math.abs(contentRef.current.scrollTop - scrollTop) > 0.001) {
      contentRef.current.scrollTop = scrollTop;
    }
  }, [editableSegment.endLine, editableSegment.startLine, isHugeEditableMode]);

  useEffect(() => {
    window.addEventListener('pointerup', endScrollbarDragSelectionGuard);
    window.addEventListener('blur', endScrollbarDragSelectionGuard);

    return () => {
      window.removeEventListener('pointerup', endScrollbarDragSelectionGuard);
      window.removeEventListener('blur', endScrollbarDragSelectionGuard);
    };
  }, [endScrollbarDragSelectionGuard]);

  useEffect(() => {
    const handleSelectionChange = () => {
      updateActiveLineFromSelection();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [updateActiveLineFromSelection]);

  useEffect(() => {
    if (!highlightCurrentLine) {
      return;
    }

    updateActiveLineFromSelection();
  }, [highlightCurrentLine, updateActiveLineFromSelection]);

  useEffect(() => {
    setActiveLineNumber(1);
    setSearchHighlight(null);

    if (contentTreeFlashTimerRef.current) {
      window.clearTimeout(contentTreeFlashTimerRef.current);
      contentTreeFlashTimerRef.current = null;
    }

    setContentTreeFlashLine(null);
  }, [tab.id]);

  useEffect(() => {
    const handleNavigateToLine = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
        length?: number;
        source?: string;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      const targetLine = Number.isFinite(detail.line) ? Math.max(1, Math.floor(detail.line as number)) : 1;
      const targetColumn = Number.isFinite(detail.column) ? Math.max(1, Math.floor(detail.column as number)) : 1;
      const targetLength = Number.isFinite(detail.length) ? Math.max(0, Math.floor(detail.length as number)) : 0;
      const shouldMoveCaretToLineStart = detail.source === 'content-tree';
      setActiveLineNumber(targetLine);

      const placeCaretAtTargetLineStart = () => {
        if (!contentRef.current) {
          return;
        }

        const lineForCaret = isHugeEditableMode
          ? Math.max(1, targetLine - editableSegmentRef.current.startLine)
          : targetLine;

        setCaretToLineStart(contentRef.current, lineForCaret);
      };

      if (detail.source === 'content-tree') {
        if (contentTreeFlashTimerRef.current) {
          window.clearTimeout(contentTreeFlashTimerRef.current);
          contentTreeFlashTimerRef.current = null;
        }

        setContentTreeFlashLine(targetLine);
        contentTreeFlashTimerRef.current = window.setTimeout(() => {
          setContentTreeFlashLine(null);
          contentTreeFlashTimerRef.current = null;
        }, 1000);
      }

      setSearchHighlight({
        line: targetLine,
        column: targetColumn,
        length: targetLength,
        id: Date.now(),
      });

      const targetScrollTop = alignScrollOffset((targetLine - 1) * itemSize);
      const listElement = listRef.current?._outerRef as HTMLDivElement | undefined;

      if (isHugeEditableMode) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetScrollTop;
        }

        if (contentRef.current) {
          contentRef.current.scrollTop = targetScrollTop;
          contentRef.current.focus();

          if (shouldMoveCaretToLineStart) {
            window.requestAnimationFrame(() => {
              placeCaretAtTargetLineStart();
              window.setTimeout(() => {
                placeCaretAtTargetLineStart();
              }, 60);
            });
          }
        }

        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }

        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (isLargeReadOnlyMode) {
        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }
        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (contentRef.current) {
        contentRef.current.scrollTop = targetScrollTop;
        contentRef.current.focus();

        if (shouldMoveCaretToLineStart) {
          window.requestAnimationFrame(() => {
            placeCaretAtTargetLineStart();
          });
        }
      }

      if (listElement) {
        listElement.scrollTop = targetScrollTop;
      }

      void syncVisibleTokens(Math.max(1, tab.lineCount));
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:navigate-to-content-tree', handleNavigateToLine as EventListener);
    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:navigate-to-content-tree', handleNavigateToLine as EventListener);
    };
  }, [isHugeEditableMode, isLargeReadOnlyMode, itemSize, syncVisibleTokens, tab.id, tab.lineCount]);

  useEffect(() => {
    const handleForcedRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId: string; lineCount?: number }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      if (typeof detail.lineCount === 'number' && Number.isFinite(detail.lineCount)) {
        updateTab(tab.id, { lineCount: Math.max(1, detail.lineCount) });
      }

      void loadTextFromBackend();
      void syncVisibleTokens(Math.max(1, detail.lineCount ?? tab.lineCount));
    };

    window.addEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    return () => {
      window.removeEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    };
  }, [loadTextFromBackend, syncVisibleTokens, tab.id, tab.lineCount, updateTab]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full overflow-hidden bg-background relative"
      tabIndex={isLargeReadOnlyMode ? 0 : -1}
      onPointerDown={handleLargeModePointerDown}
      onKeyDown={handleLargeModeEditIntent}
    >
      {!isLargeReadOnlyMode && isHugeEditableMode && (
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 w-full h-full z-0 outline-none overflow-auto editor-scroll-stable"
          style={{
            overflowX: horizontalOverflowMode,
            overflowY: 'auto',
          }}
          onScroll={handleScroll}
          onPointerDown={handleHugeScrollablePointerDown}
        >
          <div
            className="relative"
            style={{
              minHeight: `${Math.max(1, tab.lineCount) * itemSize}px`,
              minWidth: '100%',
            }}
          >
            <div
              ref={contentRef}
              contentEditable="plaintext-only"
              suppressContentEditableWarning
              className="absolute left-0 right-0 editor-input-layer"
              style={{
                top: hugeEditablePaddingTop,
                fontFamily: settings.fontFamily,
                fontSize: `${renderedFontSizePx}px`,
                lineHeight: `${lineHeightPx}px`,
                whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                paddingLeft: contentPaddingLeft,
                paddingBottom: hugeEditablePaddingBottom,
              }}
              onInput={handleInput}
              onPointerDown={handleEditorPointerDown}
              onKeyUp={syncActiveLineAfterInteraction}
              onPointerUp={syncActiveLineAfterInteraction}
              onFocus={syncActiveLineAfterInteraction}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {!isLargeReadOnlyMode && !isHugeEditableMode && (
        <div
          ref={contentRef}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          className="absolute inset-0 w-full h-full z-0 outline-none overflow-auto editor-input-layer editor-scroll-stable"
          style={{
            overflowX: horizontalOverflowMode,
            overflowY: 'auto',
            fontFamily: settings.fontFamily,
            fontSize: `${renderedFontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            paddingLeft: contentPaddingLeft,
          }}
          onInput={handleInput}
          onScroll={handleScroll}
          onPointerDown={handleEditorPointerDown}
          onKeyUp={syncActiveLineAfterInteraction}
          onPointerUp={syncActiveLineAfterInteraction}
          onFocus={syncActiveLineAfterInteraction}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          spellCheck={false}
        />
      )}

      {width > 0 && height > 0 && (
        <div
          ref={backdropRef}
          className={`absolute inset-0 w-full h-full z-10 overflow-hidden ${
            isLargeReadOnlyMode ? '' : 'pointer-events-none'
          }`}
        >
          <List
            ref={listRef}
            height={height}
            width={width}
            itemCount={tab.lineCount}
            itemSize={getListItemSize}
            estimatedItemSize={itemSize}
            onItemsRendered={onItemsRendered}
            overscanCount={20}
            style={{ overflowX: horizontalOverflowMode, overflowY: 'auto' }}
            onScroll={isLargeReadOnlyMode ? handleScroll : undefined}
            onPointerDown={isLargeReadOnlyMode ? handleReadOnlyListPointerDown : undefined}
          >
            {({ index, style }) => {
              const relativeIndex = isHugeEditableMode
                ? index - editableSegment.startLine
                : usePlainLineRendering
                ? index - plainStartLine
                : index - startLine;
              const plainRelativeIndex = index - plainStartLine;
              const lineTokensArr =
                !usePlainLineRendering && relativeIndex >= 0 && relativeIndex < lineTokens.length
                  ? lineTokens[relativeIndex]
                  : [];
              const plainLine =
                isHugeEditableMode && relativeIndex >= 0 && relativeIndex < editableSegmentLines.length
                  ? editableSegmentLines[relativeIndex]
                  : usePlainLineRendering && plainRelativeIndex >= 0 && plainRelativeIndex < plainLines.length
                  ? plainLines[plainRelativeIndex]
                  : '';

              return (
                <div
                  ref={(element) => measureRenderedLineHeight(index, element)}
                  style={{
                    ...style,
                    width: wordWrap ? '100%' : 'max-content',
                    minWidth: '100%',
                    fontFamily: settings.fontFamily,
                    fontSize: `${renderedFontSizePx}px`,
                    lineHeight: `${lineHeightPx}px`,
                  }}
                  className={`px-4 hover:bg-muted/5 text-foreground group editor-line flex items-start transition-colors duration-1000 ${
                    contentTreeFlashLine === index + 1
                      ? 'bg-primary/15 dark:bg-primary/20'
                      : highlightCurrentLine && activeLineNumber === index + 1
                      ? 'bg-accent/45 dark:bg-accent/25'
                      : ''
                  }`}
                >
                  <span
                    className="shrink-0 text-muted-foreground/40 line-number w-12 text-right mr-2 border-r border-border/50 pr-2 group-hover:text-muted-foreground transition-colors"
                    style={{ fontSize: `${alignToDevicePixel(Math.max(10, renderedFontSizePx - 2))}px` }}
                  >
                    {index + 1}
                  </span>
                  <div
                    className={wordWrap ? 'min-w-0 flex-1' : 'shrink-0'}
                    style={{
                      whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                    }}
                  >
                    {usePlainLineRendering
                      ? renderHighlightedPlainLine(plainLine, index + 1)
                      : lineTokensArr.length > 0
                      ? renderHighlightedTokens(lineTokensArr, index + 1)
                      : <span className="opacity-10 italic">...</span>}
                  </div>
                </div>
              );
            }}
          </List>
        </div>
      )}

      {showLargeModeEditPrompt && isLargeReadOnlyMode && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35">
          <div className="w-[min(92vw,420px)] rounded-lg border border-border bg-background p-4 shadow-2xl">
            <p className="text-sm font-medium text-foreground">{tr('editor.largeMode.readOnlyTitle')}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {tr('editor.largeMode.readOnlyDesc')}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={handleKeepReadOnlyMode}
              >
                {tr('editor.largeMode.keepReadOnly')}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                onClick={handleEnterEditableMode}
              >
                {tr('editor.largeMode.enterEditable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
