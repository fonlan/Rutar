import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SyntaxToken } from './Editor.types';

interface EditorDocumentLoadSnapshot {
  text: string;
  lineTokens: SyntaxToken[][];
  startLine: number;
  tokenFallbackPlainLines: string[];
  tokenFallbackPlainStartLine: number;
  plainLines: string[];
  plainStartLine: number;
  editableSegment: EditorSegmentState;
  contentScrollTop: number;
  contentScrollLeft: number;
  containerScrollTop: number;
  containerScrollLeft: number;
}

interface UseEditorDocumentLoadEffectsParams {
  tabId: string;
  tabLineCount: number;
  itemSize: number;
  savedCursorLine: number;
  savedCursorColumn: number;
  usePlainLineRendering: boolean;
  isHugeEditableMode: boolean;
  lineTokens: SyntaxToken[][];
  startLine: number;
  tokenFallbackPlainLines: string[];
  tokenFallbackPlainStartLine: number;
  plainLines: string[];
  plainStartLine: number;
  editableSegmentState: EditorSegmentState;
  initializedRef: MutableRefObject<boolean>;
  suppressExternalReloadRef: MutableRefObject<boolean>;
  syncInFlightRef: MutableRefObject<boolean>;
  pendingSyncRequestedRef: MutableRefObject<boolean>;
  hugeWindowLockedRef: MutableRefObject<boolean>;
  hugeWindowFollowScrollOnUnlockRef: MutableRefObject<boolean>;
  hugeWindowUnlockTimerRef: MutableRefObject<any>;
  syncedTextRef: MutableRefObject<string>;
  requestTimeoutRef: MutableRefObject<any>;
  editTimeoutRef: MutableRefObject<any>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  pendingRestoreScrollTopRef: MutableRefObject<number | null>;
  lastKnownContentScrollTopRef: MutableRefObject<number>;
  lastKnownContentScrollLeftRef: MutableRefObject<number>;
  lastKnownContainerScrollTopRef: MutableRefObject<number>;
  lastKnownContainerScrollLeftRef: MutableRefObject<number>;
  setLineTokens: (updater: SyntaxToken[][] | ((prev: SyntaxToken[][]) => SyntaxToken[][])) => void;
  setStartLine: (updater: number | ((prev: number) => number)) => void;
  setTokenFallbackPlainLines: (updater: string[] | ((prev: string[]) => string[])) => void;
  setTokenFallbackPlainStartLine: (updater: number | ((prev: number) => number)) => void;
  setEditableSegment: (updater: EditorSegmentState | ((prev: EditorSegmentState) => EditorSegmentState)) => void;
  setPlainLines: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPlainStartLine: (updater: number | ((prev: number) => number)) => void;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  getEditableText: (element: HTMLTextAreaElement) => string;
  setCaretToLineColumn: (element: HTMLTextAreaElement, line: number, column: number) => void;
  loadTextFromBackend: () => Promise<void>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
}

export function useEditorDocumentLoadEffects({
  tabId,
  tabLineCount,
  itemSize,
  savedCursorLine,
  savedCursorColumn,
  usePlainLineRendering,
  isHugeEditableMode,
  lineTokens,
  startLine,
  tokenFallbackPlainLines,
  tokenFallbackPlainStartLine,
  plainLines,
  plainStartLine,
  editableSegmentState,
  initializedRef,
  suppressExternalReloadRef,
  syncInFlightRef,
  pendingSyncRequestedRef,
  hugeWindowLockedRef,
  hugeWindowFollowScrollOnUnlockRef,
  hugeWindowUnlockTimerRef,
  syncedTextRef,
  requestTimeoutRef,
  editTimeoutRef,
  editableSegmentRef,
  contentRef,
  scrollContainerRef,
  pendingRestoreScrollTopRef,
  lastKnownContentScrollTopRef,
  lastKnownContentScrollLeftRef,
  lastKnownContainerScrollTopRef,
  lastKnownContainerScrollLeftRef,
  setLineTokens,
  setStartLine,
  setTokenFallbackPlainLines,
  setTokenFallbackPlainStartLine,
  setEditableSegment,
  setPlainLines,
  setPlainStartLine,
  setInputLayerText,
  getEditableText,
  setCaretToLineColumn,
  loadTextFromBackend,
  syncVisibleTokens,
}: UseEditorDocumentLoadEffectsParams) {
  const previousTabIdRef = useRef<string | null>(null);
  const tabSnapshotRef = useRef<Record<string, EditorDocumentLoadSnapshot>>({});
  const externalSyncDoneTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const setLastKnownScrollOffsets = (
      contentScrollTop: number,
      contentScrollLeft: number,
      containerScrollTop: number,
      containerScrollLeft: number
    ) => {
      lastKnownContentScrollTopRef.current = contentScrollTop;
      lastKnownContentScrollLeftRef.current = contentScrollLeft;
      lastKnownContainerScrollTopRef.current = containerScrollTop;
      lastKnownContainerScrollLeftRef.current = containerScrollLeft;
    };

    const restoreCaretToSavedPosition = () => {
      if (!contentRef.current) {
        return;
      }

      const targetLine = Math.max(1, Math.floor(savedCursorLine || 1));
      const targetColumn = Math.max(1, Math.floor(savedCursorColumn || 1));
      const lineForCaret = isHugeEditableMode
        ? Math.max(1, targetLine - editableSegmentRef.current.startLine)
        : targetLine;
      setCaretToLineColumn(contentRef.current, lineForCaret, targetColumn);
    };

    const restoreScrollFromSnapshot = (snapshot: EditorDocumentLoadSnapshot) => {
      if (contentRef.current) {
        if (Math.abs(contentRef.current.scrollTop - snapshot.contentScrollTop) > 0.001) {
          contentRef.current.scrollTop = snapshot.contentScrollTop;
        }

        if (Math.abs(contentRef.current.scrollLeft - snapshot.contentScrollLeft) > 0.001) {
          contentRef.current.scrollLeft = snapshot.contentScrollLeft;
        }
      }

      if (scrollContainerRef.current) {
        if (Math.abs(scrollContainerRef.current.scrollTop - snapshot.containerScrollTop) > 0.001) {
          scrollContainerRef.current.scrollTop = snapshot.containerScrollTop;
        }

        if (Math.abs(scrollContainerRef.current.scrollLeft - snapshot.containerScrollLeft) > 0.001) {
          scrollContainerRef.current.scrollLeft = snapshot.containerScrollLeft;
        }
      }

      if (isHugeEditableMode) {
        pendingRestoreScrollTopRef.current = snapshot.containerScrollTop;
      }

      setLastKnownScrollOffsets(
        snapshot.contentScrollTop,
        snapshot.contentScrollLeft,
        snapshot.containerScrollTop,
        snapshot.containerScrollLeft
      );
    };

    const previousTabId = previousTabIdRef.current;
    if (previousTabId && previousTabId !== tabId) {
      const currentElement = contentRef.current;
      const elementText = currentElement
        ? getEditableText(currentElement)
        : '';
      const currentText = elementText.length === 0 && syncedTextRef.current.length > 0
        ? syncedTextRef.current
        : (elementText || syncedTextRef.current);
      const contentScrollTop = Math.abs(lastKnownContentScrollTopRef.current) > 0.001
        ? lastKnownContentScrollTopRef.current
        : currentElement?.scrollTop ?? 0;
      const contentScrollLeft = Math.abs(lastKnownContentScrollLeftRef.current) > 0.001
        ? lastKnownContentScrollLeftRef.current
        : currentElement?.scrollLeft ?? 0;
      const containerScrollTop = Math.abs(lastKnownContainerScrollTopRef.current) > 0.001
        ? lastKnownContainerScrollTopRef.current
        : scrollContainerRef.current?.scrollTop ?? 0;
      const containerScrollLeft = Math.abs(lastKnownContainerScrollLeftRef.current) > 0.001
        ? lastKnownContainerScrollLeftRef.current
        : scrollContainerRef.current?.scrollLeft ?? 0;

      tabSnapshotRef.current[previousTabId] = {
        text: currentText,
        lineTokens: lineTokens.map((line) => line.map((token) => ({ ...token }))),
        startLine,
        tokenFallbackPlainLines: [...tokenFallbackPlainLines],
        tokenFallbackPlainStartLine,
        plainLines: [...plainLines],
        plainStartLine,
        editableSegment: {
          startLine: editableSegmentState.startLine,
          endLine: editableSegmentState.endLine,
          text: editableSegmentState.text,
        },
        contentScrollTop,
        contentScrollLeft,
        containerScrollTop,
        containerScrollLeft,
      };
    }

    previousTabIdRef.current = tabId;
    externalSyncDoneTabIdRef.current = null;
    const restoredSnapshot = tabSnapshotRef.current[tabId];
    const safeSavedCursorLine = Math.max(1, Math.min(Math.max(1, tabLineCount), Math.floor(savedCursorLine || 1)));
    const savedCursorTargetIndex = Math.max(0, safeSavedCursorLine - 1);
    const snapshotContainsSavedCursor = !!(
      restoredSnapshot
      && savedCursorTargetIndex >= Math.max(0, Math.floor(restoredSnapshot.editableSegment.startLine))
      && savedCursorTargetIndex < Math.max(0, Math.floor(restoredSnapshot.editableSegment.endLine))
    );
    const restoredSnapshotTargetIndex = restoredSnapshot
      ? Math.max(0, Math.floor(restoredSnapshot.containerScrollTop / Math.max(1, itemSize)))
      : null;
    const shouldPreferSavedCursorAnchor = isHugeEditableMode
      && safeSavedCursorLine > 1
      && !snapshotContainsSavedCursor;
    const hugeSyncTargetIndex = isHugeEditableMode
      ? (shouldPreferSavedCursorAnchor
        ? savedCursorTargetIndex
        : restoredSnapshotTargetIndex ?? savedCursorTargetIndex)
      : 0;
    const hugeSyncTargetScrollTop = Math.max(0, hugeSyncTargetIndex * itemSize);
    if (restoredSnapshot) {
      setLineTokens(restoredSnapshot.lineTokens);
      setStartLine(restoredSnapshot.startLine);
      setTokenFallbackPlainLines(restoredSnapshot.tokenFallbackPlainLines);
      setTokenFallbackPlainStartLine(restoredSnapshot.tokenFallbackPlainStartLine);
      setPlainLines(restoredSnapshot.plainLines);
      setPlainStartLine(restoredSnapshot.plainStartLine);
      editableSegmentRef.current = restoredSnapshot.editableSegment;
      setEditableSegment(restoredSnapshot.editableSegment);
      if (contentRef.current) {
        setInputLayerText(contentRef.current, restoredSnapshot.text);
      }
      syncedTextRef.current = restoredSnapshot.text;
      restoreScrollFromSnapshot(restoredSnapshot);
      if (shouldPreferSavedCursorAnchor) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = hugeSyncTargetScrollTop;
        }
        pendingRestoreScrollTopRef.current = hugeSyncTargetScrollTop;
        setLastKnownScrollOffsets(
          contentRef.current?.scrollTop ?? 0,
          contentRef.current?.scrollLeft ?? 0,
          hugeSyncTargetScrollTop,
          scrollContainerRef.current?.scrollLeft ?? 0
        );
      }
      restoreCaretToSavedPosition();
    } else {
      setTokenFallbackPlainLines((prev) => (prev.length === 0 ? prev : []));
      setTokenFallbackPlainStartLine((prev) => (prev === 0 ? prev : 0));
      const targetContentScrollTop = 0;
      const targetContentScrollLeft = 0;
      const targetContainerScrollTop = isHugeEditableMode
        ? hugeSyncTargetScrollTop
        : 0;
      const targetContainerScrollLeft = 0;

      if (contentRef.current) {
        contentRef.current.scrollTop = targetContentScrollTop;
        contentRef.current.scrollLeft = targetContentScrollLeft;
      }

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = targetContainerScrollTop;
        scrollContainerRef.current.scrollLeft = targetContainerScrollLeft;
      }

      pendingRestoreScrollTopRef.current = isHugeEditableMode
        ? targetContainerScrollTop
        : null;

      setLastKnownScrollOffsets(
        targetContentScrollTop,
        targetContentScrollLeft,
        targetContainerScrollTop,
        targetContainerScrollLeft
      );
    }

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

    const bootstrap = async () => {
      try {
        await loadTextFromBackend();
        if (cancelled) {
          return;
        }
        if (restoredSnapshot) {
          if (shouldPreferSavedCursorAnchor) {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = hugeSyncTargetScrollTop;
            }
            pendingRestoreScrollTopRef.current = hugeSyncTargetScrollTop;
            setLastKnownScrollOffsets(
              contentRef.current?.scrollTop ?? 0,
              contentRef.current?.scrollLeft ?? 0,
              hugeSyncTargetScrollTop,
              scrollContainerRef.current?.scrollLeft ?? 0
            );
          } else {
            restoreScrollFromSnapshot(restoredSnapshot);
          }
        }
        restoreCaretToSavedPosition();

        if (!isHugeEditableMode) {
          await syncVisibleTokens(Math.max(1, tabLineCount));
        }
        if (!cancelled) {
          if (restoredSnapshot) {
            if (shouldPreferSavedCursorAnchor) {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = hugeSyncTargetScrollTop;
              }
              pendingRestoreScrollTopRef.current = hugeSyncTargetScrollTop;
              setLastKnownScrollOffsets(
                contentRef.current?.scrollTop ?? 0,
                contentRef.current?.scrollLeft ?? 0,
                hugeSyncTargetScrollTop,
                scrollContainerRef.current?.scrollLeft ?? 0
              );
            } else {
              restoreScrollFromSnapshot(restoredSnapshot);
            }
          }
          restoreCaretToSavedPosition();
          initializedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load file text:', error);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
      if (editTimeoutRef.current) {
        clearTimeout(editTimeoutRef.current);
      }
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    };
  }, [
    editableSegmentRef,
    editTimeoutRef,
    getEditableText,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowLockedRef,
    hugeWindowUnlockTimerRef,
    initializedRef,
    isHugeEditableMode,
    lastKnownContainerScrollLeftRef,
    lastKnownContainerScrollTopRef,
    lastKnownContentScrollLeftRef,
    lastKnownContentScrollTopRef,
    loadTextFromBackend,
    pendingRestoreScrollTopRef,
    pendingSyncRequestedRef,
    requestTimeoutRef,
    setInputLayerText,
    setCaretToLineColumn,
    setEditableSegment,
    setLineTokens,
    setPlainLines,
    setPlainStartLine,
    setStartLine,
    setTokenFallbackPlainLines,
    setTokenFallbackPlainStartLine,
    suppressExternalReloadRef,
    syncInFlightRef,
    syncedTextRef,
    syncVisibleTokens,
    tabId,
    tabLineCount,
    tokenFallbackPlainLines,
    tokenFallbackPlainStartLine,
    itemSize,
    contentRef,
    scrollContainerRef,
  ]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    if (suppressExternalReloadRef.current) {
      suppressExternalReloadRef.current = false;
      return;
    }

    if (externalSyncDoneTabIdRef.current === tabId) {
      return;
    }
    externalSyncDoneTabIdRef.current = tabId;

    const syncExternalChange = async () => {
      try {
        await loadTextFromBackend();
        await syncVisibleTokens(Math.max(1, tabLineCount));
      } catch (error) {
        console.error('Failed to sync external edit:', error);
      }
    };

    syncExternalChange();
  }, [
    externalSyncDoneTabIdRef,
    initializedRef,
    loadTextFromBackend,
    suppressExternalReloadRef,
    syncVisibleTokens,
    tabId,
    tabLineCount,
  ]);

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

    if (usePlainLineRendering || isHugeEditableMode) {
      setTokenFallbackPlainLines([]);
      setTokenFallbackPlainStartLine(0);
    }
  }, [
    editableSegmentRef,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowLockedRef,
    hugeWindowUnlockTimerRef,
    isHugeEditableMode,
    setEditableSegment,
    setPlainLines,
    setPlainStartLine,
    setTokenFallbackPlainLines,
    setTokenFallbackPlainStartLine,
    usePlainLineRendering,
  ]);
}
