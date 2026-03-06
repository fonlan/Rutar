import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { useStore } from '@/store/useStore';
import type { EditorSegmentState } from './Editor.types';

interface UseEditorFlushPendingSyncParams {
  tabId: string;
  tabLineCount: number;
  isHugeEditableMode: boolean;
  hugeEditableWindowUnlockMs: number;
  height: number;
  itemSize: number;
  largeFetchBuffer: number;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  setEditableSegment: (updater: EditorSegmentState | ((prev: EditorSegmentState) => EditorSegmentState)) => void;
  syncedTextRef: MutableRefObject<string>;
  suppressExternalReloadRef: MutableRefObject<boolean>;
  pendingSyncRequestedRef: MutableRefObject<boolean>;
  syncInFlightRef: MutableRefObject<boolean>;
  isComposingRef: MutableRefObject<boolean>;
  hugeWindowLockedRef: MutableRefObject<boolean>;
  hugeWindowFollowScrollOnUnlockRef: MutableRefObject<boolean>;
  hugeWindowUnlockTimerRef: MutableRefObject<any>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  dispatchDocumentUpdated: (tabId: string) => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  alignScrollOffset: (offset: number) => number;
  buildCodeUnitDiff: (
    previousText: string,
    nextText: string
  ) => {
    start: number;
    end: number;
    newText: string;
  } | null;
  codeUnitOffsetToUnicodeScalarIndex: (text: string, offset: number) => number;
  pendingEditCursorSnapshotRef: MutableRefObject<{ line: number; column: number } | null>;
  queuedEditCursorSnapshotRef: MutableRefObject<{ line: number; column: number } | null>;
}

export function useEditorFlushPendingSync({
  tabId,
  tabLineCount,
  isHugeEditableMode,
  hugeEditableWindowUnlockMs,
  height,
  itemSize,
  largeFetchBuffer,
  contentRef,
  scrollContainerRef,
  editableSegmentRef,
  setEditableSegment,
  syncedTextRef,
  suppressExternalReloadRef,
  pendingSyncRequestedRef,
  syncInFlightRef,
  isComposingRef,
  hugeWindowLockedRef,
  hugeWindowFollowScrollOnUnlockRef,
  hugeWindowUnlockTimerRef,
  syncVisibleTokens,
  updateTab,
  dispatchDocumentUpdated,
  normalizeSegmentText,
  getEditableText,
  alignScrollOffset,
  buildCodeUnitDiff,
  codeUnitOffsetToUnicodeScalarIndex,
  pendingEditCursorSnapshotRef,
  queuedEditCursorSnapshotRef,
}: UseEditorFlushPendingSyncParams) {
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
    void syncVisibleTokens(Math.max(1, tabLineCount));
  }, [hugeWindowFollowScrollOnUnlockRef, hugeWindowLockedRef, isHugeEditableMode, syncVisibleTokens, tabLineCount]);

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
    }, hugeEditableWindowUnlockMs);
  }, [hugeEditableWindowUnlockMs, hugeWindowUnlockTimerRef, isHugeEditableMode, releaseHugeEditableWindowLock]);

  const flushPendingSync = useCallback(async () => {
    if (syncInFlightRef.current || isComposingRef.current || !contentRef.current) {
      return;
    }

    const baseText = syncedTextRef.current;
    const targetText = normalizeSegmentText(getEditableText(contentRef.current));
    pendingSyncRequestedRef.current = false;
    const beforeCursor = pendingEditCursorSnapshotRef.current;
    const afterCursor = useStore.getState().cursorPositionByTab[tabId];

    if (isHugeEditableMode) {
      const segment = editableSegmentRef.current;
      if (segment.endLine <= segment.startLine) {
        return;
      }

      hugeWindowLockedRef.current = true;

      if (baseText === targetText) {
        syncedTextRef.current = targetText;
        pendingEditCursorSnapshotRef.current = queuedEditCursorSnapshotRef.current;
        queuedEditCursorSnapshotRef.current = null;
        scheduleHugeEditableWindowUnlock();
        return;
      }

      syncInFlightRef.current = true;

      try {
        const newLineCount = await invoke<number>('replace_line_range', {
          id: tabId,
          startLine: segment.startLine,
          endLine: segment.endLine,
          newText: targetText,
          beforeCursorLine: beforeCursor?.line,
          beforeCursorColumn: beforeCursor?.column,
          afterCursorLine: afterCursor?.line,
          afterCursorColumn: afterCursor?.column,
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
        updateTab(tabId, { lineCount: newLineCountSafe, isDirty: true });
        dispatchDocumentUpdated(tabId);

        if (contentRef.current) {
          const alignedTop = alignScrollOffset(currentScrollTop);
          if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
            scrollContainerRef.current.scrollTop = alignedTop;
          }
        }
      } catch (error) {
        console.error('Large segment sync error:', error);
      } finally {
        syncInFlightRef.current = false;
        pendingEditCursorSnapshotRef.current = queuedEditCursorSnapshotRef.current;
        queuedEditCursorSnapshotRef.current = null;
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
      pendingEditCursorSnapshotRef.current = queuedEditCursorSnapshotRef.current;
      queuedEditCursorSnapshotRef.current = null;
      return;
    }

    syncInFlightRef.current = true;

    try {
      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.start);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.end);

      const newLineCount = await invoke<number>('edit_text', {
        id: tabId,
        startChar,
        endChar,
        newText: diff.newText,
        beforeCursorLine: beforeCursor?.line,
        beforeCursorColumn: beforeCursor?.column,
        afterCursorLine: afterCursor?.line,
        afterCursorColumn: afterCursor?.column,
      });

      syncedTextRef.current = targetText;
      suppressExternalReloadRef.current = true;
      updateTab(tabId, { lineCount: newLineCount, isDirty: true });
      dispatchDocumentUpdated(tabId);
      await syncVisibleTokens(newLineCount);
    } catch (error) {
      console.error('Edit sync error:', error);
    } finally {
      syncInFlightRef.current = false;
      pendingEditCursorSnapshotRef.current = queuedEditCursorSnapshotRef.current;
      queuedEditCursorSnapshotRef.current = null;

      if (pendingSyncRequestedRef.current && !isComposingRef.current) {
        void flushPendingSync();
      }
    }
  }, [
    alignScrollOffset,
    buildCodeUnitDiff,
    codeUnitOffsetToUnicodeScalarIndex,
    contentRef,
    dispatchDocumentUpdated,
    editableSegmentRef,
    getEditableText,
    height,
    isComposingRef,
    isHugeEditableMode,
    itemSize,
    largeFetchBuffer,
    normalizeSegmentText,
    pendingSyncRequestedRef,
    scheduleHugeEditableWindowUnlock,
    scrollContainerRef,
    setEditableSegment,
    suppressExternalReloadRef,
    syncedTextRef,
    syncInFlightRef,
    syncVisibleTokens,
    tabId,
    updateTab,
    hugeWindowLockedRef,
  ]);

  return {
    flushPendingSync,
  };
}
