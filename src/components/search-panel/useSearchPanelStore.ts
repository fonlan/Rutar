import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSearchPanelMessages, t } from '@/i18n';
import { useStore } from '@/store/useStore';
import type {
  FilterMatch,
  FilterRuleGroupPayload,
  PanelMode,
  SearchMatch,
  SearchMode,
  SearchResultPanelState,
  TabSearchPanelSnapshot,
} from './types';
import {
  RESULT_PANEL_DEFAULT_HEIGHT,
  SEARCH_SIDEBAR_DEFAULT_WIDTH,
  normalizeFilterRuleGroups,
  resolveSearchKeyword,
} from './utils';

export function useSearchPanelStore() {
  // === Zustand store selectors (formerly useSearchPanelStoreState) ===
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const cursorPositionByTab = useStore((state) => state.cursorPositionByTab);
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const updateTab = useStore((state) => state.updateTab);
  const updateSettings = useStore((state) => state.updateSettings);
  const language = useStore((state) => state.settings.language);
  const fontFamily = useStore((state) => state.settings.fontFamily);
  const fontSize = useStore((state) => state.settings.fontSize);
  const recentSearchKeywords = useStore((state) => state.settings.recentSearchKeywords);
  const recentReplaceValues = useStore((state) => state.settings.recentReplaceValues);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId && tab.tabType !== 'diff') ?? null,
    [tabs, activeTabId]
  );
  const activeCursorPosition = activeTab ? cursorPositionByTab[activeTab.id] : null;

  // === Local UI state (formerly useSearchPanelLocalState) ===
  const [isOpen, setIsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('find');
  const [keyword, setKeyword] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [parseEscapeSequences, setParseEscapeSequences] = useState(false);
  const [reverseSearch, setReverseSearch] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [filterRuleGroups, setFilterRuleGroups] = useState<FilterRuleGroupPayload[]>([]);
  const [filterMatches, setFilterMatches] = useState<FilterMatch[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null);
  const [totalMatchedLineCount, setTotalMatchedLineCount] = useState<number | null>(null);
  const [totalFilterMatchedLineCount, setTotalFilterMatchedLineCount] = useState<number | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [currentFilterMatchIndex, setCurrentFilterMatchIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [resultPanelState, setResultPanelState] = useState<SearchResultPanelState>('closed');
  const [isSearching, setIsSearching] = useState(false);
  const [resultFilterKeyword, setResultFilterKeyword] = useState('');
  const [appliedResultFilterKeyword, setAppliedResultFilterKeyword] = useState('');
  const [isResultFilterSearching, setIsResultFilterSearching] = useState(false);
  const [resultFilterStepLoadingDirection, setResultFilterStepLoadingDirection] = useState<'prev' | 'next' | null>(null);
  const [resultPanelHeight, setResultPanelHeight] = useState(RESULT_PANEL_DEFAULT_HEIGHT);
  const [searchSidebarWidth, setSearchSidebarWidth] = useState(SEARCH_SIDEBAR_DEFAULT_WIDTH);
  const [searchTarget, setSearchTarget] = useState('');

  // === Runtime refs (formerly useSearchPanelRuntimeRefs) ===
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const runVersionRef = useRef(0);
  const filterRunVersionRef = useRef(0);
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

  // === Session lifecycle (formerly useSearchSessionLifecycle) ===
  const disposeSearchSessionById = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      return;
    }

    void invoke<boolean>('dispose_search_session', { sessionId }).catch((error) => {
      console.warn('Failed to dispose search session:', error);
    });
  }, []);

  const disposeFilterSessionById = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      return;
    }

    void invoke<boolean>('dispose_filter_session', { sessionId }).catch((error) => {
      console.warn('Failed to dispose filter session:', error);
    });
  }, []);

  const setSearchSessionId = useCallback((nextSessionId: string | null) => {
    const previousSessionId = searchSessionIdRef.current;
    if (previousSessionId && previousSessionId !== nextSessionId) {
      disposeSearchSessionById(previousSessionId);
    }
    searchSessionIdRef.current = nextSessionId;
  }, [disposeSearchSessionById]);

  const setFilterSessionId = useCallback((nextSessionId: string | null) => {
    const previousSessionId = filterSessionIdRef.current;
    if (previousSessionId && previousSessionId !== nextSessionId) {
      disposeFilterSessionById(previousSessionId);
    }
    filterSessionIdRef.current = nextSessionId;
  }, [disposeFilterSessionById]);

  useEffect(() => {
    return () => {
      disposeSearchSessionById(searchSessionIdRef.current);
      disposeFilterSessionById(filterSessionIdRef.current);
    };
  }, [disposeFilterSessionById, disposeSearchSessionById]);

  // === UI derived (formerly useSearchPanelUiState) ===
  const messages = useMemo(() => getSearchPanelMessages(language), [language]);
  const isReplaceMode = panelMode === 'replace';
  const isFilterMode = panelMode === 'filter';
  const inputContextCopyLabel = useMemo(() => t(language, 'toolbar.copy'), [language]);
  const inputContextCutLabel = useMemo(() => t(language, 'toolbar.cut'), [language]);
  const inputContextPasteLabel = useMemo(() => t(language, 'toolbar.paste'), [language]);
  const normalizedFilterRuleGroups = useMemo(
    () => normalizeFilterRuleGroups(filterRuleGroups),
    [filterRuleGroups]
  );
  const resultListTextStyle = useMemo(
    () => ({ fontFamily, fontSize: `${Math.max(10, fontSize || 14)}px` }),
    [fontFamily, fontSize]
  );

  // === Derived state (formerly useSearchPanelDerivedState) ===
  const normalizedResultFilterKeyword = appliedResultFilterKeyword.trim().toLowerCase();
  const isResultFilterActive = normalizedResultFilterKeyword.length > 0;

  const backendResultFilterKeyword = useMemo(() => {
    if (!isResultFilterActive) {
      return '';
    }

    return caseSensitive ? appliedResultFilterKeyword.trim() : normalizedResultFilterKeyword;
  }, [appliedResultFilterKeyword, caseSensitive, isResultFilterActive, normalizedResultFilterKeyword]);

  const effectiveSearchKeyword = useMemo(
    () => resolveSearchKeyword(keyword, parseEscapeSequences),
    [keyword, parseEscapeSequences]
  );

  const visibleFilterMatches = useMemo(() => filterMatches, [filterMatches]);
  const visibleMatches = useMemo(() => matches, [matches]);

  const visibleCurrentFilterMatchIndex = useMemo(() => {
    if (visibleFilterMatches.length === 0) {
      return -1;
    }

    return Math.min(currentFilterMatchIndex, visibleFilterMatches.length - 1);
  }, [currentFilterMatchIndex, visibleFilterMatches]);

  const visibleCurrentMatchIndex = useMemo(() => {
    if (visibleMatches.length === 0) {
      return -1;
    }

    return Math.min(currentMatchIndex, visibleMatches.length - 1);
  }, [currentMatchIndex, visibleMatches]);

  // === Reset helpers (formerly useSearchPanelResetState) ===
  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex]);

  useEffect(() => {
    currentFilterMatchIndexRef.current = currentFilterMatchIndex;
  }, [currentFilterMatchIndex]);

  useEffect(() => {
    setSearchTarget(activeTab?.path ?? '');
  }, [activeTab?.id, activeTab?.path]);

  const resetSearchState = useCallback((clearTotals = true) => {
    setMatches([]);
    setCurrentMatchIndex(0);
    setSearchSessionId(null);
    cachedSearchRef.current = null;
    chunkCursorRef.current = null;
    countCacheRef.current = null;

    if (clearTotals) {
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
    }
  }, [setSearchSessionId]);

  const resetFilterState = useCallback((clearTotals = true) => {
    setFilterMatches([]);
    setCurrentFilterMatchIndex(0);
    setFilterSessionId(null);
    cachedFilterRef.current = null;
    filterLineCursorRef.current = null;
    filterCountCacheRef.current = null;

    if (clearTotals) {
      setTotalFilterMatchedLineCount(null);
    }
  }, [setFilterSessionId]);

  return {
    // Zustand selectors
    activeCursorPosition,
    activeTab,
    activeTabId,
    fontFamily,
    fontSize,
    language,
    recentReplaceValues,
    recentSearchKeywords,
    setCursorPosition,
    updateSettings,
    updateTab,

    // Local state values
    appliedResultFilterKeyword,
    caseSensitive,
    currentFilterMatchIndex,
    currentMatchIndex,
    errorMessage,
    feedbackMessage,
    filterMatches,
    filterRuleGroups,
    isOpen,
    isResultFilterSearching,
    isSearching,
    keyword,
    matches,
    panelMode,
    parseEscapeSequences,
    replaceValue,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultPanelHeight,
    resultPanelState,
    reverseSearch,
    searchMode,
    searchSidebarWidth,
    searchTarget,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,

    // Local state setters
    setAppliedResultFilterKeyword,
    setCaseSensitive,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterRuleGroups,
    setIsOpen,
    setIsResultFilterSearching,
    setIsSearching,
    setKeyword,
    setMatches,
    setPanelMode,
    setParseEscapeSequences,
    setReplaceValue,
    setResultFilterKeyword,
    setResultFilterStepLoadingDirection,
    setResultPanelHeight,
    setResultPanelState,
    setReverseSearch,
    setSearchMode,
    setSearchSidebarWidth,
    setSearchTarget,
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,

    // Refs
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    filterCountCacheRef,
    filterLineCursorRef,
    filterRunVersionRef,
    filterSessionIdRef,
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    minimizedResultWrapperRef,
    previousActiveTabIdRef,
    resultFilterStepRunVersionRef,
    resultListRef,
    resultPanelWrapperRef,
    runVersionRef,
    searchInputRef,
    searchSessionIdRef,
    sessionRestoreRunVersionRef,
    stopResultFilterSearchRef,
    tabSearchPanelStateRef,

    // Session lifecycle setters
    setFilterSessionId,
    setSearchSessionId,

    // UI derived
    inputContextCopyLabel,
    inputContextCutLabel,
    inputContextPasteLabel,
    isFilterMode,
    isReplaceMode,
    messages,
    normalizedFilterRuleGroups,
    resultListTextStyle,

    // Derived state
    backendResultFilterKeyword,
    effectiveSearchKeyword,
    isResultFilterActive,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,

    // Reset helpers
    resetFilterState,
    resetSearchState,
  };
}
