import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  FilterMatch,
  PanelMode,
  SearchMatch,
  SearchMode,
  SearchResultPanelState,
  TabSearchPanelSnapshot,
} from './types';
import { resolveSearchKeyword } from './utils';

interface CachedSearchSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  sessionId: string | null;
}

interface CachedFilterSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: FilterMatch[];
  nextLine: number | null;
  sessionId: string | null;
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

interface FilterCountCacheSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matchedLines: number;
}

interface RestoreSearchPanelSnapshotStateOptions {
  activeTabId: string;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  defaultResultPanelHeight: number;
  defaultSidebarWidth: number;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  setAppliedResultFilterKeyword: Dispatch<SetStateAction<string>>;
  setCaseSensitive: Dispatch<SetStateAction<boolean>>;
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setKeyword: Dispatch<SetStateAction<string>>;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setPanelMode: Dispatch<SetStateAction<PanelMode>>;
  setParseEscapeSequences: Dispatch<SetStateAction<boolean>>;
  setReplaceValue: Dispatch<SetStateAction<string>>;
  setResultFilterKeyword: Dispatch<SetStateAction<string>>;
  setResultPanelHeight: Dispatch<SetStateAction<number>>;
  setResultPanelState: Dispatch<SetStateAction<SearchResultPanelState>>;
  setReverseSearch: Dispatch<SetStateAction<boolean>>;
  setSearchMode: Dispatch<SetStateAction<SearchMode>>;
  setSearchSessionId: (value: string | null) => void;
  setSearchSidebarWidth: Dispatch<SetStateAction<number>>;
  setTotalFilterMatchedLineCount: Dispatch<SetStateAction<number | null>>;
  setTotalMatchCount: Dispatch<SetStateAction<number | null>>;
  setTotalMatchedLineCount: Dispatch<SetStateAction<number | null>>;
  snapshot: TabSearchPanelSnapshot;
}

export function restoreSearchPanelSnapshotState({
  activeTabId,
  cachedFilterRef,
  cachedSearchRef,
  defaultResultPanelHeight,
  defaultSidebarWidth,
  chunkCursorRef,
  countCacheRef,
  filterCountCacheRef,
  filterLineCursorRef,
  setAppliedResultFilterKeyword,
  setCaseSensitive,
  setCurrentFilterMatchIndex,
  setCurrentMatchIndex,
  setFilterMatches,
  setFilterSessionId,
  setIsOpen,
  setKeyword,
  setMatches,
  setPanelMode,
  setParseEscapeSequences,
  setReplaceValue,
  setResultFilterKeyword,
  setResultPanelHeight,
  setResultPanelState,
  setReverseSearch,
  setSearchMode,
  setSearchSessionId,
  setSearchSidebarWidth,
  setTotalFilterMatchedLineCount,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  snapshot,
}: RestoreSearchPanelSnapshotStateOptions) {
  setIsOpen(snapshot.isOpen);
  setPanelMode(snapshot.panelMode);
  setResultPanelState(snapshot.resultPanelState);
  setResultPanelHeight(snapshot.resultPanelHeight ?? defaultResultPanelHeight);
  setSearchSidebarWidth(snapshot.searchSidebarWidth ?? defaultSidebarWidth);
  setKeyword(snapshot.keyword);
  setReplaceValue(snapshot.replaceValue);
  setSearchMode(snapshot.searchMode);
  setCaseSensitive(snapshot.caseSensitive);
  setParseEscapeSequences(snapshot.parseEscapeSequences ?? false);
  setReverseSearch(snapshot.reverseSearch);
  setResultFilterKeyword(snapshot.resultFilterKeyword);
  setAppliedResultFilterKeyword(snapshot.appliedResultFilterKeyword);

  const restoredMatches = snapshot.matches || [];
  const restoredFilterMatches = snapshot.filterMatches || [];

  setMatches(restoredMatches);
  setFilterMatches(restoredFilterMatches);
  setCurrentMatchIndex(() => {
    if (restoredMatches.length === 0) {
      return 0;
    }

    return Math.min(snapshot.currentMatchIndex, restoredMatches.length - 1);
  });
  setCurrentFilterMatchIndex(() => {
    if (restoredFilterMatches.length === 0) {
      return 0;
    }

    return Math.min(snapshot.currentFilterMatchIndex, restoredFilterMatches.length - 1);
  });

  setTotalMatchCount(snapshot.totalMatchCount);
  setTotalMatchedLineCount(snapshot.totalMatchedLineCount);
  setTotalFilterMatchedLineCount(snapshot.totalFilterMatchedLineCount);

  setSearchSessionId(snapshot.searchSessionId ?? null);
  setFilterSessionId(snapshot.filterSessionId ?? null);
  chunkCursorRef.current = snapshot.searchNextOffset;
  filterLineCursorRef.current = snapshot.filterNextLine;

  const restoredNormalizedResultFilterKeyword = snapshot.appliedResultFilterKeyword.trim().toLowerCase();
  const restoredResultFilterKeyword = restoredNormalizedResultFilterKeyword.length
    ? snapshot.caseSensitive
      ? snapshot.appliedResultFilterKeyword.trim()
      : restoredNormalizedResultFilterKeyword
    : '';

  if (snapshot.searchDocumentVersion !== null && snapshot.keyword) {
    const snapshotParseEscapeSequences = snapshot.parseEscapeSequences ?? false;
    const snapshotEffectiveKeyword = resolveSearchKeyword(
      snapshot.keyword,
      snapshotParseEscapeSequences
    );
    cachedSearchRef.current = {
      tabId: activeTabId,
      keyword: snapshotEffectiveKeyword,
      searchMode: snapshot.searchMode,
      caseSensitive: snapshot.caseSensitive,
      parseEscapeSequences: snapshotParseEscapeSequences,
      resultFilterKeyword: restoredResultFilterKeyword,
      documentVersion: snapshot.searchDocumentVersion,
      matches: restoredMatches,
      nextOffset: snapshot.searchNextOffset,
      sessionId: snapshot.searchSessionId ?? null,
    };

    if (snapshot.totalMatchCount !== null && snapshot.totalMatchedLineCount !== null) {
      countCacheRef.current = {
        tabId: activeTabId,
        keyword: snapshotEffectiveKeyword,
        searchMode: snapshot.searchMode,
        caseSensitive: snapshot.caseSensitive,
        parseEscapeSequences: snapshotParseEscapeSequences,
        resultFilterKeyword: restoredResultFilterKeyword,
        documentVersion: snapshot.searchDocumentVersion,
        totalMatches: snapshot.totalMatchCount,
        matchedLines: snapshot.totalMatchedLineCount,
      };
    } else {
      countCacheRef.current = null;
    }
  } else {
    setSearchSessionId(null);
    cachedSearchRef.current = null;
    countCacheRef.current = null;
  }

  if (snapshot.filterDocumentVersion !== null && snapshot.filterRulesKey) {
    cachedFilterRef.current = {
      tabId: activeTabId,
      rulesKey: snapshot.filterRulesKey,
      resultFilterKeyword: restoredResultFilterKeyword,
      documentVersion: snapshot.filterDocumentVersion,
      matches: restoredFilterMatches,
      nextLine: snapshot.filterNextLine,
      sessionId: snapshot.filterSessionId ?? null,
    };

    if (snapshot.totalFilterMatchedLineCount !== null) {
      filterCountCacheRef.current = {
        tabId: activeTabId,
        rulesKey: snapshot.filterRulesKey,
        resultFilterKeyword: restoredResultFilterKeyword,
        documentVersion: snapshot.filterDocumentVersion,
        matchedLines: snapshot.totalFilterMatchedLineCount,
      };
    } else {
      filterCountCacheRef.current = null;
    }
  } else {
    setFilterSessionId(null);
    cachedFilterRef.current = null;
    filterCountCacheRef.current = null;
  }

  return {
    restoredResultFilterKeyword,
  };
}