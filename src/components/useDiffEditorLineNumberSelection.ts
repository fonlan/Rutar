import { useCallback } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';

interface UseDiffEditorLineNumberSelectionParams {
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  setActivePanel: (side: ActivePanel) => void;
  getLineSelectionRange: (lines: string[], rowIndex: number) => { start: number; end: number };
}

export function useDiffEditorLineNumberSelection({
  sourceTextareaRef,
  targetTextareaRef,
  lineDiffRef,
  setActivePanel,
  getLineSelectionRange,
}: UseDiffEditorLineNumberSelectionParams) {
  const activateLineNumberSelection = useCallback(
    (side: ActivePanel, rowIndex: number) => {
      const snapshot = lineDiffRef.current;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      if (!present[rowIndex]) {
        return;
      }

      const textarea = side === 'source'
        ? sourceTextareaRef.current
        : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      const lines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const { start, end } = getLineSelectionRange(lines, rowIndex);

      setActivePanel(side);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
    },
    [getLineSelectionRange, lineDiffRef, setActivePanel, sourceTextareaRef, targetTextareaRef]
  );

  const handleLineNumberPointerDown = useCallback(
    (side: ActivePanel, rowIndex: number, event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      activateLineNumberSelection(side, rowIndex);
    },
    [activateLineNumberSelection]
  );

  const handleLineNumberKeyDown = useCallback(
    (side: ActivePanel, rowIndex: number, event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      activateLineNumberSelection(side, rowIndex);
    },
    [activateLineNumberSelection]
  );

  return {
    activateLineNumberSelection,
    handleLineNumberPointerDown,
    handleLineNumberKeyDown,
  };
}
