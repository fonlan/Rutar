import { useCallback } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';

interface UseEditorKeyboardActionsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  rectangularSelectionRef: MutableRefObject<unknown>;
  lineNumberMultiSelection: number[];
  normalizedRectangularSelection: unknown;
  handleRectangularSelectionInputByKey: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  isVerticalSelectionShortcut: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  beginRectangularSelectionFromCaret: () => void;
  nudgeRectangularSelectionByKey: (direction: 'up' | 'down' | 'left' | 'right') => Promise<unknown>;
  clearVerticalSelectionState: () => void;
  isToggleLineCommentShortcut: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  toggleSelectedLinesComment: (event: KeyboardEvent<HTMLDivElement>) => Promise<void>;
  applyLineNumberMultiSelectionEdit: (mode: 'cut' | 'delete') => Promise<boolean>;
  buildLineNumberSelectionRangeText: (text: string, selectedLines: number[]) => string;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  clearRectangularSelection: () => void;
  clearLineNumberMultiSelection: () => void;
  insertTextAtSelection: (text: string) => boolean;
  handleInput: () => void;
}

export function useEditorKeyboardActions({
  contentRef,
  rectangularSelectionRef,
  lineNumberMultiSelection,
  normalizedRectangularSelection,
  handleRectangularSelectionInputByKey,
  isVerticalSelectionShortcut,
  beginRectangularSelectionFromCaret,
  nudgeRectangularSelectionByKey,
  clearVerticalSelectionState,
  isToggleLineCommentShortcut,
  toggleSelectedLinesComment,
  applyLineNumberMultiSelectionEdit,
  buildLineNumberSelectionRangeText,
  normalizeSegmentText,
  getEditableText,
  clearRectangularSelection,
  clearLineNumberMultiSelection,
  insertTextAtSelection,
  handleInput,
}: UseEditorKeyboardActionsParams) {
  const handleEditableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (handleRectangularSelectionInputByKey(event)) {
        return;
      }

      if (isVerticalSelectionShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        const direction =
          event.key === 'ArrowUp'
            ? 'up'
            : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
            ? 'left'
            : 'right';

        if (!rectangularSelectionRef.current) {
          beginRectangularSelectionFromCaret();
        }

        void nudgeRectangularSelectionByKey(direction as 'up' | 'down' | 'left' | 'right');
        return;
      }

      if (isToggleLineCommentShortcut(event)) {
        clearVerticalSelectionState();
        void toggleSelectedLinesComment(event);
        return;
      }

      if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
        if (event.key === 'Delete' && lineNumberMultiSelection.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('delete');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'x' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('cut');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'c' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          const element = contentRef.current;
          if (element) {
            const text = normalizeSegmentText(getEditableText(element));
            const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn('Failed to write line selection to clipboard.');
              });
            }
          }
          return;
        }

        if (
          normalizedRectangularSelection &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        ) {
          clearRectangularSelection();
        }
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey && event.key !== 'Shift') {
          clearLineNumberMultiSelection();
        }
        if (!event.shiftKey || event.key !== 'Shift') {
          clearVerticalSelectionState();
        }
        return;
      }

      clearVerticalSelectionState();
      clearRectangularSelection();
      clearLineNumberMultiSelection();
      event.preventDefault();
      event.stopPropagation();
      if (insertTextAtSelection('\n')) {
        handleInput();
      }
    },
    [
      applyLineNumberMultiSelectionEdit,
      beginRectangularSelectionFromCaret,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      clearVerticalSelectionState,
      contentRef,
      getEditableText,
      handleInput,
      handleRectangularSelectionInputByKey,
      insertTextAtSelection,
      isToggleLineCommentShortcut,
      isVerticalSelectionShortcut,
      lineNumberMultiSelection,
      normalizedRectangularSelection,
      normalizeSegmentText,
      nudgeRectangularSelectionByKey,
      rectangularSelectionRef,
      toggleSelectedLinesComment,
    ]
  );

  return {
    handleEditableKeyDown,
  };
}
