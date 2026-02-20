import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { ActivePanel, DiffLineKind, LineDiffComparisonResult } from './diffEditor.types';
import {
  buildLineNumberByAlignedRow,
  buildPairHighlightSegments,
  buildPairHighlightRows,
  clampPercent,
  ensureDiffKindArray,
  getLineIndexFromTextOffset,
  getLineSelectionRange,
  getNextMatchedRow,
  getNextMatchedRowFromAnchor,
  resolveAlignedDiffKind,
  type PairHighlightPosition,
  type ViewportMetrics,
} from './diffEditor.utils';
import { useDiffEditorPairHighlight } from './useDiffEditorPairHighlight';
import { useDiffEditorSearchNavigation } from './useDiffEditorSearchNavigation';

interface UseDiffEditorPresentationStateParams {
  lineDiff: LineDiffComparisonResult;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  sourceTabId: string | null;
  targetTabId: string | null;
  sourceTabExists: boolean;
  targetTabExists: boolean;
  sourcePairHighlightEnabled: boolean;
  targetPairHighlightEnabled: boolean;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  sourceScroller: HTMLElement | null;
  targetScroller: HTMLElement | null;
  activePanel: ActivePanel;
  setActivePanel: (side: ActivePanel) => void;
  leftWidthPx: number;
  rightWidthPx: number;
  sourceViewport: ViewportMetrics;
  targetViewport: ViewportMetrics;
  fontSize: number;
}

export function useDiffEditorPresentationState({
  lineDiff,
  lineDiffRef,
  sourceTabId,
  targetTabId,
  sourceTabExists,
  targetTabExists,
  sourcePairHighlightEnabled,
  targetPairHighlightEnabled,
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
  fontSize,
}: UseDiffEditorPresentationStateParams) {
  const alignedLineCount = Math.max(
    1,
    lineDiff.alignedLineCount,
    lineDiff.alignedSourceLines.length,
    lineDiff.alignedTargetLines.length
  );
  const diffLineNumbers = useMemo(
    () =>
      Array.from(new Set(lineDiff.diffLineNumbers))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right),
    [lineDiff.diffLineNumbers]
  );
  const diffRowIndexes = useMemo(() => {
    const candidate = lineDiff.diffRowIndexes;
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .map((rowIndex) => Math.floor(rowIndex))
        .filter((rowIndex) => Number.isFinite(rowIndex) && rowIndex >= 0 && rowIndex < alignedLineCount);
    }

    return diffLineNumbers
      .map((lineNumber) => lineNumber - 1)
      .filter((rowIndex) => rowIndex >= 0 && rowIndex < alignedLineCount);
  }, [alignedLineCount, diffLineNumbers, lineDiff.diffRowIndexes]);

  const alignedDiffKindByLine = useMemo(() => {
    const result = new Map<number, DiffLineKind>();
    const normalizedKinds = Array.isArray(lineDiff.alignedDiffKinds)
      ? ensureDiffKindArray(lineDiff.alignedDiffKinds, alignedLineCount)
      : [];

    if (normalizedKinds.length > 0) {
      for (let index = 0; index < alignedLineCount; index += 1) {
        const kind = normalizedKinds[index];
        if (!kind) {
          continue;
        }
        result.set(index + 1, kind);
      }

      return result;
    }

    for (const lineNumber of diffLineNumbers) {
      const index = lineNumber - 1;
      if (index < 0 || index >= alignedLineCount) {
        continue;
      }

      const kind = resolveAlignedDiffKind(
        index,
        lineDiff.alignedSourceLines,
        lineDiff.alignedTargetLines,
        lineDiff.alignedSourcePresent,
        lineDiff.alignedTargetPresent
      );
      if (!kind) {
        continue;
      }

      result.set(lineNumber, kind);
    }

    return result;
  }, [
    alignedLineCount,
    diffLineNumbers,
    lineDiff.alignedDiffKinds,
    lineDiff.alignedSourceLines,
    lineDiff.alignedSourcePresent,
    lineDiff.alignedTargetLines,
    lineDiff.alignedTargetPresent,
  ]);

  const sourceLineNumbers = useMemo(() => {
    if (
      Array.isArray(lineDiff.sourceLineNumbersByAlignedRow)
      && lineDiff.sourceLineNumbersByAlignedRow.length === lineDiff.alignedSourcePresent.length
    ) {
      return lineDiff.sourceLineNumbersByAlignedRow;
    }

    return buildLineNumberByAlignedRow(lineDiff.alignedSourcePresent);
  }, [lineDiff.alignedSourcePresent, lineDiff.sourceLineNumbersByAlignedRow]);

  const targetLineNumbers = useMemo(() => {
    if (
      Array.isArray(lineDiff.targetLineNumbersByAlignedRow)
      && lineDiff.targetLineNumbersByAlignedRow.length === lineDiff.alignedTargetPresent.length
    ) {
      return lineDiff.targetLineNumbersByAlignedRow;
    }

    return buildLineNumberByAlignedRow(lineDiff.alignedTargetPresent);
  }, [lineDiff.alignedTargetPresent, lineDiff.targetLineNumbersByAlignedRow]);

  const rowHeightPx = Math.max(22, Math.round(fontSize * 1.6));
  const {
    sourceSearchQuery,
    setSourceSearchQuery,
    targetSearchQuery,
    setTargetSearchQuery,
    sourceSearchMatchedRows,
    targetSearchMatchedRows,
    sourceSearchMatchedRow,
    setSourceSearchMatchedRow,
    targetSearchMatchedRow,
    setTargetSearchMatchedRow,
    sourceSearchCurrentRow,
    targetSearchCurrentRow,
    sourceSearchDisabled,
    targetSearchDisabled,
  } = useDiffEditorSearchNavigation({
    sourceTabId,
    targetTabId,
    alignedLineCount,
    sourceAlignedPresent: lineDiff.alignedSourcePresent,
    targetAlignedPresent: lineDiff.alignedTargetPresent,
  });
  const {
    sourcePairHighlights,
    targetPairHighlights,
    clearPairHighlightsForSide,
    updatePairHighlightsForSide,
    schedulePairHighlightSyncForSide,
  } = useDiffEditorPairHighlight({
    lineDiff,
    sourcePairHighlightEnabled,
    targetPairHighlightEnabled,
  });

  const jumpToPanelAlignedRow = useCallback(
    (side: ActivePanel, rowIndex: number) => {
      const snapshot = lineDiffRef.current;
      const lines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const textarea = side === 'source'
        ? sourceTextareaRef.current
        : targetTextareaRef.current;
      const scroller = side === 'source'
        ? sourceScroller
        : targetScroller;
      const safeRowIndex = Math.max(0, Math.min(rowIndex, Math.max(0, lines.length - 1)));
      const { start, end } = getLineSelectionRange(lines, safeRowIndex);

      if (textarea) {
        const valueLength = textarea.value.length;
        const safeStart = Math.max(0, Math.min(start, valueLength));
        const safeEnd = Math.max(safeStart, Math.min(end, valueLength));
        textarea.setSelectionRange(safeStart, safeEnd);
      }

      if (scroller) {
        const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const centeredScrollTop = safeRowIndex * rowHeightPx - Math.max(0, (scroller.clientHeight - rowHeightPx) / 2);
        scroller.scrollTop = Math.max(0, Math.min(maxScrollTop, centeredScrollTop));
      }

      setActivePanel(side);
    },
    [lineDiffRef, rowHeightPx, setActivePanel, sourceScroller, sourceTextareaRef, targetScroller, targetTextareaRef]
  );

  const resolvePanelCurrentRow = useCallback(
    (side: ActivePanel) => {
      const textarea = side === 'source'
        ? sourceTextareaRef.current
        : targetTextareaRef.current;
      if (!textarea) {
        return null;
      }

      const value = textarea.value ?? '';
      const selectionStart = textarea.selectionStart ?? 0;
      return getLineIndexFromTextOffset(value, selectionStart);
    },
    [sourceTextareaRef, targetTextareaRef]
  );

  const jumpPanelDiffRow = useCallback(
    (side: ActivePanel, direction: 'next' | 'prev') => {
      const currentRow = resolvePanelCurrentRow(side);
      const nextRow = getNextMatchedRowFromAnchor(diffRowIndexes, currentRow, direction);
      if (nextRow === null) {
        return;
      }

      jumpToPanelAlignedRow(side, nextRow);
    },
    [diffRowIndexes, jumpToPanelAlignedRow, resolvePanelCurrentRow]
  );

  const jumpSourceDiffRow = useCallback(
    (direction: 'next' | 'prev') => {
      jumpPanelDiffRow('source', direction);
    },
    [jumpPanelDiffRow]
  );
  const jumpTargetDiffRow = useCallback(
    (direction: 'next' | 'prev') => {
      jumpPanelDiffRow('target', direction);
    },
    [jumpPanelDiffRow]
  );

  const jumpSourceSearchMatch = useCallback(
    (direction: 'next' | 'prev') => {
      const nextRow = getNextMatchedRow(sourceSearchMatchedRows, sourceSearchMatchedRow, direction);
      if (nextRow === null) {
        return;
      }

      setSourceSearchMatchedRow(nextRow);
      jumpToPanelAlignedRow('source', nextRow);
    },
    [jumpToPanelAlignedRow, setSourceSearchMatchedRow, sourceSearchMatchedRow, sourceSearchMatchedRows]
  );
  const jumpTargetSearchMatch = useCallback(
    (direction: 'next' | 'prev') => {
      const nextRow = getNextMatchedRow(targetSearchMatchedRows, targetSearchMatchedRow, direction);
      if (nextRow === null) {
        return;
      }

      setTargetSearchMatchedRow(nextRow);
      jumpToPanelAlignedRow('target', nextRow);
    },
    [jumpToPanelAlignedRow, setTargetSearchMatchedRow, targetSearchMatchedRow, targetSearchMatchedRows]
  );

  const sourceDiffJumpDisabled = diffRowIndexes.length === 0 || !sourceTabExists;
  const targetDiffJumpDisabled = diffRowIndexes.length === 0 || !targetTabExists;
  const lineNumberColumnWidth = Math.max(
    44,
    String(Math.max(lineDiff.sourceLineCount, lineDiff.targetLineCount, 1)).length * 10 + 16
  );

  const sourceContentWidthPx = useMemo(() => {
    const longest = lineDiff.alignedSourceLines.reduce((maxLength, lineText) => {
      return Math.max(maxLength, (lineText ?? '').length);
    }, 1);
    return Math.max(
      leftWidthPx,
      Math.ceil(longest * Math.max(fontSize, 12) * 0.62) + lineNumberColumnWidth + 24
    );
  }, [fontSize, leftWidthPx, lineDiff.alignedSourceLines, lineNumberColumnWidth]);
  const targetContentWidthPx = useMemo(() => {
    const longest = lineDiff.alignedTargetLines.reduce((maxLength, lineText) => {
      return Math.max(maxLength, (lineText ?? '').length);
    }, 1);
    return Math.max(
      rightWidthPx,
      Math.ceil(longest * Math.max(fontSize, 12) * 0.62) + lineNumberColumnWidth + 24
    );
  }, [fontSize, lineDiff.alignedTargetLines, lineNumberColumnWidth, rightWidthPx]);

  const activeViewport = activePanel === 'source' ? sourceViewport : targetViewport;
  const shadowTopPercent = clampPercent(activeViewport.topPercent);
  const shadowHeightPercent = Math.max(1, clampPercent(activeViewport.heightPercent));
  const shadowBottomPercent = Math.min(100, shadowTopPercent + shadowHeightPercent);

  const sourcePanelText = useMemo(
    () => lineDiff.alignedSourceLines.join('\n'),
    [lineDiff.alignedSourceLines]
  );
  const targetPanelText = useMemo(
    () => lineDiff.alignedTargetLines.join('\n'),
    [lineDiff.alignedTargetLines]
  );
  const sourcePanelHeightPx = Math.max(1, alignedLineCount * rowHeightPx);
  const targetPanelHeightPx = Math.max(1, alignedLineCount * rowHeightPx);
  const sourcePairHighlightRows = useMemo(
    () => buildPairHighlightRows(sourcePairHighlights as PairHighlightPosition[], lineDiff.alignedSourceLines),
    [lineDiff.alignedSourceLines, sourcePairHighlights]
  );
  const targetPairHighlightRows = useMemo(
    () => buildPairHighlightRows(targetPairHighlights as PairHighlightPosition[], lineDiff.alignedTargetLines),
    [lineDiff.alignedTargetLines, targetPairHighlights]
  );

  return {
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
    sourcePairHighlights,
    targetPairHighlights,
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
  };
}
