import { invoke } from '@tauri-apps/api/core';
import { buildSearchFirstRequest } from './buildSearchPanelRunRequests';
import type { SearchFirstBackendResult, SearchMatch, SearchMode } from './types';

interface ResolveSearchFirstMatchStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveSearchKeyword: string;
  reverse: boolean;
  searchMode: SearchMode;
}

interface ResolvedSearchFirstMatchState {
  documentVersion: number;
  firstMatch: SearchMatch | null;
}

export async function resolveSearchFirstMatchState({
  activeTabId,
  caseSensitive,
  effectiveSearchKeyword,
  reverse,
  searchMode,
}: ResolveSearchFirstMatchStateOptions): Promise<ResolvedSearchFirstMatchState> {
  const firstResult = await invoke<SearchFirstBackendResult>(
    'search_first_in_document',
    buildSearchFirstRequest({
      activeTabId,
      effectiveSearchKeyword,
      searchMode,
      caseSensitive,
      reverse,
    })
  );

  return {
    documentVersion: firstResult.documentVersion ?? 0,
    firstMatch: firstResult.firstMatch,
  };
}
