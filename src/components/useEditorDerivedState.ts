import { useMemo } from 'react';
import type { RectangularSelectionState } from './Editor.types';

interface UseEditorDerivedStateParams {
  lineNumberMultiSelection: number[];
  diffHighlightLines: number[];
  rectangularSelection: RectangularSelectionState | null;
  normalizeRectangularSelection: (
    value: RectangularSelectionState | null
  ) => {
    width: number;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    lineCount: number;
  } | null;
}

export function useEditorDerivedState({
  lineNumberMultiSelection,
  diffHighlightLines,
  rectangularSelection,
  normalizeRectangularSelection,
}: UseEditorDerivedStateParams) {
  const lineNumberMultiSelectionSet = useMemo(
    () => new Set(lineNumberMultiSelection),
    [lineNumberMultiSelection]
  );

  const diffHighlightLineSet = useMemo(
    () =>
      new Set(
        (diffHighlightLines || [])
          .filter((line) => Number.isFinite(line) && line > 0)
          .map((line) => Math.floor(line))
      ),
    [diffHighlightLines]
  );

  const normalizedRectangularSelection = useMemo(
    () => normalizeRectangularSelection(rectangularSelection),
    [normalizeRectangularSelection, rectangularSelection]
  );

  return {
    lineNumberMultiSelectionSet,
    diffHighlightLineSet,
    normalizedRectangularSelection,
  };
}
