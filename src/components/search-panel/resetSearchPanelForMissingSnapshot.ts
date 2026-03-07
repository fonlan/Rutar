import type { MutableRefObject } from 'react';
import type { FilterMatch, SearchMatch } from './types';

interface CachedSearchSnapshot {
  documentVersion: number;
}

interface CachedFilterSnapshot {
  documentVersion: number;
}

interface SearchCountCacheSnapshot {
  documentVersion: number;
}

interface FilterCountCacheSnapshot {
  documentVersion: number;
}

interface ResetSearchPanelForMissingSnapshotOptions {
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  chunkCursorRef: MutableRefObject<number | null>;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  defaultResultPanelHeight: number;
  defaultSidebarWidth: number;
  filterCountCacheRef: MutableRefObject<FilterCountCacheSnapshot | null>;
  filterLineCursorRef: MutableRefObject<number | null>;
  setAppliedResultFilterKeyword: (value: string) => void;
  setCaseSensitive: (value: boolean) => void;
  setCurrentFilterMatchIndex: (value: number) => void;
  setCurrentMatchIndex: (value: number) => void;
  setFilterMatches: (value: FilterMatch[]) => void;
  setFilterSessionId: (value: string | null) => void;
  setIsOpen: (value: boolean) => void;
  setKeyword: (value: string) => void;
  setMatches: (value: SearchMatch[]) => void;
  setPanelMode: (value: 'find') => void;
  setParseEscapeSequences: (value: boolean) => void;
  setReplaceValue: (value: string) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelHeight: (value: number) => void;
  setResultPanelState: (value: 'closed') => void;
  setReverseSearch: (value: boolean) => void;
  setSearchMode: (value: 'literal') => void;
  setSearchSessionId: (value: string | null) => void;
  setSearchSidebarWidth: (value: number) => void;
  setTotalFilterMatchedLineCount: (value: number | null) => void;
  setTotalMatchCount: (value: number | null) => void;
  setTotalMatchedLineCount: (value: number | null) => void;
}

export function resetSearchPanelForMissingSnapshot({
  cachedFilterRef,
  cachedSearchRef,
  chunkCursorRef,
  countCacheRef,
  defaultResultPanelHeight,
  defaultSidebarWidth,
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
}: ResetSearchPanelForMissingSnapshotOptions) {
  setIsOpen(false);
  setPanelMode('find');
  setResultPanelState('closed');
  setResultPanelHeight(defaultResultPanelHeight);
  setSearchSidebarWidth(defaultSidebarWidth);
  setKeyword('');
  setReplaceValue('');
  setSearchMode('literal');
  setCaseSensitive(false);
  setParseEscapeSequences(false);
  setReverseSearch(false);
  setResultFilterKeyword('');
  setAppliedResultFilterKeyword('');
  setMatches([]);
  setFilterMatches([]);
  setCurrentMatchIndex(0);
  setCurrentFilterMatchIndex(0);
  setTotalMatchCount(null);
  setTotalMatchedLineCount(null);
  setTotalFilterMatchedLineCount(null);
  chunkCursorRef.current = null;
  filterLineCursorRef.current = null;
  setSearchSessionId(null);
  setFilterSessionId(null);
  cachedSearchRef.current = null;
  cachedFilterRef.current = null;
  countCacheRef.current = null;
  filterCountCacheRef.current = null;
}