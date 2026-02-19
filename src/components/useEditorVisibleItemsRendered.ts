import { useCallback } from 'react';
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
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
}

export function useEditorVisibleItemsRendered({
  isHugeEditableMode,
  pendingSyncRequestedRef,
  syncInFlightRef,
  isComposingRef,
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
  syncVisibleTokens,
}: UseEditorVisibleItemsRenderedParams) {
  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: ItemsRenderedArgs) => {
      if (isHugeEditableMode && (pendingSyncRequestedRef.current || syncInFlightRef.current || isComposingRef.current)) {
        return;
      }

      const buffer = largeFetchBuffer;
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
        const debounceMs = isHugeEditableMode
          ? hugeEditableFetchDebounceMs
          : tabLargeFileMode
          ? largeFileFetchDebounceMs
          : normalFileFetchDebounceMs;
        requestTimeoutRef.current = setTimeout(
          () => syncVisibleTokens(tabLineCount, {
            start: visibleStartIndex,
            stop: visibleStopIndex,
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
      largeFetchBuffer,
      largeFileFetchDebounceMs,
      lineTokensLength,
      normalFileFetchDebounceMs,
      pendingSyncRequestedRef,
      plainLinesLength,
      plainStartLine,
      requestTimeoutRef,
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
