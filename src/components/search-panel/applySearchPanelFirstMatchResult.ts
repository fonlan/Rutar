import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import type {
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

interface ApplyEmptySearchFirstMatchResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  resetSearchState: (clearTotals?: boolean) => void;
  searchMode: SearchMode;
  setErrorMessage: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
  setSearchSessionId: (value: string | null) => void;
}

interface ApplyImmediateSearchFirstMatchResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  documentVersion: number;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  firstMatch: SearchMatch;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
}

export function applyEmptySearchFirstMatchResult({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  parseEscapeSequences,
  resetSearchState,
  searchMode,
  setErrorMessage,
  setIsSearching,
  setSearchSessionId,
}: ApplyEmptySearchFirstMatchResultOptions): SearchRunResult {
  setErrorMessage(null);
  resetSearchState(false);

  cachedSearchRef.current = {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion,
    matches: [],
    nextOffset: null,
    sessionId: null,
  };
  setSearchSessionId(null);
  chunkCursorRef.current = null;
  setIsSearching(false);

  return {
    matches: [],
    documentVersion,
    errorMessage: null,
    nextOffset: null,
  };
}

export function applyImmediateSearchFirstMatchResult({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  firstMatch,
  parseEscapeSequences,
  searchMode,
  setCurrentMatchIndex,
  setErrorMessage,
  setMatches,
  setSearchSessionId,
  startTransition,
}: ApplyImmediateSearchFirstMatchResultOptions): SearchRunResult {
  const immediateMatches = [firstMatch];
  setErrorMessage(null);
  startTransition(() => {
    setMatches(immediateMatches);
    setCurrentMatchIndex(0);
  });

  cachedSearchRef.current = {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion,
    matches: immediateMatches,
    nextOffset: 0,
    sessionId: null,
  };
  setSearchSessionId(null);
  chunkCursorRef.current = 0;

  return {
    matches: immediateMatches,
    documentVersion,
    errorMessage: null,
    nextOffset: 0,
  };
}