import type {
  FilterRuleInputPayload,
  SearchMode,
  TabSearchPanelSnapshot,
} from './types';
import { getSearchModeValue, resolveSearchKeyword } from './utils';

interface BuildSearchSessionRestoreRequestOptions {
  activeTabId: string;
  restoredResultFilterKeyword: string;
  snapshot: TabSearchPanelSnapshot;
}

interface SearchSessionRestoreRequest {
  invokeArgs: {
    id: string;
    keyword: string;
    mode: SearchMode;
    caseSensitive: boolean;
    resultFilterKeyword: string;
    resultFilterCaseSensitive: boolean;
    expectedDocumentVersion: number;
    nextOffset: number | null;
  };
  snapshotCaseSensitive: boolean;
  snapshotDocumentVersion: number;
  snapshotEffectiveKeyword: string;
  snapshotParseEscapeSequences: boolean;
  snapshotSearchMode: SearchMode;
}

interface BuildFilterSessionRestoreRequestOptions {
  activeTabId: string;
  filterRulesKey: string;
  filterRulesPayload: FilterRuleInputPayload[];
  restoredResultFilterKeyword: string;
  snapshot: TabSearchPanelSnapshot;
}

interface FilterSessionRestoreRequest {
  invokeArgs: {
    id: string;
    rules: FilterRuleInputPayload[];
    resultFilterKeyword: string;
    resultFilterCaseSensitive: boolean;
    expectedDocumentVersion: number;
    nextLine: number | null;
  };
  snapshotCaseSensitive: boolean;
  snapshotFilterDocumentVersion: number;
}

export function buildSearchSessionRestoreRequest({
  activeTabId,
  restoredResultFilterKeyword,
  snapshot,
}: BuildSearchSessionRestoreRequestOptions): SearchSessionRestoreRequest | null {
  if (
    snapshot.searchDocumentVersion === null ||
    !snapshot.keyword
  ) {
    return null;
  }

  const snapshotParseEscapeSequences = snapshot.parseEscapeSequences ?? false;
  const snapshotEffectiveKeyword = resolveSearchKeyword(
    snapshot.keyword,
    snapshotParseEscapeSequences
  );
  const snapshotSearchMode = snapshot.searchMode;
  const snapshotCaseSensitive = snapshot.caseSensitive;
  const snapshotDocumentVersion = snapshot.searchDocumentVersion;
  const snapshotNextOffset = snapshot.searchNextOffset;

  return {
    invokeArgs: {
      id: activeTabId,
      keyword: snapshotEffectiveKeyword,
      mode: getSearchModeValue(snapshotSearchMode),
      caseSensitive: snapshotCaseSensitive,
      resultFilterKeyword: restoredResultFilterKeyword,
      resultFilterCaseSensitive: snapshotCaseSensitive,
      expectedDocumentVersion: snapshotDocumentVersion,
      nextOffset: snapshotNextOffset,
    },
    snapshotCaseSensitive,
    snapshotDocumentVersion,
    snapshotEffectiveKeyword,
    snapshotParseEscapeSequences,
    snapshotSearchMode,
  };
}

export function buildFilterSessionRestoreRequest({
  activeTabId,
  filterRulesKey,
  filterRulesPayload,
  restoredResultFilterKeyword,
  snapshot,
}: BuildFilterSessionRestoreRequestOptions): FilterSessionRestoreRequest | null {
  if (
    snapshot.filterDocumentVersion === null ||
    snapshot.filterRulesKey !== filterRulesKey
  ) {
    return null;
  }

  const snapshotCaseSensitive = snapshot.caseSensitive;
  const snapshotFilterDocumentVersion = snapshot.filterDocumentVersion;
  const snapshotFilterNextLine = snapshot.filterNextLine;

  return {
    invokeArgs: {
      id: activeTabId,
      rules: filterRulesPayload,
      resultFilterKeyword: restoredResultFilterKeyword,
      resultFilterCaseSensitive: snapshotCaseSensitive,
      expectedDocumentVersion: snapshotFilterDocumentVersion,
      nextLine: snapshotFilterNextLine,
    },
    snapshotCaseSensitive,
    snapshotFilterDocumentVersion,
  };
}
