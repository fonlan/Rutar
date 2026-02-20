import { invoke } from '@tauri-apps/api/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { type DiffPanelSide, type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';
import { DiffEditorContextMenus } from './DiffEditorContextMenus';
import { DiffEditorHeader } from './DiffEditorHeader';
import { DiffPanelView } from './DiffPanelView';
import {
  DEFAULT_RATIO,
  DEFAULT_VIEWPORT,
  MIN_PANEL_WIDTH_PX,
  PAIR_HIGHLIGHT_CLASS,
  SPLITTER_WIDTH_PX,
  bindScrollerViewport,
  buildAlignedDiffMetadata,
  buildCopyTextWithoutVirtualRows,
  buildInitialDiff,
  buildLineNumberByAlignedRow,
  clampRatio,
  dispatchDocumentUpdated,
  extractActualLines,
  findAlignedRowIndexByLineNumber,
  getDiffKindStyle,
  getLineIndexFromTextOffset,
  getSelectedLineRangeByOffset,
  getLineSelectionRange,
  getParentDirectoryPath,
  inferTrailingNewlineFromLines,
  normalizeLineDiffResult,
  normalizeTextToLines,
  pathBaseName,
  reconcilePresenceAfterTextEdit,
  serializeLines,
  shouldOffloadDiffMetadataComputation,
  type CaretSnapshot,
  type PanelScrollSnapshot,
} from './diffEditor.utils';
import { useDiffEditorLineNumberSelection } from './useDiffEditorLineNumberSelection';
import { useDiffEditorMenusAndClipboard } from './useDiffEditorMenusAndClipboard';
import { useDiffEditorPanelActions } from './useDiffEditorPanelActions';
import { useDiffEditorPanelScrollSync } from './useDiffEditorPanelScrollSync';
import { useDiffEditorSplitter } from './useDiffEditorSplitter';
import { useDiffEditorSync } from './useDiffEditorSync';
import { useDiffEditorPresentationState } from './useDiffEditorPresentationState';
import { useExternalPasteEvent } from './useExternalPasteEvent';

export { diffEditorTestUtils } from './diffEditor.utils';

interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
}

interface ApplyAlignedDiffPanelCopyResult {
  lineDiff: LineDiffComparisonResult;
  changed: boolean;
}


export function DiffEditor({ tab }: DiffEditorProps) {
  const tabs = useStore((state) => state.tabs);
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const setActiveDiffPanel = useStore((state) => state.setActiveDiffPanel);
  const persistedActivePanel = useStore((state) => state.activeDiffPanelByTab[tab.id]);
  const { ref: viewportRef, width } = useResizeObserver<HTMLDivElement>();
  const [activePanel, setActivePanel] = useState<ActivePanel>(
    persistedActivePanel === 'target' ? 'target' : 'source'
  );
  const [lineDiff, setLineDiff] = useState<LineDiffComparisonResult>(() => buildInitialDiff(tab.diffPayload));

  const lineDiffRef = useRef(lineDiff);
  const pendingScrollRestoreRef = useRef<PanelScrollSnapshot | null>(null);
  const pendingCaretRestoreRef = useRef<CaretSnapshot | null>(null);
  const lastEditAtRef = useRef(0);
  const copyLinesRequestSequenceRef = useRef(0);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const targetTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sourceTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.sourceTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.sourceTabId, tabs]
  );
  const targetTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.targetTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.targetTabId, tabs]
  );
  const sourceTabId = sourceTab?.id ?? null;
  const targetTabId = targetTab?.id ?? null;
  const sourcePath = sourceTab?.path || tab.diffPayload.sourcePath || '';
  const targetPath = targetTab?.path || tab.diffPayload.targetPath || '';
  const sourceDisplayName = sourceTab?.name || tab.diffPayload.sourceName;
  const targetDisplayName = targetTab?.name || tab.diffPayload.targetName;

  useEffect(() => {
    setActiveDiffPanel(tab.id, activePanel);
  }, [activePanel, setActiveDiffPanel, tab.id]);

  const resolvePanelPath = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourcePath : targetPath),
    [sourcePath, targetPath]
  );

  const resolvePanelDisplayName = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourceDisplayName : targetDisplayName),
    [sourceDisplayName, targetDisplayName]
  );
  const {
    leftWidthPx,
    rightWidthPx,
    separatorLeftPx,
    handleSplitterPointerDown,
  } = useDiffEditorSplitter({
    width,
    defaultRatio: DEFAULT_RATIO,
    minPanelWidthPx: MIN_PANEL_WIDTH_PX,
    splitterWidthPx: SPLITTER_WIDTH_PX,
    clampRatio,
  });

  const {
    sourceViewport,
    targetViewport,
    sourceScroller,
    targetScroller,
    handleSourceScrollerRef,
    handleTargetScrollerRef,
  } = useDiffEditorPanelScrollSync({
    defaultViewport: DEFAULT_VIEWPORT,
    bindScrollerViewport,
  });

  const capturePanelScrollSnapshot = useCallback(() => {
    if (!sourceScroller || !targetScroller) {
      pendingScrollRestoreRef.current = null;
      return;
    }

    pendingScrollRestoreRef.current = {
      sourceTop: sourceScroller.scrollTop,
      sourceLeft: sourceScroller.scrollLeft,
      targetTop: targetScroller.scrollTop,
      targetLeft: targetScroller.scrollLeft,
    };
  }, [sourceScroller, targetScroller]);

  const captureFocusedCaretSnapshot = useCallback((): CaretSnapshot | null => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return null;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return null;
    }

    const snapshotState = lineDiffRef.current;
    const present = panel === 'source'
      ? snapshotState.alignedSourcePresent
      : snapshotState.alignedTargetPresent;
    const lineNumbers = panel === 'source'
      ? snapshotState.sourceLineNumbersByAlignedRow
      : snapshotState.targetLineNumbersByAlignedRow;
    const resolvedLineNumbers = Array.isArray(lineNumbers) && lineNumbers.length === present.length
      ? lineNumbers
      : buildLineNumberByAlignedRow(present);
    const elementText = activeElement.value ?? '';
    const selectionStart = activeElement.selectionStart ?? elementText.length;
    const selectionEnd = activeElement.selectionEnd ?? elementText.length;
    const effectiveRowIndex = getLineIndexFromTextOffset(elementText, selectionStart);
    const lineNumber = resolvedLineNumbers[effectiveRowIndex] ?? 0;

    return {
      side: panel,
      rowIndex: effectiveRowIndex,
      lineNumber,
      selectionStart,
      selectionEnd,
    };
  }, []);

  const {
    schedulePreviewMetadataComputation,
    invalidatePreviewMetadataComputation,
    scheduleDiffRefresh,
    flushSideCommit,
    scheduleSideCommit,
    clearSideCommitTimer,
    applyDeferredBackendResultIfIdle,
  } = useDiffEditorSync({
    tabId: tab.id,
    diffPayload: tab.diffPayload,
    sourceTab,
    targetTab,
    sourceScroller,
    targetScroller,
    lineDiff,
    setLineDiff,
    lineDiffRef,
    pendingScrollRestoreRef,
    pendingCaretRestoreRef,
    lastEditAtRef,
    updateTab,
    capturePanelScrollSnapshot,
    captureFocusedCaretSnapshot,
    normalizeLineDiffResult,
    extractActualLines,
    inferTrailingNewlineFromLines,
    serializeLines,
    findAlignedRowIndexByLineNumber,
    buildInitialDiff,
    dispatchDocumentUpdated,
  });

  const { handleSavePanel } = useDiffEditorPanelActions({
    tabId: tab.id,
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
  });

  const handlePanelInputBlur = useCallback(() => {
    window.requestAnimationFrame(() => {
      applyDeferredBackendResultIfIdle();
    });
  }, [applyDeferredBackendResultIfIdle]);

  const handlePanelTextareaChange = useCallback(
    (
      side: ActivePanel,
      nextText: string,
      selectionStart: number,
      selectionEnd: number
    ) => {
      lastEditAtRef.current = Date.now();
      capturePanelScrollSnapshot();

      const normalizedLines = normalizeTextToLines(nextText);

      setLineDiff((previous) => {
        const isSourceSide = side === 'source';
        const previousActiveLines = isSourceSide
          ? previous.alignedSourceLines
          : previous.alignedTargetLines;
        const previousActivePresent = isSourceSide
          ? previous.alignedSourcePresent
          : previous.alignedTargetPresent;
        const previousOppositeLines = isSourceSide
          ? previous.alignedTargetLines
          : previous.alignedSourceLines;
        const previousOppositePresent = isSourceSide
          ? previous.alignedTargetPresent
          : previous.alignedSourcePresent;

        const reconciledPresent = reconcilePresenceAfterTextEdit(
          previousActiveLines,
          previousActivePresent,
          normalizedLines
        );

        const nextAlignedCount = Math.max(1, normalizedLines.length, previousOppositeLines.length);
        const nextActiveLines = [...normalizedLines];
        const nextActivePresent = [...reconciledPresent];
        const nextOppositeLines = [...previousOppositeLines];
        const nextOppositePresent = [...previousOppositePresent];

        while (nextActiveLines.length < nextAlignedCount) {
          nextActiveLines.push('');
          nextActivePresent.push(false);
        }

        while (nextOppositeLines.length < nextAlignedCount) {
          nextOppositeLines.push('');
          nextOppositePresent.push(false);
        }

        const nextSourceLines = isSourceSide ? nextActiveLines : nextOppositeLines;
        const nextSourcePresent = isSourceSide ? nextActivePresent : nextOppositePresent;
        const nextTargetLines = isSourceSide ? nextOppositeLines : nextActiveLines;
        const nextTargetPresent = isSourceSide ? nextOppositePresent : nextActivePresent;
        const caretRowIndex = getLineIndexFromTextOffset(nextText, selectionStart);
        const shouldOffloadMetadata = shouldOffloadDiffMetadataComputation(nextAlignedCount);

        if (shouldOffloadMetadata) {
          pendingCaretRestoreRef.current = {
            side,
            rowIndex: Math.max(0, Math.min(caretRowIndex, nextAlignedCount - 1)),
            lineNumber: 0,
            selectionStart,
            selectionEnd,
          };

          const nextState = {
            ...previous,
            alignedSourceLines: nextSourceLines,
            alignedTargetLines: nextTargetLines,
            alignedSourcePresent: nextSourcePresent,
            alignedTargetPresent: nextTargetPresent,
            alignedLineCount: nextAlignedCount,
          };
          lineDiffRef.current = nextState;
          schedulePreviewMetadataComputation(
            nextSourceLines,
            nextTargetLines,
            nextSourcePresent,
            nextTargetPresent
          );
          return nextState;
        }

        const metadata = buildAlignedDiffMetadata(
          nextSourceLines,
          nextTargetLines,
          nextSourcePresent,
          nextTargetPresent
        );
        const lineNumbers = isSourceSide
          ? metadata.sourceLineNumbersByAlignedRow
          : metadata.targetLineNumbersByAlignedRow;
        pendingCaretRestoreRef.current = {
          side,
          rowIndex: Math.max(0, Math.min(caretRowIndex, metadata.alignedLineCount - 1)),
          lineNumber: lineNumbers[caretRowIndex] ?? 0,
          selectionStart,
          selectionEnd,
        };

        const nextState = {
          ...previous,
          alignedSourceLines: nextSourceLines,
          alignedTargetLines: nextTargetLines,
          alignedSourcePresent: nextSourcePresent,
          alignedTargetPresent: nextTargetPresent,
          ...metadata,
        };
        lineDiffRef.current = nextState;
        return nextState;
      });

      scheduleSideCommit(side);
    },
    [capturePanelScrollSnapshot, schedulePreviewMetadataComputation, scheduleSideCommit]
  );

  const handlePanelPasteText = useCallback(
    (side: ActivePanel, pastedText: string) => {
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      const value = textarea.value ?? '';
      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const safeStart = Math.max(0, Math.min(selectionStart, value.length));
      const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length));
      const nextValue = `${value.slice(0, safeStart)}${pastedText}${value.slice(safeEnd)}`;
      const nextCaret = safeStart + pastedText.length;
      setActivePanel(side);
      textarea.focus({ preventScroll: true });
      handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
    },
    [handlePanelTextareaChange]
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
    (detail: { diffTabId?: string }) => detail.diffTabId === tab.id,
    [tab.id]
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

  const handlePanelTextareaKeyDown = useCallback(
    (side: ActivePanel, event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === 'Tab'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        event.preventDefault();
        const target = event.currentTarget;
        const value = target.value;
        const start = target.selectionStart ?? value.length;
        const end = target.selectionEnd ?? start;
        const safeStart = Math.max(0, Math.min(start, value.length));
        const safeEnd = Math.max(safeStart, Math.min(end, value.length));
        const nextValue = `${value.slice(0, safeStart)}\t${value.slice(safeEnd)}`;
        const nextCaret = safeStart + 1;
        handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
      }
    },
    [handlePanelTextareaChange]
  );

  const handlePanelTextareaCopy = useCallback(
    (side: ActivePanel, event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const value = target.value ?? '';
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      const snapshot = lineDiffRef.current;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      const copiedText = buildCopyTextWithoutVirtualRows(
        value,
        selectionStart,
        selectionEnd,
        present
      );

      if (copiedText === null) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData('text/plain', copiedText);
    },
    []
  );

  const handleCopyLinesToPanel = useCallback(
    async (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return;
      }

      const destinationTab = targetSide === 'source' ? sourceTab : targetTab;
      if (!destinationTab) {
        return;
      }

      const sourceTextarea = fromSide === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!sourceTextarea) {
        return;
      }

      const sourceText = sourceTextarea.value ?? '';
      const selectionStart = sourceTextarea.selectionStart ?? 0;
      const selectionEnd = sourceTextarea.selectionEnd ?? selectionStart;
      const { startLine, endLine } = getSelectedLineRangeByOffset(
        sourceText,
        selectionStart,
        selectionEnd
      );
      const snapshot = lineDiffRef.current;
      const requestSequence = copyLinesRequestSequenceRef.current + 1;
      copyLinesRequestSequenceRef.current = requestSequence;

      try {
        const result = await invoke<ApplyAlignedDiffPanelCopyResult>('apply_aligned_diff_panel_copy', {
          fromSide,
          toSide: targetSide,
          startRowIndex: Math.max(0, Math.floor(startLine)),
          endRowIndex: Math.max(0, Math.floor(endLine)),
          alignedSourceLines: snapshot.alignedSourceLines,
          alignedTargetLines: snapshot.alignedTargetLines,
          alignedSourcePresent: snapshot.alignedSourcePresent,
          alignedTargetPresent: snapshot.alignedTargetPresent,
        });

        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }

        if (!result?.changed) {
          return;
        }

        lastEditAtRef.current = Date.now();
        capturePanelScrollSnapshot();
        invalidatePreviewMetadataComputation();
        const normalized = normalizeLineDiffResult(result.lineDiff);
        lineDiffRef.current = normalized;
        setLineDiff(normalized);
        scheduleSideCommit(targetSide);
      } catch (error) {
        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }
        console.error('Failed to copy diff lines to panel:', error);
      }
    },
    [
      capturePanelScrollSnapshot,
      invalidatePreviewMetadataComputation,
      scheduleSideCommit,
      sourceTab,
      targetTab,
    ]
  );

  const isCopyLinesToPanelDisabled = useCallback(
    (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return true;
      }

      const destinationTab = targetSide === 'source' ? sourceTab : targetTab;
      if (!destinationTab) {
        return true;
      }

      const textarea = fromSide === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return true;
      }

      const snapshot = lineDiffRef.current;
      const sourceLines = fromSide === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const destinationLines = targetSide === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;

      const maxIndex = Math.min(sourceLines.length, destinationLines.length) - 1;
      if (maxIndex < 0) {
        return true;
      }

      return false;
    },
    [sourceTab, targetTab]
  );

  const { handleLineNumberPointerDown, handleLineNumberKeyDown } = useDiffEditorLineNumberSelection({
    sourceTextareaRef,
    targetTextareaRef,
    lineDiffRef,
    setActivePanel,
    getLineSelectionRange,
  });

  const {
    alignedLineCount,
    alignedDiffKindByLine,
    sourceLineNumbers,
    targetLineNumbers,
    rowHeightPx,
    sourceSearchQuery,
    setSourceSearchQuery,
    targetSearchQuery,
    setTargetSearchQuery,
    setSourceSearchMatchedRow,
    setTargetSearchMatchedRow,
    sourceSearchCurrentRow,
    targetSearchCurrentRow,
    sourceSearchDisabled,
    targetSearchDisabled,
    clearPairHighlightsForSide,
    updatePairHighlightsForSide,
    schedulePairHighlightSyncForSide,
    jumpSourceDiffRow,
    jumpTargetDiffRow,
    jumpSourceSearchMatch,
    jumpTargetSearchMatch,
    sourceDiffJumpDisabled,
    targetDiffJumpDisabled,
    lineNumberColumnWidth,
    sourceContentWidthPx,
    targetContentWidthPx,
    shadowTopPercent,
    shadowBottomPercent,
    sourcePanelText,
    targetPanelText,
    sourcePanelHeightPx,
    targetPanelHeightPx,
    sourcePairHighlightRows,
    targetPairHighlightRows,
    buildPairHighlightSegments,
  } = useDiffEditorPresentationState({
    lineDiff,
    lineDiffRef,
    sourceTabId,
    targetTabId,
    sourceTabExists: Boolean(sourceTab),
    targetTabExists: Boolean(targetTab),
    sourceTextareaRef,
    targetTextareaRef,
    sourceScroller,
    targetScroller,
    activePanel,
    setActivePanel,
    leftWidthPx,
    rightWidthPx,
    sourceViewport,
    targetViewport,
    fontSize: settings.fontSize,
  });

  const saveLabel = 'Save';
  const sourceTitlePrefix = 'Source';
  const targetTitlePrefix = 'Target';
  const sourceUnavailableLabel = 'Source tab closed';
  const targetUnavailableLabel = 'Target tab closed';
  const isZhCN = settings.language === 'zh-CN';
  const copyLabel = isZhCN ? '复制' : 'Copy';
  const cutLabel = isZhCN ? '剪切' : 'Cut';
  const pasteLabel = isZhCN ? '粘贴' : 'Paste';
  const copyToLeftLabel = isZhCN ? '复制到左侧' : 'Copy to Left';
  const copyToRightLabel = isZhCN ? '复制到右侧' : 'Copy to Right';
  const copyFileNameLabel = isZhCN ? '复制文件名' : 'Copy File Name';
  const copyDirectoryPathLabel = isZhCN ? '复制文件夹路径' : 'Copy Folder Path';
  const copyFullPathLabel = isZhCN ? '复制完整路径' : 'Copy Full Path';
  const openContainingFolderLabel = isZhCN ? '打开所在目录' : 'Open Containing Folder';
  const searchPlaceholderLabel = isZhCN ? '搜索关键字' : 'Search keyword';
  const previousMatchLabel = isZhCN ? '上一个匹配' : 'Previous Match';
  const nextMatchLabel = isZhCN ? '下一个匹配' : 'Next Match';
  const previousDiffLineLabel = isZhCN ? '上一个不同行' : 'Previous Diff Line';
  const nextDiffLineLabel = isZhCN ? '下一个不同行' : 'Next Diff Line';
  const noDiffLineLabel = isZhCN ? '未找到不同行' : 'No diff lines';
  const noMatchLabel = isZhCN ? '未找到匹配' : 'No matches';
  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <DiffEditorHeader
        leftWidthPx={leftWidthPx}
        rightWidthPx={rightWidthPx}
        splitterWidthPx={SPLITTER_WIDTH_PX}
        sourcePath={sourcePath}
        targetPath={targetPath}
        sourceDisplayName={sourceDisplayName}
        targetDisplayName={targetDisplayName}
        sourceTabExists={Boolean(sourceTab)}
        targetTabExists={Boolean(targetTab)}
        sourceTabIsDirty={Boolean(sourceTab?.isDirty)}
        targetTabIsDirty={Boolean(targetTab?.isDirty)}
        sourceSearchQuery={sourceSearchQuery}
        targetSearchQuery={targetSearchQuery}
        setSourceSearchQuery={setSourceSearchQuery}
        setTargetSearchQuery={setTargetSearchQuery}
        setSourceSearchMatchedRow={setSourceSearchMatchedRow}
        setTargetSearchMatchedRow={setTargetSearchMatchedRow}
        jumpSourceSearchMatch={jumpSourceSearchMatch}
        jumpTargetSearchMatch={jumpTargetSearchMatch}
        sourceSearchDisabled={sourceSearchDisabled}
        targetSearchDisabled={targetSearchDisabled}
        jumpSourceDiffRow={jumpSourceDiffRow}
        jumpTargetDiffRow={jumpTargetDiffRow}
        sourceDiffJumpDisabled={sourceDiffJumpDisabled}
        targetDiffJumpDisabled={targetDiffJumpDisabled}
        handleSavePanel={handleSavePanel}
        handleHeaderContextMenu={handleHeaderContextMenu}
        saveLabel={saveLabel}
        sourceTitlePrefix={sourceTitlePrefix}
        targetTitlePrefix={targetTitlePrefix}
        searchPlaceholderLabel={searchPlaceholderLabel}
        previousMatchLabel={previousMatchLabel}
        nextMatchLabel={nextMatchLabel}
        previousDiffLineLabel={previousDiffLineLabel}
        nextDiffLineLabel={nextDiffLineLabel}
        noDiffLineLabel={noDiffLineLabel}
        noMatchLabel={noMatchLabel}
      />

      <div ref={viewportRef} className="relative h-[calc(100%-2.5rem)] w-full overflow-hidden">
        <div className="absolute inset-0 flex">
          <DiffPanelView
            side="source"
            panelWidthPx={leftWidthPx}
            isActive={activePanel === 'source'}
            hasTab={Boolean(sourceTab)}
            unavailableText={sourceUnavailableLabel}
            scrollerRef={handleSourceScrollerRef}
            onScrollerContextMenu={handleScrollerContextMenu}
            contentWidthPx={sourceContentWidthPx}
            panelHeightPx={sourcePanelHeightPx}
            lineNumberColumnWidth={lineNumberColumnWidth}
            alignedLineCount={alignedLineCount}
            alignedDiffKindByLine={alignedDiffKindByLine}
            getDiffKindStyle={getDiffKindStyle}
            lines={lineDiff.alignedSourceLines}
            present={lineDiff.alignedSourcePresent}
            lineNumbers={sourceLineNumbers}
            searchCurrentRow={sourceSearchCurrentRow}
            titlePrefix={sourceTitlePrefix}
            rowHeightPx={rowHeightPx}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            onLineNumberPointerDown={handleLineNumberPointerDown}
            onLineNumberKeyDown={handleLineNumberKeyDown}
            textareaRef={sourceTextareaRef}
            panelText={sourcePanelText}
            onTextareaChange={handlePanelTextareaChange}
            onTextareaKeyDown={handlePanelTextareaKeyDown}
            onTextareaCopy={handlePanelTextareaCopy}
            onPanelContextMenu={handlePanelContextMenu}
            setActivePanel={setActivePanel}
            schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
            onPanelInputBlur={handlePanelInputBlur}
            clearPairHighlightsForSide={clearPairHighlightsForSide}
            updatePairHighlightsForSide={updatePairHighlightsForSide}
            pairHighlightRows={sourcePairHighlightRows}
            buildPairHighlightSegments={buildPairHighlightSegments}
            pairHighlightClass={PAIR_HIGHLIGHT_CLASS}
            onLineNumberContextMenu={handleLineNumberContextMenu}
          />

          <div
            className="border-x border-border/70 bg-muted/30"
            style={{ width: SPLITTER_WIDTH_PX }}
            aria-hidden="true"
          />

          <DiffPanelView
            side="target"
            panelWidthPx={rightWidthPx}
            isActive={activePanel === 'target'}
            hasTab={Boolean(targetTab)}
            unavailableText={targetUnavailableLabel}
            scrollerRef={handleTargetScrollerRef}
            onScrollerContextMenu={handleScrollerContextMenu}
            contentWidthPx={targetContentWidthPx}
            panelHeightPx={targetPanelHeightPx}
            lineNumberColumnWidth={lineNumberColumnWidth}
            alignedLineCount={alignedLineCount}
            alignedDiffKindByLine={alignedDiffKindByLine}
            getDiffKindStyle={getDiffKindStyle}
            lines={lineDiff.alignedTargetLines}
            present={lineDiff.alignedTargetPresent}
            lineNumbers={targetLineNumbers}
            searchCurrentRow={targetSearchCurrentRow}
            titlePrefix={targetTitlePrefix}
            rowHeightPx={rowHeightPx}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            onLineNumberPointerDown={handleLineNumberPointerDown}
            onLineNumberKeyDown={handleLineNumberKeyDown}
            textareaRef={targetTextareaRef}
            panelText={targetPanelText}
            onTextareaChange={handlePanelTextareaChange}
            onTextareaKeyDown={handlePanelTextareaKeyDown}
            onTextareaCopy={handlePanelTextareaCopy}
            onPanelContextMenu={handlePanelContextMenu}
            setActivePanel={setActivePanel}
            schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
            onPanelInputBlur={handlePanelInputBlur}
            clearPairHighlightsForSide={clearPairHighlightsForSide}
            updatePairHighlightsForSide={updatePairHighlightsForSide}
            pairHighlightRows={targetPairHighlightRows}
            buildPairHighlightSegments={buildPairHighlightSegments}
            pairHighlightClass={PAIR_HIGHLIGHT_CLASS}
            onLineNumberContextMenu={handleLineNumberContextMenu}
          />
        </div>

        <div
          className="pointer-events-none absolute top-0 bottom-0"
          style={{ left: separatorLeftPx, width: SPLITTER_WIDTH_PX }}
          aria-hidden="true"
        >
          <div
            className="absolute left-0 right-0 bg-sky-400/20 dark:bg-sky-300/20"
            style={{
              top: `${shadowTopPercent}%`,
              height: `${Math.max(1, shadowBottomPercent - shadowTopPercent)}%`,
              zIndex: 10,
            }}
          />

          {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
            const diffStyle = getDiffKindStyle(kind);
            return (
              <div
                key={`diff-marker-${lineNumber}`}
                className={cn('absolute left-0 right-0 h-[2px]', diffStyle.markerClass)}
                style={{
                  top: `${(lineNumber / alignedLineCount) * 100}%`,
                  zIndex: 20,
                }}
              />
            );
          })}
        </div>

        <div
          className="absolute top-0 bottom-0 z-30 cursor-col-resize"
          style={{ left: separatorLeftPx, width: SPLITTER_WIDTH_PX }}
          onPointerDown={handleSplitterPointerDown}
          onContextMenu={handleSplitterContextMenu}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize diff panels"
        >
          <div className="mx-auto h-full w-px bg-border/90 shadow-[0_0_8px_rgba(0,0,0,0.18)]" />
        </div>
      </div>

      <DiffEditorContextMenus
        diffHeaderContextMenu={diffHeaderContextMenu}
        diffContextMenu={diffContextMenu}
        diffHeaderContextMenuRef={diffHeaderContextMenuRef}
        diffContextMenuRef={diffContextMenuRef}
        handleDiffHeaderContextMenuAction={handleDiffHeaderContextMenuAction}
        handleDiffContextMenuClipboardAction={handleDiffContextMenuClipboardAction}
        isCopyLinesToPanelDisabled={isCopyLinesToPanelDisabled}
        handleCopyLinesToPanel={handleCopyLinesToPanel}
        closeDiffContextMenu={closeDiffContextMenu}
        diffHeaderMenuPath={diffHeaderMenuPath}
        diffHeaderMenuFileName={diffHeaderMenuFileName}
        diffHeaderMenuDirectory={diffHeaderMenuDirectory}
        copyLabel={copyLabel}
        cutLabel={cutLabel}
        pasteLabel={pasteLabel}
        copyToLeftLabel={copyToLeftLabel}
        copyToRightLabel={copyToRightLabel}
        copyFileNameLabel={copyFileNameLabel}
        copyDirectoryPathLabel={copyDirectoryPathLabel}
        copyFullPathLabel={copyFullPathLabel}
        openContainingFolderLabel={openContainingFolderLabel}
      />
    </div>
  );
}
