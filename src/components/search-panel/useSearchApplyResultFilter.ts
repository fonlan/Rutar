import { useCallback, type MutableRefObject } from 'react';
import type { FilterRunResult, SearchRunResult } from './types';

interface UseSearchApplyResultFilterOptions {
  appliedResultFilterKeyword: string;
  cancelPendingBatchLoad: () => void;
  caseSensitive: boolean;
  executeFilter: (
    forceRefresh?: boolean,
    silent?: boolean,
    resultFilterKeywordOverride?: string
  ) => Promise<FilterRunResult | null>;
  executeSearch: (
    forceRefresh?: boolean,
    silent?: boolean,
    resultFilterKeywordOverride?: string
  ) => Promise<SearchRunResult | null>;
  isFilterMode: boolean;
  isResultFilterSearching: boolean;
  keyword: string;
  requestStopResultFilterSearch: () => void;
  resultFilterKeyword: string;
  setAppliedResultFilterKeyword: (keyword: string) => void;
  setIsResultFilterSearching: (value: boolean) => void;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
}

export function useSearchApplyResultFilter({
  appliedResultFilterKeyword,
  cancelPendingBatchLoad,
  caseSensitive,
  executeFilter,
  executeSearch,
  isFilterMode,
  isResultFilterSearching,
  keyword,
  requestStopResultFilterSearch,
  resultFilterKeyword,
  setAppliedResultFilterKeyword,
  setIsResultFilterSearching,
  stopResultFilterSearchRef,
}: UseSearchApplyResultFilterOptions) {
  return useCallback(async () => {
    cancelPendingBatchLoad();
    const nextKeyword = resultFilterKeyword.trim();
    const nextResultFilterKeyword = nextKeyword
      ? caseSensitive
        ? nextKeyword
        : nextKeyword.toLowerCase()
      : '';

    if (nextKeyword.length === 0) {
      requestStopResultFilterSearch();
      setAppliedResultFilterKeyword('');
      void executeSearch(true, true, '');
      if (isFilterMode) {
        void executeFilter(true, true, '');
      }
      setIsResultFilterSearching(false);
      return;
    }

    if (isResultFilterSearching) {
      return;
    }

    if (nextKeyword === appliedResultFilterKeyword.trim()) {
      return;
    }

    stopResultFilterSearchRef.current = false;
    setIsResultFilterSearching(true);
    setAppliedResultFilterKeyword('');

    try {
      if (isFilterMode) {
        await executeFilter(true, true, nextResultFilterKeyword);
      } else if (keyword) {
        await executeSearch(true, true, nextResultFilterKeyword);
      }

      if (!stopResultFilterSearchRef.current) {
        setAppliedResultFilterKeyword(nextKeyword);
      }
    } finally {
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = false;
    }
  }, [
    appliedResultFilterKeyword,
    cancelPendingBatchLoad,
    caseSensitive,
    executeFilter,
    executeSearch,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
    setAppliedResultFilterKeyword,
    setIsResultFilterSearching,
    stopResultFilterSearchRef,
  ]);
}