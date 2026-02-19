import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { RectangularSelectionState, TextSelectionState } from './Editor.types';

interface UseEditorTextSelectionHighlightSyncParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  rectangularSelectionRef: MutableRefObject<RectangularSelectionState | null>;
  normalizedRectangularSelection: {
    width: number;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    lineCount: number;
  } | null;
  setTextSelectionHighlight: (
    updater:
      | TextSelectionState
      | null
      | ((prev: TextSelectionState | null) => TextSelectionState | null)
  ) => void;
  getSelectionOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { start: number; end: number; isCollapsed: boolean } | null;
}

export function useEditorTextSelectionHighlightSync({
  contentRef,
  rectangularSelectionRef,
  normalizedRectangularSelection,
  setTextSelectionHighlight,
  getSelectionOffsetsInElement,
}: UseEditorTextSelectionHighlightSyncParams) {
  const syncTextSelectionHighlight = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      setTextSelectionHighlight(null);
      return;
    }

    if (rectangularSelectionRef.current) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const offsets = getSelectionOffsetsInElement(element);
    if (!offsets || offsets.isCollapsed) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const start = Math.min(offsets.start, offsets.end);
    const end = Math.max(offsets.start, offsets.end);

    setTextSelectionHighlight((prev) => {
      if (prev && prev.start === start && prev.end === end) {
        return prev;
      }

      return { start, end };
    });
  }, [contentRef, getSelectionOffsetsInElement, rectangularSelectionRef, setTextSelectionHighlight]);

  useEffect(() => {
    if (!normalizedRectangularSelection) {
      return;
    }

    setTextSelectionHighlight((prev) => (prev === null ? prev : null));
  }, [normalizedRectangularSelection, setTextSelectionHighlight]);

  return {
    syncTextSelectionHighlight,
  };
}
