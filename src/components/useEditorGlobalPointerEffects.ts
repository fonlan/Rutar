import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { TextDragMoveState } from './Editor.types';

type ScrollElement = HTMLDivElement | HTMLTextAreaElement;

interface UseEditorGlobalPointerEffectsParams {
  rectangularAutoScrollEdgePx: number;
  rectangularAutoScrollMaxStepPx: number;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  textDragMoveStateRef: MutableRefObject<TextDragMoveState | null>;
  textDragCursorAppliedRef: MutableRefObject<boolean>;
  rectangularSelectionPointerActiveRef: MutableRefObject<boolean>;
  rectangularSelectionLastClientPointRef: MutableRefObject<{ x: number; y: number } | null>;
  rectangularSelectionAutoScrollDirectionRef: MutableRefObject<-1 | 0 | 1>;
  rectangularSelectionAutoScrollRafRef: MutableRefObject<number | null>;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
  resolveDropOffsetFromPointer: (element: HTMLTextAreaElement, clientX: number, clientY: number) => number;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  getRectangularSelectionScrollElement: () => ScrollElement | null;
  updateRectangularSelectionFromPoint: (clientX: number, clientY: number) => boolean;
  applyTextDragMove: (element: HTMLTextAreaElement, state: TextDragMoveState) => boolean;
  alignScrollOffset: (offset: number) => number;
  handleScroll: () => void;
}

export function useEditorGlobalPointerEffects({
  rectangularAutoScrollEdgePx,
  rectangularAutoScrollMaxStepPx,
  contentRef,
  textDragMoveStateRef,
  textDragCursorAppliedRef,
  rectangularSelectionPointerActiveRef,
  rectangularSelectionLastClientPointRef,
  rectangularSelectionAutoScrollDirectionRef,
  rectangularSelectionAutoScrollRafRef,
  isTextareaInputElement,
  resolveDropOffsetFromPointer,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  getRectangularSelectionScrollElement,
  updateRectangularSelectionFromPoint,
  applyTextDragMove,
  alignScrollOffset,
  handleScroll,
}: UseEditorGlobalPointerEffectsParams) {
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const textDragState = textDragMoveStateRef.current;
      if (textDragState && event.pointerId === textDragState.pointerId) {
        const element = contentRef.current;
        if (element && isTextareaInputElement(element)) {
          const deltaX = event.clientX - textDragState.startClientX;
          const deltaY = event.clientY - textDragState.startClientY;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared >= 16) {
            textDragState.dragging = true;
            if (!textDragCursorAppliedRef.current) {
              document.body.style.cursor = 'copy';
              element.style.cursor = 'copy';
              textDragCursorAppliedRef.current = true;
            }
          }

          if (textDragState.dragging) {
            const dropOffset = resolveDropOffsetFromPointer(element, event.clientX, event.clientY);
            textDragState.dropOffset = dropOffset;

            const layerOffset = mapLogicalOffsetToInputLayerOffset(element.value, dropOffset);
            setCaretToCodeUnitOffset(element, layerOffset);
            event.preventDefault();
          }
        }
      }

      if (!rectangularSelectionPointerActiveRef.current) {
        return;
      }

      const clientX = event.clientX;
      const clientY = event.clientY;
      const element = contentRef.current;
      if (!isTextareaInputElement(element)) {
        event.preventDefault();
      }

      rectangularSelectionLastClientPointRef.current = { x: clientX, y: clientY };

      const scrollElement = getRectangularSelectionScrollElement();
      if (scrollElement) {
        const rect = scrollElement.getBoundingClientRect();
        if (event.clientY <= rect.top + rectangularAutoScrollEdgePx) {
          rectangularSelectionAutoScrollDirectionRef.current = -1;
        } else if (event.clientY >= rect.bottom - rectangularAutoScrollEdgePx) {
          rectangularSelectionAutoScrollDirectionRef.current = 1;
        } else {
          rectangularSelectionAutoScrollDirectionRef.current = 0;
        }
      }

      if (isTextareaInputElement(element)) {
        window.requestAnimationFrame(() => {
          if (!rectangularSelectionPointerActiveRef.current) {
            return;
          }
          updateRectangularSelectionFromPoint(clientX, clientY);
        });
      } else {
        updateRectangularSelectionFromPoint(clientX, clientY);
      }

      if (
        rectangularSelectionAutoScrollDirectionRef.current !== 0
        && rectangularSelectionAutoScrollRafRef.current === null
      ) {
        const step = () => {
          if (!rectangularSelectionPointerActiveRef.current) {
            rectangularSelectionAutoScrollRafRef.current = null;
            return;
          }

          const direction = rectangularSelectionAutoScrollDirectionRef.current;
          const point = rectangularSelectionLastClientPointRef.current;
          const currentScrollElement = getRectangularSelectionScrollElement();

          if (direction !== 0 && point && currentScrollElement) {
            const before = currentScrollElement.scrollTop;
            const rect = currentScrollElement.getBoundingClientRect();
            const distance = direction < 0
              ? Math.max(0, (rect.top + rectangularAutoScrollEdgePx) - point.y)
              : Math.max(0, point.y - (rect.bottom - rectangularAutoScrollEdgePx));
            const ratio = Math.min(1, distance / rectangularAutoScrollEdgePx);
            const delta = Math.max(1, Math.round(rectangularAutoScrollMaxStepPx * ratio)) * direction;

            currentScrollElement.scrollTop = alignScrollOffset(before + delta);
            handleScroll();

            if (Math.abs(currentScrollElement.scrollTop - before) > 0.001) {
              updateRectangularSelectionFromPoint(point.x, point.y);
            }
          }

          if (
            rectangularSelectionPointerActiveRef.current
            && rectangularSelectionAutoScrollDirectionRef.current !== 0
          ) {
            rectangularSelectionAutoScrollRafRef.current = window.requestAnimationFrame(step);
          } else {
            rectangularSelectionAutoScrollRafRef.current = null;
          }
        };

        rectangularSelectionAutoScrollRafRef.current = window.requestAnimationFrame(step);
      }
    };

    const handlePointerUp = () => {
      const textDragState = textDragMoveStateRef.current;
      if (textDragState) {
        const element = contentRef.current;
        if (element && isTextareaInputElement(element)) {
          applyTextDragMove(element, textDragState);
        }
        textDragMoveStateRef.current = null;
      }

      if (textDragCursorAppliedRef.current) {
        document.body.style.removeProperty('cursor');
        const element = contentRef.current;
        if (element) {
          element.style.removeProperty('cursor');
        }
        textDragCursorAppliedRef.current = false;
      }

      rectangularSelectionPointerActiveRef.current = false;
      rectangularSelectionLastClientPointRef.current = null;
      rectangularSelectionAutoScrollDirectionRef.current = 0;
      if (rectangularSelectionAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
        rectangularSelectionAutoScrollRafRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);

      if (rectangularSelectionAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
        rectangularSelectionAutoScrollRafRef.current = null;
      }

      if (textDragCursorAppliedRef.current) {
        document.body.style.removeProperty('cursor');
        const element = contentRef.current;
        if (element) {
          element.style.removeProperty('cursor');
        }
        textDragCursorAppliedRef.current = false;
      }
    };
  }, [
    alignScrollOffset,
    applyTextDragMove,
    contentRef,
    getRectangularSelectionScrollElement,
    handleScroll,
    isTextareaInputElement,
    mapLogicalOffsetToInputLayerOffset,
    rectangularAutoScrollEdgePx,
    rectangularAutoScrollMaxStepPx,
    rectangularSelectionAutoScrollDirectionRef,
    rectangularSelectionAutoScrollRafRef,
    rectangularSelectionLastClientPointRef,
    rectangularSelectionPointerActiveRef,
    resolveDropOffsetFromPointer,
    setCaretToCodeUnitOffset,
    textDragCursorAppliedRef,
    textDragMoveStateRef,
    updateRectangularSelectionFromPoint,
  ]);
}
