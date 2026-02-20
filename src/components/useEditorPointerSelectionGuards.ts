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
  const setPointerSelectionNativeHighlightMode = useCallback((enabled: boolean) => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    if (enabled) {
      element.style.setProperty('--editor-native-selection-bg', 'hsl(217 91% 60% / 0.28)');
      return;
    }

    element.style.removeProperty('--editor-native-selection-bg');
  }, [contentRef]);

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

  const clearPointerSelectionNativeHighlightMode = useCallback(() => {
    setPointerSelectionNativeHighlightMode(false);
  }, [setPointerSelectionNativeHighlightMode]);

  const finalizePointerSelectionInteraction = useCallback(() => {
    const wasPointerSelectionActive = pointerSelectionActiveRef.current;
    pointerSelectionActiveRef.current = false;
    return wasPointerSelectionActive;
  }, [pointerSelectionActiveRef]);

  return {
    setPointerSelectionNativeHighlightMode,
    clearPointerSelectionNativeHighlightMode,
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
  };
}
