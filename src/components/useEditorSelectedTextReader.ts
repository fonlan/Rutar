import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorSelectedTextReaderParams {
  contentRef: MutableRefObject<any>;
  normalizedRectangularSelection: {
    width: number;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    lineCount: number;
  } | null;
  getRectangularSelectionText: (text: string) => string;
  normalizeSegmentText: (text: string) => string;
  normalizeLineText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
}

export function useEditorSelectedTextReader({
  contentRef,
  normalizedRectangularSelection,
  getRectangularSelectionText,
  normalizeSegmentText,
  normalizeLineText,
  getEditableText,
  isTextareaInputElement,
}: UseEditorSelectedTextReaderParams) {
  const getSelectedEditorText = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return '';
    }

    if (normalizedRectangularSelection) {
      const text = normalizeSegmentText(getEditableText(element));
      return getRectangularSelectionText(text);
    }

    if (isTextareaInputElement(element)) {
      const start = Math.max(0, Math.min(element.selectionStart ?? 0, element.value.length));
      const end = Math.max(0, Math.min(element.selectionEnd ?? start, element.value.length));
      if (end <= start) {
        return '';
      }

      return normalizeLineText(element.value.slice(start, end));
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return '';
    }

    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) {
      return '';
    }

    return normalizeLineText(selection.toString());
  }, [
    contentRef,
    getEditableText,
    getRectangularSelectionText,
    isTextareaInputElement,
    normalizeLineText,
    normalizeSegmentText,
    normalizedRectangularSelection,
  ]);

  return {
    getSelectedEditorText,
  };
}
