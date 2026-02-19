import { useEffect } from 'react';

interface UseEditorPointerFinalizeEffectsParams {
  endScrollbarDragSelectionGuard: () => void;
  finalizePointerSelectionInteraction: () => void;
}

export function useEditorPointerFinalizeEffects({
  endScrollbarDragSelectionGuard,
  finalizePointerSelectionInteraction,
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
    window.addEventListener('pointerup', finalizePointerSelectionInteraction);
    window.addEventListener('pointercancel', finalizePointerSelectionInteraction);
    window.addEventListener('blur', finalizePointerSelectionInteraction);

    return () => {
      window.removeEventListener('pointerup', finalizePointerSelectionInteraction);
      window.removeEventListener('pointercancel', finalizePointerSelectionInteraction);
      window.removeEventListener('blur', finalizePointerSelectionInteraction);
    };
  }, [finalizePointerSelectionInteraction]);
}
