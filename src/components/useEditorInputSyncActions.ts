import { useCallback, useRef } from 'react';
import type { FormEventHandler, MutableRefObject } from 'react';
import type { EditorCompositionDisplayState } from './Editor.types';

interface UseEditorInputSyncActionsParams {
  tabId: string;
  tabLineCount: number;
  tabIsDirty: boolean;
  largeFilePlainRenderLineThreshold: number;
  largeFileEditSyncDebounceMs: number;
  normalEditSyncDebounceMs: number;
  isHugeEditableMode: boolean;
  pendingSyncRequestedRef: MutableRefObject<boolean>;
  hugeWindowLockedRef: MutableRefObject<boolean>;
  editTimeoutRef: MutableRefObject<any>;
  contentRef: MutableRefObject<any>;
  isComposingRef: MutableRefObject<boolean>;
  editableSegmentStartLine: number;
  clearVerticalSelectionState: () => void;
  normalizeInputLayerDom: (element: any) => void;
  syncHugeScrollableContentWidth: () => void;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  syncSelectionAfterInteraction: () => void;
  handleScroll: () => void;
  flushPendingSync: () => Promise<void>;
  capturePendingEditBeforeCursor: () => void;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionOffsetsInElement: (element: HTMLTextAreaElement) => {
    start: number;
    end: number;
    isCollapsed: boolean;
  } | null;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
  setCompositionDisplay: (state: EditorCompositionDisplayState | null) => void;
}

export function useEditorInputSyncActions({
  tabId,
  tabLineCount,
  tabIsDirty,
  largeFilePlainRenderLineThreshold,
  largeFileEditSyncDebounceMs,
  normalEditSyncDebounceMs,
  isHugeEditableMode,
  pendingSyncRequestedRef,
  hugeWindowLockedRef,
  editTimeoutRef,
  contentRef,
  isComposingRef,
  editableSegmentStartLine,
  clearVerticalSelectionState,
  normalizeInputLayerDom,
  syncHugeScrollableContentWidth,
  updateTab,
  syncSelectionAfterInteraction,
  handleScroll,
  flushPendingSync,
  capturePendingEditBeforeCursor,
  getEditableText,
  getSelectionOffsetsInElement,
  codeUnitOffsetToLineColumn,
  setCompositionDisplay,
}: UseEditorInputSyncActionsParams) {
  const compositionDisplayRef = useRef<Pick<EditorCompositionDisplayState, 'line' | 'startColumn' | 'endColumn'> | null>(null);

  const updateCompositionDisplayText = useCallback(
    (text: string, mode: EditorCompositionDisplayState['mode']) => {
      const current = compositionDisplayRef.current;
      const safeText = typeof text === 'string' ? text : '';
      if (!current || !safeText || safeText.includes('\n')) {
        if (!safeText) {
          setCompositionDisplay(null);
        }
        return;
      }

      setCompositionDisplay({
        ...current,
        text: safeText,
        mode,
      });
    },
    [setCompositionDisplay]
  );

  const handleBeforeInput = useCallback<FormEventHandler<HTMLTextAreaElement>>(() => {
    capturePendingEditBeforeCursor();
  }, [capturePendingEditBeforeCursor]);

  const queueTextSync = useCallback(
    () => {
      pendingSyncRequestedRef.current = true;

      if (isHugeEditableMode) {
        hugeWindowLockedRef.current = true;
      }

      if (editTimeoutRef.current) {
        clearTimeout(editTimeoutRef.current);
      }

      const debounceMs =
        tabLineCount >= largeFilePlainRenderLineThreshold
          ? largeFileEditSyncDebounceMs
          : normalEditSyncDebounceMs;

      editTimeoutRef.current = setTimeout(() => {
        void flushPendingSync();
      }, debounceMs);
    },
    [
      editTimeoutRef,
      flushPendingSync,
      hugeWindowLockedRef,
      isHugeEditableMode,
      largeFileEditSyncDebounceMs,
      largeFilePlainRenderLineThreshold,
      normalEditSyncDebounceMs,
      pendingSyncRequestedRef,
      tabLineCount,
    ]
  );

  const handleInput = useCallback(
    (event: any) => {
      clearVerticalSelectionState();

      if (isComposingRef.current) {
        const nativeData =
          typeof event?.nativeEvent?.data === 'string'
            ? event.nativeEvent.data
            : typeof event?.data === 'string'
              ? event.data
              : '';

        if (nativeData) {
          updateCompositionDisplayText(nativeData, 'composing');
        }
      }

      if (contentRef.current && !isComposingRef.current) {
        normalizeInputLayerDom(contentRef.current);
        syncHugeScrollableContentWidth();
      }

      if (!tabIsDirty) {
        updateTab(tabId, { isDirty: true });
      }

      syncSelectionAfterInteraction();
      window.requestAnimationFrame(handleScroll);

      if (!isComposingRef.current) {
        queueTextSync();
      }
    },
    [
      clearVerticalSelectionState,
      contentRef,
      handleScroll,
      isComposingRef,
      normalizeInputLayerDom,
      queueTextSync,
      syncHugeScrollableContentWidth,
      syncSelectionAfterInteraction,
      tabId,
      tabIsDirty,
      updateTab,
      updateCompositionDisplayText,
    ]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    compositionDisplayRef.current = null;
    setCompositionDisplay(null);

    const element = contentRef.current;
    const selectionOffsets = element ? getSelectionOffsetsInElement(element) : null;
    if (element && selectionOffsets) {
      const text = getEditableText(element);
      const startPosition = codeUnitOffsetToLineColumn(text, selectionOffsets.start);
      const endPosition = codeUnitOffsetToLineColumn(text, selectionOffsets.end);
      if (startPosition.line === endPosition.line) {
        compositionDisplayRef.current = {
          line: (isHugeEditableMode ? editableSegmentStartLine : 0) + startPosition.line,
          startColumn: startPosition.column,
          endColumn: endPosition.column,
        };
      }
    }

    if (isHugeEditableMode) {
      hugeWindowLockedRef.current = true;
    }
  }, [
    codeUnitOffsetToLineColumn,
    contentRef,
    editableSegmentStartLine,
    getEditableText,
    getSelectionOffsetsInElement,
    hugeWindowLockedRef,
    isComposingRef,
    isHugeEditableMode,
    setCompositionDisplay,
  ]);

  const handleCompositionUpdate = useCallback(
    (event: any) => {
      const nextText =
        typeof event?.data === 'string'
          ? event.data
          : typeof event?.nativeEvent?.data === 'string'
            ? event.nativeEvent.data
            : '';
      updateCompositionDisplayText(nextText, 'composing');
    },
    [updateCompositionDisplayText]
  );

  const handleCompositionEnd = useCallback(
    (event: any) => {
      isComposingRef.current = false;
      const finalText =
        typeof event?.data === 'string'
          ? event.data
          : typeof event?.nativeEvent?.data === 'string'
            ? event.nativeEvent.data
            : '';

      if (finalText) {
        updateCompositionDisplayText(finalText, 'committed');
      } else {
        compositionDisplayRef.current = null;
        setCompositionDisplay(null);
      }

      queueTextSync();
    },
    [isComposingRef, queueTextSync, setCompositionDisplay, updateCompositionDisplayText]
  );

  return {
    handleBeforeInput,
    handleInput,
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
  };
}
