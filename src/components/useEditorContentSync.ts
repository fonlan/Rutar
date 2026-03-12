import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SyntaxToken } from './Editor.types';

interface TokenRange {
  start: number;
  end: number;
}

interface VisibleRange {
  start: number;
  stop: number;
}

interface EditableSegmentSelectionSnapshot {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  direction: "forward" | "backward" | "none";
}

interface UseEditorContentSyncParams {
  maxLineRange: number;
  tabId: string;
  height: number;
  itemSize: number;
  largeFetchBuffer: number;
  isHugeEditableMode: boolean;
  usePlainLineRendering: boolean;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  listRef: MutableRefObject<any>;
  isScrollbarDragRef: MutableRefObject<boolean>;
  currentRequestVersionRef: MutableRefObject<number>;
  hugeWindowLockedRef: MutableRefObject<boolean>;
  hugeWindowFollowScrollOnUnlockRef: MutableRefObject<boolean>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  pendingRestoreScrollTopRef: MutableRefObject<number | null>;
  syncedTextRef: MutableRefObject<string>;
  pendingSyncRequestedRef: MutableRefObject<boolean>;
  lineTokensLength: number;
  tokenStartLine: number;
  setPlainLines: (lines: string[]) => void;
  setPlainStartLine: (line: number) => void;
  setLineTokens: (tokens: SyntaxToken[][]) => void;
  setStartLine: (line: number) => void;
  setTokenFallbackPlainLines: (lines: string[]) => void;
  setTokenFallbackPlainStartLine: (line: number) => void;
  setEditableSegment: (segment: EditorSegmentState) => void;
  normalizeLineText: (text: string) => string;
  normalizeEditableLineText: (text: string) => string;
  normalizeEditorText: (text: string) => string;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { start: number; end: number; isCollapsed: boolean } | null;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
  getCodeUnitOffsetFromLineColumn: (text: string, line: number, column: number) => number;
  syncSelectionAfterEditableSegmentSwapRef: MutableRefObject<(() => void) | null>;
}

export function useEditorContentSync({
  maxLineRange,
  tabId,
  height,
  itemSize,
  largeFetchBuffer,
  isHugeEditableMode,
  usePlainLineRendering,
  contentRef,
  scrollContainerRef,
  listRef,
  isScrollbarDragRef,
  currentRequestVersionRef,
  hugeWindowLockedRef,
  hugeWindowFollowScrollOnUnlockRef,
  editableSegmentRef,
  pendingRestoreScrollTopRef,
  syncedTextRef,
  pendingSyncRequestedRef,
  lineTokensLength,
  tokenStartLine,
  setPlainLines,
  setPlainStartLine,
  setLineTokens,
  setStartLine,
  setTokenFallbackPlainLines,
  setTokenFallbackPlainStartLine,
  setEditableSegment,
  normalizeLineText,
  normalizeEditableLineText,
  normalizeEditorText,
  setInputLayerText,
  getEditableText,
  getSelectionOffsetsInElement,
  codeUnitOffsetToLineColumn,
  getCodeUnitOffsetFromLineColumn,
  syncSelectionAfterEditableSegmentSwapRef,
}: UseEditorContentSyncParams) {
  const fallbackPlainRequestVersionRef = useRef(0);
  const tokenRequestSerialRef = useRef(0);
  const tokenFetchInFlightRef = useRef(false);
  const inFlightTokenRangeRef: MutableRefObject<TokenRange | null> = useRef<TokenRange | null>(null);
  const pendingTokenRangeRef: MutableRefObject<TokenRange | null> = useRef<TokenRange | null>(null);
  const pendingLockedVisibleRangeRef: MutableRefObject<VisibleRange | null> = useRef<VisibleRange | null>(null);

  const captureEditableSegmentSelectionSnapshot = useCallback((): EditableSegmentSelectionSnapshot | null => {
    const element = contentRef.current;
    const segmentText = editableSegmentRef.current.text;
    if (!element || !segmentText) {
      return null;
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets || selectionOffsets.isCollapsed) {
      return null;
    }

    const startPosition = codeUnitOffsetToLineColumn(segmentText, selectionOffsets.start);
    const endPosition = codeUnitOffsetToLineColumn(segmentText, selectionOffsets.end);
    const direction = element.selectionDirection === 'backward'
      ? 'backward'
      : element.selectionDirection === 'none'
        ? 'none'
        : 'forward';

    return {
      startLine: editableSegmentRef.current.startLine + startPosition.line,
      startColumn: startPosition.column + 1,
      endLine: editableSegmentRef.current.startLine + endPosition.line,
      endColumn: endPosition.column + 1,
      direction,
    };
  }, [
    codeUnitOffsetToLineColumn,
    contentRef,
    editableSegmentRef,
    getSelectionOffsetsInElement,
  ]);

  const restoreEditableSegmentSelectionSnapshot = useCallback(
    (snapshot: EditableSegmentSelectionSnapshot | null, segment: EditorSegmentState) => {
      const element = contentRef.current;
      if (!element || !snapshot) {
        return;
      }

      const segmentFirstLine = segment.startLine + 1;
      const segmentLastLine = segment.endLine;
      const selectionFirstLine = Math.min(snapshot.startLine, snapshot.endLine);
      const selectionLastLine = Math.max(snapshot.startLine, snapshot.endLine);
      if (selectionLastLine < segmentFirstLine || selectionFirstLine > segmentLastLine) {
        return;
      }

      const clampedStartLine = Math.min(Math.max(snapshot.startLine, segmentFirstLine), segmentLastLine);
      const clampedEndLine = Math.min(Math.max(snapshot.endLine, segmentFirstLine), segmentLastLine);
      const localStartLine = clampedStartLine - segment.startLine;
      const localEndLine = clampedEndLine - segment.startLine;
      const startOffset = getCodeUnitOffsetFromLineColumn(segment.text, localStartLine, snapshot.startColumn);
      const endOffset = getCodeUnitOffsetFromLineColumn(segment.text, localEndLine, snapshot.endColumn);

      element.setSelectionRange(startOffset, endOffset, snapshot.direction);
      syncSelectionAfterEditableSegmentSwapRef.current?.();
    },
    [contentRef, getCodeUnitOffsetFromLineColumn, syncSelectionAfterEditableSegmentSwapRef]
  );

  const fetchPlainLines = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersionRef.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tabId,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersionRef.current) return;
        if (!Array.isArray(lines)) return;

        setPlainLines(lines.map(normalizeLineText));
        setPlainStartLine(start);
      } catch (error) {
        console.error('Fetch visible lines error:', error);
      }
    },
    [currentRequestVersionRef, normalizeLineText, setPlainLines, setPlainStartLine, tabId]
  );

  const fetchEditableSegment = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersionRef.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tabId,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersionRef.current) return;
        if (!Array.isArray(lines)) return;

        const selectionSnapshot = captureEditableSegmentSelectionSnapshot();
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
          setInputLayerText(contentRef.current, text);
          // In huge editable mode, scrolling is controlled by the outer container.
          // Keep textarea internal scroll at origin to avoid pointer/selection drift.
          if (Math.abs(contentRef.current.scrollTop) > 0.001) {
            contentRef.current.scrollTop = 0;
          }

          if (Math.abs(contentRef.current.scrollLeft) > 0.001) {
            contentRef.current.scrollLeft = 0;
          }

          restoreEditableSegmentSelectionSnapshot(selectionSnapshot, segment);
        }

        syncedTextRef.current = text;
        pendingSyncRequestedRef.current = false;
      } catch (error) {
        console.error('Fetch editable segment error:', error);
      }
    },
    [
      contentRef,
      currentRequestVersionRef,
      editableSegmentRef,
      captureEditableSegmentSelectionSnapshot,
      isScrollbarDragRef,
      normalizeEditableLineText,
      pendingRestoreScrollTopRef,
      pendingSyncRequestedRef,
      restoreEditableSegmentSelectionSnapshot,
      scrollContainerRef,
      setEditableSegment,
      setInputLayerText,
      syncedTextRef,
      tabId,
    ]
  );

  const fetchTokens = useCallback(
    async (
      start: number,
      end: number,
      version: number,
      requestSerial: number
    ) => {
      try {
        const lineResult = await invoke<SyntaxToken[][]>('get_syntax_token_lines', {
          id: tabId,
          startLine: start,
          endLine: end,
          requestSerial,
        });

        if (version !== currentRequestVersionRef.current) return;
        if (!Array.isArray(lineResult)) return;

        setLineTokens(lineResult);
        setStartLine(start);
        setTokenFallbackPlainLines([]);
        setTokenFallbackPlainStartLine(0);
      } catch (error) {
        console.error('Fetch error:', error);
      }
    },
    [
      currentRequestVersionRef,
      setLineTokens,
      setStartLine,
      setTokenFallbackPlainLines,
      setTokenFallbackPlainStartLine,
      tabId,
    ]
  );

  const fetchTokenFallbackPlainLines = useCallback(
    async (start: number, end: number) => {
      const version = ++fallbackPlainRequestVersionRef.current;
      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tabId,
          startLine: start,
          endLine: end,
        });

        if (version !== fallbackPlainRequestVersionRef.current) return;
        if (!Array.isArray(lines)) return;

        const normalizedLines = lines.map(normalizeLineText);
        setTokenFallbackPlainLines(normalizedLines);
        setTokenFallbackPlainStartLine(start);
      } catch (error) {
        console.error('Fetch token fallback lines error:', error);
      }
    },
    [
      normalizeLineText,
      setTokenFallbackPlainLines,
      setTokenFallbackPlainStartLine,
      tabId,
    ]
  );

  const enqueueTokenFetch = useCallback(
    async (start: number, end: number) => {
      const nextRange = { start, end };

      const isSameRange = (left: TokenRange | null, right: TokenRange) =>
        !!left && left.start === right.start && left.end === right.end;

      if (tokenFetchInFlightRef.current) {
        if (
          isSameRange(inFlightTokenRangeRef.current, nextRange)
          || isSameRange(pendingTokenRangeRef.current, nextRange)
        ) {
          return;
        }

        pendingTokenRangeRef.current = nextRange;
        return;
      }

      tokenFetchInFlightRef.current = true;
      inFlightTokenRangeRef.current = nextRange;
      pendingTokenRangeRef.current = null;

      try {
        let activeRange: TokenRange | null = nextRange;
        while (activeRange) {
          const currentRange: TokenRange = activeRange;
          const version = ++currentRequestVersionRef.current;
          const requestSerial = ++tokenRequestSerialRef.current;
          await fetchTokens(currentRange.start, currentRange.end, version, requestSerial);

          const queuedRange: TokenRange | null = pendingTokenRangeRef.current;
          pendingTokenRangeRef.current = null;

          if (queuedRange !== null) {
            const nextQueuedRange = queuedRange as TokenRange;
            const isSameAsCurrent =
              nextQueuedRange.start === currentRange.start && nextQueuedRange.end === currentRange.end;
            if (isSameAsCurrent) {
              activeRange = null;
              continue;
            }

            inFlightTokenRangeRef.current = nextQueuedRange;
            activeRange = nextQueuedRange;
            continue;
          }

          activeRange = null;
        }
      } finally {
        tokenFetchInFlightRef.current = false;
        inFlightTokenRangeRef.current = null;
        pendingTokenRangeRef.current = null;
      }
    },
    [currentRequestVersionRef, fetchTokens]
  );

  const syncVisibleTokens = useCallback(
    async (lineCount: number, visibleRange?: VisibleRange) => {
      let effectiveVisibleRange = visibleRange;

      if (isHugeEditableMode && hugeWindowLockedRef.current) {
        if (effectiveVisibleRange) {
          pendingLockedVisibleRangeRef.current = {
            start: effectiveVisibleRange.start,
            stop: effectiveVisibleRange.stop,
          };
        }
        hugeWindowFollowScrollOnUnlockRef.current = true;
        return;
      }

      if (isHugeEditableMode) {
        if (effectiveVisibleRange) {
          pendingLockedVisibleRangeRef.current = null;
        } else if (pendingLockedVisibleRangeRef.current) {
          effectiveVisibleRange = pendingLockedVisibleRangeRef.current;
          pendingLockedVisibleRangeRef.current = null;
        }
      }

      const buffer = largeFetchBuffer;
      let start = 0;
      let end = 1;

      if (effectiveVisibleRange) {
        start = Math.max(0, effectiveVisibleRange.start - buffer);
        end = Math.max(start + 1, Math.min(lineCount, effectiveVisibleRange.stop + buffer));
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

      const tokenCacheStart = tokenStartLine;
      const tokenCacheEnd = tokenCacheStart + Math.max(0, lineTokensLength);
      const hasTokenCoverage =
        lineTokensLength > 0 && start >= tokenCacheStart && end <= tokenCacheEnd;
      if (isScrollbarDragRef.current || !hasTokenCoverage) {
        void fetchTokenFallbackPlainLines(start, end);
      }

      await enqueueTokenFetch(start, end);
    },
    [
      contentRef,
      enqueueTokenFetch,
      fetchEditableSegment,
      fetchTokenFallbackPlainLines,
      fetchPlainLines,
      height,
      hugeWindowFollowScrollOnUnlockRef,
      hugeWindowLockedRef,
      isHugeEditableMode,
      itemSize,
      lineTokensLength,
      largeFetchBuffer,
      listRef,
      pendingLockedVisibleRangeRef,
      scrollContainerRef,
      tokenStartLine,
      usePlainLineRendering,
    ]
  );

  const loadTextFromBackend = useCallback(async () => {
    if (isHugeEditableMode) {
      const anchorScrollTop = pendingRestoreScrollTopRef.current
        ?? scrollContainerRef.current?.scrollTop
        ?? contentRef.current?.scrollTop
        ?? 0;
      const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
      const anchorLine = Math.max(0, Math.floor(anchorScrollTop / itemSize));
      const start = Math.max(0, anchorLine - largeFetchBuffer);
      const end = Math.max(start + 1, anchorLine + viewportLines + largeFetchBuffer);
      await fetchEditableSegment(start, end);
      return;
    }

    const raw = await invoke<string>('get_visible_lines', {
      id: tabId,
      startLine: 0,
      endLine: maxLineRange,
    });

    const normalized = normalizeEditorText(raw || '');
    if (contentRef.current) {
      const currentText = normalizeEditorText(getEditableText(contentRef.current));
      if (currentText !== normalized) {
        setInputLayerText(contentRef.current, normalized);
      }
    }

    syncedTextRef.current = normalized;
    pendingSyncRequestedRef.current = false;
  }, [
    contentRef,
    fetchEditableSegment,
    height,
    isHugeEditableMode,
    itemSize,
    largeFetchBuffer,
    pendingRestoreScrollTopRef,
    normalizeEditorText,
    getEditableText,
    maxLineRange,
    pendingSyncRequestedRef,
    scrollContainerRef,
    setInputLayerText,
    syncedTextRef,
    tabId,
  ]);

  return {
    syncVisibleTokens,
    loadTextFromBackend,
  };
}
