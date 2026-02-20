import { invoke } from '@tauri-apps/api/core';
import {
  useCallback,
  type ClipboardEvent as ReactClipboardEvent,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { FileTab } from '@/store/useStore';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';
import type { CaretSnapshot } from './diffEditor.utils';

interface ApplyAlignedDiffPanelCopyResult {
  lineDiff: LineDiffComparisonResult;
  changed: boolean;
}

interface UseDiffEditorEditActionsParams {
  sourceTab: FileTab | null;
  targetTab: FileTab | null;
  setActivePanel: (side: ActivePanel) => void;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  pendingCaretRestoreRef: MutableRefObject<CaretSnapshot | null>;
  lastEditAtRef: MutableRefObject<number>;
  copyLinesRequestSequenceRef: MutableRefObject<number>;
  setLineDiff: Dispatch<SetStateAction<LineDiffComparisonResult>>;
  capturePanelScrollSnapshot: () => void;
  applyDeferredBackendResultIfIdle: () => void;
  schedulePreviewMetadataComputation: (
    alignedSourceLines: string[],
    alignedTargetLines: string[],
    alignedSourcePresent: boolean[],
    alignedTargetPresent: boolean[]
  ) => void;
  scheduleSideCommit: (side: ActivePanel) => void;
  invalidatePreviewMetadataComputation: () => void;
  normalizeTextToLines: (text: string) => string[];
  reconcilePresenceAfterTextEdit: (oldLines: string[], oldPresent: boolean[], newLines: string[]) => boolean[];
  getLineIndexFromTextOffset: (text: string, offset: number) => number;
  shouldOffloadDiffMetadataComputation: (alignedLineCount: number) => boolean;
  buildAlignedDiffMetadata: (
    alignedSourceLines: string[],
    alignedTargetLines: string[],
    alignedSourcePresent: boolean[],
    alignedTargetPresent: boolean[]
  ) => {
    diffLineNumbers: number[];
    sourceDiffLineNumbers: number[];
    targetDiffLineNumbers: number[];
    alignedDiffKinds: Array<'insert' | 'delete' | 'modify' | null>;
    sourceLineNumbersByAlignedRow: number[];
    targetLineNumbersByAlignedRow: number[];
    diffRowIndexes: number[];
    sourceLineCount: number;
    targetLineCount: number;
    alignedLineCount: number;
  };
  buildCopyTextWithoutVirtualRows: (
    text: string,
    selectionStart: number,
    selectionEnd: number,
    present: boolean[]
  ) => string | null;
  getSelectedLineRangeByOffset: (
    text: string,
    selectionStart: number,
    selectionEnd: number
  ) => { startLine: number; endLine: number };
  normalizeLineDiffResult: (input: LineDiffComparisonResult) => LineDiffComparisonResult;
}

export function useDiffEditorEditActions({
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
  getLineIndexFromTextOffset,
  shouldOffloadDiffMetadataComputation,
  buildAlignedDiffMetadata,
  buildCopyTextWithoutVirtualRows,
  getSelectedLineRangeByOffset,
  normalizeLineDiffResult,
}: UseDiffEditorEditActionsParams) {
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
    [
      buildAlignedDiffMetadata,
      capturePanelScrollSnapshot,
      getLineIndexFromTextOffset,
      lastEditAtRef,
      lineDiffRef,
      normalizeTextToLines,
      pendingCaretRestoreRef,
      reconcilePresenceAfterTextEdit,
      schedulePreviewMetadataComputation,
      scheduleSideCommit,
      setLineDiff,
      shouldOffloadDiffMetadataComputation,
    ]
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
    [handlePanelTextareaChange, setActivePanel, sourceTextareaRef, targetTextareaRef]
  );

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
    [buildCopyTextWithoutVirtualRows, lineDiffRef]
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
      copyLinesRequestSequenceRef,
      getSelectedLineRangeByOffset,
      invalidatePreviewMetadataComputation,
      lastEditAtRef,
      lineDiffRef,
      normalizeLineDiffResult,
      scheduleSideCommit,
      setLineDiff,
      sourceTab,
      sourceTextareaRef,
      targetTab,
      targetTextareaRef,
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
    [lineDiffRef, sourceTab, sourceTextareaRef, targetTab, targetTextareaRef]
  );

  return {
    handlePanelInputBlur,
    handlePanelTextareaChange,
    handlePanelPasteText,
    handlePanelTextareaKeyDown,
    handlePanelTextareaCopy,
    handleCopyLinesToPanel,
    isCopyLinesToPanelDisabled,
  };
}
