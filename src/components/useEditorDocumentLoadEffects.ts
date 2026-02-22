import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SyntaxToken } from './Editor.types';

interface EditorDocumentLoadSnapshot {
  text: string;
  lineTokens: SyntaxToken[][];
  startLine: number;
  plainLines: string[];
  plainStartLine: number;
  editableSegment: EditorSegmentState;
}

interface UseEditorDocumentLoadEffectsParams {
  tabId: string;
  tabLineCount: number;
  usePlainLineRendering: boolean;
  isHugeEditableMode: boolean;
  lineTokens: SyntaxToken[][];
  startLine: number;
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
  setLineTokens: (updater: SyntaxToken[][] | ((prev: SyntaxToken[][]) => SyntaxToken[][])) => void;
  setStartLine: (updater: number | ((prev: number) => number)) => void;
  setEditableSegment: (updater: EditorSegmentState | ((prev: EditorSegmentState) => EditorSegmentState)) => void;
  setPlainLines: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPlainStartLine: (updater: number | ((prev: number) => number)) => void;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  getEditableText: (element: HTMLTextAreaElement) => string;
  loadTextFromBackend: () => Promise<void>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
}

export function useEditorDocumentLoadEffects({
  tabId,
  tabLineCount,
  usePlainLineRendering,
  isHugeEditableMode,
  lineTokens,
  startLine,
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
  setLineTokens,
  setStartLine,
  setEditableSegment,
  setPlainLines,
  setPlainStartLine,
  setInputLayerText,
  getEditableText,
  loadTextFromBackend,
  syncVisibleTokens,
}: UseEditorDocumentLoadEffectsParams) {
  const previousTabIdRef = useRef<string | null>(null);
  const tabSnapshotRef = useRef<Record<string, EditorDocumentLoadSnapshot>>({});

  useEffect(() => {
    let cancelled = false;
    const previousTabId = previousTabIdRef.current;
    if (previousTabId && previousTabId !== tabId) {
      const currentElement = contentRef.current;
      const currentText = currentElement
        ? getEditableText(currentElement)
        : syncedTextRef.current;

      tabSnapshotRef.current[previousTabId] = {
        text: currentText,
        lineTokens: lineTokens.map((line) => line.map((token) => ({ ...token }))),
        startLine,
        plainLines: [...plainLines],
        plainStartLine,
        editableSegment: {
          startLine: editableSegmentState.startLine,
          endLine: editableSegmentState.endLine,
          text: editableSegmentState.text,
        },
      };
    }

    previousTabIdRef.current = tabId;
    const restoredSnapshot = tabSnapshotRef.current[tabId];
    if (restoredSnapshot) {
      setLineTokens(restoredSnapshot.lineTokens);
      setStartLine(restoredSnapshot.startLine);
      setPlainLines(restoredSnapshot.plainLines);
      setPlainStartLine(restoredSnapshot.plainStartLine);
      editableSegmentRef.current = restoredSnapshot.editableSegment;
      setEditableSegment(restoredSnapshot.editableSegment);
      if (contentRef.current) {
        setInputLayerText(contentRef.current, restoredSnapshot.text);
      }
      syncedTextRef.current = restoredSnapshot.text;
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

        await syncVisibleTokens(Math.max(1, tabLineCount));
        if (!cancelled) {
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
    loadTextFromBackend,
    pendingSyncRequestedRef,
    requestTimeoutRef,
    setInputLayerText,
    setEditableSegment,
    setLineTokens,
    setPlainLines,
    setPlainStartLine,
    setStartLine,
    suppressExternalReloadRef,
    syncInFlightRef,
    syncedTextRef,
    syncVisibleTokens,
    tabId,
    tabLineCount,
    contentRef,
  ]);

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
        await syncVisibleTokens(Math.max(1, tabLineCount));
      } catch (error) {
        console.error('Failed to sync external edit:', error);
      }
    };

    syncExternalChange();
  }, [initializedRef, loadTextFromBackend, suppressExternalReloadRef, syncVisibleTokens, tabLineCount]);

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
  }, [
    editableSegmentRef,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowLockedRef,
    hugeWindowUnlockTimerRef,
    isHugeEditableMode,
    setEditableSegment,
    setPlainLines,
    setPlainStartLine,
    usePlainLineRendering,
  ]);
}
