import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type {
  RectangularSelectionState,
  ReplaceRectangularSelectionResultPayload,
} from './Editor.types';

interface ReplaceRectangularSelectionOptions {
  collapseToStart?: boolean;
  preserveSelection?: boolean;
  preserveColumnDelta?: number;
}

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
  const getActiveRectangularSelection = useCallback(() => {
    const current = rectangularSelectionRef.current;
    if (!current) {
      return normalizedRectangularSelection;
    }

    const startLine = Math.min(current.anchorLine, current.focusLine);
    const endLine = Math.max(current.anchorLine, current.focusLine);
    const startColumn = Math.min(current.anchorColumn, current.focusColumn);
    const endColumn = Math.max(current.anchorColumn, current.focusColumn);

    return {
      startLine,
      endLine,
      startColumn,
      endColumn,
      lineCount: endLine - startLine + 1,
    };
  }, [normalizedRectangularSelection, rectangularSelectionRef]);

  const getRectangularSelectionText = useCallback(
    (text: string) => {
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!activeRectangularSelection) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const lines: string[] = [];

      for (
        let line = activeRectangularSelection.startLine;
        line <= activeRectangularSelection.endLine;
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
          activeRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          activeRectangularSelection.endColumn
        );

        lines.push(text.slice(segmentStart, segmentEnd));
      }

      return lines.join('\n');
    },
    [buildLineStartOffsets, getActiveRectangularSelection, getLineBoundsByLineNumber, getOffsetForColumnInLine]
  );

  const getRectangularSelectionTextFromBackend = useCallback(async () => {
    const element = contentRef.current;
    const activeRectangularSelection = getActiveRectangularSelection();
    if (!element || !activeRectangularSelection) {
      return '';
    }

    const text = normalizeSegmentText(getEditableText(element));

    try {
      return await invoke<string>('get_rectangular_selection_text', {
        text,
        startLine: activeRectangularSelection.startLine,
        endLine: activeRectangularSelection.endLine,
        startColumn: activeRectangularSelection.startColumn,
        endColumn: activeRectangularSelection.endColumn,
      });
    } catch (error) {
      console.error('Failed to get rectangular selection text from backend:', error);
      return getRectangularSelectionText(text);
    }
  }, [contentRef, getActiveRectangularSelection, getEditableText, getRectangularSelectionText, normalizeSegmentText]);

  const resolvePreservedRectangularSelectionColumnDelta = useCallback(
    (insertText: string, options?: ReplaceRectangularSelectionOptions) => {
      const normalizedInsertText = normalizeLineText(insertText ?? '');
      if (normalizedInsertText.includes('\n')) {
        return null;
      }

      if (typeof options?.preserveColumnDelta === 'number') {
        return options.preserveColumnDelta;
      }

      if (options?.collapseToStart === true) {
        return 0;
      }

      return normalizedInsertText.length;
    },
    [normalizeLineText]
  );

  const buildPreservedRectangularSelection = useCallback(
    (insertText: string, options?: ReplaceRectangularSelectionOptions) => {
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!options?.preserveSelection || !activeRectangularSelection) {
        return null;
      }

      const current = rectangularSelectionRef.current;
      if (!current) {
        return null;
      }

      const columnDelta = resolvePreservedRectangularSelectionColumnDelta(
        insertText,
        options
      );
      if (columnDelta === null) {
        return null;
      }

      return {
        anchorLine: current.anchorLine,
        anchorColumn: Math.max(1, current.anchorColumn + columnDelta),
        focusLine: current.focusLine,
        focusColumn: Math.max(1, current.focusColumn + columnDelta),
      } satisfies RectangularSelectionState;
    },
    [
      getActiveRectangularSelection,
      rectangularSelectionRef,
      resolvePreservedRectangularSelectionColumnDelta,
    ]
  );

  const getPreservedRectangularSelectionFocusOffset = useCallback(
    (text: string, columnDelta: number) => {
      const current = rectangularSelectionRef.current;
      if (!current) {
        return 0;
      }

      const starts = buildLineStartOffsets(text);
      const bounds = getLineBoundsByLineNumber(text, starts, current.focusLine);
      if (!bounds) {
        return 0;
      }

      return getOffsetForColumnInLine(
        bounds.start,
        bounds.end,
        Math.max(1, current.focusColumn + columnDelta)
      );
    },
    [
      buildLineStartOffsets,
      getLineBoundsByLineNumber,
      getOffsetForColumnInLine,
      rectangularSelectionRef,
    ]
  );

  const applyRectangularReplacementResult = useCallback(
    (
      element: HTMLTextAreaElement,
      insertText: string,
      nextText: string,
      caretLogicalOffset: number,
      options?: ReplaceRectangularSelectionOptions
    ) => {
      setInputLayerText(element, nextText);
      const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, layerCaretOffset);

      const preservedSelection = buildPreservedRectangularSelection(
        insertText,
        options
      );

      if (preservedSelection) {
        rectangularSelectionRef.current = preservedSelection;
        setRectangularSelection(preservedSelection);
      } else {
        rectangularSelectionRef.current = null;
        clearRectangularSelection();
      }

      dispatchEditorInputEvent(element);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [
      buildPreservedRectangularSelection,
      clearRectangularSelection,
      dispatchEditorInputEvent,
      mapLogicalOffsetToInputLayerOffset,
      rectangularSelectionRef,
      setCaretToCodeUnitOffset,
      setInputLayerText,
      setRectangularSelection,
      syncSelectionState,
    ]
  );

  const replaceRectangularSelectionLocally = useCallback(
    (insertText: string, options?: ReplaceRectangularSelectionOptions) => {
      const element = contentRef.current;
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!element || !activeRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const rawRows = normalizeLineText(insertText ?? '').split('\n');
      const rowCount = activeRectangularSelection.lineCount;
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
        let line = activeRectangularSelection.startLine;
        line <= activeRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          activeRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          activeRectangularSelection.endColumn
        );

        pieces.push(text.slice(cursor, segmentStart));
        const replacementRow = rows[line - activeRectangularSelection.startLine] ?? '';
        pieces.push(replacementRow);
        cursor = segmentEnd;

        if (line === activeRectangularSelection.endLine) {
          caretLogicalOffset =
            pieces.join('').length + (options?.collapseToStart ? 0 : replacementRow.length);
        }
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');

      return applyRectangularReplacementResult(
        element,
        insertText,
        nextText,
        caretLogicalOffset,
        options
      );
    },
    [
      applyRectangularReplacementResult,
      buildLineStartOffsets,
      contentRef,
      getActiveRectangularSelection,
      getEditableText,
      getLineBoundsByLineNumber,
      getOffsetForColumnInLine,
      normalizeLineText,
      normalizeSegmentText,
    ]
  );

  const replaceRectangularSelection = useCallback(
    async (insertText: string, options?: ReplaceRectangularSelectionOptions) => {
      const element = contentRef.current;
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!element || !activeRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));

      try {
        const result = await invoke<ReplaceRectangularSelectionResultPayload>(
          'replace_rectangular_selection_text',
          {
            text,
            startLine: activeRectangularSelection.startLine,
            endLine: activeRectangularSelection.endLine,
            startColumn: activeRectangularSelection.startColumn,
            endColumn: activeRectangularSelection.endColumn,
            insertText,
            collapseToStart: options?.collapseToStart === true,
          }
        );

        const nextText = normalizeSegmentText(result?.nextText ?? text);
        const caretLogicalOffset = Math.max(
          0,
          Math.min(nextText.length, Math.floor(result?.caretOffset ?? 0))
        );

        return applyRectangularReplacementResult(
          element,
          insertText,
          nextText,
          caretLogicalOffset,
          options
        );
      } catch (error) {
        console.error('Failed to replace rectangular selection with backend command:', error);
        return replaceRectangularSelectionLocally(insertText, options);
      }
    },
    [
      applyRectangularReplacementResult,
      contentRef,
      getActiveRectangularSelection,
      getEditableText,
      normalizeSegmentText,
      replaceRectangularSelectionLocally,
    ]
  );

  const indentRectangularSelection = useCallback(
    async (indentText: string) => {
      const element = contentRef.current;
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!element || !activeRectangularSelection || !indentText) {
        return false;
      }

      if (activeRectangularSelection.startColumn === activeRectangularSelection.endColumn) {
        return replaceRectangularSelection(indentText, { preserveSelection: true });
      }

      const normalizedIndentText = normalizeLineText(indentText ?? '');
      if (!normalizedIndentText || normalizedIndentText.includes('\n')) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const pieces: string[] = [];
      let cursor = 0;

      for (
        let line = activeRectangularSelection.startLine;
        line <= activeRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          return false;
        }

        pieces.push(text.slice(cursor, bounds.start));
        pieces.push(normalizedIndentText);
        pieces.push(text.slice(bounds.start, bounds.end));
        cursor = bounds.end;
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');
      const caretLogicalOffset = getPreservedRectangularSelectionFocusOffset(
        nextText,
        normalizedIndentText.length
      );

      return applyRectangularReplacementResult(
        element,
        normalizedIndentText,
        nextText,
        caretLogicalOffset,
        {
          preserveSelection: true,
          preserveColumnDelta: normalizedIndentText.length,
        }
      );
    },
    [
      applyRectangularReplacementResult,
      buildLineStartOffsets,
      contentRef,
      getActiveRectangularSelection,
      getEditableText,
      getLineBoundsByLineNumber,
      getPreservedRectangularSelectionFocusOffset,
      normalizeLineText,
      normalizeSegmentText,
      replaceRectangularSelection,
    ]
  );

  const outdentRectangularSelection = useCallback(
    async (indentText: string) => {
      const element = contentRef.current;
      const activeRectangularSelection = getActiveRectangularSelection();
      if (!element || !activeRectangularSelection || !indentText) {
        return false;
      }

      const normalizedIndentText = normalizeLineText(indentText ?? '');
      if (!normalizedIndentText || normalizedIndentText.includes('\n')) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);

      if (activeRectangularSelection.startColumn !== activeRectangularSelection.endColumn) {
        const pieces: string[] = [];
        let cursor = 0;

        for (
          let line = activeRectangularSelection.startLine;
          line <= activeRectangularSelection.endLine;
          line += 1
        ) {
          const bounds = getLineBoundsByLineNumber(text, starts, line);
          if (!bounds) {
            return false;
          }

          const removalEnd = bounds.start + normalizedIndentText.length;
          if (text.slice(bounds.start, removalEnd) !== normalizedIndentText) {
            return false;
          }

          pieces.push(text.slice(cursor, bounds.start));
          cursor = removalEnd;
        }

        pieces.push(text.slice(cursor));
        const nextText = pieces.join('');
        const caretLogicalOffset = getPreservedRectangularSelectionFocusOffset(
          nextText,
          -normalizedIndentText.length
        );

        return applyRectangularReplacementResult(
          element,
          '',
          nextText,
          caretLogicalOffset,
          {
            preserveSelection: true,
            preserveColumnDelta: -normalizedIndentText.length,
          }
        );
      }

      const pieces: string[] = [];
      let cursor = 0;
      let caretLogicalOffset = 0;

      for (
        let line = activeRectangularSelection.startLine;
        line <= activeRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          return false;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          activeRectangularSelection.startColumn
        );
        const removalStart = segmentStart - normalizedIndentText.length;

        if (removalStart < bounds.start) {
          return false;
        }

        if (text.slice(removalStart, segmentStart) !== normalizedIndentText) {
          return false;
        }

        pieces.push(text.slice(cursor, removalStart));
        cursor = segmentStart;

        if (line === activeRectangularSelection.endLine) {
          caretLogicalOffset = pieces.join('').length;
        }
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');

      return applyRectangularReplacementResult(
        element,
        '',
        nextText,
        caretLogicalOffset,
        {
          preserveSelection: true,
          preserveColumnDelta: -normalizedIndentText.length,
        }
      );
    },
    [
      applyRectangularReplacementResult,
      buildLineStartOffsets,
      contentRef,
      getActiveRectangularSelection,
      getEditableText,
      getPreservedRectangularSelectionFocusOffset,
      getLineBoundsByLineNumber,
      getOffsetForColumnInLine,
      normalizeLineText,
      normalizeSegmentText,
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
    indentRectangularSelection,
    replaceRectangularSelection,
    outdentRectangularSelection,
    updateRectangularSelectionFromPoint,
    getRectangularSelectionScrollElement,
    beginRectangularSelectionAtPoint,
    beginRectangularSelectionFromCaret,
    nudgeRectangularSelectionByKey,
  };
}
