import type { MutableRefObject } from 'react';
import type {
  FilterCountBackendResult,
  SearchCountBackendResult,
  SearchMode,
} from './types';

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

interface FilterCountCacheSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matchedLines: number;
}

interface ApplySearchCountResultOptions {
  activeTabId: string;
  caseSensitive: boolean;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  result: SearchCountBackendResult;
  searchMode: SearchMode;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
}

interface HandleSearchCountFailureOptions {
  error: unknown;
  setTotalMatchCount: (value: number | null) => void;
  setTotalMatchedLineCount: (value: number | null) => void;
}

interface ApplyFilterCountResultOptions {
  activeTabId: string;
  effectiveResultFilterKeyword: string;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterRulesKey: string;
  result: FilterCountBackendResult;
  setTotalFilterMatchedLineCount: (value: number) => void;
}

interface HandleFilterCountFailureOptions {
  error: unknown;
  setTotalFilterMatchedLineCount: (value: number | null) => void;
}

export function applySearchCountResult({
  activeTabId,
  caseSensitive,
  countCacheRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  parseEscapeSequences,
  result,
  searchMode,
  setTotalMatchCount,
  setTotalMatchedLineCount,
}: ApplySearchCountResultOptions) {
  setTotalMatchCount(result.totalMatches ?? 0);
  setTotalMatchedLineCount(result.matchedLines ?? 0);

  countCacheRef.current = {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion: result.documentVersion ?? 0,
    totalMatches: result.totalMatches ?? 0,
    matchedLines: result.matchedLines ?? 0,
  };
}

export function handleSearchCountFailure({
  error,
  setTotalMatchCount,
  setTotalMatchedLineCount,
}: HandleSearchCountFailureOptions) {
  console.warn('Count search failed:', error);
  setTotalMatchCount(null);
  setTotalMatchedLineCount(null);
}

export function applyFilterCountResult({
  activeTabId,
  effectiveResultFilterKeyword,
  filterCountCacheRef,
  filterRulesKey,
  result,
  setTotalFilterMatchedLineCount,
}: ApplyFilterCountResultOptions) {
  setTotalFilterMatchedLineCount(result.matchedLines ?? 0);
  filterCountCacheRef.current = {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword: effectiveResultFilterKeyword,
    documentVersion: result.documentVersion ?? 0,
    matchedLines: result.matchedLines ?? 0,
  };
}

export function handleFilterCountFailure({
  error,
  setTotalFilterMatchedLineCount,
}: HandleFilterCountFailureOptions) {
  console.warn('Filter count failed:', error);
  setTotalFilterMatchedLineCount(null);
}