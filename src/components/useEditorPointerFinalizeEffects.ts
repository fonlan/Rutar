import { useEffect } from 'react';

interface UseEditorPointerFinalizeEffectsParams {
  endScrollbarDragSelectionGuard: () => void;
  finalizePointerSelectionInteraction: () => boolean;
  clearPointerSelectionNativeHighlightMode: () => void;
  syncSelectionAfterInteraction: () => void;
  syncTextSelectionHighlight: () => void;
}

export function useEditorPointerFinalizeEffects({
  endScrollbarDragSelectionGuard,
  finalizePointerSelectionInteraction,
  clearPointerSelectionNativeHighlightMode,
  syncSelectionAfterInteraction,
  syncTextSelectionHighlight,
}: UseEditorPointerFinalizeEffectsParams) {
  useEffect(() => {
    window.addEventListener('pointerup', endScrollbarDragSelectionGuard);
    window.addEventListener('pointercancel', endScrollbarDragSelectionGuard);
    window.addEventListener('blur', endScrollbarDragSelectionGuard);

    return () => {
      window.removeEventListener('pointerup', endScrollbarDragSelectionGuard);
      window.removeEventListener('pointercancel', endScrollbarDragSelectionGuard);
      window.removeEventListener('blur', endScrollbarDragSelectionGuard);
    };
  }, [endScrollbarDragSelectionGuard]);

  useEffect(() => {
    const handleFinalizePointerSelection = () => {
      const hadPointerSelection = finalizePointerSelectionInteraction();
      if (!hadPointerSelection) {
        clearPointerSelectionNativeHighlightMode();
        return;
      }
      syncSelectionAfterInteraction();
      window.requestAnimationFrame(() => {
        syncTextSelectionHighlight();
        window.requestAnimationFrame(() => {
          clearPointerSelectionNativeHighlightMode();
        });
      });
    };

    window.addEventListener('pointerup', handleFinalizePointerSelection);
    window.addEventListener('pointercancel', handleFinalizePointerSelection);
    window.addEventListener('blur', handleFinalizePointerSelection);

    return () => {
      window.removeEventListener('pointerup', handleFinalizePointerSelection);
      window.removeEventListener('pointercancel', handleFinalizePointerSelection);
      window.removeEventListener('blur', handleFinalizePointerSelection);
    };
  }, [
    clearPointerSelectionNativeHighlightMode,
    finalizePointerSelectionInteraction,
    syncSelectionAfterInteraction,
    syncTextSelectionHighlight,
  ]);
}
