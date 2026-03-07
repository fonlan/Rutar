import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import {
  buildFilterChunkRequest,
  buildSearchChunkRequest,
} from './buildSearchPanelRunRequests';
import type {
  FilterChunkBackendResult,
  FilterRuleInputPayload,
  SearchChunkBackendResult,
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

interface ResolveSearchLoadMoreFallbackStateOptions {
  activeTabId: string;
  cachedSearch: CachedSearchSnapshot | null;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  setSearchSessionId: (value: string | null) => void;
  startOffset: number;
  maxResults: number;
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

interface ResolveFilterLoadMoreFallbackStateOptions {
  activeTabId: string;
  cachedFilter: CachedFilterSnapshot | null;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  rules: FilterRuleInputPayload[];
  setFilterSessionId: (value: string | null) => void;
  startLine: number;
  maxResults: number;
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

export async function resolveSearchLoadMoreFallbackState({
  activeTabId,
  cachedSearch,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  loadMoreSessionId,
  loadMoreSessionRef,
  parseEscapeSequences,
  searchMode,
  setSearchSessionId,
  startOffset,
  maxResults,
}: ResolveSearchLoadMoreFallbackStateOptions): Promise<{
  appendedMatches: SearchChunkBackendResult['matches'];
  documentVersion: number;
  nextOffset: number | null;
} | null> {
  const params = getSearchLoadMoreFallbackParams({
    activeTabId,
    cachedSearch,
    caseSensitive,
    effectiveResultFilterKeyword,
    effectiveSearchKeyword,
    parseEscapeSequences,
    searchMode,
  });
  if (!params) {
    return null;
  }

  const backendResult = await invoke<SearchChunkBackendResult>(
    'search_in_document_chunk',
    buildSearchChunkRequest({
      activeTabId,
      effectiveSearchKeyword,
      searchMode,
      caseSensitive,
      effectiveResultFilterKeyword,
      startOffset,
      maxResults,
    })
  );

  if (loadMoreSessionId !== loadMoreSessionRef.current) {
    return null;
  }

  if (backendResult.documentVersion !== params.documentVersion) {
    handleSearchLoadMoreVersionMismatch({
      cachedSearchRef,
      chunkCursorRef,
      setSearchSessionId,
    });
    return null;
  }

  return {
    appendedMatches: backendResult.matches || [],
    nextOffset: backendResult.nextOffset ?? null,
    documentVersion: params.documentVersion,
  };
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

export async function resolveFilterLoadMoreFallbackState({
  activeTabId,
  cachedFilter,
  cachedFilterRef,
  caseSensitive,
  effectiveResultFilterKeyword,
  filterLineCursorRef,
  filterRulesKey,
  loadMoreSessionId,
  loadMoreSessionRef,
  rules,
  setFilterSessionId,
  startLine,
  maxResults,
}: ResolveFilterLoadMoreFallbackStateOptions): Promise<{
  appendedMatches: FilterChunkBackendResult['matches'];
  documentVersion: number;
  nextLine: number | null;
} | null> {
  const params = getFilterLoadMoreFallbackParams({
    activeTabId,
    cachedFilter,
    filterRulesKey,
    effectiveResultFilterKeyword,
  });
  if (!params) {
    return null;
  }

  const backendResult = await invoke<FilterChunkBackendResult>(
    'filter_in_document_chunk',
    buildFilterChunkRequest({
      activeTabId,
      rules,
      effectiveResultFilterKeyword,
      caseSensitive,
      startLine,
      maxResults,
    })
  );

  if (loadMoreSessionId !== loadMoreSessionRef.current) {
    return null;
  }

  if (backendResult.documentVersion !== params.documentVersion) {
    handleFilterLoadMoreVersionMismatch({
      cachedFilterRef,
      filterLineCursorRef,
      setFilterSessionId,
    });
    return null;
  }

  return {
    appendedMatches: backendResult.matches || [],
    nextLine: backendResult.nextLine ?? null,
    documentVersion: params.documentVersion,
  };
}
