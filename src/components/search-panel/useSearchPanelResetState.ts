import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { FilterMatch, SearchMatch } from './types';

interface UseSearchPanelResetStateOptions {
  cachedFilterRef: MutableRefObject<unknown>;
  cachedSearchRef: MutableRefObject<unknown>;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<unknown>;
  currentFilterMatchIndex: number;
  currentFilterMatchIndexRef: MutableRefObject<number>;
  currentMatchIndex: number;
  currentMatchIndexRef: MutableRefObject<number>;
  filterCountCacheRef: MutableRefObject<unknown>;
  filterLineCursorRef: MutableRefObject<number | null>;
  setCurrentFilterMatchIndex: (value: number) => void;
  setCurrentMatchIndex: (value: number) => void;
  setFilterMatches: (value: FilterMatch[]) => void;
  setFilterSessionId: (value: string | null) => void;
  setMatches: (value: SearchMatch[]) => void;
  setSearchSessionId: (value: string | null) => void;
  setTotalFilterMatchedLineCount: (value: number | null) => void;
  setTotalMatchCount: (value: number | null) => void;
  setTotalMatchedLineCount: (value: number | null) => void;
}

export function useSearchPanelResetState({
  cachedFilterRef,
  cachedSearchRef,
  chunkCursorRef,
  countCacheRef,
  currentFilterMatchIndex,
  currentFilterMatchIndexRef,
  currentMatchIndex,
  currentMatchIndexRef,
  filterCountCacheRef,
  filterLineCursorRef,
  setCurrentFilterMatchIndex,
  setCurrentMatchIndex,
  setFilterMatches,
  setFilterSessionId,
  setMatches,
  setSearchSessionId,
  setTotalFilterMatchedLineCount,
  setTotalMatchCount,
  setTotalMatchedLineCount,
}: UseSearchPanelResetStateOptions) {
  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex, currentMatchIndexRef]);

  useEffect(() => {
    currentFilterMatchIndexRef.current = currentFilterMatchIndex;
  }, [currentFilterMatchIndex, currentFilterMatchIndexRef]);

  const resetSearchState = useCallback((clearTotals = true) => {
    setMatches([]);
    setCurrentMatchIndex(0);
    setSearchSessionId(null);
    cachedSearchRef.current = null;
    chunkCursorRef.current = null;
    countCacheRef.current = null;

    if (clearTotals) {
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
    }
  }, [
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    setCurrentMatchIndex,
    setMatches,
    setSearchSessionId,
    setTotalMatchCount,
    setTotalMatchedLineCount,
  ]);

  const resetFilterState = useCallback((clearTotals = true) => {
    setFilterMatches([]);
    setCurrentFilterMatchIndex(0);
    setFilterSessionId(null);
    cachedFilterRef.current = null;
    filterLineCursorRef.current = null;
    filterCountCacheRef.current = null;

    if (clearTotals) {
      setTotalFilterMatchedLineCount(null);
    }
  }, [
    cachedFilterRef,
    filterCountCacheRef,
    filterLineCursorRef,
    setCurrentFilterMatchIndex,
    setFilterMatches,
    setFilterSessionId,
    setTotalFilterMatchedLineCount,
  ]);

  return {
    resetFilterState,
    resetSearchState,
  };
}