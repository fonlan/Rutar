import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { saveTab } from '@/lib/tabClose';
import {
  type DiffPanelSide,
  type FileTab,
  useStore,
} from '@/store/useStore';
import type { ActivePanel } from './diffEditor.types';

interface EditHistoryState {
  isDirty: boolean;
}

interface UseDiffEditorPanelActionsParams {
  tabId: string;
  activePanel: ActivePanel;
  sourceTab: FileTab | null;
  targetTab: FileTab | null;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setActivePanel: (side: ActivePanel) => void;
  updateTab: (id: string, updates: Partial<FileTab>) => void;
  clearSideCommitTimer: (side: ActivePanel) => void;
  flushSideCommit: (side: ActivePanel) => Promise<void>;
  scheduleDiffRefresh: () => void;
  dispatchDocumentUpdated: (tabId: string) => void;
}

export function useDiffEditorPanelActions({
  tabId,
  activePanel,
  sourceTab,
  targetTab,
  sourceTextareaRef,
  targetTextareaRef,
  setActivePanel,
  updateTab,
  clearSideCommitTimer,
  flushSideCommit,
  scheduleDiffRefresh,
  dispatchDocumentUpdated,
}: UseDiffEditorPanelActionsParams) {
  const handleSavePanel = useCallback(
    async (panel: ActivePanel) => {
      const panelTab = panel === 'source' ? sourceTab : targetTab;
      if (!panelTab) {
        return;
      }

      clearSideCommitTimer(panel);
      await flushSideCommit(panel);

      const latestTab = useStore
        .getState()
        .tabs.find((item) => item.id === panelTab.id && item.tabType !== 'diff');

      if (!latestTab || latestTab.tabType === 'diff') {
        return;
      }

      try {
        await saveTab(latestTab, updateTab);
        scheduleDiffRefresh();
      } catch (error) {
        console.error('Failed to save panel tab:', error);
      }
    },
    [clearSideCommitTimer, flushSideCommit, scheduleDiffRefresh, sourceTab, targetTab, updateTab]
  );

  const handleSaveActivePanel = useCallback(async () => {
    await handleSavePanel(activePanel);
  }, [activePanel, handleSavePanel]);

  const runPanelHistoryAction = useCallback(
    async (side: ActivePanel, action: 'undo' | 'redo') => {
      const panelTab = side === 'source' ? sourceTab : targetTab;
      if (!panelTab) {
        return;
      }

      setActivePanel(side);
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (textarea && document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      clearSideCommitTimer(side);
      await flushSideCommit(side);

      try {
        const nextLineCount = await invoke<number>(action, { id: panelTab.id });
        let nextDirtyState = useStore.getState().tabs.find((item) => item.id === panelTab.id)?.isDirty ?? true;
        try {
          const historyState = await invoke<EditHistoryState>('get_edit_history_state', { id: panelTab.id });
          nextDirtyState = historyState.isDirty;
        } catch (error) {
          console.warn('Failed to refresh panel history state:', error);
        }

        updateTab(panelTab.id, {
          lineCount: Math.max(1, nextLineCount),
          isDirty: nextDirtyState,
        });
        dispatchDocumentUpdated(panelTab.id);
        scheduleDiffRefresh();
      } catch (error) {
        console.warn(`Failed to ${action} panel tab:`, error);
      }
    },
    [
      clearSideCommitTimer,
      dispatchDocumentUpdated,
      flushSideCommit,
      scheduleDiffRefresh,
      setActivePanel,
      sourceTab,
      sourceTextareaRef,
      targetTab,
      targetTextareaRef,
      updateTab,
    ]
  );

  useEffect(() => {
    const handleDiffToolbarHistory = (event: Event) => {
      const customEvent = event as CustomEvent<{
        diffTabId?: string;
        panel?: DiffPanelSide;
        action?: 'undo' | 'redo';
      }>;
      if (customEvent.detail?.diffTabId !== tabId) {
        return;
      }

      if (customEvent.detail.action !== 'undo' && customEvent.detail.action !== 'redo') {
        return;
      }

      const targetPanel = customEvent.detail.panel === 'target'
        ? 'target'
        : customEvent.detail.panel === 'source'
          ? 'source'
          : activePanel;
      void runPanelHistoryAction(targetPanel, customEvent.detail.action);
    };

    window.addEventListener('rutar:diff-history-action', handleDiffToolbarHistory as EventListener);
    return () => {
      window.removeEventListener('rutar:diff-history-action', handleDiffToolbarHistory as EventListener);
    };
  }, [activePanel, runPanelHistoryAction, tabId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      void handleSaveActivePanel();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleSaveActivePanel]);

  return {
    handleSavePanel,
  };
}
