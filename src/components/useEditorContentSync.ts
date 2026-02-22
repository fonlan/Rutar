import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SyntaxToken } from './Editor.types';

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
  setPlainLines: (lines: string[]) => void;
  setPlainStartLine: (line: number) => void;
  setLineTokens: (tokens: SyntaxToken[][]) => void;
  setStartLine: (line: number) => void;
  setEditableSegment: (segment: EditorSegmentState) => void;
  normalizeLineText: (text: string) => string;
  normalizeEditableLineText: (text: string) => string;
  normalizeEditorText: (text: string) => string;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  getEditableText: (element: HTMLTextAreaElement) => string;
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
  setPlainLines,
  setPlainStartLine,
  setLineTokens,
  setStartLine,
  setEditableSegment,
  normalizeLineText,
  normalizeEditableLineText,
  normalizeEditorText,
  setInputLayerText,
  getEditableText,
}: UseEditorContentSyncParams) {
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
      isScrollbarDragRef,
      normalizeEditableLineText,
      pendingRestoreScrollTopRef,
      pendingSyncRequestedRef,
      scrollContainerRef,
      setEditableSegment,
      setInputLayerText,
      syncedTextRef,
      tabId,
    ]
  );

  const fetchTokens = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersionRef.current;
      try {
        const lineResult = await invoke<SyntaxToken[][]>('get_syntax_token_lines', {
          id: tabId,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersionRef.current) return;
        if (!Array.isArray(lineResult)) return;

        setLineTokens(lineResult);
        setStartLine(start);
      } catch (error) {
        console.error('Fetch error:', error);
      }
    },
    [currentRequestVersionRef, setLineTokens, setStartLine, tabId]
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
      contentRef,
      fetchEditableSegment,
      fetchPlainLines,
      fetchTokens,
      height,
      hugeWindowFollowScrollOnUnlockRef,
      hugeWindowLockedRef,
      isHugeEditableMode,
      itemSize,
      largeFetchBuffer,
      listRef,
      scrollContainerRef,
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
