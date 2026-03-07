import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { appendRecentTextHistoryEntry } from '@/lib/recentTextHistory';
import type { SearchResultPanelState } from './types';

interface UseSearchInputHistoryOptions {
  recentReplaceValues: string[];
  recentSearchKeywords: string[];
  updateSettings: (updates: {
    recentReplaceValues?: string[];
    recentSearchKeywords?: string[];
  }) => void;
}

interface UseSearchInputHistoryResult {
  rememberReplaceValue: (value: string) => void;
  rememberSearchKeyword: (value: string) => void;
}

export function useSearchInputHistory({
  recentReplaceValues,
  recentSearchKeywords,
  updateSettings,
}: UseSearchInputHistoryOptions): UseSearchInputHistoryResult {
  const rememberSearchKeyword = useCallback((value: string) => {
    if (value.length === 0) {
      return;
    }

    const nextKeywords = appendRecentTextHistoryEntry(recentSearchKeywords, value);
    if (nextKeywords !== recentSearchKeywords) {
      updateSettings({ recentSearchKeywords: nextKeywords });
    }
  }, [recentSearchKeywords, updateSettings]);

  const rememberReplaceValue = useCallback((value: string) => {
    const nextValues = appendRecentTextHistoryEntry(recentReplaceValues, value);
    if (nextValues !== recentReplaceValues) {
      updateSettings({ recentReplaceValues: nextValues });
    }
  }, [recentReplaceValues, updateSettings]);

  return {
    rememberReplaceValue,
    rememberSearchKeyword,
  };
}

interface UseSearchKeywordKeyDownOptions {
  executeFilter: (forceRefresh?: boolean) => Promise<unknown>;
  executeSearch: (forceRefresh?: boolean) => Promise<unknown>;
  isFilterMode: boolean;
  isSearching: boolean;
  keyword: string;
  navigateByStep: (step: number) => Promise<void>;
  rememberSearchKeyword: (value: string) => void;
  reverseSearch: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  setIsOpen: (value: boolean) => void;
  setResultPanelState: (value: SearchResultPanelState) => void;
}

export function useSearchKeywordKeyDown({
  executeFilter,
  executeSearch,
  isFilterMode,
  isSearching,
  keyword,
  navigateByStep,
  rememberSearchKeyword,
  reverseSearch,
  searchInputRef,
  setIsOpen,
  setResultPanelState,
}: UseSearchKeywordKeyDownOptions) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isFilterMode) {
          if (!isSearching) {
            void executeFilter(true);
          }
          return;
        }

        if (event.currentTarget === searchInputRef.current) {
          setResultPanelState('open');
          rememberSearchKeyword(keyword);
          if (!isSearching) {
            void executeSearch(true);
          }
          return;
        }

        const primaryStep = reverseSearch ? -1 : 1;
        const step = event.shiftKey ? -primaryStep : primaryStep;
        void navigateByStep(step);
      }
    },
    [
      executeFilter,
      executeSearch,
      isFilterMode,
      isSearching,
      keyword,
      navigateByStep,
      rememberSearchKeyword,
      reverseSearch,
      searchInputRef,
      setIsOpen,
      setResultPanelState,
    ]
  );
}