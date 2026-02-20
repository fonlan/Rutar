import { useCallback, useRef } from 'react';
import type { LineDiffComparisonResult } from './diffEditor.types';
import {
  buildLineNumberByAlignedRow,
  getLineIndexFromTextOffset,
  type CaretSnapshot,
  type PanelScrollSnapshot,
} from './diffEditor.utils';

interface UseDiffEditorSnapshotStateParams {
  lineDiff: LineDiffComparisonResult;
  sourceScroller: HTMLElement | null;
  targetScroller: HTMLElement | null;
}

export function useDiffEditorSnapshotState({
  lineDiff,
  sourceScroller,
  targetScroller,
}: UseDiffEditorSnapshotStateParams) {
  const lineDiffRef = useRef(lineDiff);
  const pendingScrollRestoreRef = useRef<PanelScrollSnapshot | null>(null);
  const pendingCaretRestoreRef = useRef<CaretSnapshot | null>(null);
  const lastEditAtRef = useRef(0);
  const copyLinesRequestSequenceRef = useRef(0);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const targetTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  }, [lineDiffRef]);

  return {
    lineDiffRef,
    pendingScrollRestoreRef,
    pendingCaretRestoreRef,
    lastEditAtRef,
    copyLinesRequestSequenceRef,
    sourceTextareaRef,
    targetTextareaRef,
    capturePanelScrollSnapshot,
    captureFocusedCaretSnapshot,
  };
}
