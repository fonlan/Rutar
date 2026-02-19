import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, PairHighlightPosition, PairOffsetsResultPayload } from './Editor.types';

interface UseEditorSelectionStateSyncParams {
  isHugeEditableMode: boolean;
  isPairHighlightEnabled: boolean;
  tabId: string;
  tabLineCount: number;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  setActiveLineNumber: (updater: number | ((prev: number) => number)) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setPairHighlights: (updater: PairHighlightPosition[] | ((prev: PairHighlightPosition[]) => PairHighlightPosition[])) => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionAnchorFocusOffsetsInElement: (element: HTMLTextAreaElement) => { anchor: number; focus: number } | null;
  getSelectionOffsetsInElement: (element: HTMLTextAreaElement) => { start: number; end: number; isCollapsed: boolean } | null;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
  arePairHighlightPositionsEqual: (left: PairHighlightPosition[], right: PairHighlightPosition[]) => boolean;
}

export function useEditorSelectionStateSync({
  isHugeEditableMode,
  isPairHighlightEnabled,
  tabId,
  tabLineCount,
  contentRef,
  editableSegmentRef,
  setActiveLineNumber,
  setCursorPosition,
  setPairHighlights,
  normalizeSegmentText,
  getEditableText,
  getSelectionAnchorFocusOffsetsInElement,
  getSelectionOffsetsInElement,
  codeUnitOffsetToLineColumn,
  arePairHighlightPositionsEqual,
}: UseEditorSelectionStateSyncParams) {
  const pairHighlightRequestIdRef = useRef(0);

  const updateCursorPositionFromSelection = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const text = normalizeSegmentText(getEditableText(contentRef.current));
    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(contentRef.current);
    const focusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(contentRef.current)?.end;

    if (focusOffset === null || focusOffset === undefined) {
      return;
    }

    const localPosition = codeUnitOffsetToLineColumn(text, focusOffset);
    const absoluteLine = isHugeEditableMode
      ? editableSegmentRef.current.startLine + localPosition.line
      : localPosition.line;
    const safeLine = Math.max(1, Math.min(Math.max(1, tabLineCount), Math.floor(absoluteLine)));
    const safeColumn = Math.max(1, Math.floor(localPosition.column + 1));

    setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
    setCursorPosition(tabId, safeLine, safeColumn);
  }, [
    codeUnitOffsetToLineColumn,
    contentRef,
    editableSegmentRef,
    getEditableText,
    getSelectionAnchorFocusOffsetsInElement,
    getSelectionOffsetsInElement,
    isHugeEditableMode,
    normalizeSegmentText,
    setActiveLineNumber,
    setCursorPosition,
    tabId,
    tabLineCount,
  ]);

  const updatePairHighlightsFromSelection = useCallback(async () => {
    const requestId = pairHighlightRequestIdRef.current + 1;
    pairHighlightRequestIdRef.current = requestId;

    if (!isPairHighlightEnabled || !contentRef.current) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const selectionOffsets = getSelectionOffsetsInElement(contentRef.current);

    if (!selectionOffsets || !selectionOffsets.isCollapsed) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const text = normalizeSegmentText(getEditableText(contentRef.current));

    let matched: PairOffsetsResultPayload | null = null;
    try {
      matched = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
        text,
        offset: selectionOffsets.end,
      });
    } catch (error) {
      if (requestId === pairHighlightRequestIdRef.current) {
        setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      }
      console.error('Failed to find matching pair offsets:', error);
      return;
    }

    if (requestId !== pairHighlightRequestIdRef.current) {
      return;
    }

    if (!matched) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const sortedIndexes =
      matched.leftOffset <= matched.rightOffset
        ? [matched.leftOffset, matched.rightOffset]
        : [matched.rightOffset, matched.leftOffset];
    const resolveAbsoluteLine = (line: number) => {
      const safeLine = Math.max(1, Math.floor(line));
      return isHugeEditableMode ? editableSegmentRef.current.startLine + safeLine : safeLine;
    };
    const hasBackendPositions =
      Number.isFinite(matched.leftLine)
      && Number.isFinite(matched.leftColumn)
      && Number.isFinite(matched.rightLine)
      && Number.isFinite(matched.rightColumn);
    const nextHighlights = hasBackendPositions
      ? [
          {
            offset: matched.leftOffset,
            line: resolveAbsoluteLine(matched.leftLine as number),
            column: Math.max(1, Math.floor(matched.leftColumn as number)),
          },
          {
            offset: matched.rightOffset,
            line: resolveAbsoluteLine(matched.rightLine as number),
            column: Math.max(1, Math.floor(matched.rightColumn as number)),
          },
        ]
          .sort((left, right) => left.offset - right.offset)
          .map((item) => ({ line: item.line, column: item.column }))
      : sortedIndexes.map((offset) => {
          const local = codeUnitOffsetToLineColumn(text, offset);
          return {
            line: resolveAbsoluteLine(local.line),
            column: local.column + 1,
          };
        });

    setPairHighlights((prev) =>
      arePairHighlightPositionsEqual(prev, nextHighlights) ? prev : nextHighlights
    );
  }, [
    arePairHighlightPositionsEqual,
    codeUnitOffsetToLineColumn,
    contentRef,
    editableSegmentRef,
    getEditableText,
    getSelectionOffsetsInElement,
    isHugeEditableMode,
    isPairHighlightEnabled,
    normalizeSegmentText,
    setPairHighlights,
  ]);

  const syncSelectionState = useCallback(() => {
    updateCursorPositionFromSelection();
    void updatePairHighlightsFromSelection();
  }, [updateCursorPositionFromSelection, updatePairHighlightsFromSelection]);

  return {
    syncSelectionState,
  };
}
