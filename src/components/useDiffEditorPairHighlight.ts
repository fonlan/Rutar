import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivePanel, LineDiffComparisonResult } from './diffEditor.types';
import { editorTestUtils } from './editorUtils';

interface PairHighlightPosition {
  line: number;
  column: number;
}

interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
  leftLine?: number;
  leftColumn?: number;
  rightLine?: number;
  rightColumn?: number;
}

interface UseDiffEditorPairHighlightParams {
  lineDiff: LineDiffComparisonResult;
}

const { codeUnitOffsetToLineColumn, arePairHighlightPositionsEqual } = editorTestUtils;

function isPairCandidateCharacter(char: string) {
  return char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}' || char === '"' || char === "'";
}

export function useDiffEditorPairHighlight({ lineDiff }: UseDiffEditorPairHighlightParams) {
  const [sourcePairHighlights, setSourcePairHighlights] = useState<PairHighlightPosition[]>([]);
  const [targetPairHighlights, setTargetPairHighlights] = useState<PairHighlightPosition[]>([]);
  const pairHighlightRequestIdRef = useRef<{ source: number; target: number }>({
    source: 0,
    target: 0,
  });

  const setPairHighlightsForSide = useCallback(
    (side: ActivePanel, nextHighlights: PairHighlightPosition[]) => {
      if (side === 'source') {
        setSourcePairHighlights((previous) =>
          arePairHighlightPositionsEqual(previous, nextHighlights) ? previous : nextHighlights
        );
        return;
      }

      setTargetPairHighlights((previous) =>
        arePairHighlightPositionsEqual(previous, nextHighlights) ? previous : nextHighlights
      );
    },
    []
  );

  const clearPairHighlightsForSide = useCallback(
    (side: ActivePanel) => {
      pairHighlightRequestIdRef.current[side] = pairHighlightRequestIdRef.current[side] + 1;
      setPairHighlightsForSide(side, []);
    },
    [setPairHighlightsForSide]
  );

  const updatePairHighlightsForSide = useCallback(
    async (side: ActivePanel, text: string, selectionStart: number, selectionEnd: number) => {
      const requestId = pairHighlightRequestIdRef.current[side] + 1;
      pairHighlightRequestIdRef.current[side] = requestId;

      if (selectionStart !== selectionEnd) {
        setPairHighlightsForSide(side, []);
        return;
      }

      let matched: PairOffsetsResultPayload | null = null;
      try {
        matched = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
          text,
          offset: selectionEnd,
        });
      } catch (error) {
        if (pairHighlightRequestIdRef.current[side] === requestId) {
          setPairHighlightsForSide(side, []);
        }
        console.error('Failed to find matching pair offsets in diff panel:', error);
        return;
      }

      if (pairHighlightRequestIdRef.current[side] !== requestId) {
        return;
      }

      if (!matched) {
        setPairHighlightsForSide(side, []);
        return;
      }

      // Prefer matching the character currently at caret position when backend resolution
      // lands on previous offset but caret itself is on a pair candidate.
      if (selectionStart === selectionEnd && selectionEnd >= 0 && selectionEnd < text.length) {
        const currentChar = text.charAt(selectionEnd);
        if (isPairCandidateCharacter(currentChar)) {
          const includesCurrent =
            matched.leftOffset === selectionEnd || matched.rightOffset === selectionEnd;
          const includesPrevious =
            selectionEnd > 0
              && (matched.leftOffset === selectionEnd - 1 || matched.rightOffset === selectionEnd - 1);

          if (!includesCurrent && includesPrevious) {
            try {
              const corrected = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
                text,
                offset: selectionEnd + 1,
              });
              if (pairHighlightRequestIdRef.current[side] !== requestId) {
                return;
              }
              if (corrected) {
                matched = corrected;
              }
            } catch (error) {
              console.error('Failed to correct matching pair offset in diff panel:', error);
            }
          }
        }
      }

      const sortedOffsets = matched.leftOffset <= matched.rightOffset
        ? [matched.leftOffset, matched.rightOffset]
        : [matched.rightOffset, matched.leftOffset];
      const hasBackendPositions =
        Number.isFinite(matched.leftLine)
        && Number.isFinite(matched.leftColumn)
        && Number.isFinite(matched.rightLine)
        && Number.isFinite(matched.rightColumn);
      const nextHighlights = hasBackendPositions
        ? [
          {
            offset: matched.leftOffset,
            line: Math.max(1, Math.floor(matched.leftLine as number)),
            column: Math.max(1, Math.floor(matched.leftColumn as number)),
          },
          {
            offset: matched.rightOffset,
            line: Math.max(1, Math.floor(matched.rightLine as number)),
            column: Math.max(1, Math.floor(matched.rightColumn as number)),
          },
        ]
          .sort((left, right) => left.offset - right.offset)
          .map((item) => ({ line: item.line, column: item.column }))
        : sortedOffsets.map((offset) => {
          const position = codeUnitOffsetToLineColumn(text, offset);
          return {
            line: Math.max(1, position.line),
            column: position.column + 1,
          };
        });
      setPairHighlightsForSide(side, nextHighlights);
    },
    [setPairHighlightsForSide]
  );

  useEffect(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return;
    }

    const value = activeElement.value ?? '';
    const selectionStart = activeElement.selectionStart ?? value.length;
    const selectionEnd = activeElement.selectionEnd ?? value.length;
    void updatePairHighlightsForSide(panel, value, selectionStart, selectionEnd);
  }, [lineDiff, updatePairHighlightsForSide]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLTextAreaElement)) {
        return;
      }

      const panel = activeElement.dataset.diffPanel;
      if (panel !== 'source' && panel !== 'target') {
        return;
      }

      const value = activeElement.value ?? '';
      const selectionStart = activeElement.selectionStart ?? value.length;
      const selectionEnd = activeElement.selectionEnd ?? value.length;
      void updatePairHighlightsForSide(panel, value, selectionStart, selectionEnd);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [updatePairHighlightsForSide]);

  const schedulePairHighlightSyncForSide = useCallback(
    (side: ActivePanel, textarea: HTMLTextAreaElement) => {
      window.requestAnimationFrame(() => {
        if (!textarea.isConnected) {
          return;
        }

        const panel = textarea.dataset.diffPanel;
        if (panel !== side) {
          return;
        }

        const value = textarea.value ?? '';
        const selectionStart = textarea.selectionStart ?? value.length;
        const selectionEnd = textarea.selectionEnd ?? value.length;
        void updatePairHighlightsForSide(side, value, selectionStart, selectionEnd);
      });
    },
    [updatePairHighlightsForSide]
  );

  return {
    sourcePairHighlights,
    targetPairHighlights,
    clearPairHighlightsForSide,
    updatePairHighlightsForSide,
    schedulePairHighlightSyncForSide,
  };
}
