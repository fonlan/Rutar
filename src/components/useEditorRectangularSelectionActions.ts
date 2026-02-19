import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type {
  RectangularSelectionState,
  ReplaceRectangularSelectionResultPayload,
} from './Editor.types';

interface UseEditorRectangularSelectionActionsParams {
  isHugeEditableMode: boolean;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  rectangularSelectionRef: MutableRefObject<RectangularSelectionState | null>;
  normalizedRectangularSelection: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    lineCount: number;
  } | null;
  setRectangularSelection: (state: RectangularSelectionState | null) => void;
  clearRectangularSelection: () => void;
  syncSelectionState: () => void;
  normalizeSegmentText: (text: string) => string;
  normalizeLineText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  buildLineStartOffsets: (text: string) => number[];
  getLineBoundsByLineNumber: (
    text: string,
    starts: number[],
    lineNumber: number
  ) => { start: number; end: number } | null;
  getOffsetForColumnInLine: (lineStart: number, lineEnd: number, column: number) => number;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  dispatchEditorInputEvent: (element: HTMLTextAreaElement) => void;
  getLogicalOffsetFromPoint: (element: HTMLTextAreaElement, x: number, y: number) => number | null;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
  getSelectionAnchorFocusOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { anchor: number; focus: number } | null;
  getSelectionOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { start: number; end: number; isCollapsed: boolean } | null;
}

export function useEditorRectangularSelectionActions({
  isHugeEditableMode,
  contentRef,
  scrollContainerRef,
  rectangularSelectionRef,
  normalizedRectangularSelection,
  setRectangularSelection,
  clearRectangularSelection,
  syncSelectionState,
  normalizeSegmentText,
  normalizeLineText,
  getEditableText,
  buildLineStartOffsets,
  getLineBoundsByLineNumber,
  getOffsetForColumnInLine,
  setInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  dispatchEditorInputEvent,
  getLogicalOffsetFromPoint,
  codeUnitOffsetToLineColumn,
  getSelectionAnchorFocusOffsetsInElement,
  getSelectionOffsetsInElement,
}: UseEditorRectangularSelectionActionsParams) {
  const getRectangularSelectionText = useCallback(
    (text: string) => {
      if (!normalizedRectangularSelection) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const lines: string[] = [];

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          lines.push('');
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        lines.push(text.slice(segmentStart, segmentEnd));
      }

      return lines.join('\n');
    },
    [buildLineStartOffsets, getLineBoundsByLineNumber, getOffsetForColumnInLine, normalizedRectangularSelection]
  );

  const getRectangularSelectionTextFromBackend = useCallback(async () => {
    const element = contentRef.current;
    if (!element || !normalizedRectangularSelection) {
      return '';
    }

    const text = normalizeSegmentText(getEditableText(element));

    try {
      return await invoke<string>('get_rectangular_selection_text', {
        text,
        startLine: normalizedRectangularSelection.startLine,
        endLine: normalizedRectangularSelection.endLine,
        startColumn: normalizedRectangularSelection.startColumn,
        endColumn: normalizedRectangularSelection.endColumn,
      });
    } catch (error) {
      console.error('Failed to get rectangular selection text from backend:', error);
      return getRectangularSelectionText(text);
    }
  }, [contentRef, getEditableText, getRectangularSelectionText, normalizeSegmentText, normalizedRectangularSelection]);

  const replaceRectangularSelectionLocally = useCallback(
    (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const rawRows = normalizeLineText(insertText ?? '').split('\n');
      const rowCount = normalizedRectangularSelection.lineCount;
      const rows = Array.from({ length: rowCount }, (_, index) => {
        if (rawRows.length === 0) {
          return '';
        }
        return rawRows[Math.min(index, rawRows.length - 1)] ?? '';
      });

      const pieces: string[] = [];
      let cursor = 0;
      let caretLogicalOffset = 0;

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        pieces.push(text.slice(cursor, segmentStart));
        const replacementRow = rows[line - normalizedRectangularSelection.startLine] ?? '';
        pieces.push(replacementRow);
        cursor = segmentEnd;

        if (line === normalizedRectangularSelection.endLine) {
          caretLogicalOffset =
            pieces.join('').length + (options?.collapseToStart ? 0 : replacementRow.length);
        }
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');

      setInputLayerText(element, nextText);
      const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, layerCaretOffset);
      clearRectangularSelection();
      dispatchEditorInputEvent(element);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [
      buildLineStartOffsets,
      clearRectangularSelection,
      contentRef,
      dispatchEditorInputEvent,
      getEditableText,
      getLineBoundsByLineNumber,
      getOffsetForColumnInLine,
      mapLogicalOffsetToInputLayerOffset,
      normalizeLineText,
      normalizeSegmentText,
      normalizedRectangularSelection,
      setCaretToCodeUnitOffset,
      setInputLayerText,
      syncSelectionState,
    ]
  );

  const replaceRectangularSelection = useCallback(
    async (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));

      try {
        const result = await invoke<ReplaceRectangularSelectionResultPayload>(
          'replace_rectangular_selection_text',
          {
            text,
            startLine: normalizedRectangularSelection.startLine,
            endLine: normalizedRectangularSelection.endLine,
            startColumn: normalizedRectangularSelection.startColumn,
            endColumn: normalizedRectangularSelection.endColumn,
            insertText,
            collapseToStart: options?.collapseToStart === true,
          }
        );

        const nextText = normalizeSegmentText(result?.nextText ?? text);
        const caretLogicalOffset = Math.max(
          0,
          Math.min(nextText.length, Math.floor(result?.caretOffset ?? 0))
        );

        setInputLayerText(element, nextText);
        const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
        setCaretToCodeUnitOffset(element, layerCaretOffset);
        clearRectangularSelection();
        dispatchEditorInputEvent(element);
        window.requestAnimationFrame(() => {
          syncSelectionState();
        });
        return true;
      } catch (error) {
        console.error('Failed to replace rectangular selection with backend command:', error);
        return replaceRectangularSelectionLocally(insertText, options);
      }
    },
    [
      clearRectangularSelection,
      contentRef,
      dispatchEditorInputEvent,
      getEditableText,
      mapLogicalOffsetToInputLayerOffset,
      normalizeSegmentText,
      normalizedRectangularSelection,
      replaceRectangularSelectionLocally,
      setCaretToCodeUnitOffset,
      setInputLayerText,
      syncSelectionState,
    ]
  );

  const updateRectangularSelectionFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
      if (logicalOffset === null) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const position = codeUnitOffsetToLineColumn(text, logicalOffset);
      const line = Math.max(1, position.line);
      const column = Math.max(1, position.column + 1);
      const current = rectangularSelectionRef.current;

      if (!current) {
        const next: RectangularSelectionState = {
          anchorLine: line,
          anchorColumn: column,
          focusLine: line,
          focusColumn: column,
        };

        rectangularSelectionRef.current = next;
        setRectangularSelection(next);
        return true;
      }

      const next: RectangularSelectionState = {
        ...current,
        focusLine: line,
        focusColumn: column,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    [
      codeUnitOffsetToLineColumn,
      contentRef,
      getEditableText,
      getLogicalOffsetFromPoint,
      normalizeSegmentText,
      rectangularSelectionRef,
      setRectangularSelection,
    ]
  );

  const getRectangularSelectionScrollElement = useCallback(() => {
    if (isHugeEditableMode) {
      return scrollContainerRef.current;
    }

    return contentRef.current;
  }, [contentRef, isHugeEditableMode, scrollContainerRef]);

  const beginRectangularSelectionAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
    if (logicalOffset === null) {
      return false;
    }

    const text = normalizeSegmentText(getEditableText(element));
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
    return true;
  }, [
    codeUnitOffsetToLineColumn,
    contentRef,
    getEditableText,
    getLogicalOffsetFromPoint,
    normalizeSegmentText,
    rectangularSelectionRef,
    setRectangularSelection,
  ]);

  const beginRectangularSelectionFromCaret = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
    const resolvedFocusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(element)?.end ?? 0;
    const text = normalizeSegmentText(getEditableText(element));
    const position = codeUnitOffsetToLineColumn(text, resolvedFocusOffset);
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
    return true;
  }, [
    codeUnitOffsetToLineColumn,
    contentRef,
    getEditableText,
    getSelectionAnchorFocusOffsetsInElement,
    getSelectionOffsetsInElement,
    normalizeSegmentText,
    rectangularSelectionRef,
    setRectangularSelection,
  ]);

  const nudgeRectangularSelectionByKey = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const current = rectangularSelectionRef.current;
      if (!current) {
        return false;
      }

      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const logicalLineCount = Math.max(1, text.length === 0 ? 1 : text.split('\n').length);

      const nextFocusLine = direction === 'up'
        ? Math.max(1, current.focusLine - 1)
        : direction === 'down'
        ? Math.min(logicalLineCount, current.focusLine + 1)
        : current.focusLine;

      const nextFocusColumn = direction === 'left'
        ? Math.max(1, current.focusColumn - 1)
        : direction === 'right'
        ? current.focusColumn + 1
        : current.focusColumn;

      const next: RectangularSelectionState = {
        ...current,
        focusLine: nextFocusLine,
        focusColumn: nextFocusColumn,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    [contentRef, getEditableText, normalizeSegmentText, rectangularSelectionRef, setRectangularSelection]
  );

  return {
    getRectangularSelectionText,
    getRectangularSelectionTextFromBackend,
    replaceRectangularSelection,
    updateRectangularSelectionFromPoint,
    getRectangularSelectionScrollElement,
    beginRectangularSelectionAtPoint,
    beginRectangularSelectionFromCaret,
    nudgeRectangularSelectionByKey,
  };
}
