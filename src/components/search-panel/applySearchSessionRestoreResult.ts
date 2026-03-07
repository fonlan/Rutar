import type { MutableRefObject } from 'react';
import { isMissingInvokeCommandError } from './backendGuards';
import type { SearchMode, SearchSessionRestoreBackendResult } from './types';

interface CachedSearchSnapshot {
  tabId: string;
  sessionId: string | null;
  nextOffset: number | null;
  documentVersion: number;
}

interface SearchCountCacheSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  totalMatches: number;
  matchedLines: number;
}

interface ApplySearchSessionRestoreResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  parseEscapeSequences: boolean;
  restoreResult: SearchSessionRestoreBackendResult;
  restoredResultFilterKeyword: string;
  searchMode: SearchMode;
  searchSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  snapshotCaseSensitive: boolean;
  snapshotDocumentVersion: number;
  snapshotEffectiveKeyword: string;
}

interface HandleSearchSessionRestoreErrorOptions {
  error: unknown;
  restoreRunVersion: number;
  searchSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  sessionRestoreRunVersionRef: MutableRefObject<number>;
}

export function applySearchSessionRestoreResult({
  activeTabId,
  cachedSearchRef,
  chunkCursorRef,
  countCacheRef,
  parseEscapeSequences,
  restoreResult,
  restoredResultFilterKeyword,
  searchMode,
  searchSessionRestoreCommandUnsupportedRef,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  snapshotCaseSensitive,
  snapshotDocumentVersion,
  snapshotEffectiveKeyword,
}: ApplySearchSessionRestoreResultOptions) {
  searchSessionRestoreCommandUnsupportedRef.current = false;
  setSearchSessionId(restoreResult.sessionId ?? null);
  chunkCursorRef.current = restoreResult.nextOffset ?? null;

  setTotalMatchCount(restoreResult.totalMatches ?? 0);
  setTotalMatchedLineCount(restoreResult.totalMatchedLines ?? 0);
  countCacheRef.current = {
    tabId: activeTabId,
    keyword: snapshotEffectiveKeyword,
    searchMode,
    caseSensitive: snapshotCaseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: restoredResultFilterKeyword,
    documentVersion: restoreResult.documentVersion ?? snapshotDocumentVersion,
    totalMatches: restoreResult.totalMatches ?? 0,
    matchedLines: restoreResult.totalMatchedLines ?? 0,
  };

  if (cachedSearchRef.current?.tabId === activeTabId) {
    cachedSearchRef.current = {
      ...cachedSearchRef.current,
      sessionId: restoreResult.sessionId ?? null,
      nextOffset: restoreResult.nextOffset ?? null,
      documentVersion: restoreResult.documentVersion ?? snapshotDocumentVersion,
    };
  }
}

export function handleSearchSessionRestoreError({
  error,
  restoreRunVersion,
  searchSessionRestoreCommandUnsupportedRef,
  sessionRestoreRunVersionRef,
}: HandleSearchSessionRestoreErrorOptions) {
  if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
    return;
  }

  if (isMissingInvokeCommandError(error, 'search_session_restore_in_document')) {
    searchSessionRestoreCommandUnsupportedRef.current = true;
    return;
  }

  console.warn('Failed to restore search session:', error);
}