import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, SyntaxToken } from './Editor.types';

interface UseEditorDocumentLoadEffectsParams {
  tabId: string;
  tabLineCount: number;
  usePlainLineRendering: boolean;
  isHugeEditableMode: boolean;
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
  setLineTokens: (updater: SyntaxToken[][] | ((prev: SyntaxToken[][]) => SyntaxToken[][])) => void;
  setEditableSegment: (updater: EditorSegmentState | ((prev: EditorSegmentState) => EditorSegmentState)) => void;
  setPlainLines: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPlainStartLine: (updater: number | ((prev: number) => number)) => void;
  loadTextFromBackend: () => Promise<void>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
}

export function useEditorDocumentLoadEffects({
  tabId,
  tabLineCount,
  usePlainLineRendering,
  isHugeEditableMode,
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
  setLineTokens,
  setEditableSegment,
  setPlainLines,
  setPlainStartLine,
  loadTextFromBackend,
  syncVisibleTokens,
}: UseEditorDocumentLoadEffectsParams) {
  useEffect(() => {
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
    setLineTokens([]);
    editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
    setEditableSegment({ startLine: 0, endLine: 0, text: '' });

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
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowLockedRef,
    hugeWindowUnlockTimerRef,
    initializedRef,
    loadTextFromBackend,
    pendingSyncRequestedRef,
    requestTimeoutRef,
    setEditableSegment,
    setLineTokens,
    suppressExternalReloadRef,
    syncInFlightRef,
    syncedTextRef,
    syncVisibleTokens,
    tabId,
    tabLineCount,
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
