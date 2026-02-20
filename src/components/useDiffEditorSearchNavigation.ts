import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseDiffEditorSearchNavigationParams {
  sourceTabId: string | null;
  targetTabId: string | null;
  alignedLineCount: number;
  sourceAlignedPresent: boolean[];
  targetAlignedPresent: boolean[];
}

export function useDiffEditorSearchNavigation({
  sourceTabId,
  targetTabId,
  alignedLineCount,
  sourceAlignedPresent,
  targetAlignedPresent,
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

  const queryPanelSearchMatchedRows = useCallback(
    async (
      id: string,
      keyword: string,
      alignedPresent: boolean[],
      alignedLineCountValue: number
    ) => {
      const matchedRows = await invoke<number[]>('search_diff_panel_aligned_row_matches', {
        id,
        keyword,
        alignedPresent,
      });
      return normalizeMatchedRows(matchedRows, alignedLineCountValue);
    },
    [normalizeMatchedRows]
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
