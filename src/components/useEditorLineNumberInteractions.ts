import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorLineNumberInteractionsParams {
  tabId: string;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineNumberSelectionAnchorLineRef: MutableRefObject<number | null>;
  clearLineNumberMultiSelection: () => void;
  clearRectangularSelection: () => void;
  mapAbsoluteLineToSourceLine: (absoluteLine: number) => number | null;
  setLineNumberMultiSelection: (updater: number[] | ((prev: number[]) => number[])) => void;
  setActiveLineNumber: (updater: number | ((prev: number) => number)) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  syncSelectionAfterInteraction: () => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  buildLineStartOffsets: (text: string) => number[];
  getLineBoundsByLineNumber: (
    text: string,
    starts: number[],
    lineNumber: number
  ) => { start: number; end: number } | null;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  setSelectionToCodeUnitOffsets: (element: HTMLTextAreaElement, startOffset: number, endOffset: number) => void;
}

export function useEditorLineNumberInteractions({
  tabId,
  contentRef,
  lineNumberSelectionAnchorLineRef,
  clearLineNumberMultiSelection,
  clearRectangularSelection,
  mapAbsoluteLineToSourceLine,
  setLineNumberMultiSelection,
  setActiveLineNumber,
  setCursorPosition,
  syncSelectionAfterInteraction,
  normalizeSegmentText,
  getEditableText,
  buildLineStartOffsets,
  getLineBoundsByLineNumber,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  setSelectionToCodeUnitOffsets,
}: UseEditorLineNumberInteractionsParams) {
  const getLineNumberFromGutterElement = useCallback((element: HTMLDivElement, fallbackLine: number) => {
    const parsedLine = Number.parseInt((element.textContent || '').trim(), 10);
    if (Number.isFinite(parsedLine)) {
      return Math.max(1, parsedLine);
    }

    return Math.max(1, Math.floor(fallbackLine));
  }, []);

  const handleLineNumberClick = useCallback(
    (line: number, shiftKey: boolean, additiveKey: boolean) => {
      const safeLine = Math.max(1, Math.floor(line));

      if (additiveKey) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
        clearRectangularSelection();
        setLineNumberMultiSelection((prev) => {
          const exists = prev.includes(safeLine);
          if (exists) {
            return prev.filter((lineNumber) => lineNumber !== safeLine);
          }

          return [...prev, safeLine].sort((left, right) => left - right);
        });

        const element = contentRef.current;
        if (element) {
          const text = normalizeSegmentText(getEditableText(element));
          const starts = buildLineStartOffsets(text);
          const lineInSource = mapAbsoluteLineToSourceLine(safeLine);
          if (lineInSource === null) {
            return;
          }
          const bounds = getLineBoundsByLineNumber(text, starts, lineInSource);
          if (bounds) {
            const caretOffset = mapLogicalOffsetToInputLayerOffset(text, bounds.start);
            setCaretToCodeUnitOffset(element, caretOffset);
          }
        }

        setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
        setCursorPosition(tabId, safeLine, 1);
        syncSelectionAfterInteraction();
        return;
      }

      clearLineNumberMultiSelection();

      if (lineNumberSelectionAnchorLineRef.current === null) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
      }

      const anchorLine = lineNumberSelectionAnchorLineRef.current;
      const selectionStartLine = shiftKey ? Math.min(anchorLine, safeLine) : safeLine;
      const selectionEndLine = shiftKey ? Math.max(anchorLine, safeLine) : safeLine;

      if (!shiftKey) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
      }

      setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
      setCursorPosition(tabId, safeLine, 1);

      const element = contentRef.current;
      if (!element) {
        return;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const startLineInSource = mapAbsoluteLineToSourceLine(selectionStartLine);
      const endLineInSource = mapAbsoluteLineToSourceLine(selectionEndLine);
      if (startLineInSource === null || endLineInSource === null) {
        return;
      }
      const startBounds = getLineBoundsByLineNumber(text, starts, startLineInSource);
      const endBounds = getLineBoundsByLineNumber(text, starts, endLineInSource);
      if (!startBounds || !endBounds) {
        return;
      }

      const selectionStartOffset = mapLogicalOffsetToInputLayerOffset(text, startBounds.start);
      const logicalEndOffset = endBounds.end < text.length && text[endBounds.end] === '\n'
        ? endBounds.end + 1
        : endBounds.end;
      const selectionEndOffset = mapLogicalOffsetToInputLayerOffset(text, logicalEndOffset);

      clearRectangularSelection();
      setSelectionToCodeUnitOffsets(element, selectionStartOffset, selectionEndOffset);
      syncSelectionAfterInteraction();
    },
    [
      buildLineStartOffsets,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      contentRef,
      getEditableText,
      getLineBoundsByLineNumber,
      lineNumberSelectionAnchorLineRef,
      mapAbsoluteLineToSourceLine,
      mapLogicalOffsetToInputLayerOffset,
      normalizeSegmentText,
      setActiveLineNumber,
      setCaretToCodeUnitOffset,
      setCursorPosition,
      setLineNumberMultiSelection,
      setSelectionToCodeUnitOffsets,
      syncSelectionAfterInteraction,
      tabId,
    ]
  );

  return {
    getLineNumberFromGutterElement,
    handleLineNumberClick,
  };
}
