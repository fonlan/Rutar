import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SearchHighlightState } from './Editor.types';

interface SelectionOffsets {
  start: number;
  end: number;
  isCollapsed: boolean;
}

interface UseEditorNavigationAndRefreshEffectsParams {
  tabId: string;
  tabLineCount: number;
  itemSize: number;
  isHugeEditableMode: boolean;
  requestTimeoutRef: MutableRefObject<any>;
  currentRequestVersionRef: MutableRefObject<number>;
  pendingRestoreScrollTopRef: MutableRefObject<number | null>;
  outlineFlashTimerRef: MutableRefObject<number | null>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  listRef: MutableRefObject<any>;
  lineNumberListRef: MutableRefObject<any>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  setActiveLineNumber: (lineNumber: number) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setOutlineFlashLine: (lineNumber: number | null) => void;
  setSearchHighlight: (highlight: SearchHighlightState | null) => void;
  ensureSearchMatchVisibleHorizontally: (
    scrollElement: HTMLElement | null,
    line: number,
    column: number,
    length: number,
    lineText: string,
    occludedRightPx: number,
    listElement?: HTMLDivElement
  ) => void;
  syncVisibleTokens: (lineCount: number) => Promise<void>;
  alignScrollOffset: (value: number) => number;
  setCaretToLineColumn: (element: HTMLTextAreaElement, line: number, column: number) => void;
  loadTextFromBackend: () => Promise<void>;
  updateTab: (tabId: string, patch: { lineCount: number }) => void;
  getSelectionOffsetsInElement: (element: HTMLTextAreaElement) => SelectionOffsets | null;
  getEditableText: (element: HTMLTextAreaElement) => string;
  mapLogicalOffsetToInputLayerOffset: (text: string, logicalOffset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
}

export function useEditorNavigationAndRefreshEffects({
  tabId,
  tabLineCount,
  itemSize,
  isHugeEditableMode,
  requestTimeoutRef,
  currentRequestVersionRef,
  pendingRestoreScrollTopRef,
  outlineFlashTimerRef,
  contentRef,
  scrollContainerRef,
  listRef,
  lineNumberListRef,
  editableSegmentRef,
  setActiveLineNumber,
  setCursorPosition,
  setOutlineFlashLine,
  setSearchHighlight,
  ensureSearchMatchVisibleHorizontally,
  syncVisibleTokens,
  alignScrollOffset,
  setCaretToLineColumn,
  loadTextFromBackend,
  updateTab,
  getSelectionOffsetsInElement,
  getEditableText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
}: UseEditorNavigationAndRefreshEffectsParams) {
  useEffect(() => {
    const handleNavigateToLine = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
        length?: number;
        lineText?: string;
        occludedRightPx?: number;
        source?: string;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tabId) {
        return;
      }

      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
      // Invalidate stale async segment fetches so old viewport requests cannot re-apply after navigation.
      currentRequestVersionRef.current += 1;
      pendingRestoreScrollTopRef.current = null;

      const targetLine = Number.isFinite(detail.line) ? Math.max(1, Math.floor(detail.line as number)) : 1;
      const targetColumn = Number.isFinite(detail.column) ? Math.max(1, Math.floor(detail.column as number)) : 1;
      const targetLength = Number.isFinite(detail.length) ? Math.max(0, Math.floor(detail.length as number)) : 0;
      const targetLineText = typeof detail.lineText === 'string' ? detail.lineText : '';
      const targetOccludedRightPx = Number.isFinite(detail.occludedRightPx)
        ? Math.max(0, Math.floor(detail.occludedRightPx as number))
        : 0;
      const shouldMoveCaretToLineStart = detail.source === 'outline';
      const targetCaretColumn = shouldMoveCaretToLineStart ? 1 : targetColumn;
      setActiveLineNumber(targetLine);
      setCursorPosition(tabId, targetLine, targetCaretColumn);

      const placeCaretAtTargetPosition = () => {
        if (!contentRef.current) {
          return;
        }

        const lineForCaret = isHugeEditableMode
          ? Math.max(1, targetLine - editableSegmentRef.current.startLine)
          : targetLine;
        const columnForCaret = targetCaretColumn;

        setCaretToLineColumn(contentRef.current, lineForCaret, columnForCaret);
      };

      if (detail.source === 'outline') {
        if (outlineFlashTimerRef.current) {
          window.clearTimeout(outlineFlashTimerRef.current);
          outlineFlashTimerRef.current = null;
        }

        setOutlineFlashLine(targetLine);
        outlineFlashTimerRef.current = window.setTimeout(() => {
          setOutlineFlashLine(null);
          outlineFlashTimerRef.current = null;
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
      const lineNumberElement = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;

      if (isHugeEditableMode) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetScrollTop;
        }

        if (contentRef.current) {
          contentRef.current.focus();

          ensureSearchMatchVisibleHorizontally(
            scrollContainerRef.current,
            targetLine,
            targetColumn,
            targetLength,
            targetLineText,
            targetOccludedRightPx,
            listElement
          );

          window.requestAnimationFrame(() => {
            placeCaretAtTargetPosition();
            window.setTimeout(() => {
              placeCaretAtTargetPosition();
            }, 60);
          });
        }

        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }

        if (lineNumberElement) {
          lineNumberElement.scrollTop = targetScrollTop;
        }

        void syncVisibleTokens(Math.max(1, tabLineCount));
        return;
      }

      if (contentRef.current) {
        contentRef.current.scrollTop = targetScrollTop;
        contentRef.current.focus();

        ensureSearchMatchVisibleHorizontally(
          contentRef.current,
          targetLine,
          targetColumn,
          targetLength,
          targetLineText,
          targetOccludedRightPx,
          listElement
        );

        window.requestAnimationFrame(() => {
          placeCaretAtTargetPosition();
        });
      }

      if (listElement) {
        listElement.scrollTop = targetScrollTop;
      }

      if (lineNumberElement) {
        lineNumberElement.scrollTop = targetScrollTop;
      }

      void syncVisibleTokens(Math.max(1, tabLineCount));
    };

    const handleSearchClose = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tabId) {
        return;
      }

      setSearchHighlight(null);
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:navigate-to-outline', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:search-close', handleSearchClose as EventListener);
    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:navigate-to-outline', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:search-close', handleSearchClose as EventListener);
    };
  }, [
    alignScrollOffset,
    currentRequestVersionRef,
    editableSegmentRef,
    ensureSearchMatchVisibleHorizontally,
    isHugeEditableMode,
    itemSize,
    lineNumberListRef,
    listRef,
    outlineFlashTimerRef,
    pendingRestoreScrollTopRef,
    requestTimeoutRef,
    scrollContainerRef,
    setActiveLineNumber,
    setCaretToLineColumn,
    setCursorPosition,
    setOutlineFlashLine,
    setSearchHighlight,
    syncVisibleTokens,
    tabId,
    tabLineCount,
  ]);

  useEffect(() => {
    const handleForcedRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId: string;
        lineCount?: number;
        preserveCaret?: boolean;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tabId) {
        return;
      }

      const preserveCaret = detail.preserveCaret === true;
      const caretOffsets = preserveCaret && contentRef.current
        ? getSelectionOffsetsInElement(contentRef.current)
        : null;
      const caretLogicalOffset = caretOffsets
        ? Math.max(0, caretOffsets.isCollapsed ? caretOffsets.end : caretOffsets.start)
        : null;

      if (typeof detail.lineCount === 'number' && Number.isFinite(detail.lineCount)) {
        updateTab(tabId, { lineCount: Math.max(1, detail.lineCount) });
      }

      void (async () => {
        await loadTextFromBackend();

        if (preserveCaret && caretLogicalOffset !== null && contentRef.current) {
          const editorText = getEditableText(contentRef.current);
          const safeLogicalOffset = Math.min(caretLogicalOffset, editorText.length);
          const layerOffset = mapLogicalOffsetToInputLayerOffset(editorText, safeLogicalOffset);
          setCaretToCodeUnitOffset(contentRef.current, layerOffset);
        }

        await syncVisibleTokens(Math.max(1, detail.lineCount ?? tabLineCount));
      })();
    };

    window.addEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    return () => {
      window.removeEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    };
  }, [
    contentRef,
    getEditableText,
    getSelectionOffsetsInElement,
    loadTextFromBackend,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    syncVisibleTokens,
    tabId,
    tabLineCount,
    updateTab,
  ]);
}
