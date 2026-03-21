import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorPointerSelectionGuardsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  isScrollbarDragRef: MutableRefObject<boolean>;
  pointerSelectionActiveRef: MutableRefObject<boolean>;
}

export function useEditorPointerSelectionGuards({
  contentRef,
  isScrollbarDragRef,
  pointerSelectionActiveRef,
}: UseEditorPointerSelectionGuardsParams) {
  const clearPointerSelectionNativeHighlightMode = useCallback(() => {}, []);

  const endScrollbarDragSelectionGuard = useCallback(() => {
    if (!isScrollbarDragRef.current) {
      return;
    }

    isScrollbarDragRef.current = false;

    if (contentRef.current) {
      contentRef.current.style.userSelect = 'text';
      contentRef.current.style.webkitUserSelect = 'text';
    }
  }, [contentRef, isScrollbarDragRef]);

  const finalizePointerSelectionInteraction = useCallback(() => {
    const wasPointerSelectionActive = pointerSelectionActiveRef.current;
    pointerSelectionActiveRef.current = false;
    return wasPointerSelectionActive;
  }, [pointerSelectionActiveRef]);

  return {
    clearPointerSelectionNativeHighlightMode,
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
  };
}
