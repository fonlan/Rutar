import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorInputElement } from './Editor.types';

interface UseEditorClipboardSelectionEffectsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  normalizedRectangularSelection: unknown;
  lineNumberMultiSelection: number[];
  normalizeSegmentText: (value: string) => string;
  getEditableText: (element: EditorInputElement) => string;
  buildLineNumberSelectionRangeText: (text: string, lineNumbers: number[]) => string;
  getRectangularSelectionText: (text: string) => string;
  applyLineNumberMultiSelectionEdit: (mode: 'cut') => Promise<boolean>;
  replaceRectangularSelection: (replacement: string) => Promise<boolean>;
}

export function useEditorClipboardSelectionEffects({
  contentRef,
  normalizedRectangularSelection,
  lineNumberMultiSelection,
  normalizeSegmentText,
  getEditableText,
  buildLineNumberSelectionRangeText,
  getRectangularSelectionText,
  applyLineNumberMultiSelectionEdit,
  replaceRectangularSelection,
}: UseEditorClipboardSelectionEffectsParams) {
  useEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const handleCopyLike = (event: ClipboardEvent, cut: boolean) => {
      if (!normalizedRectangularSelection) {
        if (lineNumberMultiSelection.length > 0) {
          const text = normalizeSegmentText(getEditableText(element));
          const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
          if (!selected) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.clipboardData?.setData('text/plain', selected);

          if (cut) {
            void applyLineNumberMultiSelectionEdit('cut');
          }
        }
        return;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const rectangularText = getRectangularSelectionText(text);

      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData('text/plain', rectangularText);

      if (cut) {
        void replaceRectangularSelection('');
      }
    };

    const handleCopy = (event: ClipboardEvent) => {
      handleCopyLike(event, false);
    };

    const handleCut = (event: ClipboardEvent) => {
      handleCopyLike(event, true);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!normalizedRectangularSelection) {
        return;
      }

      const pasted = event.clipboardData?.getData('text/plain') ?? '';
      event.preventDefault();
      event.stopPropagation();
      void replaceRectangularSelection(pasted);
    };

    element.addEventListener('copy', handleCopy);
    element.addEventListener('cut', handleCut);
    element.addEventListener('paste', handlePaste);

    return () => {
      element.removeEventListener('copy', handleCopy);
      element.removeEventListener('cut', handleCut);
      element.removeEventListener('paste', handlePaste);
    };
  }, [
    applyLineNumberMultiSelectionEdit,
    buildLineNumberSelectionRangeText,
    contentRef,
    getEditableText,
    getRectangularSelectionText,
    lineNumberMultiSelection,
    normalizeSegmentText,
    normalizedRectangularSelection,
    replaceRectangularSelection,
  ]);
}
