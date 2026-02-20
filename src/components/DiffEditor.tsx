import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';
import { DiffEditorContextMenus } from './DiffEditorContextMenus';
import { DiffEditorHeader } from './DiffEditorHeader';
import { DiffEditorPanels } from './DiffEditorPanels';
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
  clampRatio,
  dispatchDocumentUpdated,
  extractActualLines,
  findAlignedRowIndexByLineNumber,
  getSelectedLineRangeByOffset,
  inferTrailingNewlineFromLines,
  normalizeLineDiffResult,
  normalizeTextToLines,
  reconcilePresenceAfterTextEdit,
  serializeLines,
  shouldOffloadDiffMetadataComputation,
} from './diffEditor.utils';
import { useDiffEditorPanelActions } from './useDiffEditorPanelActions';
import { useDiffEditorSnapshotState } from './useDiffEditorSnapshotState';
import { useDiffEditorPanelScrollSync } from './useDiffEditorPanelScrollSync';
import { useDiffEditorSplitter } from './useDiffEditorSplitter';
import { useDiffEditorSync } from './useDiffEditorSync';
import { useDiffEditorEditActions } from './useDiffEditorEditActions';
import { useDiffEditorPanelInteractions } from './useDiffEditorPanelInteractions';
import { useDiffEditorPresentationState } from './useDiffEditorPresentationState';

export { diffEditorTestUtils } from './diffEditor.utils';

interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
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

  const {
    lineDiffRef,
    pendingScrollRestoreRef,
    pendingCaretRestoreRef,
    lastEditAtRef,
    copyLinesRequestSequenceRef,
    sourceTextareaRef,
    targetTextareaRef,
    capturePanelScrollSnapshot,
    captureFocusedCaretSnapshot,
  } = useDiffEditorSnapshotState({
    lineDiff,
    sourceScroller,
    targetScroller,
  });

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

  const {
    handlePanelInputBlur,
    handlePanelTextareaChange,
    handlePanelPasteText,
    handlePanelTextareaKeyDown,
    handlePanelTextareaCopy,
    handleCopyLinesToPanel,
    isCopyLinesToPanelDisabled,
  } = useDiffEditorEditActions({
    sourceTab,
    targetTab,
    setActivePanel,
    sourceTextareaRef,
    targetTextareaRef,
    lineDiffRef,
    pendingCaretRestoreRef,
    lastEditAtRef,
    copyLinesRequestSequenceRef,
    setLineDiff,
    capturePanelScrollSnapshot,
    applyDeferredBackendResultIfIdle,
    schedulePreviewMetadataComputation,
    scheduleSideCommit,
    invalidatePreviewMetadataComputation,
    normalizeTextToLines,
    reconcilePresenceAfterTextEdit,
    shouldOffloadDiffMetadataComputation,
    buildAlignedDiffMetadata,
    buildCopyTextWithoutVirtualRows,
    getSelectedLineRangeByOffset,
    normalizeLineDiffResult,
  });
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
    handleLineNumberPointerDown,
    handleLineNumberKeyDown,
  } = useDiffEditorPanelInteractions({
    tabId: tab.id,
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

      <DiffEditorPanels
        viewportRef={viewportRef}
        leftWidthPx={leftWidthPx}
        rightWidthPx={rightWidthPx}
        separatorLeftPx={separatorLeftPx}
        splitterWidthPx={SPLITTER_WIDTH_PX}
        activePanel={activePanel}
        sourceTabExists={Boolean(sourceTab)}
        targetTabExists={Boolean(targetTab)}
        sourceUnavailableLabel={sourceUnavailableLabel}
        targetUnavailableLabel={targetUnavailableLabel}
        handleSourceScrollerRef={handleSourceScrollerRef}
        handleTargetScrollerRef={handleTargetScrollerRef}
        handleScrollerContextMenu={handleScrollerContextMenu}
        sourceContentWidthPx={sourceContentWidthPx}
        targetContentWidthPx={targetContentWidthPx}
        sourcePanelHeightPx={sourcePanelHeightPx}
        targetPanelHeightPx={targetPanelHeightPx}
        lineNumberColumnWidth={lineNumberColumnWidth}
        alignedLineCount={alignedLineCount}
        alignedDiffKindByLine={alignedDiffKindByLine}
        sourceLines={lineDiff.alignedSourceLines}
        targetLines={lineDiff.alignedTargetLines}
        sourcePresent={lineDiff.alignedSourcePresent}
        targetPresent={lineDiff.alignedTargetPresent}
        sourceLineNumbers={sourceLineNumbers}
        targetLineNumbers={targetLineNumbers}
        sourceSearchCurrentRow={sourceSearchCurrentRow}
        targetSearchCurrentRow={targetSearchCurrentRow}
        sourceTitlePrefix={sourceTitlePrefix}
        targetTitlePrefix={targetTitlePrefix}
        rowHeightPx={rowHeightPx}
        fontFamily={settings.fontFamily}
        fontSize={settings.fontSize}
        handleLineNumberPointerDown={handleLineNumberPointerDown}
        handleLineNumberKeyDown={handleLineNumberKeyDown}
        sourceTextareaRef={sourceTextareaRef}
        targetTextareaRef={targetTextareaRef}
        sourcePanelText={sourcePanelText}
        targetPanelText={targetPanelText}
        handlePanelTextareaChange={handlePanelTextareaChange}
        handlePanelTextareaKeyDown={handlePanelTextareaKeyDown}
        handlePanelTextareaCopy={handlePanelTextareaCopy}
        handlePanelContextMenu={handlePanelContextMenu}
        setActivePanel={setActivePanel}
        schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
        handlePanelInputBlur={handlePanelInputBlur}
        clearPairHighlightsForSide={clearPairHighlightsForSide}
        updatePairHighlightsForSide={updatePairHighlightsForSide}
        sourcePairHighlightRows={sourcePairHighlightRows}
        targetPairHighlightRows={targetPairHighlightRows}
        buildPairHighlightSegments={buildPairHighlightSegments}
        pairHighlightClass={PAIR_HIGHLIGHT_CLASS}
        handleLineNumberContextMenu={handleLineNumberContextMenu}
        shadowTopPercent={shadowTopPercent}
        shadowBottomPercent={shadowBottomPercent}
        handleSplitterPointerDown={handleSplitterPointerDown}
        handleSplitterContextMenu={handleSplitterContextMenu}
      />

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
