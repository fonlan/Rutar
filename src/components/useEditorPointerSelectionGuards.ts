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

  const finalizePointerSelectionInteraction = useCallback(() => {
    pointerSelectionActiveRef.current = false;
    setPointerSelectionNativeHighlightMode(false);
  }, [pointerSelectionActiveRef, setPointerSelectionNativeHighlightMode]);

  return {
    setPointerSelectionNativeHighlightMode,
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
  };
}
