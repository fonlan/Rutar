import type { MutableRefObject } from 'react';
import type { SearchMode } from './types';

interface CachedSearchSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
}

interface CachedFilterSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
}

interface GetSearchLoadMoreFallbackParamsOptions {
  activeTabId: string;
  cachedSearch: CachedSearchSnapshot | null;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
}

interface HandleSearchLoadMoreVersionMismatchOptions {
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  chunkCursorRef: MutableRefObject<number | null>;
  setSearchSessionId: (value: string | null) => void;
}

interface GetFilterLoadMoreFallbackParamsOptions {
  activeTabId: string;
  cachedFilter: CachedFilterSnapshot | null;
  filterRulesKey: string;
  effectiveResultFilterKeyword: string;
}

interface HandleFilterLoadMoreVersionMismatchOptions {
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  setFilterSessionId: (value: string | null) => void;
}

export function getSearchLoadMoreFallbackParams({
  activeTabId,
  cachedSearch,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  parseEscapeSequences,
  searchMode,
}: GetSearchLoadMoreFallbackParamsOptions): CachedSearchSnapshot | null {
  if (
    !cachedSearch ||
    cachedSearch.tabId !== activeTabId ||
    cachedSearch.keyword !== effectiveSearchKeyword ||
    cachedSearch.searchMode !== searchMode ||
    cachedSearch.caseSensitive !== caseSensitive ||
    cachedSearch.parseEscapeSequences !== parseEscapeSequences ||
    cachedSearch.resultFilterKeyword !== effectiveResultFilterKeyword
  ) {
    return null;
  }

  return cachedSearch;
}

export function handleSearchLoadMoreVersionMismatch({
  cachedSearchRef,
  chunkCursorRef,
  setSearchSessionId,
}: HandleSearchLoadMoreVersionMismatchOptions) {
  cachedSearchRef.current = null;
  chunkCursorRef.current = null;
  setSearchSessionId(null);
}

export function getFilterLoadMoreFallbackParams({
  activeTabId,
  cachedFilter,
  filterRulesKey,
  effectiveResultFilterKeyword,
}: GetFilterLoadMoreFallbackParamsOptions): CachedFilterSnapshot | null {
  if (
    !cachedFilter ||
    cachedFilter.tabId !== activeTabId ||
    cachedFilter.rulesKey !== filterRulesKey ||
    cachedFilter.resultFilterKeyword !== effectiveResultFilterKeyword
  ) {
    return null;
  }

  return cachedFilter;
}

export function handleFilterLoadMoreVersionMismatch({
  cachedFilterRef,
  filterLineCursorRef,
  setFilterSessionId,
}: HandleFilterLoadMoreVersionMismatchOptions) {
  cachedFilterRef.current = null;
  filterLineCursorRef.current = null;
  setFilterSessionId(null);
}