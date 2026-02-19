import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState } from './Editor.types';

interface UseEditorLineNumberMultiSelectionParams {
  lineNumberMultiSelection: number[];
  setLineNumberMultiSelection: (updater: number[] | ((prev: number[]) => number[])) => void;
  isHugeEditableMode: boolean;
  tabId: string;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  setEditableSegment: (segment: EditorSegmentState) => void;
  syncedTextRef: MutableRefObject<string>;
  suppressExternalReloadRef: MutableRefObject<boolean>;
  lineNumberSelectionAnchorLineRef: MutableRefObject<number | null>;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  buildLineStartOffsets: (text: string) => number[];
  getLineBoundsByLineNumber: (
    text: string,
    starts: number[],
    lineNumber: number
  ) => { start: number; end: number } | null;
  codeUnitOffsetToUnicodeScalarIndex: (text: string, offset: number) => number;
  setInputLayerText: (element: HTMLTextAreaElement, text: string) => void;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  setActiveLineNumber: (updater: number | ((prev: number) => number)) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  handleScroll: () => void;
  syncSelectionState: () => void;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  dispatchDocumentUpdated: (tabId: string) => void;
}

export function useEditorLineNumberMultiSelection({
  lineNumberMultiSelection,
  setLineNumberMultiSelection,
  isHugeEditableMode,
  tabId,
  contentRef,
  editableSegmentRef,
  setEditableSegment,
  syncedTextRef,
  suppressExternalReloadRef,
  lineNumberSelectionAnchorLineRef,
  normalizeSegmentText,
  getEditableText,
  buildLineStartOffsets,
  getLineBoundsByLineNumber,
  codeUnitOffsetToUnicodeScalarIndex,
  setInputLayerText,
  setCaretToCodeUnitOffset,
  setActiveLineNumber,
  setCursorPosition,
  handleScroll,
  syncSelectionState,
  syncVisibleTokens,
  updateTab,
  dispatchDocumentUpdated,
}: UseEditorLineNumberMultiSelectionParams) {
  const clearLineNumberMultiSelection = useCallback(() => {
    setLineNumberMultiSelection((prev) => (prev.length === 0 ? prev : []));
  }, [setLineNumberMultiSelection]);

  const mapAbsoluteLineToSourceLine = useCallback(
    (absoluteLine: number) => {
      const safeLine = Math.max(1, Math.floor(absoluteLine));
      if (!isHugeEditableMode) {
        return safeLine;
      }

      const segment = editableSegmentRef.current;
      const segmentStartLine = segment.startLine + 1;
      const segmentEndLine = segment.endLine;
      if (safeLine < segmentStartLine || safeLine > segmentEndLine) {
        return null;
      }

      return safeLine - segment.startLine;
    },
    [editableSegmentRef, isHugeEditableMode]
  );

  const buildLineNumberSelectionRangeText = useCallback(
    (text: string, selectedLines: number[]) => {
      if (!text || selectedLines.length === 0) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const segments: string[] = [];

      for (const line of selectedLines) {
        const sourceLine = mapAbsoluteLineToSourceLine(line);
        if (sourceLine === null) {
          continue;
        }
        const bounds = getLineBoundsByLineNumber(text, starts, sourceLine);
        if (!bounds) {
          continue;
        }

        const endOffset = bounds.end < text.length && text[bounds.end] === '\n' ? bounds.end + 1 : bounds.end;
        segments.push(text.slice(bounds.start, endOffset));
      }

      return segments.join('');
    },
    [buildLineStartOffsets, getLineBoundsByLineNumber, mapAbsoluteLineToSourceLine]
  );

  const applyLineNumberMultiSelectionEdit = useCallback(
    async (mode: 'cut' | 'delete') => {
      const selectedLines = lineNumberMultiSelection;
      if (selectedLines.length === 0) {
        return false;
      }

      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const baseText = normalizeSegmentText(getEditableText(element));
      if (!baseText) {
        clearLineNumberMultiSelection();
        return false;
      }

      const starts = buildLineStartOffsets(baseText);
      const ranges = selectedLines
        .map((line) => {
          const sourceLine = mapAbsoluteLineToSourceLine(line);
          if (sourceLine === null) {
            return null;
          }
          const bounds = getLineBoundsByLineNumber(baseText, starts, sourceLine);
          if (!bounds) {
            return null;
          }

          const endOffset =
            bounds.end < baseText.length && baseText[bounds.end] === '\n' ? bounds.end + 1 : bounds.end;

          return {
            start: bounds.start,
            end: endOffset,
          };
        })
        .filter((range): range is { start: number; end: number } => !!range)
        .sort((left, right) => left.start - right.start);

      if (ranges.length === 0) {
        clearLineNumberMultiSelection();
        return false;
      }

      const mergedRanges: Array<{ start: number; end: number }> = [];
      for (const range of ranges) {
        const previous = mergedRanges[mergedRanges.length - 1];
        if (!previous || range.start > previous.end) {
          mergedRanges.push({ ...range });
          continue;
        }

        if (range.end > previous.end) {
          previous.end = range.end;
        }
      }

      if (mode === 'cut') {
        const selectedText = mergedRanges.map((range) => baseText.slice(range.start, range.end)).join('');
        if (selectedText && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(selectedText).catch(() => {
            console.warn('Failed to write line selection to clipboard.');
          });
        }
      }

      const nextPieces: string[] = [];
      let cursor = 0;
      for (const range of mergedRanges) {
        nextPieces.push(baseText.slice(cursor, range.start));
        cursor = range.end;
      }
      nextPieces.push(baseText.slice(cursor));
      const nextText = nextPieces.join('');

      if (nextText === baseText) {
        clearLineNumberMultiSelection();
        return false;
      }

      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, 0);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, baseText.length);

      try {
        const newLineCount = isHugeEditableMode
          ? await invoke<number>('replace_line_range', {
              id: tabId,
              startLine: editableSegmentRef.current.startLine,
              endLine: editableSegmentRef.current.endLine,
              newText: nextText,
            })
          : await invoke<number>('edit_text', {
              id: tabId,
              startChar,
              endChar,
              newText: nextText,
            });

        setInputLayerText(element, nextText);
        setCaretToCodeUnitOffset(element, 0);

        if (isHugeEditableMode) {
          const nextSegment: EditorSegmentState = {
            startLine: editableSegmentRef.current.startLine,
            endLine: editableSegmentRef.current.endLine,
            text: nextText,
          };
          editableSegmentRef.current = nextSegment;
          setEditableSegment(nextSegment);
        }

        syncedTextRef.current = nextText;
        suppressExternalReloadRef.current = true;

        const safeLineCount = Math.max(1, newLineCount);
        updateTab(tabId, { lineCount: safeLineCount, isDirty: true });
        dispatchDocumentUpdated(tabId);

        clearLineNumberMultiSelection();
        lineNumberSelectionAnchorLineRef.current = null;
        setActiveLineNumber(1);
        setCursorPosition(tabId, 1, 1);
        window.requestAnimationFrame(() => {
          handleScroll();
          syncSelectionState();

          window.requestAnimationFrame(() => {
            handleScroll();
          });
        });

        await syncVisibleTokens(safeLineCount);
        return true;
      } catch (error) {
        console.error('Failed to apply line-number multi-selection edit:', error);
        return false;
      }
    },
    [
      buildLineStartOffsets,
      clearLineNumberMultiSelection,
      codeUnitOffsetToUnicodeScalarIndex,
      contentRef,
      dispatchDocumentUpdated,
      editableSegmentRef,
      getEditableText,
      getLineBoundsByLineNumber,
      handleScroll,
      isHugeEditableMode,
      lineNumberMultiSelection,
      lineNumberSelectionAnchorLineRef,
      mapAbsoluteLineToSourceLine,
      normalizeSegmentText,
      setActiveLineNumber,
      setCaretToCodeUnitOffset,
      setCursorPosition,
      setEditableSegment,
      setInputLayerText,
      suppressExternalReloadRef,
      syncSelectionState,
      syncVisibleTokens,
      syncedTextRef,
      tabId,
      updateTab,
    ]
  );

  return {
    clearLineNumberMultiSelection,
    mapAbsoluteLineToSourceLine,
    buildLineNumberSelectionRangeText,
    applyLineNumberMultiSelectionEdit,
  };
}
