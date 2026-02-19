import { useCallback } from 'react';
import type { TextDragMoveState } from './Editor.types';

interface UseEditorTextDragMoveActionParams {
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  dispatchEditorInputEvent: (element: HTMLTextAreaElement) => void;
  syncSelectionAfterInteraction: () => void;
}

export function useEditorTextDragMoveAction({
  setInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  dispatchEditorInputEvent,
  syncSelectionAfterInteraction,
}: UseEditorTextDragMoveActionParams) {
  const applyTextDragMove = useCallback(
    (element: HTMLTextAreaElement, state: TextDragMoveState) => {
      if (!state.dragging) {
        return false;
      }

      const sourceStart = state.sourceStart;
      const sourceEnd = state.sourceEnd;
      const baseText = state.baseText;
      if (sourceStart < 0 || sourceEnd <= sourceStart || sourceEnd > baseText.length) {
        return false;
      }

      let dropOffset = Math.max(0, Math.min(baseText.length, state.dropOffset));
      if (dropOffset >= sourceStart && dropOffset <= sourceEnd) {
        return false;
      }

      const sourceText = baseText.slice(sourceStart, sourceEnd);
      const textWithoutSource = `${baseText.slice(0, sourceStart)}${baseText.slice(sourceEnd)}`;

      let adjustedDropOffset = dropOffset;
      if (dropOffset > sourceEnd) {
        adjustedDropOffset -= sourceText.length;
      }

      adjustedDropOffset = Math.max(0, Math.min(textWithoutSource.length, adjustedDropOffset));
      const nextText = `${textWithoutSource.slice(0, adjustedDropOffset)}${sourceText}${textWithoutSource.slice(adjustedDropOffset)}`;
      if (nextText === baseText) {
        return false;
      }

      setInputLayerText(element, nextText);
      const caretLogicalOffset = adjustedDropOffset + sourceText.length;
      const caretLayerOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, caretLayerOffset);
      dispatchEditorInputEvent(element);
      syncSelectionAfterInteraction();
      return true;
    },
    [
      dispatchEditorInputEvent,
      mapLogicalOffsetToInputLayerOffset,
      setCaretToCodeUnitOffset,
      setInputLayerText,
      syncSelectionAfterInteraction,
    ]
  );

  return {
    applyTextDragMove,
  };
}
