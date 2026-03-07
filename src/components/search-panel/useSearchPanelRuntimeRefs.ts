import { useRef } from 'react';
import type {
  FilterMatch,
  SearchMatch,
  SearchMode,
  TabSearchPanelSnapshot,
} from './types';

export function useSearchPanelRuntimeRefs() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const runVersionRef = useRef(0);
  const countRunVersionRef = useRef(0);
  const filterRunVersionRef = useRef(0);
  const filterCountRunVersionRef = useRef(0);
  const sessionRestoreRunVersionRef = useRef(0);
  const currentMatchIndexRef = useRef(0);
  const currentFilterMatchIndexRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const loadMoreDebounceRef = useRef<number | null>(null);
  const loadMoreSessionRef = useRef(0);
  const searchSessionIdRef = useRef<string | null>(null);
  const filterSessionIdRef = useRef<string | null>(null);
  const chunkCursorRef = useRef<number | null>(null);
  const filterLineCursorRef = useRef<number | null>(null);
  const stopResultFilterSearchRef = useRef(false);
  const resultFilterStepRunVersionRef = useRef(0);
  const cachedSearchRef = useRef<{
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
  } | null>(null);
  const cachedFilterRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
    matches: FilterMatch[];
    nextLine: number | null;
    sessionId: string | null;
  } | null>(null);
  const countCacheRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    parseEscapeSequences: boolean;
    resultFilterKeyword: string;
    documentVersion: number;
    totalMatches: number;
    matchedLines: number;
  } | null>(null);
  const filterCountCacheRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
    matchedLines: number;
  } | null>(null);
  const tabSearchPanelStateRef = useRef<Record<string, TabSearchPanelSnapshot>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const searchSessionCommandUnsupportedRef = useRef(false);
  const searchSessionRestoreCommandUnsupportedRef = useRef(false);
  const filterSessionCommandUnsupportedRef = useRef(false);
  const filterSessionRestoreCommandUnsupportedRef = useRef(false);
  const searchCursorStepCommandUnsupportedRef = useRef(false);
  const filterStepCommandUnsupportedRef = useRef(false);

  return {
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    countRunVersionRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    filterCountCacheRef,
    filterCountRunVersionRef,
    filterLineCursorRef,
    filterRunVersionRef,
    filterSessionCommandUnsupportedRef,
    filterSessionIdRef,
    filterSessionRestoreCommandUnsupportedRef,
    filterStepCommandUnsupportedRef,
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    minimizedResultWrapperRef,
    previousActiveTabIdRef,
    resultFilterStepRunVersionRef,
    resultListRef,
    resultPanelWrapperRef,
    runVersionRef,
    searchCursorStepCommandUnsupportedRef,
    searchInputRef,
    searchSessionCommandUnsupportedRef,
    searchSessionIdRef,
    searchSessionRestoreCommandUnsupportedRef,
    sessionRestoreRunVersionRef,
    stopResultFilterSearchRef,
    tabSearchPanelStateRef,
  };
}