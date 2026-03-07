import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import {
  isFilterSessionStartBackendResult,
  isSearchSessionStartBackendResult,
} from './backendGuards';
import {
  buildFilterChunkRequest,
  buildFilterSessionStartRequest,
  buildSearchChunkRequest,
  buildSearchSessionStartRequest,
} from './buildSearchPanelRunRequests';
import { attemptSearchPanelSessionStart } from './attemptSearchPanelSessionStart';
import { resolveFilterChunkState, resolveSearchChunkState } from './resolveSearchPanelChunkState';
import {
  resolveFilterSessionStartState,
  resolveSearchSessionStartState,
} from './resolveSearchPanelSessionStartState';
import type {
  FilterChunkBackendResult,
  FilterRuleInputPayload,
  SearchChunkBackendResult,
  SearchMode,
} from './types';

interface ResolveSearchRunStartStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  searchMode: SearchMode;
  searchSessionCommandUnsupportedRef: MutableRefObject<boolean>;
}

interface ResolvedSearchRunStartState {
  documentVersion: number;
  nextMatches: SearchChunkBackendResult['matches'];
  nextOffset: number | null;
  sessionId: string | null;
  shouldRunCountFallback: boolean;
  totalMatchedLines: number | null;
  totalMatches: number | null;
}

interface ResolveFilterRunStartStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  maxResults: number;
  rules: FilterRuleInputPayload[];
}

interface ResolvedFilterRunStartState {
  documentVersion: number;
  nextLine: number | null;
  nextMatches: FilterChunkBackendResult['matches'];
  sessionId: string | null;
  shouldRunCountFallback: boolean;
  totalMatchedLines: number | null;
}

export async function resolveSearchRunStartState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  searchMode,
  searchSessionCommandUnsupportedRef,
}: ResolveSearchRunStartStateOptions): Promise<ResolvedSearchRunStartState> {
  const sessionStartResult = await attemptSearchPanelSessionStart({
    commandName: 'search_session_start_in_document',
    isExpectedResult: isSearchSessionStartBackendResult,
    request: buildSearchSessionStartRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      effectiveSearchKeyword,
      maxResults,
      searchMode,
    }),
    sessionCommandUnsupportedRef: searchSessionCommandUnsupportedRef,
  });

  if (sessionStartResult) {
    searchSessionCommandUnsupportedRef.current = false;
    const {
      documentVersion,
      nextMatches,
      nextOffset,
      sessionId,
      totalMatchedLines,
      totalMatches,
    } = resolveSearchSessionStartState(sessionStartResult);

    return {
      documentVersion,
      nextMatches,
      nextOffset,
      sessionId,
      shouldRunCountFallback: false,
      totalMatchedLines,
      totalMatches,
    };
  }

  const backendResult = await invoke<SearchChunkBackendResult>(
    'search_in_document_chunk',
    buildSearchChunkRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      effectiveSearchKeyword,
      maxResults,
      searchMode,
      startOffset: 0,
    })
  );
  const {
    documentVersion,
    nextMatches,
    nextOffset,
  } = resolveSearchChunkState(backendResult);

  return {
    documentVersion,
    nextMatches,
    nextOffset,
    sessionId: null,
    shouldRunCountFallback: true,
    totalMatchedLines: null,
    totalMatches: null,
  };
}

export async function resolveFilterRunStartState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  filterSessionCommandUnsupportedRef,
  maxResults,
  rules,
}: ResolveFilterRunStartStateOptions): Promise<ResolvedFilterRunStartState> {
  const sessionStartResult = await attemptSearchPanelSessionStart({
    commandName: 'filter_session_start_in_document',
    isExpectedResult: isFilterSessionStartBackendResult,
    request: buildFilterSessionStartRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      maxResults,
      rules,
    }),
    sessionCommandUnsupportedRef: filterSessionCommandUnsupportedRef,
  });

  if (sessionStartResult) {
    filterSessionCommandUnsupportedRef.current = false;
    const {
      documentVersion,
      nextLine,
      nextMatches,
      sessionId,
      totalMatchedLines,
    } = resolveFilterSessionStartState(sessionStartResult);

    return {
      documentVersion,
      nextLine,
      nextMatches,
      sessionId,
      shouldRunCountFallback: false,
      totalMatchedLines,
    };
  }

  const backendResult = await invoke<FilterChunkBackendResult>(
    'filter_in_document_chunk',
    buildFilterChunkRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      maxResults,
      rules,
      startLine: 0,
    })
  );
  const {
    documentVersion,
    nextLine,
    nextMatches,
  } = resolveFilterChunkState(backendResult);

  return {
    documentVersion,
    nextLine,
    nextMatches,
    sessionId: null,
    shouldRunCountFallback: true,
    totalMatchedLines: null,
  };
}
