import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorSelectionPresenceParams {
  contentRef: MutableRefObject<any>;
  lineNumberMultiSelectionCount: number;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
}

export function useEditorSelectionPresence({
  contentRef,
  lineNumberMultiSelectionCount,
  isTextareaInputElement,
}: UseEditorSelectionPresenceParams) {
  const hasSelectionInsideEditor = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    if (lineNumberMultiSelectionCount > 0) {
      return true;
    }

    if (isTextareaInputElement(element)) {
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? 0;
      return end > start;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    const range = selection.getRangeAt(0);
    return element.contains(range.commonAncestorContainer) && selection.toString().length > 0;
  }, [contentRef, isTextareaInputElement, lineNumberMultiSelectionCount]);

  return {
    hasSelectionInsideEditor,
  };
}
