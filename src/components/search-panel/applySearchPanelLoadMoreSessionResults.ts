import type { MutableRefObject } from 'react';
import {
  isFilterSessionNextBackendResult,
  isMissingInvokeCommandError,
  isSearchSessionNextBackendResult,
} from './backendGuards';
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

interface ApplyFilterSessionNextResultOptions {
  documentVersion: number;
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  result: unknown;
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