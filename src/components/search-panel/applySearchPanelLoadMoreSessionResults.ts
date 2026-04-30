import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import {
  isFilterSessionNextBackendResult,
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
  setSearchSessionId: (value: string | null) => void;
}

interface ResolveSearchLoadMoreSessionStateOptions {
  activeSearchSessionId: string | null;
  documentVersion: number;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  maxResults: number;
  setSearchSessionId: (value: string | null) => void;
}

interface ApplyFilterSessionNextResultOptions {
  documentVersion: number;
  result: unknown;
  setFilterSessionId: (value: string | null) => void;
}

interface ResolveFilterLoadMoreSessionStateOptions {
  activeFilterSessionId: string | null;
  documentVersion: number;
  loadMoreSessionId: number;
  loadMoreSessionRef: MutableRefObject<number>;
  maxResults: number;
  setFilterSessionId: (value: string | null) => void;
}

export function applySearchSessionNextResult({
  documentVersion,
  result,
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
  setSearchSessionId,
}: ResolveSearchLoadMoreSessionStateOptions): Promise<{
  aborted: boolean;
  nextState: {
    documentVersion: number;
    matches: SearchMatch[];
    nextOffset: number | null;
  } | null;
}> {
  if (!activeSearchSessionId) {
    return {
      aborted: false,
      nextState: null,
    };
  }

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
      setSearchSessionId,
    }),
  };
}

export function applyFilterSessionNextResult({
  documentVersion,
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

  return {
    documentVersion: result.documentVersion ?? documentVersion,
    matches: result.matches || [],
    nextLine,
  };
}

export async function resolveFilterLoadMoreSessionState({
  activeFilterSessionId,
  documentVersion,
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
  if (!activeFilterSessionId) {
    return {
      aborted: false,
      nextState: null,
    };
  }

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
      result: sessionNextResult,
      setFilterSessionId,
    }),
  };
}
