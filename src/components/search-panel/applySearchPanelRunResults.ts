import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import type {
  FilterMatch,
  SearchMatch,
  SearchMode,
} from './types';

interface CachedSearchSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  sessionId: string | null;
}

interface SearchCountCacheSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  totalMatches: number;
  matchedLines: number;
}

interface CachedFilterSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: FilterMatch[];
  nextLine: number | null;
  sessionId: string | null;
}

interface FilterCountCacheSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matchedLines: number;
}

interface ApplyCachedSearchRunResultOptions {
  cached: CachedSearchSnapshot;
  chunkCursorRef: MutableRefObject<number | null>;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
}

interface ApplySearchRunResultOptions {
  activeTabId: string;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  nextMatches: SearchMatch[];
  nextOffset: number | null;
  parseEscapeSequences: boolean;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  searchMode: SearchMode;
  sessionId: string | null;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  shouldRunCountFallback: boolean;
  startTransition: TransitionStartFunction;
  totalMatchedLines: number | null;
  totalMatches: number | null;
}

interface ApplyCachedFilterRunResultOptions {
  cached: CachedFilterSnapshot;
  filterLineCursorRef: MutableRefObject<number | null>;
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
}

interface ApplyFilterRunResultOptions {
  activeTabId: string;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  nextLine: number | null;
  nextMatches: FilterMatch[];
  sessionId: string | null;
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  setTotalFilterMatchedLineCount: (value: number) => void;
  shouldRunCountFallback: boolean;
  startTransition: TransitionStartFunction;
  totalMatchedLines: number | null;
}

export function applyCachedSearchRunResult({
  cached,
  chunkCursorRef,
  setCurrentMatchIndex,
  setErrorMessage,
  setMatches,
  setSearchSessionId,
  startTransition,
}: ApplyCachedSearchRunResultOptions) {
  setErrorMessage(null);
  startTransition(() => {
    setMatches(cached.matches);
    setCurrentMatchIndex((previousIndex) => {
      if (cached.matches.length === 0) {
        return 0;
      }

      return Math.min(previousIndex, cached.matches.length - 1);
    });
  });

  chunkCursorRef.current = cached.nextOffset;
  setSearchSessionId(cached.sessionId);
}

export function applySearchRunResult({
  activeTabId,
  caseSensitive,
  chunkCursorRef,
  countCacheRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  nextMatches,
  nextOffset,
  parseEscapeSequences,
  cachedSearchRef,
  searchMode,
  sessionId,
  setCurrentMatchIndex,
  setErrorMessage,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  shouldRunCountFallback,
  startTransition,
  totalMatchedLines,
  totalMatches,
}: ApplySearchRunResultOptions) {
  setErrorMessage(null);
  startTransition(() => {
    setMatches(nextMatches);
    setCurrentMatchIndex((previousIndex) => {
      if (nextMatches.length === 0) {
        return 0;
      }

      return Math.min(previousIndex, nextMatches.length - 1);
    });
  });
  if (totalMatches !== null) {
    setTotalMatchCount(totalMatches);
  }
  if (totalMatchedLines !== null) {
    setTotalMatchedLineCount(totalMatchedLines);
  }

  cachedSearchRef.current = {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion,
    matches: nextMatches,
    nextOffset,
    sessionId,
  };

  chunkCursorRef.current = nextOffset;
  setSearchSessionId(sessionId);
  if (!shouldRunCountFallback && totalMatches !== null && totalMatchedLines !== null) {
    countCacheRef.current = {
      tabId: activeTabId,
      keyword: effectiveSearchKeyword,
      searchMode,
      caseSensitive,
      parseEscapeSequences,
      resultFilterKeyword: effectiveResultFilterKeyword,
      documentVersion,
      totalMatches,
      matchedLines: totalMatchedLines,
    };
  }
}

export function applyCachedFilterRunResult({
  cached,
  filterLineCursorRef,
  setCurrentFilterMatchIndex,
  setErrorMessage,
  setFilterMatches,
  setFilterSessionId,
  startTransition,
}: ApplyCachedFilterRunResultOptions) {
  setErrorMessage(null);
  startTransition(() => {
    setFilterMatches(cached.matches);
    setCurrentFilterMatchIndex((previousIndex) => {
      if (cached.matches.length === 0) {
        return 0;
      }

      return Math.min(previousIndex, cached.matches.length - 1);
    });
  });

  filterLineCursorRef.current = cached.nextLine;
  setFilterSessionId(cached.sessionId);
}

export function applyFilterRunResult({
  activeTabId,
  cachedFilterRef,
  documentVersion,
  effectiveResultFilterKeyword,
  filterCountCacheRef,
  filterLineCursorRef,
  filterRulesKey,
  nextLine,
  nextMatches,
  sessionId,
  setCurrentFilterMatchIndex,
  setErrorMessage,
  setFilterMatches,
  setFilterSessionId,
  setTotalFilterMatchedLineCount,
  shouldRunCountFallback,
  startTransition,
  totalMatchedLines,
}: ApplyFilterRunResultOptions) {
  setErrorMessage(null);
  startTransition(() => {
    setFilterMatches(nextMatches);
    setCurrentFilterMatchIndex((previousIndex) => {
      if (nextMatches.length === 0) {
        return 0;
      }

      return Math.min(previousIndex, nextMatches.length - 1);
    });
  });
  if (totalMatchedLines !== null) {
    setTotalFilterMatchedLineCount(totalMatchedLines);
  }

  cachedFilterRef.current = {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion,
    matches: nextMatches,
    nextLine,
    sessionId,
  };

  filterLineCursorRef.current = nextLine;
  setFilterSessionId(sessionId);
  if (!shouldRunCountFallback && totalMatchedLines !== null) {
    filterCountCacheRef.current = {
      tabId: activeTabId,
      rulesKey: filterRulesKey,
      resultFilterKeyword: effectiveResultFilterKeyword,
      documentVersion,
      matchedLines: totalMatchedLines,
    };
  }
}