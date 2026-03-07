import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import {
  isFilterSessionNextBackendResult,
  isMissingInvokeCommandError,
  isSearchSessionNextBackendResult,
} from './backendGuards';
import {
  buildFilterSessionNextRequest,
  buildSearchSessionNextRequest,
} from './buildSearchPanelRunRequests';
import type {
  FilterMatch,
  SearchMatch,
} from './types';

interface ApplySearchSessionNextResultOptions {
  documentVersion: number;
  result: unknown;
  searchSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  setSearchSessionId: (value: string | null) => void;
}

interface ResolveSearchLoadMoreSessionStateOptions {
  activeSearchSessionId: string | null;
  documentVersion: number;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  maxResults: number;
  searchSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  setSearchSessionId: (value: string | null) => void;
}

interface ApplyFilterSessionNextResultOptions {
  documentVersion: number;
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  result: unknown;
  setFilterSessionId: (value: string | null) => void;
}

interface ResolveFilterLoadMoreSessionStateOptions {
  activeFilterSessionId: string | null;
  documentVersion: number;
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  maxResults: number;
  setFilterSessionId: (value: string | null) => void;
}

interface HandleSearchSessionNextErrorOptions {
  error: unknown;
  searchSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  setSearchSessionId: (value: string | null) => void;
}

interface HandleFilterSessionNextErrorOptions {
  error: unknown;
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  setFilterSessionId: (value: string | null) => void;
}

export function applySearchSessionNextResult({
  documentVersion,
  result,
  searchSessionCommandUnsupportedRef,
  setSearchSessionId,
}: ApplySearchSessionNextResultOptions): {
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
} | null {
  if (!isSearchSessionNextBackendResult(result)) {
    setSearchSessionId(null);
    return null;
  }

  const nextOffset = result.nextOffset ?? null;
  if (nextOffset === null) {
    setSearchSessionId(null);
  }
  searchSessionCommandUnsupportedRef.current = false;

  return {
    documentVersion: result.documentVersion ?? documentVersion,
    matches: result.matches || [],
    nextOffset,
  };
}

export async function resolveSearchLoadMoreSessionState({
  activeSearchSessionId,
  documentVersion,
  loadMoreSessionId,
  loadMoreSessionRef,
  maxResults,
  searchSessionCommandUnsupportedRef,
  setSearchSessionId,
}: ResolveSearchLoadMoreSessionStateOptions): Promise<{
  aborted: boolean;
  nextState: {
    documentVersion: number;
    matches: SearchMatch[];
    nextOffset: number | null;
  } | null;
}> {
  if (!activeSearchSessionId || searchSessionCommandUnsupportedRef.current) {
    return {
      aborted: false,
      nextState: null,
    };
  }

  try {
    const sessionNextResult = await invoke<unknown>(
      'search_session_next_in_document',
      buildSearchSessionNextRequest({
        sessionId: activeSearchSessionId,
        maxResults,
      })
    );
    if (loadMoreSessionId !== loadMoreSessionRef.current) {
      return {
        aborted: true,
        nextState: null,
      };
    }

    return {
      aborted: false,
      nextState: applySearchSessionNextResult({
        documentVersion,
        result: sessionNextResult,
        searchSessionCommandUnsupportedRef,
        setSearchSessionId,
      }),
    };
  } catch (error) {
    handleSearchSessionNextError({
      error,
      searchSessionCommandUnsupportedRef,
      setSearchSessionId,
    });

    return {
      aborted: false,
      nextState: null,
    };
  }
}

export function handleSearchSessionNextError({
  error,
  searchSessionCommandUnsupportedRef,
  setSearchSessionId,
}: HandleSearchSessionNextErrorOptions) {
  if (isMissingInvokeCommandError(error, 'search_session_next_in_document')) {
    searchSessionCommandUnsupportedRef.current = true;
  }
  setSearchSessionId(null);
}

export function applyFilterSessionNextResult({
  documentVersion,
  filterSessionCommandUnsupportedRef,
  result,
  setFilterSessionId,
}: ApplyFilterSessionNextResultOptions): {
  documentVersion: number;
  matches: FilterMatch[];
  nextLine: number | null;
} | null {
  if (!isFilterSessionNextBackendResult(result)) {
    setFilterSessionId(null);
    return null;
  }

  const nextLine = result.nextLine ?? null;
  if (nextLine === null) {
    setFilterSessionId(null);
  }
  filterSessionCommandUnsupportedRef.current = false;

  return {
    documentVersion: result.documentVersion ?? documentVersion,
    matches: result.matches || [],
    nextLine,
  };
}

export async function resolveFilterLoadMoreSessionState({
  activeFilterSessionId,
  documentVersion,
  filterSessionCommandUnsupportedRef,
  loadMoreSessionId,
  loadMoreSessionRef,
  maxResults,
  setFilterSessionId,
}: ResolveFilterLoadMoreSessionStateOptions): Promise<{
  aborted: boolean;
  nextState: {
    documentVersion: number;
    matches: FilterMatch[];
    nextLine: number | null;
  } | null;
}> {
  if (!activeFilterSessionId || filterSessionCommandUnsupportedRef.current) {
    return {
      aborted: false,
      nextState: null,
    };
  }

  try {
    const sessionNextResult = await invoke<unknown>(
      'filter_session_next_in_document',
      buildFilterSessionNextRequest({
        sessionId: activeFilterSessionId,
        maxResults,
      })
    );
    if (loadMoreSessionId !== loadMoreSessionRef.current) {
      return {
        aborted: true,
        nextState: null,
      };
    }

    return {
      aborted: false,
      nextState: applyFilterSessionNextResult({
        documentVersion,
        filterSessionCommandUnsupportedRef,
        result: sessionNextResult,
        setFilterSessionId,
      }),
    };
  } catch (error) {
    handleFilterSessionNextError({
      error,
      filterSessionCommandUnsupportedRef,
      setFilterSessionId,
    });

    return {
      aborted: false,
      nextState: null,
    };
  }
}

export function handleFilterSessionNextError({
  error,
  filterSessionCommandUnsupportedRef,
  setFilterSessionId,
}: HandleFilterSessionNextErrorOptions) {
  if (isMissingInvokeCommandError(error, 'filter_session_next_in_document')) {
    filterSessionCommandUnsupportedRef.current = true;
  }
  setFilterSessionId(null);
}
