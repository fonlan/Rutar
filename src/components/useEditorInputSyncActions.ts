import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

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
  clearVerticalSelectionState: () => void;
  normalizeInputLayerDom: (element: any) => void;
  syncHugeScrollableContentWidth: () => void;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  syncSelectionAfterInteraction: () => void;
  handleScroll: () => void;
  flushPendingSync: () => Promise<void>;
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
  clearVerticalSelectionState,
  normalizeInputLayerDom,
  syncHugeScrollableContentWidth,
  updateTab,
  syncSelectionAfterInteraction,
  handleScroll,
  flushPendingSync,
}: UseEditorInputSyncActionsParams) {
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
    () => {
      clearVerticalSelectionState();

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
    ]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;

    if (isHugeEditableMode) {
      hugeWindowLockedRef.current = true;
    }
  }, [hugeWindowLockedRef, isComposingRef, isHugeEditableMode]);

  const handleCompositionEnd = useCallback(
    () => {
      isComposingRef.current = false;
      queueTextSync();
    },
    [isComposingRef, queueTextSync]
  );

  return {
    handleInput,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
