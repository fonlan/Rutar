import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import { isSearchSessionStartBackendResult } from './backendGuards';
import { buildSearchChunkRequest, buildSearchSessionStartRequest } from './buildSearchPanelRunRequests';
import { attemptSearchPanelSessionStart } from './attemptSearchPanelSessionStart';
import { resolveSearchChunkState } from './resolveSearchPanelChunkState';
import { resolveSearchSessionStartState } from './resolveSearchPanelSessionStartState';
import type { SearchChunkBackendResult, SearchMode } from './types';

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
