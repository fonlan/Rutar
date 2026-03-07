import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import type {
  FilterMatch,
  FilterRunResult,
  ReplaceAllAndSearchChunkBackendResult,
  ReplaceCurrentAndSearchChunkBackendResult,
  SearchMatch,
  SearchMode,
  SearchRunResult,
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

interface ApplySearchLoadMoreResultOptions {
  activeTabId: string;
  appendedMatches: SearchMatch[];
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  nextOffset: number | null;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  sessionId: string | null;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  startTransition: TransitionStartFunction;
}

interface ApplyFilterResultFilterStepResultOptions {
  activeTabId: string;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  documentVersion: number;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  nextLine: number | null;
  nextMatches: FilterMatch[];
  resultFilterKeyword: string;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  setTotalFilterMatchedLineCount: (value: number) => void;
  startTransition: TransitionStartFunction;
  totalMatchedLines: number;
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

interface ApplySearchResultFilterStepResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  nextMatches: SearchMatch[];
  nextOffset: number | null;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  startTransition: TransitionStartFunction;
  totalMatchedLines: number;
  totalMatches: number;
}

interface ApplyReplaceCurrentSearchResultOptions {
  activeTabId: string;
  boundedCurrentIndex: number;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  currentMatchIndexRef: MutableRefObject<number>;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  result: ReplaceCurrentAndSearchChunkBackendResult;
  searchMode: SearchMode;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  startTransition: TransitionStartFunction;
}

interface ApplyReplaceAllSearchResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  currentMatchIndexRef: MutableRefObject<number>;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  result: ReplaceAllAndSearchChunkBackendResult;
  searchMode: SearchMode;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  startTransition: TransitionStartFunction;
}

interface ApplyFilterLoadMoreResultOptions {
  activeTabId: string;
  appendedMatches: FilterMatch[];
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  nextLine: number | null;
  sessionId: string | null;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  startTransition: TransitionStartFunction;
}

interface CreateSearchRunSuccessResultOptions {
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
}

interface CreateFilterRunSuccessResultOptions {
  documentVersion: number;
  matches: FilterMatch[];
  nextLine: number | null;
}

export function createSearchRunSuccessResult({
  documentVersion,
  matches,
  nextOffset,
}: CreateSearchRunSuccessResultOptions): SearchRunResult {
  return {
    matches,
    documentVersion,
    errorMessage: null,
    nextOffset,
  };
}

export function createFilterRunSuccessResult({
  documentVersion,
  matches,
  nextLine,
}: CreateFilterRunSuccessResultOptions): FilterRunResult {
  return {
    matches,
    documentVersion,
    errorMessage: null,
    nextLine,
  };
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

export function applyCachedSearchRunHit(
  options: ApplyCachedSearchRunResultOptions,
): SearchRunResult {
  applyCachedSearchRunResult(options);

  return createSearchRunSuccessResult({
    matches: options.cached.matches,
    documentVersion: options.cached.documentVersion,
    nextOffset: options.cached.nextOffset,
  });
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

export function applySearchLoadMoreResult({
  activeTabId,
  appendedMatches,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  nextOffset,
  parseEscapeSequences,
  searchMode,
  sessionId,
  setMatches,
  startTransition,
}: ApplySearchLoadMoreResultOptions) {
  chunkCursorRef.current = nextOffset;

  if (appendedMatches.length === 0) {
    if (cachedSearchRef.current) {
      cachedSearchRef.current.nextOffset = nextOffset;
      cachedSearchRef.current.sessionId = sessionId;
    }
    return;
  }

  startTransition(() => {
    setMatches((previousMatches) => {
      const mergedMatches = [...previousMatches, ...appendedMatches];

      cachedSearchRef.current = {
        tabId: activeTabId,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: mergedMatches,
        nextOffset,
        sessionId,
      };

      return mergedMatches;
    });
  });
}

export function applyFilterResultFilterStepResult({
  activeTabId,
  cachedFilterRef,
  documentVersion,
  filterCountCacheRef,
  filterLineCursorRef,
  filterRulesKey,
  nextLine,
  nextMatches,
  resultFilterKeyword,
  setFilterMatches,
  setFilterSessionId,
  setTotalFilterMatchedLineCount,
  startTransition,
  totalMatchedLines,
}: ApplyFilterResultFilterStepResultOptions) {
  filterLineCursorRef.current = nextLine;
  setFilterSessionId(null);
  cachedFilterRef.current = {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword,
    documentVersion,
    matches: nextMatches,
    nextLine: filterLineCursorRef.current,
    sessionId: null,
  };
  filterCountCacheRef.current = {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword,
    documentVersion,
    matchedLines: totalMatchedLines,
  };
  setTotalFilterMatchedLineCount(totalMatchedLines);
  startTransition(() => {
    setFilterMatches(nextMatches);
  });
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

export function applyCachedFilterRunHit(
  options: ApplyCachedFilterRunResultOptions,
): FilterRunResult {
  applyCachedFilterRunResult(options);

  return createFilterRunSuccessResult({
    matches: options.cached.matches,
    documentVersion: options.cached.documentVersion,
    nextLine: options.cached.nextLine,
  });
}

export function applyFilterLoadMoreResult({
  activeTabId,
  appendedMatches,
  cachedFilterRef,
  documentVersion,
  effectiveResultFilterKeyword,
  filterLineCursorRef,
  filterRulesKey,
  nextLine,
  sessionId,
  setFilterMatches,
  startTransition,
}: ApplyFilterLoadMoreResultOptions) {
  filterLineCursorRef.current = nextLine;

  if (appendedMatches.length === 0) {
    if (cachedFilterRef.current) {
      cachedFilterRef.current.nextLine = nextLine;
      cachedFilterRef.current.sessionId = sessionId;
    }
    return;
  }

  startTransition(() => {
    setFilterMatches((previousMatches) => {
      const mergedMatches = [...previousMatches, ...appendedMatches];

      cachedFilterRef.current = {
        tabId: activeTabId,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: mergedMatches,
        nextLine,
        sessionId,
      };

      return mergedMatches;
    });
  });
}

export function applySearchResultFilterStepResult({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  countCacheRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  nextMatches,
  nextOffset,
  parseEscapeSequences,
  searchMode,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
  totalMatchedLines,
  totalMatches,
}: ApplySearchResultFilterStepResultOptions) {
  setTotalMatchCount(totalMatches);
  setTotalMatchedLineCount(totalMatchedLines);
  chunkCursorRef.current = nextOffset;
  setSearchSessionId(null);
  cachedSearchRef.current = {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion,
    matches: nextMatches,
    nextOffset: chunkCursorRef.current,
    sessionId: null,
  };
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

  startTransition(() => {
    setMatches(nextMatches);
  });
}

export function applyReplaceCurrentSearchResult({
  activeTabId,
  boundedCurrentIndex,
  cachedSearchRef,
  caseSensitive,
  countCacheRef,
  currentMatchIndexRef,
  chunkCursorRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  parseEscapeSequences,
  result,
  searchMode,
  setCurrentMatchIndex,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
}: ApplyReplaceCurrentSearchResultOptions): SearchMatch | null {
  const documentVersion = result.documentVersion ?? 0;
  const nextMatches = result.matches || [];
  const nextOffset = result.nextOffset ?? null;
  const totalMatches = result.totalMatches ?? nextMatches.length;
  const totalMatchedLines =
    result.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size;
  const preferredMatch = result.preferredMatch ?? null;
  const preferredIndex = preferredMatch
    ? nextMatches.findIndex((item) => item.start === preferredMatch.start && item.end === preferredMatch.end)
    : -1;
  const nextIndex =
    nextMatches.length === 0
      ? 0
      : preferredIndex >= 0
        ? preferredIndex
        : Math.min(boundedCurrentIndex, nextMatches.length - 1);

  startTransition(() => {
    setMatches(nextMatches);
    setCurrentMatchIndex(nextIndex);
    setTotalMatchCount(totalMatches);
    setTotalMatchedLineCount(totalMatchedLines);
  });
  currentMatchIndexRef.current = nextIndex;
  chunkCursorRef.current = nextOffset;
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
    sessionId: null,
  };
  setSearchSessionId(null);
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

  return nextMatches[nextIndex] ?? null;
}

export function applyReplaceAllSearchResult({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  countCacheRef,
  currentMatchIndexRef,
  chunkCursorRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  parseEscapeSequences,
  result,
  searchMode,
  setCurrentMatchIndex,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
}: ApplyReplaceAllSearchResultOptions): SearchMatch | null {
  const documentVersion = result.documentVersion ?? 0;
  const nextMatches = result.matches || [];
  const nextOffset = result.nextOffset ?? null;
  const totalMatches = result.totalMatches ?? nextMatches.length;
  const totalMatchedLines =
    result.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size;
  const nextIndex = 0;

  startTransition(() => {
    setMatches(nextMatches);
    setCurrentMatchIndex(nextIndex);
    setTotalMatchCount(totalMatches);
    setTotalMatchedLineCount(totalMatchedLines);
  });
  currentMatchIndexRef.current = nextIndex;
  chunkCursorRef.current = nextOffset;
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
    sessionId: null,
  };
  setSearchSessionId(null);
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

  return nextMatches[nextIndex] ?? null;
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