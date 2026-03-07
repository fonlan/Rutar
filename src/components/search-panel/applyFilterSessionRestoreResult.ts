import type { MutableRefObject } from 'react';
import { isMissingInvokeCommandError } from './backendGuards';
import type { FilterSessionRestoreBackendResult } from './types';

interface CachedFilterSnapshot {
  tabId: string;
  rulesKey: string;
  sessionId: string | null;
  nextLine: number | null;
  documentVersion: number;
}

interface FilterCountCacheSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matchedLines: number;
}

interface ApplyFilterSessionRestoreResultOptions {
  activeTabId: string;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  filterSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  restoreResult: FilterSessionRestoreBackendResult;
  restoredResultFilterKeyword: string;
  setFilterSessionId: (value: string | null) => void;
  setTotalFilterMatchedLineCount: (value: number) => void;
  snapshotFilterDocumentVersion: number;
}

interface HandleFilterSessionRestoreErrorOptions {
  error: unknown;
  filterSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  restoreRunVersion: number;
  sessionRestoreRunVersionRef: MutableRefObject<number>;
}

export function applyFilterSessionRestoreResult({
  activeTabId,
  cachedFilterRef,
  filterCountCacheRef,
  filterLineCursorRef,
  filterRulesKey,
  filterSessionRestoreCommandUnsupportedRef,
  restoreResult,
  restoredResultFilterKeyword,
  setFilterSessionId,
  setTotalFilterMatchedLineCount,
  snapshotFilterDocumentVersion,
}: ApplyFilterSessionRestoreResultOptions) {
  filterSessionRestoreCommandUnsupportedRef.current = false;
  setFilterSessionId(restoreResult.sessionId ?? null);
  filterLineCursorRef.current = restoreResult.nextLine ?? null;
  setTotalFilterMatchedLineCount(restoreResult.totalMatchedLines ?? 0);

  filterCountCacheRef.current = {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword: restoredResultFilterKeyword,
    documentVersion: restoreResult.documentVersion ?? snapshotFilterDocumentVersion,
    matchedLines: restoreResult.totalMatchedLines ?? 0,
  };

  if (cachedFilterRef.current?.tabId === activeTabId) {
    cachedFilterRef.current = {
      ...cachedFilterRef.current,
      rulesKey: filterRulesKey,
      sessionId: restoreResult.sessionId ?? null,
      nextLine: restoreResult.nextLine ?? null,
      documentVersion: restoreResult.documentVersion ?? snapshotFilterDocumentVersion,
    };
  }
}

export function handleFilterSessionRestoreError({
  error,
  filterSessionRestoreCommandUnsupportedRef,
  restoreRunVersion,
  sessionRestoreRunVersionRef,
}: HandleFilterSessionRestoreErrorOptions) {
  if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
    return;
  }

  if (isMissingInvokeCommandError(error, 'filter_session_restore_in_document')) {
    filterSessionRestoreCommandUnsupportedRef.current = true;
    return;
  }

  console.warn('Failed to restore filter session:', error);
}