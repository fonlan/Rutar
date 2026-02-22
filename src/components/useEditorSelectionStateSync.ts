import { invoke } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';
import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorSegmentState, PairHighlightPosition, PairOffsetsResultPayload } from './Editor.types';

const MAX_PAIR_HIGHLIGHT_TEXT_LENGTH = 200_000;

interface UseEditorSelectionStateSyncParams {
  isHugeEditableMode: boolean;
  isPairHighlightEnabled: boolean;
  tabId: string;
  tabLineCount: number;
  initializedRef: MutableRefObject<boolean>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  setActiveLineNumber: (updater: number | ((prev: number) => number)) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setPairHighlights: (updater: PairHighlightPosition[] | ((prev: PairHighlightPosition[]) => PairHighlightPosition[])) => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  getSelectionOffsetsInElement: (element: HTMLTextAreaElement) => { start: number; end: number; isCollapsed: boolean } | null;
  codeUnitOffsetToLineColumn: (text: string, offset: number) => { line: number; column: number };
  arePairHighlightPositionsEqual: (left: PairHighlightPosition[], right: PairHighlightPosition[]) => boolean;
}

export function useEditorSelectionStateSync({
  isHugeEditableMode,
  isPairHighlightEnabled,
  tabId,
  tabLineCount,
  initializedRef,
  contentRef,
  editableSegmentRef,
  setActiveLineNumber,
  setCursorPosition,
  setPairHighlights,
  normalizeSegmentText,
  getEditableText,
  getSelectionOffsetsInElement,
  codeUnitOffsetToLineColumn,
  arePairHighlightPositionsEqual,
}: UseEditorSelectionStateSyncParams) {
  const pairHighlightRequestIdRef = useRef(0);

  const resolveTextareaFocusLineColumn = useCallback((element: HTMLTextAreaElement) => {
    const text = element.value || '';
    const maxOffset = text.length;
    const rawStart = Math.max(0, Math.min(element.selectionStart ?? 0, maxOffset));
    const rawEnd = Math.max(0, Math.min(element.selectionEnd ?? rawStart, maxOffset));
    const isBackward = element.selectionDirection === 'backward';
    const focusOffset = isBackward ? rawStart : rawEnd;

    if (tabLineCount <= 1) {
      return {
        line: 1,
        column: focusOffset,
      };
    }

    let line = 1;
    let lineStartOffset = 0;
    for (let index = 0; index < focusOffset; index += 1) {
      if (text.charCodeAt(index) === 10) {
        line += 1;
        lineStartOffset = index + 1;
      }
    }

    return {
      line,
      column: focusOffset - lineStartOffset,
    };
  }, [tabLineCount]);

  const resolveSelectionPosition = useCallback(() => {
    if (!contentRef.current) {
      return null;
    }

    const localPosition = resolveTextareaFocusLineColumn(contentRef.current);
    const absoluteLine = isHugeEditableMode
      ? editableSegmentRef.current.startLine + localPosition.line
      : localPosition.line;
    const safeLine = Math.max(1, Math.min(Math.max(1, tabLineCount), Math.floor(absoluteLine)));
    const safeColumn = Math.max(1, Math.floor(localPosition.column + 1));

    return {
      safeLine,
      safeColumn,
    };
  }, [
    contentRef,
    editableSegmentRef,
    isHugeEditableMode,
    tabLineCount,
    resolveTextareaFocusLineColumn,
  ]);

  const applyActiveLineNumber = useCallback(
    (safeLine: number, immediate: boolean) => {
      const apply = () => {
        setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
      };

      if (immediate) {
        flushSync(apply);
        return;
      }

      apply();
    },
    [setActiveLineNumber]
  );

  const updateCursorPositionFromSelection = useCallback((options?: { immediateLine?: boolean; skipStore?: boolean }) => {
    if (!initializedRef.current) {
      return;
    }

    const position = resolveSelectionPosition();
    if (!position) {
      return;
    }

    applyActiveLineNumber(position.safeLine, options?.immediateLine === true);

    if (!options?.skipStore) {
      setCursorPosition(tabId, position.safeLine, position.safeColumn);
    }
  }, [
    applyActiveLineNumber,
    initializedRef,
    resolveSelectionPosition,
    setCursorPosition,
    tabId,
  ]);

  const updatePairHighlightsFromSelection = useCallback(async () => {
    const requestId = pairHighlightRequestIdRef.current + 1;
    pairHighlightRequestIdRef.current = requestId;

    if (!isPairHighlightEnabled || !contentRef.current) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const element = contentRef.current;
    const selectionOffsets = getSelectionOffsetsInElement(element);

    if (!selectionOffsets || !selectionOffsets.isCollapsed) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if ((element.value || '').length > MAX_PAIR_HIGHLIGHT_TEXT_LENGTH) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const text = normalizeSegmentText(getEditableText(element));

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

  const syncActiveLineStateNow = useCallback(() => {
    updateCursorPositionFromSelection({
      immediateLine: true,
      skipStore: true,
    });
  }, [updateCursorPositionFromSelection]);

  const syncCursorPositionState = useCallback(() => {
    updateCursorPositionFromSelection();
  }, [updateCursorPositionFromSelection]);

  const syncSelectionState = useCallback(() => {
    syncCursorPositionState();
    void updatePairHighlightsFromSelection();
  }, [syncCursorPositionState, updatePairHighlightsFromSelection]);

  return {
    syncActiveLineStateNow,
    syncCursorPositionState,
    syncSelectionState,
  };
}
