import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';

interface ItemsRenderedArgs {
  visibleStartIndex: number;
  visibleStopIndex: number;
}

interface UseEditorVisibleItemsRenderedParams {
  isHugeEditableMode: boolean;
  pendingSyncRequestedRef: MutableRefObject<boolean>;
  syncInFlightRef: MutableRefObject<boolean>;
  isComposingRef: MutableRefObject<boolean>;
  isScrollbarDragRef: MutableRefObject<boolean>;
  largeFetchBuffer: number;
  tabLineCount: number;
  tabLargeFileMode: boolean;
  editableSegmentStartLine: number;
  editableSegmentEndLine: number;
  usePlainLineRendering: boolean;
  plainLinesLength: number;
  plainStartLine: number;
  lineTokensLength: number;
  startLine: number;
  requestTimeoutRef: MutableRefObject<any>;
  hugeEditableFetchDebounceMs: number;
  largeFileFetchDebounceMs: number;
  normalFileFetchDebounceMs: number;
  scrollbarDragFetchDebounceMs: number;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
}

const FAST_SCROLL_WINDOW_MS = 90;
const FAST_SCROLL_MIN_JUMP_LINES = 24;
const ADAPTIVE_PREFETCH_MAX_EXTRA_LINES = 320;

export function useEditorVisibleItemsRendered({
  isHugeEditableMode,
  pendingSyncRequestedRef,
  syncInFlightRef,
  isComposingRef,
  isScrollbarDragRef,
  largeFetchBuffer,
  tabLineCount,
  tabLargeFileMode,
  editableSegmentStartLine,
  editableSegmentEndLine,
  usePlainLineRendering,
  plainLinesLength,
  plainStartLine,
  lineTokensLength,
  startLine,
  requestTimeoutRef,
  hugeEditableFetchDebounceMs,
  largeFileFetchDebounceMs,
  normalFileFetchDebounceMs,
  scrollbarDragFetchDebounceMs,
  syncVisibleTokens,
}: UseEditorVisibleItemsRenderedParams) {
  const lastVisibleRangeRef = useRef<{ start: number; stop: number; timestamp: number } | null>(null);

  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: ItemsRenderedArgs) => {
      if (isHugeEditableMode && (pendingSyncRequestedRef.current || syncInFlightRef.current || isComposingRef.current)) {
        return;
      }

      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const previousVisibleRange = lastVisibleRangeRef.current;
      let adaptiveExtraBuffer = 0;
      if (previousVisibleRange) {
        const jumpDistance = Math.max(
          Math.abs(visibleStartIndex - previousVisibleRange.start),
          Math.abs(visibleStopIndex - previousVisibleRange.stop)
        );
        const elapsed = Math.max(0, now - previousVisibleRange.timestamp);
        if (elapsed <= FAST_SCROLL_WINDOW_MS && jumpDistance >= FAST_SCROLL_MIN_JUMP_LINES) {
          adaptiveExtraBuffer = Math.min(
            ADAPTIVE_PREFETCH_MAX_EXTRA_LINES,
            Math.max(largeFetchBuffer, Math.floor(jumpDistance * 0.75))
          );
        }
      }
      lastVisibleRangeRef.current = {
        start: visibleStartIndex,
        stop: visibleStopIndex,
        timestamp: now,
      };

      const buffer = largeFetchBuffer + adaptiveExtraBuffer;
      const start = Math.max(0, visibleStartIndex - buffer);
      const end = Math.min(tabLineCount, visibleStopIndex + buffer);

      const cachedCount = isHugeEditableMode
        ? Math.max(0, editableSegmentEndLine - editableSegmentStartLine)
        : usePlainLineRendering
        ? plainLinesLength
        : lineTokensLength;
      const cachedStart = isHugeEditableMode
        ? editableSegmentStartLine
        : usePlainLineRendering
        ? plainStartLine
        : startLine;
      const hasNoCache = isHugeEditableMode
        ? editableSegmentEndLine <= editableSegmentStartLine
        : usePlainLineRendering
        ? plainLinesLength === 0
        : lineTokensLength === 0;
      const isOutside = hasNoCache || start < cachedStart || end > cachedStart + cachedCount;

      if (isOutside) {
        if (requestTimeoutRef.current) {
          clearTimeout(requestTimeoutRef.current);
        }
        const isFastScrollJump = adaptiveExtraBuffer > 0;
        const debounceMs = isHugeEditableMode
          ? hugeEditableFetchDebounceMs
          : tabLargeFileMode
          ? largeFileFetchDebounceMs
          : isScrollbarDragRef.current
          ? scrollbarDragFetchDebounceMs
          : isFastScrollJump
          ? Math.min(normalFileFetchDebounceMs, largeFileFetchDebounceMs)
          : normalFileFetchDebounceMs;
        const syncStart = Math.max(0, visibleStartIndex - adaptiveExtraBuffer);
        const syncStop = Math.max(syncStart, Math.min(tabLineCount - 1, visibleStopIndex + adaptiveExtraBuffer));
        requestTimeoutRef.current = setTimeout(
          () => syncVisibleTokens(tabLineCount, {
            start: syncStart,
            stop: syncStop,
          }),
          debounceMs
        );
      }
    },
    [
      editableSegmentEndLine,
      editableSegmentStartLine,
      hugeEditableFetchDebounceMs,
      isComposingRef,
      isHugeEditableMode,
      isScrollbarDragRef,
      largeFetchBuffer,
      largeFileFetchDebounceMs,
      lineTokensLength,
      normalFileFetchDebounceMs,
      pendingSyncRequestedRef,
      plainLinesLength,
      plainStartLine,
      requestTimeoutRef,
      scrollbarDragFetchDebounceMs,
      startLine,
      syncInFlightRef,
      syncVisibleTokens,
      tabLargeFileMode,
      tabLineCount,
      usePlainLineRendering,
    ]
  );

  return {
    onItemsRendered,
  };
}
