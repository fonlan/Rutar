import { useCallback } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';

interface UseEditorKeyboardActionsParams {
  contentRef: MutableRefObject<any>;
  rectangularSelectionRef: MutableRefObject<unknown>;
  lineNumberMultiSelection: number[];
  normalizedRectangularSelection: unknown;
  replaceRectangularSelection: (insertText: string) => Promise<boolean>;
  isVerticalSelectionShortcut: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  beginRectangularSelectionFromCaret: () => void;
  nudgeRectangularSelectionByKey: (direction: 'up' | 'down' | 'left' | 'right') => Promise<unknown>;
  clearVerticalSelectionState: () => void;
  isToggleLineCommentShortcut: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  toggleSelectedLinesComment: (event: KeyboardEvent<HTMLDivElement>) => Promise<void>;
  applyLineNumberMultiSelectionEdit: (mode: 'cut' | 'delete') => Promise<boolean>;
  buildLineNumberSelectionRangeText: (text: string, selectedLines: number[]) => string;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: any) => string;
  getSelectionOffsetsInElement: (
    element: any
  ) => { start: number; end: number; isCollapsed: boolean } | null;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
  setInputLayerText: (element: any, text: string) => void;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: any, offset: number) => void;
  clearRectangularSelection: () => void;
  clearLineNumberMultiSelection: () => void;
  handleInput: () => void;
}

export function useEditorKeyboardActions({
  contentRef,
  rectangularSelectionRef,
  lineNumberMultiSelection,
  normalizedRectangularSelection,
  replaceRectangularSelection,
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
  getSelectionOffsetsInElement,
  isTextareaInputElement,
  setInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  clearRectangularSelection,
  clearLineNumberMultiSelection,
  handleInput,
}: UseEditorKeyboardActionsParams) {
  const handleRectangularSelectionInputByKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!normalizedRectangularSelection || event.nativeEvent.isComposing) {
        return false;
      }

      const key = event.key;
      const lower = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === 'c' || lower === 'x' || lower === 'v') {
          return false;
        }

        if (lower === 'a') {
          event.preventDefault();
          event.stopPropagation();
          clearRectangularSelection();
          return true;
        }

        return false;
      }

      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearRectangularSelection();
        return true;
      }

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection('');
        return true;
      }

      if (key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection('\t');
        return true;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection(key);
        return true;
      }

      return false;
    },
    [clearRectangularSelection, normalizedRectangularSelection, replaceRectangularSelection]
  );

  const insertTextAtSelection = useCallback((text: string) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets) {
      return false;
    }

    if (isTextareaInputElement(element)) {
      const start = selectionOffsets.start;
      const end = selectionOffsets.end;
      const nextText = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
      element.setRangeText(text, start, end, 'end');
      if (element.value !== nextText) {
        element.value = nextText;
      }
      return true;
    }

    const currentText = getEditableText(element);
    const nextText = `${currentText.slice(0, selectionOffsets.start)}${text}${currentText.slice(selectionOffsets.end)}`;
    setInputLayerText(element, nextText);
    const logicalNextOffset = selectionOffsets.start + text.length;
    const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
    setCaretToCodeUnitOffset(element, layerNextOffset);
    return true;
  }, [
    contentRef,
    getEditableText,
    getSelectionOffsetsInElement,
    isTextareaInputElement,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    setInputLayerText,
  ]);

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
      getSelectionOffsetsInElement,
      handleInput,
      handleRectangularSelectionInputByKey,
      insertTextAtSelection,
      isTextareaInputElement,
      isToggleLineCommentShortcut,
      isVerticalSelectionShortcut,
      lineNumberMultiSelection,
      mapLogicalOffsetToInputLayerOffset,
      normalizedRectangularSelection,
      normalizeSegmentText,
      nudgeRectangularSelectionByKey,
      rectangularSelectionRef,
      replaceRectangularSelection,
      setCaretToCodeUnitOffset,
      setInputLayerText,
      toggleSelectedLinesComment,
    ]
  );

  return {
    handleEditableKeyDown,
  };
}
