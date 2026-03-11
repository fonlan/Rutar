import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorLineNumberInteractionsParams {
  tabId: string;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineNumberSelectionAnchorLineRef: MutableRefObject<number | null>;
  clearLineNumberMultiSelection: () => void;
  clearRectangularSelection: () => void;
  mapAbsoluteLineToSourceLine: (absoluteLine: number) => number | null;
  mapSourceLineToAbsoluteLine: (sourceLine: number) => number;
  setLineNumberMultiSelection: (updater: number[] | ((prev: number[]) => number[])) => void;
  setActiveLineNumber: (updater: number | ((prev: number) => number)) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  syncSelectionAfterInteraction: () => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { start: number; end: number; isCollapsed: boolean } | null;
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
  mapSourceLineToAbsoluteLine,
  setLineNumberMultiSelection,
  setActiveLineNumber,
  setCursorPosition,
  syncSelectionAfterInteraction,
  normalizeSegmentText,
  getEditableText,
  getSelectionOffsetsInElement,
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

  const buildLineNumberRange = useCallback((startLine: number, endLine: number) => {
    const normalizedStartLine = Math.max(1, Math.min(Math.floor(startLine), Math.floor(endLine)));
    const normalizedEndLine = Math.max(1, Math.max(Math.floor(startLine), Math.floor(endLine)));

    return Array.from(
      { length: normalizedEndLine - normalizedStartLine + 1 },
      (_, index) => normalizedStartLine + index
    );
  }, []);

  const resolveSourceLineRangeSelectionOffsets = useCallback(
    (text: string, starts: number[], startLineInSource: number, endLineInSource: number) => {
      const startBounds = getLineBoundsByLineNumber(text, starts, startLineInSource);
      const endBounds = getLineBoundsByLineNumber(text, starts, endLineInSource);
      if (!startBounds || !endBounds) {
        return null;
      }

      const selectionStartOffset = mapLogicalOffsetToInputLayerOffset(text, startBounds.start);
      const logicalEndOffset = endBounds.end < text.length && text[endBounds.end] === '\n'
        ? endBounds.end + 1
        : endBounds.end;
      const selectionEndOffset = mapLogicalOffsetToInputLayerOffset(text, logicalEndOffset);

      return {
        selectionStartOffset,
        selectionEndOffset,
      };
    },
    [
      getLineBoundsByLineNumber,
      mapLogicalOffsetToInputLayerOffset,
    ]
  );

  const resolveAbsoluteLineRangeSelectionOffsets = useCallback(
    (text: string, starts: number[], startAbsoluteLine: number, endAbsoluteLine: number) => {
      const startLineInSource = mapAbsoluteLineToSourceLine(startAbsoluteLine);
      const endLineInSource = mapAbsoluteLineToSourceLine(endAbsoluteLine);
      if (startLineInSource === null || endLineInSource === null) {
        return null;
      }

      return resolveSourceLineRangeSelectionOffsets(text, starts, startLineInSource, endLineInSource);
    },
    [
      mapAbsoluteLineToSourceLine,
      resolveSourceLineRangeSelectionOffsets,
    ]
  );

  const deriveWholeLineSelectionRange = useCallback(
    (text: string, starts: number[], selectionStart: number, selectionEnd: number) => {
      if (selectionEnd <= selectionStart || starts.length === 0) {
        return null;
      }

      let startSourceLine: number | null = null;
      for (let sourceLine = 1; sourceLine <= starts.length; sourceLine += 1) {
        const startBounds = getLineBoundsByLineNumber(text, starts, sourceLine);
        if (!startBounds) {
          continue;
        }

        const startOffset = mapLogicalOffsetToInputLayerOffset(text, startBounds.start);
        if (startOffset === selectionStart) {
          startSourceLine = sourceLine;
          break;
        }
      }

      if (startSourceLine === null) {
        return null;
      }

      for (let endSourceLine = startSourceLine; endSourceLine <= starts.length; endSourceLine += 1) {
        const rangeOffsets = resolveSourceLineRangeSelectionOffsets(
          text,
          starts,
          startSourceLine,
          endSourceLine
        );
        if (!rangeOffsets) {
          continue;
        }

        if (
          rangeOffsets.selectionStartOffset === selectionStart &&
          rangeOffsets.selectionEndOffset === selectionEnd
        ) {
          return {
            startLine: mapSourceLineToAbsoluteLine(startSourceLine),
            endLine: mapSourceLineToAbsoluteLine(endSourceLine),
          };
        }
      }

      return null;
    },
    [
      getLineBoundsByLineNumber,
      mapLogicalOffsetToInputLayerOffset,
      mapSourceLineToAbsoluteLine,
      resolveSourceLineRangeSelectionOffsets,
    ]
  );

  const handleLineNumberClick = useCallback(
    (line: number, shiftKey: boolean, additiveKey: boolean) => {
      const safeLine = Math.max(1, Math.floor(line));
      const element = contentRef.current;
      const text = element ? normalizeSegmentText(getEditableText(element)) : '';
      const starts = text ? buildLineStartOffsets(text) : [];

      if (additiveKey) {
        const selectionOffsets = element ? getSelectionOffsetsInElement(element) : null;
        const derivedWholeLineSelection =
          selectionOffsets && !selectionOffsets.isCollapsed && starts.length > 0
            ? deriveWholeLineSelectionRange(text, starts, selectionOffsets.start, selectionOffsets.end)
            : null;
        const seededSelection = derivedWholeLineSelection
          ? buildLineNumberRange(derivedWholeLineSelection.startLine, derivedWholeLineSelection.endLine)
          : [];
        const anchorLine = lineNumberSelectionAnchorLineRef.current ?? safeLine;

        if (lineNumberSelectionAnchorLineRef.current === null) {
          lineNumberSelectionAnchorLineRef.current = anchorLine;
        }

        clearRectangularSelection();
        setLineNumberMultiSelection((prev) => {
          const baseSelection = prev.length === 0 ? seededSelection : prev;

          if (shiftKey) {
            const rangeSelection = buildLineNumberRange(anchorLine, safeLine);
            return Array.from(new Set([...baseSelection, ...rangeSelection])).sort(
              (left, right) => left - right
            );
          }

          const exists = baseSelection.includes(safeLine);
          if (exists) {
            return baseSelection.filter((lineNumber) => lineNumber !== safeLine);
          }

          return [...baseSelection, safeLine].sort((left, right) => left - right);
        });

        if (!shiftKey) {
          lineNumberSelectionAnchorLineRef.current = safeLine;
        }

        if (element && starts.length > 0) {
          const lineOffsets = resolveAbsoluteLineRangeSelectionOffsets(text, starts, safeLine, safeLine);
          if (lineOffsets) {
            setCaretToCodeUnitOffset(element, lineOffsets.selectionStartOffset);
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

      if (!element || starts.length === 0) {
        return;
      }

      const lineRangeOffsets = resolveAbsoluteLineRangeSelectionOffsets(
        text,
        starts,
        selectionStartLine,
        selectionEndLine
      );
      if (!lineRangeOffsets) {
        return;
      }

      clearRectangularSelection();
      setSelectionToCodeUnitOffsets(
        element,
        lineRangeOffsets.selectionStartOffset,
        lineRangeOffsets.selectionEndOffset
      );
      syncSelectionAfterInteraction();
    },
    [
      buildLineNumberRange,
      buildLineStartOffsets,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      contentRef,
      deriveWholeLineSelectionRange,
      getEditableText,
      getSelectionOffsetsInElement,
      lineNumberSelectionAnchorLineRef,
      normalizeSegmentText,
      resolveAbsoluteLineRangeSelectionOffsets,
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
