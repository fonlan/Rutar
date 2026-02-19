import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { RectangularSelectionState, VerticalSelectionState } from './Editor.types';

interface UseEditorSelectionInteractionActionsParams {
  verticalSelectionRef: MutableRefObject<VerticalSelectionState | null>;
  rectangularSelectionRef: MutableRefObject<RectangularSelectionState | null>;
  rectangularSelectionPointerActiveRef: MutableRefObject<boolean>;
  rectangularSelectionLastClientPointRef: MutableRefObject<{ x: number; y: number } | null>;
  rectangularSelectionAutoScrollDirectionRef: MutableRefObject<-1 | 0 | 1>;
  rectangularSelectionAutoScrollRafRef: MutableRefObject<number | null>;
  setRectangularSelection: (selection: RectangularSelectionState | null) => void;
  handleScroll: () => void;
  syncSelectionState: () => void;
}

export function useEditorSelectionInteractionActions({
  verticalSelectionRef,
  rectangularSelectionRef,
  rectangularSelectionPointerActiveRef,
  rectangularSelectionLastClientPointRef,
  rectangularSelectionAutoScrollDirectionRef,
  rectangularSelectionAutoScrollRafRef,
  setRectangularSelection,
  handleScroll,
  syncSelectionState,
}: UseEditorSelectionInteractionActionsParams) {
  const clearVerticalSelectionState = useCallback(() => {
    verticalSelectionRef.current = null;
  }, [verticalSelectionRef]);

  const clearRectangularSelection = useCallback(() => {
    rectangularSelectionPointerActiveRef.current = false;
    rectangularSelectionRef.current = null;
    rectangularSelectionLastClientPointRef.current = null;
    rectangularSelectionAutoScrollDirectionRef.current = 0;
    if (rectangularSelectionAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
      rectangularSelectionAutoScrollRafRef.current = null;
    }
    setRectangularSelection(null);
  }, [
    rectangularSelectionAutoScrollDirectionRef,
    rectangularSelectionAutoScrollRafRef,
    rectangularSelectionLastClientPointRef,
    rectangularSelectionPointerActiveRef,
    rectangularSelectionRef,
    setRectangularSelection,
  ]);

  const syncSelectionAfterInteraction = useCallback(() => {
    window.requestAnimationFrame(() => {
      handleScroll();
      syncSelectionState();

      window.requestAnimationFrame(() => {
        handleScroll();
      });
    });
  }, [handleScroll, syncSelectionState]);

  return {
    clearVerticalSelectionState,
    clearRectangularSelection,
    syncSelectionAfterInteraction,
  };
}
