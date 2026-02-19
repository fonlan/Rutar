import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback } from 'react';
import type React from 'react';
import type { MutableRefObject } from 'react';
import type { RectangularSelectionState, TextDragMoveState, VerticalSelectionState } from './Editor.types';

const HYPERLINK_HOVER_HINT = 'Ctrl+左键打开';

interface UseEditorPointerInteractionsParams {
  isHugeEditableMode: boolean;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  textDragMoveStateRef: MutableRefObject<TextDragMoveState | null>;
  isScrollbarDragRef: MutableRefObject<boolean>;
  pointerSelectionActiveRef: MutableRefObject<boolean>;
  verticalSelectionRef: MutableRefObject<VerticalSelectionState | null>;
  rectangularSelectionRef: MutableRefObject<RectangularSelectionState | null>;
  rectangularSelectionPointerActiveRef: MutableRefObject<boolean>;
  rectangularSelectionLastClientPointRef: MutableRefObject<{ x: number; y: number } | null>;
  setLineNumberMultiSelection: (updater: number[] | ((prev: number[]) => number[])) => void;
  setPointerSelectionNativeHighlightMode: (enabled: boolean) => void;
  setRectangularSelection: (selection: RectangularSelectionState | null) => void;
  isPointerOnScrollbar: (element: HTMLElement, clientX: number, clientY: number) => boolean;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
  resolveDropOffsetFromPointer: (element: HTMLTextAreaElement, clientX: number, clientY: number) => number;
  getHttpUrlAtTextOffset: (text: string, offset: number) => string | null;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionOffsetsInElement: (element: HTMLTextAreaElement) => { start: number; end: number; isCollapsed: boolean } | null;
  getLogicalOffsetFromPoint: (element: HTMLTextAreaElement, clientX: number, clientY: number) => number | null;
  normalizeSegmentText: (text: string) => string;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
}

export function useEditorPointerInteractions({
  isHugeEditableMode,
  contentRef,
  scrollContainerRef,
  textDragMoveStateRef,
  isScrollbarDragRef,
  pointerSelectionActiveRef,
  verticalSelectionRef,
  rectangularSelectionRef,
  rectangularSelectionPointerActiveRef,
  rectangularSelectionLastClientPointRef,
  setLineNumberMultiSelection,
  setPointerSelectionNativeHighlightMode,
  setRectangularSelection,
  isPointerOnScrollbar,
  isTextareaInputElement,
  resolveDropOffsetFromPointer,
  getHttpUrlAtTextOffset,
  getEditableText,
  getSelectionOffsetsInElement,
  getLogicalOffsetFromPoint,
  normalizeSegmentText,
  codeUnitOffsetToLineColumn,
}: UseEditorPointerInteractionsParams) {
  const handleEditorPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const currentElement = contentRef.current;
      if (!currentElement || !isTextareaInputElement(currentElement)) {
        return;
      }

      if (isPointerOnScrollbar(currentElement, event.clientX, event.clientY)) {
        if (currentElement.style.cursor) {
          currentElement.style.cursor = '';
        }
        if (currentElement.title) {
          currentElement.title = '';
        }
        return;
      }

      const pointerLogicalOffset = resolveDropOffsetFromPointer(currentElement, event.clientX, event.clientY);
      const targetUrl = getHttpUrlAtTextOffset(currentElement.value, pointerLogicalOffset);
      const nextCursor = targetUrl ? 'pointer' : '';
      const nextTitle = targetUrl ? HYPERLINK_HOVER_HINT : '';
      if (currentElement.style.cursor !== nextCursor) {
        currentElement.style.cursor = nextCursor;
      }
      if (currentElement.title !== nextTitle) {
        currentElement.title = nextTitle;
      }
    },
    [contentRef, getHttpUrlAtTextOffset, isPointerOnScrollbar, isTextareaInputElement, resolveDropOffsetFromPointer]
  );

  const handleEditorPointerLeave = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    if (contentRef.current.style.cursor) {
      contentRef.current.style.cursor = '';
    }
    if (contentRef.current.title) {
      contentRef.current.title = '';
    }
  }, [contentRef]);

  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        setLineNumberMultiSelection((prev) => (prev.length === 0 ? prev : []));
      }
      const currentElement = contentRef.current;
      const pointerOnEditorScrollbar =
        currentElement
        && isTextareaInputElement(currentElement)
        && isPointerOnScrollbar(currentElement, event.clientX, event.clientY);

      if (
        currentElement
        && isTextareaInputElement(currentElement)
        && event.button === 0
        && !pointerOnEditorScrollbar
        && !event.altKey
        && !event.shiftKey
        && (event.ctrlKey || event.metaKey)
      ) {
        const pointerLogicalOffset = resolveDropOffsetFromPointer(currentElement, event.clientX, event.clientY);
        const targetUrl = getHttpUrlAtTextOffset(getEditableText(currentElement), pointerLogicalOffset);
        if (targetUrl) {
          event.preventDefault();
          event.stopPropagation();
          void openUrl(targetUrl).catch((error) => {
            console.error('Failed to open hyperlink from editor:', error);
          });
          return;
        }
      }

      if (
        currentElement
        && isTextareaInputElement(currentElement)
        && event.button === 2
        && rectangularSelectionRef.current
      ) {
        textDragMoveStateRef.current = null;
        pointerSelectionActiveRef.current = false;
        setPointerSelectionNativeHighlightMode(false);
        verticalSelectionRef.current = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        currentElement
        && isTextareaInputElement(currentElement)
        && event.button === 0
        && !pointerOnEditorScrollbar
        && !event.altKey
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
      ) {
        const selectionOffsets = getSelectionOffsetsInElement(currentElement);
        if (selectionOffsets && !selectionOffsets.isCollapsed) {
          const pointerLogicalOffset = resolveDropOffsetFromPointer(currentElement, event.clientX, event.clientY);
          if (pointerLogicalOffset >= selectionOffsets.start && pointerLogicalOffset <= selectionOffsets.end) {
            textDragMoveStateRef.current = {
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              sourceStart: selectionOffsets.start,
              sourceEnd: selectionOffsets.end,
              sourceText: currentElement.value.slice(selectionOffsets.start, selectionOffsets.end),
              baseText: currentElement.value,
              dropOffset: pointerLogicalOffset,
              dragging: false,
            };
          } else {
            textDragMoveStateRef.current = null;
          }
        } else {
          textDragMoveStateRef.current = null;
        }
      } else {
        textDragMoveStateRef.current = null;
      }

      pointerSelectionActiveRef.current = false;
      setPointerSelectionNativeHighlightMode(false);
      verticalSelectionRef.current = null;

      if (
        event.altKey
        && event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && contentRef.current
      ) {
        event.stopPropagation();
        const isTextarea = isTextareaInputElement(contentRef.current);
        if (!isTextarea) {
          event.preventDefault();
        }

        const clientX = event.clientX;
        const clientY = event.clientY;

        contentRef.current.focus();
        rectangularSelectionPointerActiveRef.current = true;
        rectangularSelectionLastClientPointRef.current = { x: clientX, y: clientY };

        if (isTextarea) {
          window.requestAnimationFrame(() => {
            if (!rectangularSelectionPointerActiveRef.current || !contentRef.current) {
              return;
            }

            const logicalOffset = getLogicalOffsetFromPoint(contentRef.current, clientX, clientY);
            if (logicalOffset === null) {
              return;
            }

            const text = normalizeSegmentText(getEditableText(contentRef.current));
            const position = codeUnitOffsetToLineColumn(text, logicalOffset);
            const line = Math.max(1, position.line);
            const column = Math.max(1, position.column + 1);
            const next: RectangularSelectionState = {
              anchorLine: line,
              anchorColumn: column,
              focusLine: line,
              focusColumn: column,
            };

            rectangularSelectionRef.current = next;
            setRectangularSelection(next);
          });

          return;
        }

        const logicalOffset = getLogicalOffsetFromPoint(contentRef.current, clientX, clientY);
        if (logicalOffset !== null) {
          const text = normalizeSegmentText(getEditableText(contentRef.current));
          const position = codeUnitOffsetToLineColumn(text, logicalOffset);
          const line = Math.max(1, position.line);
          const column = Math.max(1, position.column + 1);
          const next: RectangularSelectionState = {
            anchorLine: line,
            anchorColumn: column,
            focusLine: line,
            focusColumn: column,
          };

          rectangularSelectionRef.current = next;
          setRectangularSelection(next);
        }
        return;
      }

      rectangularSelectionPointerActiveRef.current = false;
      rectangularSelectionLastClientPointRef.current = null;
      rectangularSelectionRef.current = null;
      setRectangularSelection(null);

      if (!contentRef.current) {
        return;
      }

      const editorElement = contentRef.current;
      if (!pointerOnEditorScrollbar) {
        return;
      }

      textDragMoveStateRef.current = null;
      isScrollbarDragRef.current = true;
      editorElement.style.userSelect = 'none';
      editorElement.style.webkitUserSelect = 'none';
    },
    [
      codeUnitOffsetToLineColumn,
      contentRef,
      getEditableText,
      getHttpUrlAtTextOffset,
      getLogicalOffsetFromPoint,
      getSelectionOffsetsInElement,
      isPointerOnScrollbar,
      isScrollbarDragRef,
      isTextareaInputElement,
      normalizeSegmentText,
      pointerSelectionActiveRef,
      rectangularSelectionLastClientPointRef,
      rectangularSelectionPointerActiveRef,
      rectangularSelectionRef,
      resolveDropOffsetFromPointer,
      setLineNumberMultiSelection,
      setPointerSelectionNativeHighlightMode,
      setRectangularSelection,
      textDragMoveStateRef,
      verticalSelectionRef,
    ]
  );

  const handleHugeScrollablePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isHugeEditableMode || !scrollContainerRef.current) {
        return;
      }

      if (!isPointerOnScrollbar(scrollContainerRef.current, event.clientX, event.clientY)) {
        return;
      }

      textDragMoveStateRef.current = null;
      isScrollbarDragRef.current = true;
      if (contentRef.current) {
        contentRef.current.style.userSelect = 'none';
        contentRef.current.style.webkitUserSelect = 'none';
      }
    },
    [contentRef, isHugeEditableMode, isPointerOnScrollbar, isScrollbarDragRef, scrollContainerRef, textDragMoveStateRef]
  );

  return {
    handleEditorPointerMove,
    handleEditorPointerLeave,
    handleEditorPointerDown,
    handleHugeScrollablePointerDown,
  };
}
