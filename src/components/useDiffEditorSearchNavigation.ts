import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseDiffEditorSearchNavigationParams {
  sourceTabId: string | null;
  targetTabId: string | null;
  alignedLineCount: number;
  sourceAlignedPresent: boolean[];
  targetAlignedPresent: boolean[];
  sourceLineNumbers: number[];
  targetLineNumbers: number[];
}

export function useDiffEditorSearchNavigation({
  sourceTabId,
  targetTabId,
  alignedLineCount,
  sourceAlignedPresent,
  targetAlignedPresent,
  sourceLineNumbers,
  targetLineNumbers,
}: UseDiffEditorSearchNavigationParams) {
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [sourceSearchMatchedRows, setSourceSearchMatchedRows] = useState<number[]>([]);
  const [targetSearchMatchedRows, setTargetSearchMatchedRows] = useState<number[]>([]);
  const [sourceSearchMatchedRow, setSourceSearchMatchedRow] = useState<number | null>(null);
  const [targetSearchMatchedRow, setTargetSearchMatchedRow] = useState<number | null>(null);

  const sourceSearchRequestSequenceRef = useRef(0);
  const targetSearchRequestSequenceRef = useRef(0);

  const trimmedSourceSearchQuery = sourceSearchQuery.trim();
  const trimmedTargetSearchQuery = targetSearchQuery.trim();

  const normalizeMatchedRows = useCallback((matchedRows: unknown, alignedLineCountValue: number) => {
    if (!Array.isArray(matchedRows)) {
      return [];
    }

    return matchedRows
      .map((value) => (Number.isFinite(value) ? Math.floor(value) : -1))
      .filter((value) => value >= 0 && value < alignedLineCountValue);
  }, []);

  const mapMatchedLineNumbersToRows = useCallback((matchedLineNumbers: unknown, lineNumbers: number[]) => {
    const matchedLineNumberSet = new Set<number>(
      Array.isArray(matchedLineNumbers) ? matchedLineNumbers : []
    );
    const matchedRows: number[] = [];
    for (let rowIndex = 0; rowIndex < lineNumbers.length; rowIndex += 1) {
      const lineNumber = lineNumbers[rowIndex] ?? 0;
      if (lineNumber > 0 && matchedLineNumberSet.has(lineNumber)) {
        matchedRows.push(rowIndex);
      }
    }
    return matchedRows;
  }, []);

  const queryPanelSearchMatchedRows = useCallback(
    async (
      id: string,
      keyword: string,
      alignedPresent: boolean[],
      lineNumbers: number[],
      alignedLineCountValue: number
    ) => {
      try {
        const matchedRows = await invoke<number[]>('search_diff_panel_aligned_row_matches', {
          id,
          keyword,
          alignedPresent,
        });
        return normalizeMatchedRows(matchedRows, alignedLineCountValue);
      } catch {
        // keep fallback path for older backend runtime
      }

      const matchedLineNumbers = await invoke<number[]>('search_diff_panel_line_matches', {
        id,
        keyword,
      });
      return mapMatchedLineNumbersToRows(matchedLineNumbers, lineNumbers);
    },
    [mapMatchedLineNumbersToRows, normalizeMatchedRows]
  );

  useEffect(() => {
    if (!sourceTabId || !trimmedSourceSearchQuery) {
      sourceSearchRequestSequenceRef.current = sourceSearchRequestSequenceRef.current + 1;
      setSourceSearchMatchedRows([]);
      return;
    }

    const currentSequence = sourceSearchRequestSequenceRef.current + 1;
    sourceSearchRequestSequenceRef.current = currentSequence;

    void queryPanelSearchMatchedRows(
      sourceTabId,
      trimmedSourceSearchQuery,
      sourceAlignedPresent,
      sourceLineNumbers,
      alignedLineCount
    )
      .then((matchedRows) => {
        if (sourceSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        setSourceSearchMatchedRows(matchedRows);
      })
      .catch((error) => {
        if (sourceSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        console.error('Failed to search source diff panel matches:', error);
        setSourceSearchMatchedRows([]);
      });
  }, [
    alignedLineCount,
    queryPanelSearchMatchedRows,
    sourceAlignedPresent,
    sourceLineNumbers,
    sourceTabId,
    trimmedSourceSearchQuery,
  ]);

  useEffect(() => {
    if (!targetTabId || !trimmedTargetSearchQuery) {
      targetSearchRequestSequenceRef.current = targetSearchRequestSequenceRef.current + 1;
      setTargetSearchMatchedRows([]);
      return;
    }

    const currentSequence = targetSearchRequestSequenceRef.current + 1;
    targetSearchRequestSequenceRef.current = currentSequence;

    void queryPanelSearchMatchedRows(
      targetTabId,
      trimmedTargetSearchQuery,
      targetAlignedPresent,
      targetLineNumbers,
      alignedLineCount
    )
      .then((matchedRows) => {
        if (targetSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        setTargetSearchMatchedRows(matchedRows);
      })
      .catch((error) => {
        if (targetSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        console.error('Failed to search target diff panel matches:', error);
        setTargetSearchMatchedRows([]);
      });
  }, [
    alignedLineCount,
    queryPanelSearchMatchedRows,
    targetAlignedPresent,
    targetLineNumbers,
    targetTabId,
    trimmedTargetSearchQuery,
  ]);

  const sourceSearchCurrentRow = useMemo(() => {
    if (sourceSearchMatchedRow === null) {
      return null;
    }

    return sourceSearchMatchedRows.includes(sourceSearchMatchedRow)
      ? sourceSearchMatchedRow
      : null;
  }, [sourceSearchMatchedRow, sourceSearchMatchedRows]);

  const targetSearchCurrentRow = useMemo(() => {
    if (targetSearchMatchedRow === null) {
      return null;
    }

    return targetSearchMatchedRows.includes(targetSearchMatchedRow)
      ? targetSearchMatchedRow
      : null;
  }, [targetSearchMatchedRow, targetSearchMatchedRows]);

  useEffect(() => {
    if (sourceSearchMatchedRow === null) {
      return;
    }

    if (!sourceSearchMatchedRows.includes(sourceSearchMatchedRow)) {
      setSourceSearchMatchedRow(null);
    }
  }, [sourceSearchMatchedRow, sourceSearchMatchedRows]);

  useEffect(() => {
    if (targetSearchMatchedRow === null) {
      return;
    }

    if (!targetSearchMatchedRows.includes(targetSearchMatchedRow)) {
      setTargetSearchMatchedRow(null);
    }
  }, [targetSearchMatchedRow, targetSearchMatchedRows]);

  return {
    sourceSearchQuery,
    setSourceSearchQuery,
    targetSearchQuery,
    setTargetSearchQuery,
    sourceSearchMatchedRows,
    targetSearchMatchedRows,
    sourceSearchMatchedRow,
    setSourceSearchMatchedRow,
    targetSearchMatchedRow,
    setTargetSearchMatchedRow,
    sourceSearchCurrentRow,
    targetSearchCurrentRow,
    sourceSearchDisabled: sourceSearchMatchedRows.length === 0,
    targetSearchDisabled: targetSearchMatchedRows.length === 0,
  };
}
