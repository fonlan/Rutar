import { invoke } from '@tauri-apps/api/core';
import {
  isFilterSessionStartBackendResult,
  isSearchSessionStartBackendResult,
} from './backendGuards';
import {
  buildFilterSessionStartRequest,
  buildSearchSessionStartRequest,
} from './buildSearchPanelRunRequests';
import {
  resolveFilterSessionStartState,
  resolveSearchSessionStartState,
} from './resolveSearchPanelSessionStartState';
import type {
  FilterRuleInputPayload,
  SearchMode,
} from './types';

interface ResolveSearchRunStartStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  searchMode: SearchMode;
}

interface ResolvedSearchRunStartState {
  documentVersion: number;
  nextMatches: ReturnType<typeof resolveSearchSessionStartState>['nextMatches'];
  nextOffset: number | null;
  sessionId: string | null;
  totalMatchedLines: number;
  totalMatches: number;
}

interface ResolveFilterRunStartStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  maxResults: number;
  rules: FilterRuleInputPayload[];
}

interface ResolvedFilterRunStartState {
  documentVersion: number;
  nextLine: number | null;
  nextMatches: ReturnType<typeof resolveFilterSessionStartState>['nextMatches'];
  sessionId: string | null;
  totalMatchedLines: number;
}

export async function resolveSearchRunStartState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  searchMode,
}: ResolveSearchRunStartStateOptions): Promise<ResolvedSearchRunStartState> {
  const sessionStartResult = await invoke<unknown>(
    'search_session_start_in_document',
    buildSearchSessionStartRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      effectiveSearchKeyword,
      maxResults,
      searchMode,
    })
  );

  if (!isSearchSessionStartBackendResult(sessionStartResult)) {
    throw new Error('Invalid search_session_start_in_document response');
  }

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
    totalMatchedLines,
    totalMatches,
  };
}

export async function resolveFilterRunStartState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  maxResults,
  rules,
}: ResolveFilterRunStartStateOptions): Promise<ResolvedFilterRunStartState> {
  const sessionStartResult = await invoke<unknown>(
    'filter_session_start_in_document',
    buildFilterSessionStartRequest({
      activeTabId,
      caseSensitive,
      effectiveResultFilterKeyword,
      maxResults,
      rules,
    })
  );

  if (!isFilterSessionStartBackendResult(sessionStartResult)) {
    throw new Error('Invalid filter_session_start_in_document response');
  }

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
    totalMatchedLines,
  };
}
