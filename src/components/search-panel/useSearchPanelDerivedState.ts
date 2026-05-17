import { useMemo } from 'react';
import type { FilterMatch, SearchMatch } from './types';
import { resolveSearchKeyword } from './utils';

interface UseSearchPanelDerivedStateOptions {
  appliedResultFilterKeyword: string;
  caseSensitive: boolean;
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  filterMatches: FilterMatch[];
  keyword: string;
  matches: SearchMatch[];
  parseEscapeSequences: boolean;
}

export function useSearchPanelDerivedState({
  appliedResultFilterKeyword,
  caseSensitive,
  currentFilterMatchIndex,
  currentMatchIndex,
  filterMatches,
  keyword,
  matches,
  parseEscapeSequences,
}: UseSearchPanelDerivedStateOptions) {
  const normalizedResultFilterKeyword = appliedResultFilterKeyword.trim().toLowerCase();
  const isResultFilterActive = normalizedResultFilterKeyword.length > 0;

  const backendResultFilterKeyword = useMemo(() => {
    if (!isResultFilterActive) {
      return '';
    }

    return caseSensitive ? appliedResultFilterKeyword.trim() : normalizedResultFilterKeyword;
  }, [appliedResultFilterKeyword, caseSensitive, isResultFilterActive, normalizedResultFilterKeyword]);

  const effectiveSearchKeyword = useMemo(
    () => resolveSearchKeyword(keyword, parseEscapeSequences),
    [keyword, parseEscapeSequences]
  );

  const visibleFilterMatches = useMemo(() => filterMatches, [filterMatches]);
  const visibleMatches = useMemo(() => matches, [matches]);

  const visibleCurrentFilterMatchIndex = useMemo(() => {
    if (visibleFilterMatches.length === 0) {
      return -1;
    }

    return Math.min(currentFilterMatchIndex, visibleFilterMatches.length - 1);
  }, [currentFilterMatchIndex, visibleFilterMatches]);

  const visibleCurrentMatchIndex = useMemo(() => {
    if (visibleMatches.length === 0) {
      return -1;
    }

    return Math.min(currentMatchIndex, visibleMatches.length - 1);
  }, [currentMatchIndex, visibleMatches]);

  return {
    backendResultFilterKeyword,
    effectiveSearchKeyword,
    isResultFilterActive,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  };
}
