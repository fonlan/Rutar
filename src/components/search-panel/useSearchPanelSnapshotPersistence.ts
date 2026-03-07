import { useEffect, type MutableRefObject } from 'react';
import type {
  FilterMatch,
  PanelMode,
  SearchMatch,
  SearchMode,
  SearchResultPanelState,
  TabSearchPanelSnapshot,
} from './types';

interface SearchCacheSnapshot {
  documentVersion: number;
}

interface FilterCacheSnapshot {
  documentVersion: number;
  rulesKey: string;
}

interface UseSearchPanelSnapshotPersistenceOptions {
  activeTabId: string | null;
  appliedResultFilterKeyword: string;
  cachedFilterRef: MutableRefObject<FilterCacheSnapshot | null>;
  cachedSearchRef: MutableRefObject<SearchCacheSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterMatches: FilterMatch[];
  filterRulesKey: string;
  filterSessionIdRef: MutableRefObject<string | null>;
  isOpen: boolean;
  keyword: string;
  matches: SearchMatch[];
  panelMode: PanelMode;
  parseEscapeSequences: boolean;
  replaceValue: string;
  resultFilterKeyword: string;
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  reverseSearch: boolean;
  searchMode: SearchMode;
  searchSessionIdRef: MutableRefObject<string | null>;
  searchSidebarWidth: number;
  tabSearchPanelStateRef: MutableRefObject<Record<string, TabSearchPanelSnapshot>>;
  totalFilterMatchedLineCount: number | null;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
}

export function useSearchPanelSnapshotPersistence({
  activeTabId,
  appliedResultFilterKeyword,
  cachedFilterRef,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  currentFilterMatchIndex,
  currentMatchIndex,
  filterLineCursorRef,
  filterMatches,
  filterRulesKey,
  filterSessionIdRef,
  isOpen,
  keyword,
  matches,
  panelMode,
  parseEscapeSequences,
  replaceValue,
  resultFilterKeyword,
  resultPanelHeight,
  resultPanelState,
  reverseSearch,
  searchMode,
  searchSessionIdRef,
  searchSidebarWidth,
  tabSearchPanelStateRef,
  totalFilterMatchedLineCount,
  totalMatchCount,
  totalMatchedLineCount,
}: UseSearchPanelSnapshotPersistenceOptions) {
  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    tabSearchPanelStateRef.current[activeTabId] = {
      isOpen,
      panelMode,
      resultPanelState,
      resultPanelHeight,
      searchSidebarWidth,
      keyword,
      replaceValue,
      searchMode,
      caseSensitive,
      parseEscapeSequences,
      reverseSearch,
      resultFilterKeyword,
      appliedResultFilterKeyword,
      matches,
      filterMatches,
      currentMatchIndex,
      currentFilterMatchIndex,
      totalMatchCount,
      totalMatchedLineCount,
      totalFilterMatchedLineCount,
      searchSessionId: searchSessionIdRef.current,
      filterSessionId: filterSessionIdRef.current,
      searchNextOffset: chunkCursorRef.current,
      filterNextLine: filterLineCursorRef.current,
      searchDocumentVersion: cachedSearchRef.current?.documentVersion ?? null,
      filterDocumentVersion: cachedFilterRef.current?.documentVersion ?? null,
      filterRulesKey: cachedFilterRef.current?.rulesKey ?? filterRulesKey,
    };
  }, [
    activeTabId,
    appliedResultFilterKeyword,
    caseSensitive,
    parseEscapeSequences,
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    filterRulesKey,
    isOpen,
    keyword,
    matches,
    panelMode,
    replaceValue,
    resultFilterKeyword,
    resultPanelState,
    resultPanelHeight,
    searchSidebarWidth,
    reverseSearch,
    searchMode,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  ]);
}