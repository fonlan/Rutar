import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { EditorCleanupAction, EditorContextMenuState } from './EditorContextMenu';

interface UseEditorContextCleanupActionParams {
  tabId: string;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
  flushPendingSync: () => Promise<void>;
  loadTextFromBackend: () => Promise<void>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
  syncSelectionAfterInteraction: () => void;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  dispatchDocumentUpdated: (tabId: string) => void;
}

export function useEditorContextCleanupAction({
  tabId,
  setEditorContextMenu,
  flushPendingSync,
  loadTextFromBackend,
  syncVisibleTokens,
  syncSelectionAfterInteraction,
  updateTab,
  dispatchDocumentUpdated,
}: UseEditorContextCleanupActionParams) {
  const handleCleanupDocumentFromContext = useCallback(
    async (action: EditorCleanupAction) => {
      setEditorContextMenu(null);

      try {
        await flushPendingSync();

        const newLineCount = await invoke<number>('cleanup_document', {
          id: tabId,
          action,
        });

        const safeLineCount = Math.max(1, newLineCount);
        updateTab(tabId, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        dispatchDocumentUpdated(tabId);

        await loadTextFromBackend();
        await syncVisibleTokens(safeLineCount);
        syncSelectionAfterInteraction();
      } catch (error) {
        console.error('Failed to cleanup document:', error);
      }
    },
    [
      dispatchDocumentUpdated,
      flushPendingSync,
      loadTextFromBackend,
      setEditorContextMenu,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tabId,
      updateTab,
    ]
  );

  return {
    handleCleanupDocumentFromContext,
  };
}
