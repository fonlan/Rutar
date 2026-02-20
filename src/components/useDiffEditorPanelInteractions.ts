import { useCallback, type MutableRefObject } from 'react';
import type { DiffPanelSide } from '@/store/useStore';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';
import { getLineSelectionRange, getParentDirectoryPath, pathBaseName } from './diffEditor.utils';
import { useDiffEditorLineNumberSelection } from './useDiffEditorLineNumberSelection';
import { useDiffEditorMenusAndClipboard } from './useDiffEditorMenusAndClipboard';
import { useExternalPasteEvent } from './useExternalPasteEvent';

interface UseDiffEditorPanelInteractionsParams {
  tabId: string;
  activePanel: ActivePanel;
  sourcePath: string;
  targetPath: string;
  sourceDisplayName: string;
  targetDisplayName: string;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  setActivePanel: (side: ActivePanel) => void;
  handlePanelPasteText: (side: ActivePanel, pastedText: string) => void;
}

export function useDiffEditorPanelInteractions({
  tabId,
  activePanel,
  sourcePath,
  targetPath,
  sourceDisplayName,
  targetDisplayName,
  sourceTextareaRef,
  targetTextareaRef,
  lineDiffRef,
  setActivePanel,
  handlePanelPasteText,
}: UseDiffEditorPanelInteractionsParams) {
  const resolvePanelPath = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourcePath : targetPath),
    [sourcePath, targetPath]
  );

  const resolvePanelDisplayName = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourceDisplayName : targetDisplayName),
    [sourceDisplayName, targetDisplayName]
  );

  const {
    diffContextMenu,
    diffHeaderContextMenu,
    diffContextMenuRef,
    diffHeaderContextMenuRef,
    handlePanelContextMenu,
    handleLineNumberContextMenu,
    handleScrollerContextMenu,
    handleSplitterContextMenu,
    handleHeaderContextMenu,
    handleDiffHeaderContextMenuAction,
    handleDiffContextMenuClipboardAction,
    closeDiffContextMenu,
    diffHeaderMenuPath,
    diffHeaderMenuFileName,
    diffHeaderMenuDirectory,
  } = useDiffEditorMenusAndClipboard({
    sourceTextareaRef,
    targetTextareaRef,
    setActivePanel,
    handlePanelPasteText,
    resolvePanelPath,
    resolvePanelDisplayName,
    pathBaseName,
    getParentDirectoryPath,
  });

  const shouldHandleExternalDiffPaste = useCallback(
    (detail: { diffTabId?: string }) => detail.diffTabId === tabId,
    [tabId]
  );

  const handleExternalDiffPaste = useCallback(
    (text: string, detail: { panel?: DiffPanelSide }) => {
      const targetPanel = detail.panel === 'target'
        ? 'target'
        : detail.panel === 'source'
          ? 'source'
          : activePanel;
      handlePanelPasteText(targetPanel, text);
    },
    [activePanel, handlePanelPasteText]
  );

  useExternalPasteEvent<{ diffTabId?: string; panel?: DiffPanelSide; text?: string }>({
    eventName: 'rutar:diff-paste-text',
    shouldHandle: shouldHandleExternalDiffPaste,
    onPasteText: handleExternalDiffPaste,
  });

  const { handleLineNumberPointerDown, handleLineNumberKeyDown } = useDiffEditorLineNumberSelection({
    sourceTextareaRef,
    targetTextareaRef,
    lineDiffRef,
    setActivePanel,
    getLineSelectionRange,
  });

  return {
    diffContextMenu,
    diffHeaderContextMenu,
    diffContextMenuRef,
    diffHeaderContextMenuRef,
    handlePanelContextMenu,
    handleLineNumberContextMenu,
    handleScrollerContextMenu,
    handleSplitterContextMenu,
    handleHeaderContextMenu,
    handleDiffHeaderContextMenuAction,
    handleDiffContextMenuClipboardAction,
    closeDiffContextMenu,
    diffHeaderMenuPath,
    diffHeaderMenuFileName,
    diffHeaderMenuDirectory,
    handleLineNumberPointerDown,
    handleLineNumberKeyDown,
  };
}
