import { invoke } from '@tauri-apps/api/core';
import { buildReplaceAllRequest, buildReplaceCurrentRequest } from './buildSearchPanelRunRequests';
import type {
  ReplaceAllAndSearchChunkBackendResult,
  ReplaceCurrentAndSearchChunkBackendResult,
  SearchMode,
} from './types';

interface ResolveReplaceCurrentSearchStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  parseEscapeSequences: boolean;
  replaceValue: string;
  searchMode: SearchMode;
  targetEnd: number;
  targetStart: number;
}

interface ResolveReplaceAllSearchStateOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  parseEscapeSequences: boolean;
  replaceValue: string;
  searchMode: SearchMode;
}

export async function resolveReplaceCurrentSearchState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  parseEscapeSequences,
  replaceValue,
  searchMode,
  targetEnd,
  targetStart,
}: ResolveReplaceCurrentSearchStateOptions): Promise<ReplaceCurrentAndSearchChunkBackendResult> {
  return invoke<ReplaceCurrentAndSearchChunkBackendResult>(
    'replace_current_and_search_chunk_in_document',
    buildReplaceCurrentRequest({
      activeTabId,
      effectiveSearchKeyword,
      searchMode,
      caseSensitive,
      replaceValue,
      parseEscapeSequences,
      targetStart,
      targetEnd,
      effectiveResultFilterKeyword,
      maxResults,
    })
  );
}

export async function resolveReplaceAllSearchState({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  parseEscapeSequences,
  replaceValue,
  searchMode,
}: ResolveReplaceAllSearchStateOptions): Promise<ReplaceAllAndSearchChunkBackendResult> {
  return invoke<ReplaceAllAndSearchChunkBackendResult>(
    'replace_all_and_search_chunk_in_document',
    buildReplaceAllRequest({
      activeTabId,
      effectiveSearchKeyword,
      searchMode,
      caseSensitive,
      replaceValue,
      parseEscapeSequences,
      effectiveResultFilterKeyword,
      maxResults,
    })
  );
}