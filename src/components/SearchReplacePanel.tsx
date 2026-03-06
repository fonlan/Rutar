import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { SearchSidebarBody } from '@/components/search-panel/SearchSidebarBody';
import { SearchInputContextMenu } from '@/components/search-panel/SearchInputContextMenu';
import { SearchResultItems } from '@/components/search-panel/SearchResultItems';
import { SearchResultsPanel } from '@/components/search-panel/SearchResultsPanel';
import { SearchSidebarChrome } from '@/components/search-panel/SearchSidebarChrome';
import {
  isFilterResultFilterStepBackendResult,
  isFilterSessionNextBackendResult,
  isFilterSessionRestoreBackendResult,
  isFilterSessionStartBackendResult,
  isMissingInvokeCommandError,
  isSearchCursorStepBackendResult,
  isSearchSessionNextBackendResult,
  isSearchSessionRestoreBackendResult,
  isSearchSessionStartBackendResult,
} from '@/components/search-panel/backendGuards';
import type {
  FilterChunkBackendResult,
  FilterCountBackendResult,
  FilterMatch,
  FilterRule,
  FilterRuleDragState,
  FilterRuleGroupPayload,
  FilterRunResult,
  FilterResultFilterStepBackendResult,
  PanelMode,
  ReplaceAllAndSearchChunkBackendResult,
  ReplaceCurrentAndSearchChunkBackendResult,
  SearchChunkBackendResult,
  SearchCountBackendResult,
  SearchFirstBackendResult,
  SearchMatch,
  SearchMode,
  SearchOpenEventDetail,
  SearchResultFilterStepBackendResult,
  SearchResultPanelState,
  SearchRunResult,
  SearchSidebarInputContextAction,
  SearchSidebarInputContextMenuState,
  SearchSidebarTextInputElement,
  TabSearchPanelSnapshot,
} from '@/components/search-panel/types';
import { getSearchPanelMessages, t } from '@/i18n';
import { appendRecentTextHistoryEntry } from '@/lib/recentTextHistory';
import { useStore } from '@/store/useStore';
import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';
import {
  buildFilterRulesFromPayload,
  buildFilterRulesPayload,
  createDefaultFilterRule,
  DEFAULT_FILTER_RULE_BACKGROUND,
  DEFAULT_FILTER_RULE_TEXT,
  dispatchEditorForceRefresh,
  dispatchNavigateToLine,
  dispatchNavigateToMatch,
  dispatchSearchClose,
  FILTER_CHUNK_SIZE,
  getDisplayCountText,
  getReservedLayoutHeight,
  getPlainTextResultEntries,
  getSearchStatusText,
  getTextInputSelectionRange,
  getSearchModeValue,
  hasTextInputSelection,
  isTextInputEditable,
  normalizeFilterRuleGroups,
  normalizeFilterRules,
  reorderFilterRules,
  replaceSelectedInputText,
  resolveSearchKeyword,
  resolveSearchSidebarTextInputTarget,
  RESULT_PANEL_DEFAULT_HEIGHT,
  RESULT_PANEL_MAX_HEIGHT,
  RESULT_PANEL_MIN_HEIGHT,
  SEARCH_CHUNK_SIZE,
  SEARCH_SIDEBAR_DEFAULT_WIDTH,
  SEARCH_SIDEBAR_MAX_WIDTH,
  SEARCH_SIDEBAR_MIN_WIDTH,
  writePlainTextToClipboard,
} from '@/components/search-panel/utils';
export function SearchReplacePanel() {
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
  const messages = useMemo(
    () => getSearchPanelMessages(language),
    [language]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('find');
  const [keyword, setKeyword] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [parseEscapeSequences, setParseEscapeSequences] = useState(false);
  const [reverseSearch, setReverseSearch] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([createDefaultFilterRule(0)]);
  const [filterRuleGroups, setFilterRuleGroups] = useState<FilterRuleGroupPayload[]>([]);
  const [selectedFilterGroupName, setSelectedFilterGroupName] = useState('');
  const [filterGroupNameInput, setFilterGroupNameInput] = useState('');
  const [filterRuleDragState, setFilterRuleDragState] = useState<FilterRuleDragState | null>(null);
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
  const [searchSidebarTopOffset, setSearchSidebarTopOffset] = useState('0px');
  const [searchSidebarBottomOffset, setSearchSidebarBottomOffset] = useState('0px');
  const [isSearchUiFocused, setIsSearchUiFocused] = useState(false);
  const [isSearchUiPointerActive, setIsSearchUiPointerActive] = useState(false);
  const [isSearchUiPinnedActive, setIsSearchUiPinnedActive] = useState(false);
  const [inputContextMenu, setInputContextMenu] = useState<SearchSidebarInputContextMenuState | null>(null);

  const isReplaceMode = panelMode === 'replace';
  const isFilterMode = panelMode === 'filter';
  const inputContextCopyLabel = useMemo(() => t(language, 'toolbar.copy'), [language]);
  const inputContextCutLabel = useMemo(() => t(language, 'toolbar.cut'), [language]);
  const inputContextPasteLabel = useMemo(() => t(language, 'toolbar.paste'), [language]);
  const effectiveFilterRules = useMemo(() => normalizeFilterRules(filterRules), [filterRules]);
  const filterRulesPayload = useMemo(() => buildFilterRulesPayload(filterRules), [filterRules]);
  const hasAnyConfiguredFilterRule = useMemo(
    () =>
      filterRules.length > 1
      || filterRules.some((rule) => {
        const keyword = rule.keyword.trim();
        return (
          keyword.length > 0
          || rule.matchMode !== 'contains'
          || rule.backgroundColor !== DEFAULT_FILTER_RULE_BACKGROUND
          || rule.textColor !== DEFAULT_FILTER_RULE_TEXT
          || rule.bold
          || rule.italic
          || rule.applyTo !== 'line'
        );
      }),
    [filterRules]
  );
  const normalizedFilterRuleGroups = useMemo(
    () => normalizeFilterRuleGroups(filterRuleGroups),
    [filterRuleGroups]
  );
  const resultListTextStyle = useMemo(
    () => ({ fontFamily, fontSize: `${Math.max(10, fontSize || 14)}px` }),
    [fontFamily, fontSize]
  );
  const {
    containerRef: searchSidebarContainerRef,
    isResizing: isSearchSidebarResizing,
    startResize: startSearchSidebarResize,
  } = useResizableSidebarWidth({
    width: searchSidebarWidth,
    minWidth: SEARCH_SIDEBAR_MIN_WIDTH,
    maxWidth: SEARCH_SIDEBAR_MAX_WIDTH,
    onWidthChange: setSearchSidebarWidth,
    resizeEdge: 'left',
  });
  const isSearchUiActive = isSearchUiFocused || isSearchUiPointerActive || isSearchUiPinnedActive;
  const filterRulesKey = useMemo(() => JSON.stringify(filterRulesPayload), [filterRulesPayload]);

  const rememberSearchKeyword = useCallback((value: string) => {
    if (value.length === 0) {
      return;
    }

    const nextKeywords = appendRecentTextHistoryEntry(recentSearchKeywords, value);
    if (nextKeywords !== recentSearchKeywords) {
      updateSettings({ recentSearchKeywords: nextKeywords });
    }
  }, [recentSearchKeywords, updateSettings]);

  const rememberReplaceValue = useCallback((value: string) => {
    const nextValues = appendRecentTextHistoryEntry(recentReplaceValues, value);
    if (nextValues !== recentReplaceValues) {
      updateSettings({ recentReplaceValues: nextValues });
    }
  }, [recentReplaceValues, updateSettings]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const inputContextMenuTargetRef = useRef<SearchSidebarTextInputElement | null>(null);
  const inputContextMenuRef = useRef<HTMLDivElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const resizeDragStateRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
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

  const requestStopResultFilterSearch = useCallback(() => {
    stopResultFilterSearchRef.current = true;
    runVersionRef.current += 1;
    filterRunVersionRef.current += 1;
    countRunVersionRef.current += 1;
    filterCountRunVersionRef.current += 1;
  }, []);
  const cancelPendingBatchLoad = useCallback(() => {
    loadMoreSessionRef.current += 1;
    resultFilterStepRunVersionRef.current += 1;
    if (loadMoreDebounceRef.current !== null) {
      window.clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }
    setResultFilterStepLoadingDirection(null);
    if (loadMoreLockRef.current) {
      loadMoreLockRef.current = false;
      setIsSearching(false);
    }
  }, []);
  const filterCountCacheRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
    matchedLines: number;
  } | null>(null);
  const tabSearchPanelStateRef = useRef<Record<string, TabSearchPanelSnapshot>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);
  const previousIsOpenRef = useRef(false);
  const blurUpdateTimerRef = useRef<number | null>(null);
  const searchSessionCommandUnsupportedRef = useRef(false);
  const searchSessionRestoreCommandUnsupportedRef = useRef(false);
  const filterSessionCommandUnsupportedRef = useRef(false);
  const filterSessionRestoreCommandUnsupportedRef = useRef(false);
  const searchCursorStepCommandUnsupportedRef = useRef(false);
  const filterStepCommandUnsupportedRef = useRef(false);

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

  const closeInputContextMenu = useCallback(() => {
    setInputContextMenu(null);
    inputContextMenuTargetRef.current = null;
  }, []);

  const isTargetInsideSearchSidebar = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      return false;
    }

    return !!searchSidebarContainerRef.current?.contains(target);
  }, []);

  const getSearchSidebarOccludedRightPx = useCallback(() => {
    if (!isOpen) {
      return 0;
    }

    const sidebarElement = searchSidebarContainerRef.current;
    if (!sidebarElement) {
      return 0;
    }

    const rect = sidebarElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }

    return Math.max(0, window.innerWidth - rect.left);
  }, [isOpen, searchSidebarContainerRef]);

  const syncSearchSidebarFocusFromDom = useCallback(() => {
    setIsSearchUiFocused(isTargetInsideSearchSidebar(document.activeElement));
  }, [isTargetInsideSearchSidebar]);

  const handleSearchUiPointerDownCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiPointerActive(true);
    setIsSearchUiPinnedActive(true);
    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiFocusCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      if (isTargetInsideSearchSidebar(event.relatedTarget)) {
        return;
      }

      if (isSearchUiPointerActive) {
        return;
      }

      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
      }

      blurUpdateTimerRef.current = window.setTimeout(() => {
        if (!isSearchUiPointerActive) {
          syncSearchSidebarFocusFromDom();
        }
        blurUpdateTimerRef.current = null;
      }, 40);
    },
    [isSearchUiPointerActive, isTargetInsideSearchSidebar, syncSearchSidebarFocusFromDom]
  );

  useEffect(() => {
    if (!isSearchUiPointerActive) {
      return;
    }

    const handlePointerEnd = () => {
      setIsSearchUiPointerActive(false);
      window.requestAnimationFrame(() => {
        syncSearchSidebarFocusFromDom();
      });
    };

    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    return () => {
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [isSearchUiPointerActive, syncSearchSidebarFocusFromDom]);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      if (isTargetInsideSearchSidebar(event.target)) {
        return;
      }

      setIsSearchUiPinnedActive(false);
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    };
  }, [isTargetInsideSearchSidebar]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    closeInputContextMenu();
  }, [closeInputContextMenu, isOpen]);

  useEffect(() => {
    if (!inputContextMenu) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeInputContextMenu();
        return;
      }

      if (inputContextMenuRef.current?.contains(target)) {
        return;
      }

      closeInputContextMenu();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeInputContextMenu();
      }
    };

    const closeOnWindowBlur = () => {
      closeInputContextMenu();
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', closeOnWindowBlur);
    window.addEventListener('resize', closeOnWindowBlur);

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', closeOnWindowBlur);
      window.removeEventListener('resize', closeOnWindowBlur);
    };
  }, [closeInputContextMenu, inputContextMenu]);

  useEffect(() => {
    return () => {
      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
        blurUpdateTimerRef.current = null;
      }
      disposeSearchSessionById(searchSessionIdRef.current);
      disposeFilterSessionById(filterSessionIdRef.current);
    };
  }, [disposeFilterSessionById, disposeSearchSessionById]);

  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex]);

  useEffect(() => {
    currentFilterMatchIndexRef.current = currentFilterMatchIndex;
  }, [currentFilterMatchIndex]);

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

  const executeCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTab || !keyword || isFilterMode) {
      setTotalMatchCount(keyword ? 0 : null);
      setTotalMatchedLineCount(keyword ? 0 : null);
      return;
    }

    if (!forceRefresh) {
      const cached = countCacheRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.keyword === effectiveSearchKeyword &&
        cached.searchMode === searchMode &&
        cached.caseSensitive === caseSensitive &&
        cached.parseEscapeSequences === parseEscapeSequences &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setTotalMatchCount(cached.totalMatches);
            setTotalMatchedLineCount(cached.matchedLines);
            return;
          }
        } catch (error) {
          console.warn('Failed to read document version for count:', error);
        }
      }
    }

    const runId = countRunVersionRef.current + 1;
    countRunVersionRef.current = runId;

    try {
      const result = await invoke<SearchCountBackendResult>('search_count_in_document', {
        id: activeTab.id,
        keyword: effectiveSearchKeyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
      });

      if (countRunVersionRef.current !== runId) {
        return;
      }

      setTotalMatchCount(result.totalMatches ?? 0);
      setTotalMatchedLineCount(result.matchedLines ?? 0);

      countCacheRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion: result.documentVersion ?? 0,
        totalMatches: result.totalMatches ?? 0,
        matchedLines: result.matchedLines ?? 0,
      };
    } catch (error) {
      if (countRunVersionRef.current !== runId) {
        return;
      }

      console.warn('Count search failed:', error);
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    isFilterMode,
    keyword,
    parseEscapeSequences,
    searchMode,
  ]);

  const executeFilterCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTab) {
      setTotalFilterMatchedLineCount(null);
      return;
    }

    if (filterRulesPayload.length === 0) {
      setTotalFilterMatchedLineCount(0);
      return;
    }

    if (!forceRefresh) {
      const cached = filterCountCacheRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.rulesKey === filterRulesKey &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setTotalFilterMatchedLineCount(cached.matchedLines);
            return;
          }
        } catch (error) {
          console.warn('Failed to read document version for filter count:', error);
        }
      }
    }

    const runId = filterCountRunVersionRef.current + 1;
    filterCountRunVersionRef.current = runId;

    try {
      const result = await invoke<FilterCountBackendResult>('filter_count_in_document', {
        id: activeTab.id,
        rules: filterRulesPayload,
        resultFilterKeyword: effectiveResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
      });

      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      setTotalFilterMatchedLineCount(result.matchedLines ?? 0);
      filterCountCacheRef.current = {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion: result.documentVersion ?? 0,
        matchedLines: result.matchedLines ?? 0,
      };
    } catch (error) {
      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      console.warn('Filter count failed:', error);
      setTotalFilterMatchedLineCount(null);
    }
  }, [activeTab, backendResultFilterKeyword, caseSensitive, filterRulesKey, filterRulesPayload]);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const executeSearch = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<SearchRunResult | null> => {
      const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;
      cancelPendingBatchLoad();

    if (!activeTab || isFilterMode) {
      return null;
    }

    if (!keyword) {
      setErrorMessage(null);
      resetSearchState();
      setIsSearching(false);
      return {
        matches: [],
        documentVersion: 0,
        errorMessage: null,
        nextOffset: null,
      };
    }

    if (!forceRefresh) {
      const cached = cachedSearchRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.keyword === effectiveSearchKeyword &&
        cached.searchMode === searchMode &&
        cached.caseSensitive === caseSensitive &&
        cached.parseEscapeSequences === parseEscapeSequences &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setErrorMessage(null);
            startTransition(() => {
              setMatches(cached.matches);
              setCurrentMatchIndex((previousIndex) => {
                if (cached.matches.length === 0) {
                  return 0;
                }

                return Math.min(previousIndex, cached.matches.length - 1);
              });
            });

            chunkCursorRef.current = cached.nextOffset;
            setSearchSessionId(cached.sessionId);

            return {
              matches: cached.matches,
              documentVersion: cached.documentVersion,
              errorMessage: null,
              nextOffset: cached.nextOffset,
            };
          }
        } catch (error) {
          console.warn('Failed to read document version:', error);
        }
      }
    }

    const runVersion = runVersionRef.current + 1;
    runVersionRef.current = runVersion;
    if (!silent) {
      setIsSearching(true);
    }

    try {
      let nextMatches: SearchMatch[] = [];
      let documentVersion = 0;
      let nextOffset: number | null = null;
      let sessionId: string | null = null;
      let totalMatches: number | null = null;
      let totalMatchedLines: number | null = null;
      let shouldRunCountFallback = true;

      let sessionStartResult: unknown = null;
      let usedSessionStart = false;
      if (!searchSessionCommandUnsupportedRef.current) {
        try {
          sessionStartResult = await invoke<unknown>('search_session_start_in_document', {
            id: activeTab.id,
            keyword: effectiveSearchKeyword,
            mode: getSearchModeValue(searchMode),
            caseSensitive,
            resultFilterKeyword: effectiveResultFilterKeyword,
            resultFilterCaseSensitive: caseSensitive,
            maxResults: SEARCH_CHUNK_SIZE,
          });
          usedSessionStart = isSearchSessionStartBackendResult(sessionStartResult);
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'search_session_start_in_document')) {
            searchSessionCommandUnsupportedRef.current = true;
          }
        }
      }

      if (usedSessionStart && isSearchSessionStartBackendResult(sessionStartResult)) {
        nextMatches = sessionStartResult.matches || [];
        documentVersion = sessionStartResult.documentVersion ?? 0;
        nextOffset = sessionStartResult.nextOffset ?? null;
        sessionId = sessionStartResult.sessionId ?? null;
        totalMatches = sessionStartResult.totalMatches ?? nextMatches.length;
        totalMatchedLines = sessionStartResult.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size;
        shouldRunCountFallback = false;
        searchSessionCommandUnsupportedRef.current = false;
      } else {
        const backendResult = await invoke<SearchChunkBackendResult>('search_in_document_chunk', {
          id: activeTab.id,
          keyword: effectiveSearchKeyword,
          mode: getSearchModeValue(searchMode),
          caseSensitive,
          resultFilterKeyword: effectiveResultFilterKeyword,
          startOffset: 0,
          maxResults: SEARCH_CHUNK_SIZE,
        });

        nextMatches = backendResult.matches || [];
        documentVersion = backendResult.documentVersion ?? 0;
        nextOffset = backendResult.nextOffset ?? null;
      }

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      setErrorMessage(null);
      startTransition(() => {
        setMatches(nextMatches);
        setCurrentMatchIndex((previousIndex) => {
          if (nextMatches.length === 0) {
            return 0;
          }

          return Math.min(previousIndex, nextMatches.length - 1);
        });
      });
      if (totalMatches !== null) {
        setTotalMatchCount(totalMatches);
      }
      if (totalMatchedLines !== null) {
        setTotalMatchedLineCount(totalMatchedLines);
      }

      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextOffset,
        sessionId,
      };

      chunkCursorRef.current = nextOffset;
      setSearchSessionId(sessionId);
      if (shouldRunCountFallback) {
        void executeCountSearch(forceRefresh, effectiveResultFilterKeyword);
      } else if (totalMatches !== null && totalMatchedLines !== null) {
        countCacheRef.current = {
          tabId: activeTab.id,
          keyword: effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          parseEscapeSequences,
          resultFilterKeyword: effectiveResultFilterKeyword,
          documentVersion,
          totalMatches,
          matchedLines: totalMatchedLines,
        };
      }

      return {
        matches: nextMatches,
        documentVersion,
        errorMessage: null,
        nextOffset,
      };
    } catch (error) {
      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      resetSearchState();

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextOffset: null,
      };
    } finally {
      if (runVersionRef.current === runVersion && !silent) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    cancelPendingBatchLoad,
    caseSensitive,
    effectiveSearchKeyword,
    executeCountSearch,
    isFilterMode,
    keyword,
    messages.searchFailed,
    parseEscapeSequences,
    resetSearchState,
    setSearchSessionId,
    searchMode,
  ]);

  const executeFilter = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<FilterRunResult | null> => {
  const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;
  cancelPendingBatchLoad();

  if (!activeTab) {
    return null;
  }

    if (filterRulesPayload.length === 0) {
      setErrorMessage(null);
      resetFilterState(false);
      setTotalFilterMatchedLineCount(0);
      setIsSearching(false);
      return {
        matches: [],
        documentVersion: 0,
        errorMessage: null,
        nextLine: null,
      };
    }

    if (!forceRefresh) {
      const cached = cachedFilterRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.rulesKey === filterRulesKey &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setErrorMessage(null);
            startTransition(() => {
              setFilterMatches(cached.matches);
              setCurrentFilterMatchIndex((previousIndex) => {
                if (cached.matches.length === 0) {
                  return 0;
                }

                return Math.min(previousIndex, cached.matches.length - 1);
              });
            });

            filterLineCursorRef.current = cached.nextLine;
            setFilterSessionId(cached.sessionId);

            return {
              matches: cached.matches,
              documentVersion: cached.documentVersion,
              errorMessage: null,
              nextLine: cached.nextLine,
            };
          }
        } catch (error) {
          console.warn('Failed to read document version for filter:', error);
        }
      }
    }

    const runVersion = filterRunVersionRef.current + 1;
    filterRunVersionRef.current = runVersion;
    if (!silent) {
      setIsSearching(true);
    }

    try {
      let nextMatches: FilterMatch[] = [];
      let documentVersion = 0;
      let nextLine: number | null = null;
      let sessionId: string | null = null;
      let totalMatchedLines: number | null = null;
      let shouldRunCountFallback = true;

      let sessionStartResult: unknown = null;
      let usedSessionStart = false;
      if (!filterSessionCommandUnsupportedRef.current) {
        try {
          sessionStartResult = await invoke<unknown>('filter_session_start_in_document', {
            id: activeTab.id,
            rules: filterRulesPayload,
            resultFilterKeyword: effectiveResultFilterKeyword,
            resultFilterCaseSensitive: caseSensitive,
            maxResults: FILTER_CHUNK_SIZE,
          });
          usedSessionStart = isFilterSessionStartBackendResult(sessionStartResult);
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'filter_session_start_in_document')) {
            filterSessionCommandUnsupportedRef.current = true;
          }
        }
      }

      if (usedSessionStart && isFilterSessionStartBackendResult(sessionStartResult)) {
        nextMatches = sessionStartResult.matches || [];
        documentVersion = sessionStartResult.documentVersion ?? 0;
        nextLine = sessionStartResult.nextLine ?? null;
        sessionId = sessionStartResult.sessionId ?? null;
        totalMatchedLines = sessionStartResult.totalMatchedLines ?? nextMatches.length;
        shouldRunCountFallback = false;
        filterSessionCommandUnsupportedRef.current = false;
      } else {
        const backendResult = await invoke<FilterChunkBackendResult>('filter_in_document_chunk', {
          id: activeTab.id,
          rules: filterRulesPayload,
          resultFilterKeyword: effectiveResultFilterKeyword,
          resultFilterCaseSensitive: caseSensitive,
          startLine: 0,
          maxResults: FILTER_CHUNK_SIZE,
        });

        nextMatches = backendResult.matches || [];
        documentVersion = backendResult.documentVersion ?? 0;
        nextLine = backendResult.nextLine ?? null;
      }

      if (filterRunVersionRef.current !== runVersion) {
        return null;
      }

      setErrorMessage(null);
      startTransition(() => {
        setFilterMatches(nextMatches);
        setCurrentFilterMatchIndex((previousIndex) => {
          if (nextMatches.length === 0) {
            return 0;
          }

          return Math.min(previousIndex, nextMatches.length - 1);
        });
      });
      if (totalMatchedLines !== null) {
        setTotalFilterMatchedLineCount(totalMatchedLines);
      }

      cachedFilterRef.current = {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextLine,
        sessionId,
      };

      filterLineCursorRef.current = nextLine;
      setFilterSessionId(sessionId);
      if (shouldRunCountFallback) {
        void executeFilterCountSearch(forceRefresh, effectiveResultFilterKeyword);
      } else if (totalMatchedLines !== null) {
        filterCountCacheRef.current = {
          tabId: activeTab.id,
          rulesKey: filterRulesKey,
          resultFilterKeyword: effectiveResultFilterKeyword,
          documentVersion,
          matchedLines: totalMatchedLines,
        };
      }

      return {
        matches: nextMatches,
        documentVersion,
        errorMessage: null,
        nextLine,
      };
    } catch (error) {
      if (filterRunVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterFailed}: ${readableError}`);
      resetFilterState();

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextLine: null,
      };
    } finally {
      if (filterRunVersionRef.current === runVersion && !silent) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    cancelPendingBatchLoad,
    caseSensitive,
    executeFilterCountSearch,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    messages.filterFailed,
    resetFilterState,
    setFilterSessionId,
  ]);

  const loadMoreMatches = useCallback(async (): Promise<SearchMatch[] | null> => {
    if (loadMoreLockRef.current) {
      return null;
    }

    if (!activeTab || isFilterMode) {
      return null;
    }

    const startOffset = chunkCursorRef.current;
    if (startOffset === null) {
      return null;
    }

    const sessionId = loadMoreSessionRef.current;
    loadMoreLockRef.current = true;
    setIsSearching(true);
    try {
      let appendedMatches: SearchMatch[] = [];
      let nextOffset: number | null = null;
      let documentVersion = cachedSearchRef.current?.documentVersion ?? 0;
      let usedSessionMode = false;

      const activeSearchSessionId = searchSessionIdRef.current;
      if (activeSearchSessionId && !searchSessionCommandUnsupportedRef.current) {
        try {
          const sessionNextResult = await invoke<unknown>('search_session_next_in_document', {
            sessionId: activeSearchSessionId,
            maxResults: SEARCH_CHUNK_SIZE,
          });
          if (sessionId !== loadMoreSessionRef.current) {
            return null;
          }

          if (isSearchSessionNextBackendResult(sessionNextResult)) {
            usedSessionMode = true;
            appendedMatches = sessionNextResult.matches || [];
            nextOffset = sessionNextResult.nextOffset ?? null;
            documentVersion = sessionNextResult.documentVersion ?? documentVersion;
            if (nextOffset === null) {
              setSearchSessionId(null);
            }
            searchSessionCommandUnsupportedRef.current = false;
          } else {
            setSearchSessionId(null);
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'search_session_next_in_document')) {
            searchSessionCommandUnsupportedRef.current = true;
          }
          setSearchSessionId(null);
        }
      }

      if (!usedSessionMode) {
        const params = cachedSearchRef.current;
        if (
          !params ||
          params.tabId !== activeTab.id ||
          params.keyword !== effectiveSearchKeyword ||
          params.searchMode !== searchMode ||
          params.caseSensitive !== caseSensitive ||
          params.parseEscapeSequences !== parseEscapeSequences ||
          params.resultFilterKeyword !== backendResultFilterKeyword
        ) {
          return null;
        }

        const backendResult = await invoke<SearchChunkBackendResult>('search_in_document_chunk', {
          id: activeTab.id,
          keyword: effectiveSearchKeyword,
          mode: getSearchModeValue(searchMode),
          caseSensitive,
          resultFilterKeyword: backendResultFilterKeyword,
          startOffset,
          maxResults: SEARCH_CHUNK_SIZE,
        });

        if (sessionId !== loadMoreSessionRef.current) {
          return null;
        }

        if (backendResult.documentVersion !== params.documentVersion) {
          cachedSearchRef.current = null;
          chunkCursorRef.current = null;
          setSearchSessionId(null);
          return null;
        }

        appendedMatches = backendResult.matches || [];
        nextOffset = backendResult.nextOffset ?? null;
        documentVersion = params.documentVersion;
      }

      chunkCursorRef.current = nextOffset;

      if (appendedMatches.length === 0) {
        if (cachedSearchRef.current) {
          cachedSearchRef.current.nextOffset = nextOffset;
          cachedSearchRef.current.sessionId = searchSessionIdRef.current;
        }
        return [];
      }

      startTransition(() => {
        setMatches((previousMatches) => {
          const mergedMatches = [...previousMatches, ...appendedMatches];

          cachedSearchRef.current = {
            tabId: activeTab.id,
            keyword: effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            parseEscapeSequences,
            resultFilterKeyword: backendResultFilterKeyword,
            documentVersion,
            matches: mergedMatches,
            nextOffset,
            sessionId: searchSessionIdRef.current,
          };

          return mergedMatches;
        });
      });

      return appendedMatches;
    } catch (error) {
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      if (sessionId === loadMoreSessionRef.current) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    isFilterMode,
    messages.searchFailed,
    parseEscapeSequences,
    searchMode,
    setSearchSessionId,
  ]);

  const loadMoreFilterMatches = useCallback(async (): Promise<FilterMatch[] | null> => {
    if (loadMoreLockRef.current) {
      return null;
    }

    if (!activeTab) {
      return null;
    }

    const startLine = filterLineCursorRef.current;
    if (startLine === null) {
      return null;
    }

    const sessionId = loadMoreSessionRef.current;
    loadMoreLockRef.current = true;
    setIsSearching(true);
    try {
      let appendedMatches: FilterMatch[] = [];
      let nextLine: number | null = null;
      let documentVersion = cachedFilterRef.current?.documentVersion ?? 0;
      let usedSessionMode = false;

      const activeFilterSessionId = filterSessionIdRef.current;
      if (activeFilterSessionId && !filterSessionCommandUnsupportedRef.current) {
        try {
          const sessionNextResult = await invoke<unknown>('filter_session_next_in_document', {
            sessionId: activeFilterSessionId,
            maxResults: FILTER_CHUNK_SIZE,
          });
          if (sessionId !== loadMoreSessionRef.current) {
            return null;
          }

          if (isFilterSessionNextBackendResult(sessionNextResult)) {
            usedSessionMode = true;
            appendedMatches = sessionNextResult.matches || [];
            nextLine = sessionNextResult.nextLine ?? null;
            documentVersion = sessionNextResult.documentVersion ?? documentVersion;
            if (nextLine === null) {
              setFilterSessionId(null);
            }
            filterSessionCommandUnsupportedRef.current = false;
          } else {
            setFilterSessionId(null);
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'filter_session_next_in_document')) {
            filterSessionCommandUnsupportedRef.current = true;
          }
          setFilterSessionId(null);
        }
      }

      if (!usedSessionMode) {
        const params = cachedFilterRef.current;
        if (
          !params ||
          params.tabId !== activeTab.id ||
          params.rulesKey !== filterRulesKey ||
          params.resultFilterKeyword !== backendResultFilterKeyword
        ) {
          return null;
        }

        const backendResult = await invoke<FilterChunkBackendResult>('filter_in_document_chunk', {
          id: activeTab.id,
          rules: filterRulesPayload,
          resultFilterKeyword: backendResultFilterKeyword,
          resultFilterCaseSensitive: caseSensitive,
          startLine,
          maxResults: FILTER_CHUNK_SIZE,
        });

        if (sessionId !== loadMoreSessionRef.current) {
          return null;
        }

        if (backendResult.documentVersion !== params.documentVersion) {
          cachedFilterRef.current = null;
          filterLineCursorRef.current = null;
          setFilterSessionId(null);
          return null;
        }

        appendedMatches = backendResult.matches || [];
        nextLine = backendResult.nextLine ?? null;
        documentVersion = params.documentVersion;
      }

      filterLineCursorRef.current = nextLine;

      if (appendedMatches.length === 0) {
        if (cachedFilterRef.current) {
          cachedFilterRef.current.nextLine = nextLine;
          cachedFilterRef.current.sessionId = filterSessionIdRef.current;
        }
        return [];
      }

      startTransition(() => {
        setFilterMatches((previousMatches) => {
          const mergedMatches = [...previousMatches, ...appendedMatches];

          cachedFilterRef.current = {
            tabId: activeTab.id,
            rulesKey: filterRulesKey,
            resultFilterKeyword: backendResultFilterKeyword,
            documentVersion,
            matches: mergedMatches,
            nextLine,
            sessionId: filterSessionIdRef.current,
          };

          return mergedMatches;
        });
      });

      return appendedMatches;
    } catch (error) {
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      if (sessionId === loadMoreSessionRef.current) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    messages.filterFailed,
    setFilterSessionId,
  ]);

  const executeFirstMatchSearch = useCallback(async (reverse: boolean): Promise<SearchRunResult | null> => {
    cancelPendingBatchLoad();
    if (!activeTab || !keyword || isFilterMode) {
      return null;
    }

    const runVersion = runVersionRef.current + 1;
    runVersionRef.current = runVersion;
    setIsSearching(true);

    try {
      const firstResult = await invoke<SearchFirstBackendResult>('search_first_in_document', {
        id: activeTab.id,
        keyword: effectiveSearchKeyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        reverse,
      });

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const documentVersion = firstResult.documentVersion ?? 0;
      const firstMatch = firstResult.firstMatch;

      if (!firstMatch) {
        setErrorMessage(null);
        resetSearchState(false);

        cachedSearchRef.current = {
          tabId: activeTab.id,
          keyword: effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          parseEscapeSequences,
          resultFilterKeyword: backendResultFilterKeyword,
          documentVersion,
          matches: [],
          nextOffset: null,
          sessionId: null,
        };
        setSearchSessionId(null);
        chunkCursorRef.current = null;
        setIsSearching(false);

        return {
          matches: [],
          documentVersion,
          errorMessage: null,
          nextOffset: null,
        };
      }

      const immediateMatches = [firstMatch];
      setErrorMessage(null);
      startTransition(() => {
        setMatches(immediateMatches);
        setCurrentMatchIndex(0);
      });

      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        matches: immediateMatches,
        nextOffset: 0,
        sessionId: null,
      };
      setSearchSessionId(null);
      chunkCursorRef.current = 0;

      void (async () => {
        const chunkResult = await executeSearch(true, false);
        if (!chunkResult) {
          return;
        }
      })();

      return {
        matches: immediateMatches,
        documentVersion,
        errorMessage: null,
        nextOffset: 0,
      };
    } catch (error) {
      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      resetSearchState();
      setIsSearching(false);

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextOffset: null,
      };
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    cancelPendingBatchLoad,
    caseSensitive,
    effectiveSearchKeyword,
    executeSearch,
    isFilterMode,
    keyword,
    messages.searchFailed,
    parseEscapeSequences,
    resetSearchState,
    searchMode,
  ]);

  const navigateToMatch = useCallback(
    (targetMatch: SearchMatch) => {
      if (!activeTab) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      setCursorPosition(activeTab.id, targetMatch.line, Math.max(1, targetMatch.column || 1));
      dispatchNavigateToMatch(activeTab.id, targetMatch, occludedRightPx);
    },
    [activeTab, getSearchSidebarOccludedRightPx, setCursorPosition]
  );

  const navigateToFilterMatch = useCallback(
    (targetMatch: FilterMatch) => {
      if (!activeTab) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      dispatchNavigateToLine(
        activeTab.id,
        targetMatch.line,
        Math.max(1, targetMatch.column || 1),
        Math.max(0, targetMatch.length || 0),
        targetMatch.lineText || '',
        occludedRightPx
      );
    },
    [activeTab, getSearchSidebarOccludedRightPx]
  );

  const hasMoreMatches = chunkCursorRef.current !== null;
  const hasMoreFilterMatches = filterLineCursorRef.current !== null;

  const handleResultListScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!isOpen || resultPanelState !== 'open') {
        return;
      }

      if (isFilterMode) {
        if (filterRulesPayload.length === 0 || !hasMoreFilterMatches || isSearching || loadMoreLockRef.current) {
          return;
        }
      } else if (!keyword || !hasMoreMatches || isSearching || loadMoreLockRef.current) {
        return;
      }

      const target = event.currentTarget;
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining > 32) {
        return;
      }

      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }

      loadMoreDebounceRef.current = window.setTimeout(() => {
        loadMoreDebounceRef.current = null;
        if (isFilterMode) {
          void loadMoreFilterMatches();
          return;
        }

        void loadMoreMatches();
      }, 40);
    },
    [
      filterRulesPayload.length,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isOpen,
      isSearching,
      keyword,
      loadMoreFilterMatches,
      loadMoreMatches,
      resultPanelState,
    ]
  );

  const navigateByStep = useCallback(
    async (step: number) => {
      const normalizedStep = step < 0 ? -1 : 1;
      const navigationFeedback = normalizedStep < 0 ? messages.prevMatch : messages.nextMatch;

      if (!isFilterMode && keyword.length > 0) {
        rememberSearchKeyword(keyword);
      }

      if (activeTab && isFilterMode && !filterStepCommandUnsupportedRef.current) {
        try {
          const currentFilterMatch =
            currentFilterMatchIndexRef.current >= 0 &&
            currentFilterMatchIndexRef.current < filterMatches.length
              ? filterMatches[currentFilterMatchIndexRef.current]
              : null;
          const stepResultValue = await invoke<unknown>('step_result_filter_search_in_filter_document', {
            id: activeTab.id,
            rules: filterRulesPayload,
            resultFilterKeyword: backendResultFilterKeyword,
            resultFilterCaseSensitive: caseSensitive,
            currentLine: currentFilterMatch?.line ?? null,
            currentColumn: currentFilterMatch?.column ?? null,
            step: normalizedStep,
            maxResults: FILTER_CHUNK_SIZE,
          });

          if (isFilterResultFilterStepBackendResult(stepResultValue)) {
            filterStepCommandUnsupportedRef.current = false;

            const targetMatch = stepResultValue.targetMatch;
            if (!targetMatch) {
              return;
            }

            const stepBatchMatches =
              Array.isArray(stepResultValue.batchMatches) && stepResultValue.batchMatches.length > 0
                ? stepResultValue.batchMatches
                : filterMatches;
            const targetIndex =
              stepBatchMatches === filterMatches
                ? stepBatchMatches.findIndex(
                    (item) =>
                      item.line === targetMatch.line &&
                      item.column === targetMatch.column &&
                      item.ruleIndex === targetMatch.ruleIndex
                  )
                : Math.min(
                    Math.max(0, stepResultValue.targetIndexInBatch ?? 0),
                    Math.max(0, stepBatchMatches.length - 1)
                  );

            if (targetIndex >= 0 && targetIndex < stepBatchMatches.length) {
              const documentVersion = stepResultValue.documentVersion ?? 0;
              const totalMatchedLines = stepResultValue.totalMatchedLines ?? 0;
              filterLineCursorRef.current = stepResultValue.nextLine ?? null;
              setFilterSessionId(null);
              cachedFilterRef.current = {
                tabId: activeTab.id,
                rulesKey: filterRulesKey,
                resultFilterKeyword: backendResultFilterKeyword,
                documentVersion,
                matches: stepBatchMatches,
                nextLine: filterLineCursorRef.current,
                sessionId: null,
              };
              filterCountCacheRef.current = {
                tabId: activeTab.id,
                rulesKey: filterRulesKey,
                resultFilterKeyword: backendResultFilterKeyword,
                documentVersion,
                matchedLines: totalMatchedLines,
              };
              setTotalFilterMatchedLineCount(totalMatchedLines);
              startTransition(() => {
                setFilterMatches(stepBatchMatches);
              });
              currentFilterMatchIndexRef.current = targetIndex;
              setCurrentFilterMatchIndex(targetIndex);
              setFeedbackMessage(navigationFeedback);
              navigateToFilterMatch(stepBatchMatches[targetIndex]);
              return;
            }
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'step_result_filter_search_in_filter_document')) {
            filterStepCommandUnsupportedRef.current = true;
          } else {
            const readableError = error instanceof Error ? error.message : String(error);
            setErrorMessage(`${messages.filterFailed}: ${readableError}`);
            return;
          }
        }
      }

      if (isFilterMode) {
        if (filterMatches.length > 0) {
          const boundedCurrentIndex = Math.min(currentFilterMatchIndexRef.current, filterMatches.length - 1);
          const candidateIndex = boundedCurrentIndex + step;

          if (candidateIndex < 0) {
            const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
            currentFilterMatchIndexRef.current = nextIndex;
            setCurrentFilterMatchIndex(nextIndex);
            setFeedbackMessage(navigationFeedback);
            navigateToFilterMatch(filterMatches[nextIndex]);
            return;
          }

          if (candidateIndex >= filterMatches.length && !loadMoreLockRef.current) {
            const appended = await loadMoreFilterMatches();
            if (appended && appended.length > 0) {
              const expandedMatches = [...filterMatches, ...appended];
              const nextIndex = candidateIndex;
              currentFilterMatchIndexRef.current = nextIndex;
              setCurrentFilterMatchIndex(nextIndex);
              setFeedbackMessage(navigationFeedback);
              navigateToFilterMatch(expandedMatches[nextIndex]);
              return;
            }
          }

          const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
          currentFilterMatchIndexRef.current = nextIndex;
          setCurrentFilterMatchIndex(nextIndex);
          setFeedbackMessage(navigationFeedback);
          navigateToFilterMatch(filterMatches[nextIndex]);
          return;
        }

        const filterResult = await executeFilter();
        if (!filterResult || filterResult.matches.length === 0) {
          return;
        }

        const boundedCurrentIndex = Math.min(currentFilterMatchIndexRef.current, filterResult.matches.length - 1);
        const nextIndex = (boundedCurrentIndex + step + filterResult.matches.length) % filterResult.matches.length;

        currentFilterMatchIndexRef.current = nextIndex;
        setCurrentFilterMatchIndex(nextIndex);
        setFeedbackMessage(navigationFeedback);
        navigateToFilterMatch(filterResult.matches[nextIndex]);

        return;
      }

      if (activeTab && keyword && !searchCursorStepCommandUnsupportedRef.current) {
        try {
          const currentSearchMatch =
            currentMatchIndexRef.current >= 0 && currentMatchIndexRef.current < matches.length
              ? matches[currentMatchIndexRef.current]
              : null;
          const anchorLine = activeCursorPosition?.line ?? currentSearchMatch?.line ?? null;
          const anchorColumn = activeCursorPosition?.column ?? currentSearchMatch?.column ?? null;
          const stepResultValue = await invoke<unknown>('search_step_from_cursor_in_document', {
            id: activeTab.id,
            keyword: effectiveSearchKeyword,
            mode: getSearchModeValue(searchMode),
            caseSensitive,
            resultFilterKeyword: backendResultFilterKeyword,
            resultFilterCaseSensitive: caseSensitive,
            cursorLine: anchorLine,
            cursorColumn: anchorColumn,
            step: normalizedStep,
          });

          if (isSearchCursorStepBackendResult(stepResultValue)) {
            searchCursorStepCommandUnsupportedRef.current = false;

            const targetMatch = stepResultValue.targetMatch;
            if (!targetMatch) {
              return;
            }
            const targetIndex = matches.findIndex(
              (item) => item.start === targetMatch.start && item.end === targetMatch.end
            );
            if (targetIndex >= 0) {
              currentMatchIndexRef.current = targetIndex;
              setCurrentMatchIndex(targetIndex);
            } else {
              currentMatchIndexRef.current = 0;
              startTransition(() => {
                setMatches([targetMatch]);
                setCurrentMatchIndex(0);
              });

              setSearchSessionId(null);
              chunkCursorRef.current = null;
              cachedSearchRef.current = null;
            }
            setErrorMessage(null);
            setFeedbackMessage(navigationFeedback);
            navigateToMatch(targetMatch);
            return;
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'search_step_from_cursor_in_document')) {
            searchCursorStepCommandUnsupportedRef.current = true;
          } else {
            const readableError = error instanceof Error ? error.message : String(error);
            setErrorMessage(`${messages.searchFailed}: ${readableError}`);
            return;
          }
        }
      }

      if (keyword && matches.length > 0) {
        const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, matches.length - 1);
        const candidateIndex = boundedCurrentIndex + step;

        if (candidateIndex < 0) {
          const nextIndex = (candidateIndex + matches.length) % matches.length;
          currentMatchIndexRef.current = nextIndex;
          setCurrentMatchIndex(nextIndex);
          setFeedbackMessage(navigationFeedback);
          navigateToMatch(matches[nextIndex]);
          return;
        }

        if (candidateIndex >= matches.length && !loadMoreLockRef.current) {
          const appended = await loadMoreMatches();
          if (appended && appended.length > 0) {
            const expandedMatches = [...matches, ...appended];
            const nextIndex = candidateIndex;
            currentMatchIndexRef.current = nextIndex;
            setCurrentMatchIndex(nextIndex);
            setFeedbackMessage(navigationFeedback);
            navigateToMatch(expandedMatches[nextIndex]);
            return;
          }
        }

        const nextIndex = (candidateIndex + matches.length) % matches.length;

        currentMatchIndexRef.current = nextIndex;
        setCurrentMatchIndex(nextIndex);
        setFeedbackMessage(navigationFeedback);
        navigateToMatch(matches[nextIndex]);
        return;
      }

      const shouldReverse = step < 0;
      const searchResult = await executeFirstMatchSearch(shouldReverse);
      if (!searchResult || searchResult.matches.length === 0) {
        return;
      }

      const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, searchResult.matches.length - 1);
      const nextIndex =
        (boundedCurrentIndex + step + searchResult.matches.length) %
        searchResult.matches.length;

      currentMatchIndexRef.current = nextIndex;
      setCurrentMatchIndex(nextIndex);
      setFeedbackMessage(navigationFeedback);
      navigateToMatch(searchResult.matches[nextIndex]);

    },
    [
      activeTab,
      activeCursorPosition,
      backendResultFilterKeyword,
      caseSensitive,
      effectiveSearchKeyword,
      executeFilter,
      executeFirstMatchSearch,
      filterMatches,
      filterRulesKey,
      filterRulesPayload,
      isFilterMode,
      isSearching,
      keyword,
      loadMoreFilterMatches,
      loadMoreMatches,
      matches,
      messages.filterFailed,
      messages.nextMatch,
      messages.prevMatch,
      messages.searchFailed,
      navigateToFilterMatch,
      navigateToMatch,
      parseEscapeSequences,
      rememberSearchKeyword,
      searchMode,
      setFilterSessionId,
      setSearchSessionId,
    ]
  );

  const handleReplaceCurrent = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    rememberSearchKeyword(keyword);
    const searchResult = await executeSearch();
    if (!searchResult || searchResult.matches.length === 0) {
      setFeedbackMessage(messages.noReplaceMatches);
      return;
    }

    const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, searchResult.matches.length - 1);
    const targetMatch = searchResult.matches[boundedCurrentIndex];

    try {
      const result = await invoke<ReplaceCurrentAndSearchChunkBackendResult>('replace_current_and_search_chunk_in_document', {
        id: activeTab.id,
        keyword: effectiveSearchKeyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        replaceValue,
        parseEscapeSequences,
        targetStart: targetMatch.start,
        targetEnd: targetMatch.end,
        resultFilterKeyword: backendResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      if (!result.replaced) {
        setFeedbackMessage(messages.noReplaceMatches);
        return;
      }

      const safeLineCount = Math.max(1, result.lineCount ?? activeTab.lineCount);
      updateTab(activeTab.id, { lineCount: safeLineCount, isDirty: true });
      dispatchEditorForceRefresh(activeTab.id, safeLineCount);
      setFeedbackMessage(messages.replacedCurrent);
      setErrorMessage(null);
      rememberReplaceValue(replaceValue);

      const documentVersion = result.documentVersion ?? 0;
      const nextMatches = result.matches || [];
      const nextOffset = result.nextOffset ?? null;
      const totalMatches = result.totalMatches ?? nextMatches.length;
      const totalMatchedLines =
        result.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size;
      const preferredMatch = result.preferredMatch ?? null;
      const preferredIndex = preferredMatch
        ? nextMatches.findIndex((item) => item.start === preferredMatch.start && item.end === preferredMatch.end)
        : -1;
      const nextIndex =
        nextMatches.length === 0
          ? 0
          : preferredIndex >= 0
            ? preferredIndex
            : Math.min(boundedCurrentIndex, nextMatches.length - 1);

      startTransition(() => {
        setMatches(nextMatches);
        setCurrentMatchIndex(nextIndex);
        setTotalMatchCount(totalMatches);
        setTotalMatchedLineCount(totalMatchedLines);
      });
      currentMatchIndexRef.current = nextIndex;
      chunkCursorRef.current = nextOffset;
      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextOffset,
        sessionId: null,
      };
      setSearchSessionId(null);
      countCacheRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        totalMatches,
        matchedLines: totalMatchedLines,
      };

      if (nextMatches.length > 0) {
        navigateToMatch(nextMatches[nextIndex]);
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.replaceFailed}: ${readableError}`);
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    executeSearch,
    keyword,
    messages.noReplaceMatches,
    messages.replaceFailed,
    messages.replacedCurrent,
    navigateToMatch,
    parseEscapeSequences,
    rememberReplaceValue,
    rememberSearchKeyword,
    replaceValue,
    searchMode,
    updateTab,
  ]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    rememberSearchKeyword(keyword);
    const searchResult = await executeSearch();
    if (!searchResult || searchResult.matches.length === 0) {
      setFeedbackMessage(messages.noReplaceMatches);
      return;
    }

    try {
      const result = await invoke<ReplaceAllAndSearchChunkBackendResult>('replace_all_and_search_chunk_in_document', {
        id: activeTab.id,
        keyword: effectiveSearchKeyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        replaceValue,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      const replacedCount = result.replacedCount ?? 0;
      const safeLineCount = Math.max(1, result.lineCount ?? activeTab.lineCount);

      if (replacedCount === 0) {
        setFeedbackMessage(messages.noReplaceMatches);
        return;
      }

      updateTab(activeTab.id, { lineCount: safeLineCount, isDirty: true });
      dispatchEditorForceRefresh(activeTab.id, safeLineCount);

      setFeedbackMessage(messages.replacedAll(replacedCount));
      setErrorMessage(null);
      rememberReplaceValue(replaceValue);

      const documentVersion = result.documentVersion ?? 0;
      const nextMatches = result.matches || [];
      const nextOffset = result.nextOffset ?? null;
      const totalMatches = result.totalMatches ?? nextMatches.length;
      const totalMatchedLines =
        result.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size;
      const nextIndex = 0;

      startTransition(() => {
        setMatches(nextMatches);
        setCurrentMatchIndex(nextIndex);
        setTotalMatchCount(totalMatches);
        setTotalMatchedLineCount(totalMatchedLines);
      });
      currentMatchIndexRef.current = nextIndex;
      chunkCursorRef.current = nextOffset;
      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextOffset,
        sessionId: null,
      };
      setSearchSessionId(null);
      countCacheRef.current = {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        totalMatches,
        matchedLines: totalMatchedLines,
      };

      if (nextMatches.length > 0) {
        navigateToMatch(nextMatches[nextIndex]);
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.replaceAllFailed}: ${readableError}`);
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    executeSearch,
    keyword,
    messages.noReplaceMatches,
    messages.replaceAllFailed,
    messages.replacedAll,
    navigateToMatch,
    parseEscapeSequences,
    rememberReplaceValue,
    rememberSearchKeyword,
    replaceValue,
    searchMode,
    updateTab,
  ]);

  const handleKeywordKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isFilterMode) {
          if (!isSearching) {
            void executeFilter(true);
          }
          return;
        }

        if (event.currentTarget === searchInputRef.current) {
          setResultPanelState('open');
          rememberSearchKeyword(keyword);
          if (!isSearching) {
            void executeSearch(true);
          }
          return;
        }

        const primaryStep = reverseSearch ? -1 : 1;
        const step = event.shiftKey ? -primaryStep : primaryStep;
        void navigateByStep(step);
      }
    },
    [executeFilter, executeSearch, isFilterMode, isSearching, keyword, navigateByStep, rememberSearchKeyword, reverseSearch]
  );

  const handleSelectMatch = useCallback(
    (targetIndex: number) => {
      if (isFilterMode) {
        if (targetIndex < 0 || targetIndex >= filterMatches.length) {
          return;
        }

        setCurrentFilterMatchIndex(targetIndex);
        setFeedbackMessage(null);
        navigateToFilterMatch(filterMatches[targetIndex]);
        return;
      }

      if (targetIndex < 0 || targetIndex >= matches.length) {
        return;
      }

      setCurrentMatchIndex(targetIndex);
      setFeedbackMessage(null);
      navigateToMatch(matches[targetIndex]);
    },
    [filterMatches, isFilterMode, matches, navigateToFilterMatch, navigateToMatch]
  );

  const updateFilterRule = useCallback((id: string, updater: (rule: FilterRule) => FilterRule) => {
    setFilterRules((previousRules) =>
      previousRules.map((rule) => {
        if (rule.id !== id) {
          return rule;
        }

        return updater(rule);
      })
    );
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const addFilterRule = useCallback(() => {
    setFilterRules((previousRules) => [...previousRules, createDefaultFilterRule(previousRules.length)]);
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, []);

  const clearFilterRules = useCallback(() => {
    setFilterRules([createDefaultFilterRule(0)]);
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const removeFilterRule = useCallback((id: string) => {
    setFilterRules((previousRules) => {
      const nextRules = previousRules.filter((rule) => rule.id !== id);
      if (nextRules.length > 0) {
        return nextRules;
      }

      return [createDefaultFilterRule(0)];
    });
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const moveFilterRule = useCallback((id: string, direction: -1 | 1) => {
    setFilterRules((previousRules) => {
      const index = previousRules.findIndex((rule) => rule.id === id);
      if (index < 0) {
        return previousRules;
      }

      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= previousRules.length) {
        return previousRules;
      }

      const nextRules = [...previousRules];
      const [movedRule] = nextRules.splice(index, 1);
      nextRules.splice(targetIndex, 0, movedRule);
      return nextRules;
    });
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const onFilterRuleDragStart = useCallback((event: ReactDragEvent<HTMLElement>, ruleId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ruleId);
    setFilterRuleDragState({
      draggingRuleId: ruleId,
      overRuleId: null,
    });
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, []);

  const onFilterRuleDragOver = useCallback((event: ReactDragEvent<HTMLElement>, ruleId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    setFilterRuleDragState((previous) => {
      if (!previous || previous.overRuleId === ruleId) {
        return previous;
      }

      return {
        ...previous,
        overRuleId: ruleId,
      };
    });
  }, []);

  const onFilterRuleDrop = useCallback((event: ReactDragEvent<HTMLElement>, targetRuleId: string) => {
    event.preventDefault();

    setFilterRules((previousRules) => {
      const fallbackSourceId = event.dataTransfer.getData('text/plain');
      const sourceRuleId = filterRuleDragState?.draggingRuleId || fallbackSourceId;
      if (!sourceRuleId) {
        return previousRules;
      }

      const reordered = reorderFilterRules(previousRules, sourceRuleId, targetRuleId);
      return reordered;
    });

    setFilterRuleDragState(null);
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [filterRuleDragState?.draggingRuleId, resetFilterState]);

  const onFilterRuleDragEnd = useCallback(() => {
    setFilterRuleDragState(null);
  }, []);

  const persistFilterRuleGroups = useCallback(
    async (groups: FilterRuleGroupPayload[]) => {
      const normalized = normalizeFilterRuleGroups(groups);
      await invoke('save_filter_rule_groups_config', {
        groups: normalized,
      });
      setFilterRuleGroups(normalized);
      return normalized;
    },
    []
  );

  const handleSaveFilterRuleGroup = useCallback(async () => {
    const trimmedName = filterGroupNameInput.trim();
    if (!trimmedName) {
      setErrorMessage(messages.filterGroupNameRequired);
      return;
    }

    if (filterRulesPayload.length === 0) {
      setErrorMessage(messages.filterGroupRuleRequired);
      return;
    }

    const nextGroups = [...normalizedFilterRuleGroups];
    const groupIndex = nextGroups.findIndex((group) => group.name === trimmedName);
    const nextGroup: FilterRuleGroupPayload = {
      name: trimmedName,
      rules: filterRulesPayload,
    };

    if (groupIndex >= 0) {
      nextGroups[groupIndex] = nextGroup;
    } else {
      nextGroups.push(nextGroup);
    }

    try {
      const savedGroups = await persistFilterRuleGroups(nextGroups);
      setSelectedFilterGroupName(trimmedName);
      setFilterGroupNameInput(trimmedName);
      setFeedbackMessage(messages.filterGroupSaved(trimmedName));
      setErrorMessage(null);

      if (!savedGroups.some((group) => group.name === trimmedName)) {
        setSelectedFilterGroupName('');
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupSaveFailed}: ${readableError}`);
    }
  }, [
    filterGroupNameInput,
    filterRulesPayload,
    messages,
    normalizedFilterRuleGroups,
    persistFilterRuleGroups,
  ]);

  const handleLoadFilterRuleGroup = useCallback(() => {
    if (!selectedFilterGroupName) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    const group = normalizedFilterRuleGroups.find((item) => item.name === selectedFilterGroupName);
    if (!group) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    setFilterRules(buildFilterRulesFromPayload(group.rules));
    setFilterGroupNameInput(group.name);
    setFeedbackMessage(messages.filterGroupLoaded(group.name));
    setErrorMessage(null);
    resetFilterState();
  }, [messages, normalizedFilterRuleGroups, resetFilterState, selectedFilterGroupName]);

  const handleDeleteFilterRuleGroup = useCallback(async () => {
    if (!selectedFilterGroupName) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    const nextGroups = normalizedFilterRuleGroups.filter((group) => group.name !== selectedFilterGroupName);

    try {
      await persistFilterRuleGroups(nextGroups);
      setFeedbackMessage(messages.filterGroupDeleted(selectedFilterGroupName));
      setErrorMessage(null);
      setSelectedFilterGroupName('');
      if (filterGroupNameInput.trim() === selectedFilterGroupName) {
        setFilterGroupNameInput('');
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupSaveFailed}: ${readableError}`);
    }
  }, [
    filterGroupNameInput,
    messages,
    normalizedFilterRuleGroups,
    persistFilterRuleGroups,
    selectedFilterGroupName,
  ]);

  const handleImportFilterRuleGroups = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      const importedGroups = await invoke<FilterRuleGroupPayload[]>('import_filter_rule_groups', {
        path: selected,
      });
      const importedNormalized = normalizeFilterRuleGroups(importedGroups || []);
      if (importedNormalized.length === 0) {
        setErrorMessage(messages.filterGroupImportFailed);
        return;
      }

      const merged = [...normalizedFilterRuleGroups];
      importedNormalized.forEach((importedGroup) => {
        const existingIndex = merged.findIndex((group) => group.name === importedGroup.name);
        if (existingIndex >= 0) {
          merged[existingIndex] = importedGroup;
        } else {
          merged.push(importedGroup);
        }
      });

      await persistFilterRuleGroups(merged);
      setFeedbackMessage(messages.filterGroupsImported(importedNormalized.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupImportFailed}: ${readableError}`);
    }
  }, [messages, normalizedFilterRuleGroups, persistFilterRuleGroups]);

  const handleExportFilterRuleGroups = useCallback(async () => {
    if (normalizedFilterRuleGroups.length === 0) {
      setErrorMessage(messages.filterGroupsExportEmpty);
      return;
    }

    try {
      const selected = await save({
        defaultPath: 'rutar-filter-rule-groups.json',
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      await invoke('export_filter_rule_groups', {
        path: selected,
        groups: normalizedFilterRuleGroups,
      });

      setFeedbackMessage(messages.filterGroupsExported(normalizedFilterRuleGroups.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupExportFailed}: ${readableError}`);
    }
  }, [messages, normalizedFilterRuleGroups]);

  useEffect(() => {
    const handleSearchOpen = (event: Event) => {
      if (!activeTab) {
        return;
      }

      const customEvent = event as CustomEvent<SearchOpenEventDetail>;
      const openMode = customEvent.detail?.mode;
      const nextMode: PanelMode = openMode === 'replace' ? 'replace' : openMode === 'filter' ? 'filter' : 'find';

      setIsOpen(true);
      setPanelMode(nextMode);
      setResultPanelState('closed');
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      setErrorMessage(null);
      setFeedbackMessage(null);
      focusSearchInput();
    };

    window.addEventListener('rutar:search-open', handleSearchOpen as EventListener);
    return () => {
      window.removeEventListener('rutar:search-open', handleSearchOpen as EventListener);
    };
  }, [activeTab, focusSearchInput]);

  useEffect(() => {
    const restoreRunVersion = sessionRestoreRunVersionRef.current + 1;
    sessionRestoreRunVersionRef.current = restoreRunVersion;

    if (!activeTab) {
      setIsOpen(false);
      setPanelMode('find');
      setResultPanelState('closed');
      setResultPanelHeight(RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(SEARCH_SIDEBAR_DEFAULT_WIDTH);
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
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      resetSearchState();
      resetFilterState();
      cachedSearchRef.current = null;
      cachedFilterRef.current = null;
      countCacheRef.current = null;
      filterCountCacheRef.current = null;
      setErrorMessage(null);
      setFeedbackMessage(null);
      previousActiveTabIdRef.current = null;
      return;
    }

    const nextSnapshot = tabSearchPanelStateRef.current[activeTab.id];
    if (nextSnapshot) {
      setIsOpen(nextSnapshot.isOpen);
      setPanelMode(nextSnapshot.panelMode);
      setResultPanelState(nextSnapshot.resultPanelState);
      setResultPanelHeight(nextSnapshot.resultPanelHeight ?? RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(nextSnapshot.searchSidebarWidth ?? SEARCH_SIDEBAR_DEFAULT_WIDTH);
      setKeyword(nextSnapshot.keyword);
      setReplaceValue(nextSnapshot.replaceValue);
      setSearchMode(nextSnapshot.searchMode);
      setCaseSensitive(nextSnapshot.caseSensitive);
      setParseEscapeSequences(nextSnapshot.parseEscapeSequences ?? false);
      setReverseSearch(nextSnapshot.reverseSearch);
      setResultFilterKeyword(nextSnapshot.resultFilterKeyword);
      setAppliedResultFilterKeyword(nextSnapshot.appliedResultFilterKeyword);

      const restoredMatches = nextSnapshot.matches || [];
      const restoredFilterMatches = nextSnapshot.filterMatches || [];

      setMatches(restoredMatches);
      setFilterMatches(restoredFilterMatches);
      setCurrentMatchIndex(() => {
        if (restoredMatches.length === 0) {
          return 0;
        }

        return Math.min(nextSnapshot.currentMatchIndex, restoredMatches.length - 1);
      });
      setCurrentFilterMatchIndex(() => {
        if (restoredFilterMatches.length === 0) {
          return 0;
        }

        return Math.min(nextSnapshot.currentFilterMatchIndex, restoredFilterMatches.length - 1);
      });

      setTotalMatchCount(nextSnapshot.totalMatchCount);
      setTotalMatchedLineCount(nextSnapshot.totalMatchedLineCount);
      setTotalFilterMatchedLineCount(nextSnapshot.totalFilterMatchedLineCount);

      setSearchSessionId(nextSnapshot.searchSessionId ?? null);
      setFilterSessionId(nextSnapshot.filterSessionId ?? null);
      chunkCursorRef.current = nextSnapshot.searchNextOffset;
      filterLineCursorRef.current = nextSnapshot.filterNextLine;

      const restoredNormalizedResultFilterKeyword = nextSnapshot.appliedResultFilterKeyword.trim().toLowerCase();
      const restoredResultFilterKeyword = restoredNormalizedResultFilterKeyword.length
        ? nextSnapshot.caseSensitive
          ? nextSnapshot.appliedResultFilterKeyword.trim()
          : restoredNormalizedResultFilterKeyword
        : '';

      if (nextSnapshot.searchDocumentVersion !== null && nextSnapshot.keyword) {
        const snapshotParseEscapeSequences = nextSnapshot.parseEscapeSequences ?? false;
        const snapshotEffectiveKeyword = resolveSearchKeyword(
          nextSnapshot.keyword,
          snapshotParseEscapeSequences
        );
        cachedSearchRef.current = {
          tabId: activeTab.id,
          keyword: snapshotEffectiveKeyword,
          searchMode: nextSnapshot.searchMode,
          caseSensitive: nextSnapshot.caseSensitive,
          parseEscapeSequences: snapshotParseEscapeSequences,
          resultFilterKeyword: restoredResultFilterKeyword,
          documentVersion: nextSnapshot.searchDocumentVersion,
          matches: restoredMatches,
          nextOffset: nextSnapshot.searchNextOffset,
          sessionId: nextSnapshot.searchSessionId ?? null,
        };

        if (nextSnapshot.totalMatchCount !== null && nextSnapshot.totalMatchedLineCount !== null) {
          countCacheRef.current = {
            tabId: activeTab.id,
            keyword: snapshotEffectiveKeyword,
            searchMode: nextSnapshot.searchMode,
            caseSensitive: nextSnapshot.caseSensitive,
            parseEscapeSequences: snapshotParseEscapeSequences,
            resultFilterKeyword: restoredResultFilterKeyword,
            documentVersion: nextSnapshot.searchDocumentVersion,
            totalMatches: nextSnapshot.totalMatchCount,
            matchedLines: nextSnapshot.totalMatchedLineCount,
          };
        } else {
          countCacheRef.current = null;
        }
      } else {
        setSearchSessionId(null);
        cachedSearchRef.current = null;
        countCacheRef.current = null;
      }

      if (nextSnapshot.filterDocumentVersion !== null && nextSnapshot.filterRulesKey) {
        cachedFilterRef.current = {
          tabId: activeTab.id,
          rulesKey: nextSnapshot.filterRulesKey,
          resultFilterKeyword: restoredResultFilterKeyword,
          documentVersion: nextSnapshot.filterDocumentVersion,
          matches: restoredFilterMatches,
          nextLine: nextSnapshot.filterNextLine,
          sessionId: nextSnapshot.filterSessionId ?? null,
        };

        if (nextSnapshot.totalFilterMatchedLineCount !== null) {
          filterCountCacheRef.current = {
            tabId: activeTab.id,
            rulesKey: nextSnapshot.filterRulesKey,
            resultFilterKeyword: restoredResultFilterKeyword,
            documentVersion: nextSnapshot.filterDocumentVersion,
            matchedLines: nextSnapshot.totalFilterMatchedLineCount,
          };
        } else {
          filterCountCacheRef.current = null;
        }
      } else {
        setFilterSessionId(null);
        cachedFilterRef.current = null;
        filterCountCacheRef.current = null;
      }

      if (
        nextSnapshot.searchDocumentVersion !== null &&
        nextSnapshot.keyword &&
        !searchSessionRestoreCommandUnsupportedRef.current
      ) {
        const snapshotKeyword = nextSnapshot.keyword;
        const snapshotParseEscapeSequences = nextSnapshot.parseEscapeSequences ?? false;
        const snapshotEffectiveKeyword = resolveSearchKeyword(
          snapshotKeyword,
          snapshotParseEscapeSequences
        );
        const snapshotSearchMode = nextSnapshot.searchMode;
        const snapshotCaseSensitive = nextSnapshot.caseSensitive;
        const snapshotDocumentVersion = nextSnapshot.searchDocumentVersion;
        const snapshotNextOffset = nextSnapshot.searchNextOffset;

        void invoke<unknown>('search_session_restore_in_document', {
          id: activeTab.id,
          keyword: snapshotEffectiveKeyword,
          mode: getSearchModeValue(snapshotSearchMode),
          caseSensitive: snapshotCaseSensitive,
          resultFilterKeyword: restoredResultFilterKeyword,
          resultFilterCaseSensitive: snapshotCaseSensitive,
          expectedDocumentVersion: snapshotDocumentVersion,
          nextOffset: snapshotNextOffset,
        })
          .then((restoreResultValue) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (!isSearchSessionRestoreBackendResult(restoreResultValue)) {
              return;
            }

            searchSessionRestoreCommandUnsupportedRef.current = false;
            setSearchSessionId(restoreResultValue.sessionId ?? null);
            chunkCursorRef.current = restoreResultValue.nextOffset ?? null;

            setTotalMatchCount(restoreResultValue.totalMatches ?? 0);
            setTotalMatchedLineCount(restoreResultValue.totalMatchedLines ?? 0);
            countCacheRef.current = {
              tabId: activeTab.id,
              keyword: snapshotEffectiveKeyword,
              searchMode: snapshotSearchMode,
              caseSensitive: snapshotCaseSensitive,
              parseEscapeSequences: snapshotParseEscapeSequences,
              resultFilterKeyword: restoredResultFilterKeyword,
              documentVersion: restoreResultValue.documentVersion ?? snapshotDocumentVersion,
              totalMatches: restoreResultValue.totalMatches ?? 0,
              matchedLines: restoreResultValue.totalMatchedLines ?? 0,
            };

            if (cachedSearchRef.current?.tabId === activeTab.id) {
              cachedSearchRef.current = {
                ...cachedSearchRef.current,
                sessionId: restoreResultValue.sessionId ?? null,
                nextOffset: restoreResultValue.nextOffset ?? null,
                documentVersion: restoreResultValue.documentVersion ?? snapshotDocumentVersion,
              };
            }
          })
          .catch((error) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (isMissingInvokeCommandError(error, 'search_session_restore_in_document')) {
              searchSessionRestoreCommandUnsupportedRef.current = true;
              return;
            }

            console.warn('Failed to restore search session:', error);
          });
      }

      if (
        nextSnapshot.filterDocumentVersion !== null &&
        nextSnapshot.filterRulesKey === filterRulesKey &&
        !filterSessionRestoreCommandUnsupportedRef.current
      ) {
        const snapshotCaseSensitive = nextSnapshot.caseSensitive;
        const snapshotFilterDocumentVersion = nextSnapshot.filterDocumentVersion;
        const snapshotFilterNextLine = nextSnapshot.filterNextLine;

        void invoke<unknown>('filter_session_restore_in_document', {
          id: activeTab.id,
          rules: filterRulesPayload,
          resultFilterKeyword: restoredResultFilterKeyword,
          resultFilterCaseSensitive: snapshotCaseSensitive,
          expectedDocumentVersion: snapshotFilterDocumentVersion,
          nextLine: snapshotFilterNextLine,
        })
          .then((restoreResultValue) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (!isFilterSessionRestoreBackendResult(restoreResultValue)) {
              return;
            }

            filterSessionRestoreCommandUnsupportedRef.current = false;
            setFilterSessionId(restoreResultValue.sessionId ?? null);
            filterLineCursorRef.current = restoreResultValue.nextLine ?? null;
            setTotalFilterMatchedLineCount(restoreResultValue.totalMatchedLines ?? 0);

            filterCountCacheRef.current = {
              tabId: activeTab.id,
              rulesKey: filterRulesKey,
              resultFilterKeyword: restoredResultFilterKeyword,
              documentVersion: restoreResultValue.documentVersion ?? snapshotFilterDocumentVersion,
              matchedLines: restoreResultValue.totalMatchedLines ?? 0,
            };

            if (cachedFilterRef.current?.tabId === activeTab.id) {
              cachedFilterRef.current = {
                ...cachedFilterRef.current,
                rulesKey: filterRulesKey,
                sessionId: restoreResultValue.sessionId ?? null,
                nextLine: restoreResultValue.nextLine ?? null,
                documentVersion: restoreResultValue.documentVersion ?? snapshotFilterDocumentVersion,
              };
            }
          })
          .catch((error) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (isMissingInvokeCommandError(error, 'filter_session_restore_in_document')) {
              filterSessionRestoreCommandUnsupportedRef.current = true;
              return;
            }

            console.warn('Failed to restore filter session:', error);
          });
      }
    } else {
      setIsOpen(false);
      setPanelMode('find');
      setResultPanelState('closed');
      setResultPanelHeight(RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(SEARCH_SIDEBAR_DEFAULT_WIDTH);
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

    setIsResultFilterSearching(false);
    stopResultFilterSearchRef.current = true;
    setErrorMessage(null);
    setFeedbackMessage(null);
    previousActiveTabIdRef.current = activeTab.id;
  }, [activeTab?.id, resetFilterState, resetSearchState, setFilterSessionId, setSearchSessionId]);

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

  useEffect(() => {
    if (previousIsOpenRef.current && !isOpen) {
      const targetTabId = activeTabId ?? previousActiveTabIdRef.current;
      if (targetTabId) {
        dispatchSearchClose(targetTabId);
      }
    }

    previousIsOpenRef.current = isOpen;
  }, [activeTabId, isOpen]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setIsSearchUiFocused(false);
    setIsSearchUiPointerActive(false);
    setIsSearchUiPinnedActive(false);
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadFilterRuleGroups = async () => {
      try {
        const groups = await invoke<FilterRuleGroupPayload[]>('load_filter_rule_groups_config');
        if (cancelled) {
          return;
        }

        const normalized = normalizeFilterRuleGroups(groups || []);
        setFilterRuleGroups(normalized);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const readableError = error instanceof Error ? error.message : String(error);
        setErrorMessage(`${messages.filterGroupLoadFailed}: ${readableError}`);
      }
    };

    void loadFilterRuleGroups();

    return () => {
      cancelled = true;
    };
  }, [messages.filterGroupLoadFailed]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    focusSearchInput();
  }, [focusSearchInput, isOpen]);

  const updateSearchSidebarTopOffset = useCallback(() => {
    const reservedTopHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="titlebar"], [data-layout-region="toolbar"]'))
    );
    const nextOffset = `${reservedTopHeight}px`;

    setSearchSidebarTopOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, []);

  const updateSearchSidebarBottomOffset = useCallback(() => {
    const reservedBottomHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="statusbar"]'))
    );

    let nextOffsetValue = reservedBottomHeight;

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const resultPanelOffset = Math.max(0, Math.ceil(window.innerHeight - rect.top));
        nextOffsetValue = Math.max(nextOffsetValue, resultPanelOffset);
      }
    }

    const nextOffset = `${nextOffsetValue}px`;
    setSearchSidebarBottomOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, [isOpen, resultPanelState]);

  useEffect(() => {
    updateSearchSidebarTopOffset();
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    updateSearchSidebarBottomOffset();
  }, [updateSearchSidebarBottomOffset]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSearchSidebarTopOffset);

      return () => {
        window.removeEventListener('resize', updateSearchSidebarTopOffset);
      };
    }

    const titleAndToolbarElements = document.querySelectorAll<HTMLElement>(
      '[data-layout-region="titlebar"], [data-layout-region="toolbar"]'
    );
    const observer = new ResizeObserver(() => {
      updateSearchSidebarTopOffset();
    });

    titleAndToolbarElements.forEach((element) => {
      observer.observe(element);
    });

    window.addEventListener('resize', updateSearchSidebarTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarTopOffset);
    };
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSearchSidebarBottomOffset);

      return () => {
        window.removeEventListener('resize', updateSearchSidebarBottomOffset);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSearchSidebarBottomOffset();
    });

    const statusBarElement = document.querySelector<HTMLElement>('[data-layout-region="statusbar"]');
    if (statusBarElement) {
      observer.observe(statusBarElement);
    }

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        observer.observe(targetElement);
      }
    }

    window.addEventListener('resize', updateSearchSidebarBottomOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarBottomOffset);
    };
  }, [isOpen, resultPanelState, updateSearchSidebarBottomOffset]);

  useEffect(() => {
    return () => {
      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resultPanelState !== 'open') {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayload.length === 0 || filterMatches.length === 0 || !hasMoreFilterMatches || isSearching) {
        return;
      }
    } else if (!keyword || matches.length === 0 || !hasMoreMatches || isSearching) {
      return;
    }

    let cancelled = false;

    const fillVisibleResultViewport = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (
          cancelled ||
          isSearching ||
          loadMoreLockRef.current ||
          (isFilterMode ? !hasMoreFilterMatches : !hasMoreMatches)
        ) {
          return;
        }

        const container = resultListRef.current;
        if (!container) {
          return;
        }

        if (container.scrollHeight > container.clientHeight + 1) {
          return;
        }

        const appended = isFilterMode ? await loadMoreFilterMatches() : await loadMoreMatches();
        if (!appended || appended.length === 0) {
          return;
        }
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      void fillVisibleResultViewport();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    filterMatches.length,
    filterRulesPayload.length,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isSearching,
    keyword,
    loadMoreFilterMatches,
    loadMoreMatches,
    matches.length,
    resultPanelState,
  ]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const handleFindNextShortcuts = (event: KeyboardEvent) => {
      const key = event.key;
      if (key !== 'F3') {
        return;
      }

      event.preventDefault();

      if (!keyword && !isFilterMode) {
        if (!isOpen) {
          setIsOpen(true);
          focusSearchInput();
        }
        return;
      }

      const primaryStep = isFilterMode ? 1 : reverseSearch ? -1 : 1;
      const step = event.shiftKey ? -primaryStep : primaryStep;
      void navigateByStep(step);
    };

    window.addEventListener('keydown', handleFindNextShortcuts);
    return () => {
      window.removeEventListener('keydown', handleFindNextShortcuts);
    };
  }, [activeTab, focusSearchInput, isFilterMode, isOpen, keyword, navigateByStep, reverseSearch]);

  const handleApplyResultFilter = useCallback(async () => {
    cancelPendingBatchLoad();
    const nextKeyword = resultFilterKeyword.trim();
    const nextResultFilterKeyword = nextKeyword
      ? caseSensitive
        ? nextKeyword
        : nextKeyword.toLowerCase()
      : '';

    if (nextKeyword.length === 0) {
      requestStopResultFilterSearch();
      setAppliedResultFilterKeyword('');
      void executeSearch(true, true, '');
      if (isFilterMode) {
        void executeFilter(true, true, '');
      }
      setIsResultFilterSearching(false);
      return;
    }

    if (isResultFilterSearching) {
      return;
    }

    if (
      nextKeyword === appliedResultFilterKeyword.trim() &&
      true
    ) {
      return;
    }

    stopResultFilterSearchRef.current = false;
    setIsResultFilterSearching(true);
    setAppliedResultFilterKeyword('');

    try {
      if (isFilterMode) {
        await executeFilter(true, true, nextResultFilterKeyword);
      } else if (keyword) {
        await executeSearch(true, true, nextResultFilterKeyword);
      }

      if (!stopResultFilterSearchRef.current) {
        setAppliedResultFilterKeyword(nextKeyword);
      }
    } finally {
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = false;
    }
  }, [
    appliedResultFilterKeyword,
    cancelPendingBatchLoad,
    caseSensitive,
    executeFilter,
    executeSearch,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
  ]);

  const hasAppliedResultFilterKeyword = resultFilterKeyword.trim().length > 0;

  const scrollResultItemIntoView = useCallback((itemIndex: number) => {
    const container = resultListRef.current;
    if (!container || itemIndex < 0) {
      return;
    }

    const itemElements = container.querySelectorAll<HTMLButtonElement>('button[data-result-item="true"]');
    const targetElement = itemElements.item(itemIndex);
    if (!targetElement) {
      return;
    }

    const targetTop = targetElement.offsetTop;
    const targetBottom = targetTop + targetElement.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const verticalPadding = Math.max(8, Math.floor(container.clientHeight * 0.2));

    if (targetTop < viewTop) {
      container.scrollTop = Math.max(0, targetTop - verticalPadding);
      return;
    }

    if (targetBottom > viewBottom) {
      container.scrollTop = Math.max(0, targetTop - verticalPadding);
    }
  }, []);

  const navigateResultFilterByStep = useCallback(
    async (step: number) => {
      if (!activeTab || isSearching || isResultFilterSearching) {
        return;
      }

      const keywordForJump = resultFilterKeyword.trim();
      if (!keywordForJump) {
        return;
      }

      const normalizedStep = step < 0 ? -1 : 1;
      const direction = normalizedStep > 0 ? 'next' : 'prev';
      const effectiveResultFilterKeyword = caseSensitive
        ? keywordForJump
        : keywordForJump.toLowerCase();
      const runVersion = resultFilterStepRunVersionRef.current + 1;
      resultFilterStepRunVersionRef.current = runVersion;
      loadMoreLockRef.current = true;
      setIsSearching(true);
      setResultFilterStepLoadingDirection(direction);

      try {
        if (isFilterMode) {
          const currentFilterMatch =
            currentFilterMatchIndexRef.current >= 0 &&
            currentFilterMatchIndexRef.current < filterMatches.length
              ? filterMatches[currentFilterMatchIndexRef.current]
              : null;

          const stepResult = await invoke<FilterResultFilterStepBackendResult>(
            'step_result_filter_search_in_filter_document',
            {
              id: activeTab.id,
              rules: filterRulesPayload,
              resultFilterKeyword: keywordForJump,
              resultFilterCaseSensitive: caseSensitive,
              currentLine: currentFilterMatch?.line ?? null,
              currentColumn: currentFilterMatch?.column ?? null,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            }
          );
          if (runVersion !== resultFilterStepRunVersionRef.current) {
            return;
          }

          const targetMatch = stepResult.targetMatch;
          if (!targetMatch) {
            return;
          }
          const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
          setTotalFilterMatchedLineCount(totalMatchedLines);
          const stepBatchMatches =
            Array.isArray(stepResult.batchMatches) && stepResult.batchMatches.length > 0
              ? stepResult.batchMatches
              : null;

          const nextMatches = stepBatchMatches ?? filterMatches;
          const targetIndex = stepBatchMatches
            ? Math.min(
                Math.max(0, stepResult.targetIndexInBatch ?? 0),
                Math.max(0, nextMatches.length - 1)
              )
            : nextMatches.findIndex(
                (item) =>
                  item.line === targetMatch.line &&
                  item.column === targetMatch.column &&
                  item.ruleIndex === targetMatch.ruleIndex
              );

          if (targetIndex >= 0 && targetIndex < nextMatches.length) {
            const documentVersion = stepResult.documentVersion ?? 0;
            filterLineCursorRef.current = stepResult.nextLine ?? null;
            setFilterSessionId(null);
            cachedFilterRef.current = {
              tabId: activeTab.id,
              rulesKey: filterRulesKey,
              resultFilterKeyword: effectiveResultFilterKeyword,
              documentVersion,
              matches: nextMatches,
              nextLine: filterLineCursorRef.current,
              sessionId: null,
            };
            filterCountCacheRef.current = {
              tabId: activeTab.id,
              rulesKey: filterRulesKey,
              resultFilterKeyword: effectiveResultFilterKeyword,
              documentVersion,
              matchedLines: totalMatchedLines,
            };

            startTransition(() => {
              setFilterMatches(nextMatches);
            });
            currentFilterMatchIndexRef.current = targetIndex;
            setCurrentFilterMatchIndex(targetIndex);
            setErrorMessage(null);
            setFeedbackMessage(null);
            window.requestAnimationFrame(() => {
              scrollResultItemIntoView(targetIndex);
            });
            return;
          }

          setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
          return;
        }

        if (!keyword) {
          return;
        }

        const currentSearchMatch =
          currentMatchIndexRef.current >= 0 && currentMatchIndexRef.current < matches.length
            ? matches[currentMatchIndexRef.current]
            : null;

        const stepResult = await invoke<SearchResultFilterStepBackendResult>(
          'step_result_filter_search_in_document',
          {
            id: activeTab.id,
            keyword: effectiveSearchKeyword,
            mode: getSearchModeValue(searchMode),
            caseSensitive,
            resultFilterKeyword: keywordForJump,
            resultFilterCaseSensitive: caseSensitive,
            currentStart: currentSearchMatch?.start ?? null,
            currentEnd: currentSearchMatch?.end ?? null,
            step: normalizedStep,
            maxResults: SEARCH_CHUNK_SIZE,
          }
        );
        if (runVersion !== resultFilterStepRunVersionRef.current) {
          return;
        }

        const targetMatch = stepResult.targetMatch;
        if (!targetMatch) {
          return;
        }
        const totalMatches = stepResult.totalMatches ?? 0;
        const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
        setTotalMatchCount(totalMatches);
        setTotalMatchedLineCount(totalMatchedLines);
        const stepBatchMatches =
          Array.isArray(stepResult.batchMatches) && stepResult.batchMatches.length > 0
            ? stepResult.batchMatches
            : null;

        const nextMatches = stepBatchMatches ?? matches;
        const targetIndex = stepBatchMatches
          ? Math.min(
              Math.max(0, stepResult.targetIndexInBatch ?? 0),
              Math.max(0, nextMatches.length - 1)
            )
          : nextMatches.findIndex(
              (item) => item.start === targetMatch.start && item.end === targetMatch.end
            );

        if (targetIndex >= 0 && targetIndex < nextMatches.length) {
          const documentVersion = stepResult.documentVersion ?? 0;
          chunkCursorRef.current = stepResult.nextOffset ?? null;
          setSearchSessionId(null);
          cachedSearchRef.current = {
            tabId: activeTab.id,
            keyword: effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            parseEscapeSequences,
            resultFilterKeyword: effectiveResultFilterKeyword,
            documentVersion,
            matches: nextMatches,
            nextOffset: chunkCursorRef.current,
            sessionId: null,
          };
          countCacheRef.current = {
            tabId: activeTab.id,
            keyword: effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            parseEscapeSequences,
            resultFilterKeyword: effectiveResultFilterKeyword,
            documentVersion,
            totalMatches,
            matchedLines: totalMatchedLines,
          };

          startTransition(() => {
            setMatches(nextMatches);
          });
          currentMatchIndexRef.current = targetIndex;
          setCurrentMatchIndex(targetIndex);
          setErrorMessage(null);
          setFeedbackMessage(null);
          window.requestAnimationFrame(() => {
            scrollResultItemIntoView(targetIndex);
          });
          return;
        }

        setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
      } catch (error) {
        if (runVersion !== resultFilterStepRunVersionRef.current) {
          return;
        }
        const readableError = error instanceof Error ? error.message : String(error);
        setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      } finally {
        if (runVersion === resultFilterStepRunVersionRef.current) {
          loadMoreLockRef.current = false;
          setIsSearching(false);
          setResultFilterStepLoadingDirection(null);
        }
      }
    },
    [
      activeTab,
      caseSensitive,
      filterMatches,
      filterRulesKey,
      filterRulesPayload,
      effectiveSearchKeyword,
      isFilterMode,
      isResultFilterSearching,
      isSearching,
      keyword,
      matches,
      messages.searchFailed,
      messages.resultFilterStepNoMatch,
      parseEscapeSequences,
      resultFilterKeyword,
      scrollResultItemIntoView,
      setFilterSessionId,
      setSearchSessionId,
      searchMode,
    ]
  );

  useEffect(() => {
    if (resultPanelState === 'closed') {
      cancelPendingBatchLoad();
    }
  }, [cancelPendingBatchLoad, resultPanelState]);

  useEffect(() => {
    return () => {
      const teardown = () => {
        resizeDragStateRef.current = null;
        document.body.style.userSelect = '';
      };

      teardown();
    };
  }, []);

  const handleResultPanelResizeMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    resizeDragStateRef.current = {
      startY: event.clientY,
      startHeight: resultPanelHeight,
    };

    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dragState = resizeDragStateRef.current;
      if (!dragState) {
        return;
      }

      const delta = dragState.startY - moveEvent.clientY;
      const nextHeight = Math.max(
        RESULT_PANEL_MIN_HEIGHT,
        Math.min(RESULT_PANEL_MAX_HEIGHT, dragState.startHeight + delta)
      );
      setResultPanelHeight(nextHeight);
    };

    const onMouseUp = () => {
      resizeDragStateRef.current = null;
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [resultPanelHeight]);

  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalFilterMatchedLineCount = totalFilterMatchedLineCount;
  const displayTotalMatchCountText = getDisplayCountText(displayTotalMatchCount, messages.counting);
  const displayTotalMatchedLineCountText = getDisplayCountText(displayTotalMatchedLineCount, messages.counting);
  const displayTotalFilterMatchedLineCountText = getDisplayCountText(
    displayTotalFilterMatchedLineCount,
    messages.counting
  );

  const plainTextResultEntries = useMemo(
    () => getPlainTextResultEntries({
      filterRulesPayloadLength: filterRulesPayload.length,
      isFilterMode,
      keyword,
      visibleFilterMatches,
      visibleMatches,
    }),
    [filterRulesPayload.length, isFilterMode, keyword, visibleFilterMatches, visibleMatches]
  );

  const copyPlainTextResults = useCallback(async () => {
    if (plainTextResultEntries.length === 0) {
      setFeedbackMessage(messages.copyResultsEmpty);
      setErrorMessage(null);
      return;
    }

    try {
      await writePlainTextToClipboard(plainTextResultEntries.join('\n'));
      setFeedbackMessage(messages.copyResultsSuccess(plainTextResultEntries.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`${messages.copyResultsFailed}: ${readableError}`);
    }
  }, [messages, plainTextResultEntries]);

  const handleClearResultFilter = useCallback(() => {
    setResultFilterKeyword('');
    setAppliedResultFilterKeyword('');
  }, []);

  const handleResultFilterPrev = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'prev') {
      cancelPendingBatchLoad();
      return;
    }

    void navigateResultFilterByStep(-1);
  }, [cancelPendingBatchLoad, navigateResultFilterByStep, resultFilterStepLoadingDirection]);

  const handleResultFilterNext = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'next') {
      cancelPendingBatchLoad();
      return;
    }

    void navigateResultFilterByStep(1);
  }, [cancelPendingBatchLoad, navigateResultFilterByStep, resultFilterStepLoadingDirection]);

  const handleResultFilterAction = useCallback(() => {
    if (isResultFilterSearching) {
      requestStopResultFilterSearch();
      return;
    }

    void handleApplyResultFilter();
  }, [handleApplyResultFilter, isResultFilterSearching, requestStopResultFilterSearch]);

  const handleRefreshResults = useCallback(() => {
    cancelPendingBatchLoad();
    if (isFilterMode) {
      void executeFilter(true);
      return;
    }

    void executeSearch(true);
  }, [cancelPendingBatchLoad, executeFilter, executeSearch, isFilterMode]);

  const handleCloseResultPanel = useCallback(() => {
    cancelPendingBatchLoad();
    setResultPanelState('closed');
  }, [cancelPendingBatchLoad]);

  const handleReopenResultPanel = useCallback(() => {
    setResultPanelState('open');

    if (!isSearching) {
      if (isFilterMode) {
        if (filterRulesPayload.length > 0) {
          void executeFilter();
        }
      } else if (keyword) {
        void executeSearch();
      }
    }
  }, [executeFilter, executeSearch, filterRulesPayload.length, isFilterMode, isSearching, keyword]);

  const renderedResultItems = (
    <SearchResultItems
      filterMatches={filterMatches}
      filterRulesPayloadLength={filterRulesPayload.length}
      fontFamily={fontFamily}
      handleSelectMatch={handleSelectMatch}
      isFilterMode={isFilterMode}
      keyword={keyword}
      matches={matches}
      messages={messages}
      resultListTextStyle={resultListTextStyle}
      resultPanelState={resultPanelState}
      visibleCurrentFilterMatchIndex={visibleCurrentFilterMatchIndex}
      visibleCurrentMatchIndex={visibleCurrentMatchIndex}
      visibleFilterMatches={visibleFilterMatches}
      visibleMatches={visibleMatches}
    />
  );
  const statusText = useMemo(
    () => getSearchStatusText({
      currentFilterMatchIndex,
      currentMatchIndex,
      errorMessage,
      filterMatchCount: filterMatches.length,
      hasConfiguredFilterRules: effectiveFilterRules.length > 0,
      isFilterMode,
      isSearching,
      keyword,
      matchCount: matches.length,
      messages,
      totalFilterMatchedLineCount: displayTotalFilterMatchedLineCount,
      totalMatchCount: displayTotalMatchCount,
    }),
    [
      currentFilterMatchIndex,
      currentMatchIndex,
      displayTotalFilterMatchedLineCount,
      displayTotalMatchCount,
      effectiveFilterRules.length,
      errorMessage,
      filterMatches.length,
      isFilterMode,
      isSearching,
      keyword,
      matches.length,
      messages,
    ]
  );

  const canReplace = !!activeTab;
  const isResultPanelOpen = resultPanelState === 'open';
  const resultToggleTitle = isResultPanelOpen ? messages.collapseResults : messages.expandResults;
  const filterToggleLabel = isResultPanelOpen ? messages.collapse : messages.filterRun;

  const toggleResultPanelAndRefresh = useCallback(() => {
    setResultPanelState((previous) => (previous === 'open' ? 'minimized' : 'open'));

    if (isSearching) {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayload.length > 0) {
        void executeFilter();
      }
      return;
    }

    if (keyword) {
      rememberSearchKeyword(keyword);
      void executeSearch();
    }
  }, [executeFilter, executeSearch, filterRulesPayload.length, isFilterMode, isSearching, keyword, rememberSearchKeyword]);

  const handleSelectedFilterGroupChange = useCallback((nextName: string) => {
    setSelectedFilterGroupName(nextName);
    if (nextName) {
      setFilterGroupNameInput(nextName);
    }
  }, []);

  const handleInputContextMenuAction = useCallback(
    async (action: SearchSidebarInputContextAction) => {
      const inputTarget = inputContextMenuTargetRef.current;
      closeInputContextMenu();

      if (!inputTarget) {
        return;
      }

      const { start, end } = getTextInputSelectionRange(inputTarget);
      const hasSelection = end > start;
      const selectedText = hasSelection ? inputTarget.value.slice(start, end) : '';
      const canEdit = isTextInputEditable(inputTarget);

      try {
        if (action === 'copy') {
          if (!hasSelection) {
            return;
          }

          await writePlainTextToClipboard(selectedText);
          return;
        }

        if (action === 'cut') {
          if (!canEdit || !hasSelection) {
            return;
          }

          await writePlainTextToClipboard(selectedText);
          replaceSelectedInputText(inputTarget, '', 'start');
          return;
        }

        if (action === 'paste') {
          if (!canEdit) {
            return;
          }

          let clipboardText = '';
          if (navigator.clipboard?.readText) {
            clipboardText = await navigator.clipboard.readText();
          } else {
            inputTarget.focus();
            if (document.execCommand('paste')) {
              return;
            }
          }

          replaceSelectedInputText(inputTarget, clipboardText, 'end');
          return;
        }

        if (!canEdit || !hasSelection) {
          return;
        }

        replaceSelectedInputText(inputTarget, '', 'start');
      } catch (error) {
        console.error('Search sidebar input context action failed:', error);
      }
    },
    [closeInputContextMenu]
  );

  const handleSearchSidebarContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const textInputTarget = resolveSearchSidebarTextInputTarget(event.target);
      if (!textInputTarget) {
        event.preventDefault();
        closeInputContextMenu();
        return;
      }

      event.preventDefault();
      textInputTarget.focus();
      inputContextMenuTargetRef.current = textInputTarget;
      setInputContextMenu({
        x: event.clientX,
        y: event.clientY,
        hasSelection: hasTextInputSelection(textInputTarget),
        canEdit: isTextInputEditable(textInputTarget),
      });
    },
    [closeInputContextMenu]
  );

  if (!activeTab) {
    return null;
  }

  return (
    <>
      <SearchSidebarChrome
        canReplace={canReplace}
        errorMessage={errorMessage}
        feedbackMessage={feedbackMessage}
        isOpen={isOpen}
        isSearchUiActive={isSearchUiActive}
        isSearchSidebarResizing={isSearchSidebarResizing}
        messages={messages}
        panelMode={panelMode}
        searchSidebarBottomOffset={searchSidebarBottomOffset}
        searchSidebarContainerRef={searchSidebarContainerRef}
        searchSidebarTopOffset={searchSidebarTopOffset}
        searchSidebarWidth={searchSidebarWidth}
        statusText={statusText}
        onBlurCapture={handleSearchUiBlurCapture}
        onClose={() => setIsOpen(false)}
        onContextMenu={handleSearchSidebarContextMenu}
        onFocusCapture={handleSearchUiFocusCapture}
        onModeChange={(mode) => {
          setPanelMode(mode);
          focusSearchInput();
        }}
        onPointerDownCapture={handleSearchUiPointerDownCapture}
        onResizePointerDown={startSearchSidebarResize}
      >
        <SearchSidebarBody
          isFilterMode={isFilterMode}
          searchQuerySectionProps={{
            canReplace,
            caseSensitive,
            isReplaceMode,
            keyword,
            messages,
            parseEscapeSequences,
            recentReplaceValues,
            recentSearchKeywords,
            replaceValue,
            resultToggleTitle,
            reverseSearch,
            searchInputRef,
            searchMode,
            onCaseSensitiveChange: (checked) => {
              setCaseSensitive(checked);
              setErrorMessage(null);
              resetSearchState();
            },
            onKeywordChange: (value) => {
              setKeyword(value);
              setFeedbackMessage(null);
              setErrorMessage(null);
              resetSearchState();
            },
            onKeywordClear: () => {
              setKeyword('');
              setFeedbackMessage(null);
              setErrorMessage(null);
              resetSearchState();
            },
            onKeywordKeyDown: handleKeywordKeyDown,
            onNavigateNext: () => void navigateByStep(1),
            onNavigatePrev: () => void navigateByStep(-1),
            onParseEscapeSequencesChange: setParseEscapeSequences,
            onReplaceAll: () => void handleReplaceAll(),
            onReplaceCurrent: () => void handleReplaceCurrent(),
            onReplaceValueChange: setReplaceValue,
            onReplaceValueClear: () => setReplaceValue(''),
            onReverseSearchChange: setReverseSearch,
            onSearchModeChange: (mode) => {
              setSearchMode(mode);
              setErrorMessage(null);
              resetSearchState();
            },
            onToggleAllResults: toggleResultPanelAndRefresh,
          }}
          filterRulesEditorProps={{
            effectiveFilterRules,
            filterGroupNameInput,
            filterRuleDragState,
            filterRules,
            filterToggleLabel,
            hasAnyConfiguredFilterRule,
            messages,
            normalizedFilterRuleGroups,
            selectedFilterGroupName,
            onAddFilterRule: addFilterRule,
            onClearFilterGroupNameInput: () => setFilterGroupNameInput(''),
            onClearFilterRules: clearFilterRules,
            onDeleteFilterRuleGroup: () => void handleDeleteFilterRuleGroup(),
            onExportFilterRuleGroups: () => void handleExportFilterRuleGroups(),
            onFilterGroupNameInputChange: setFilterGroupNameInput,
            onImportFilterRuleGroups: () => void handleImportFilterRuleGroups(),
            onKeywordKeyDown: handleKeywordKeyDown,
            onLoadFilterRuleGroup: handleLoadFilterRuleGroup,
            onMoveFilterRule: moveFilterRule,
            onRemoveFilterRule: removeFilterRule,
            onRuleDragEnd: onFilterRuleDragEnd,
            onRuleDragOver: onFilterRuleDragOver,
            onRuleDragStart: onFilterRuleDragStart,
            onRuleDrop: onFilterRuleDrop,
            onSaveFilterRuleGroup: () => void handleSaveFilterRuleGroup(),
            onSelectedFilterGroupChange: handleSelectedFilterGroupChange,
            onToggleResultPanelAndRefresh: toggleResultPanelAndRefresh,
            onUpdateFilterRule: updateFilterRule,
          }}
        />
      </SearchSidebarChrome>

      {inputContextMenu && (
        <SearchInputContextMenu
          contextMenu={inputContextMenu}
          copyLabel={inputContextCopyLabel}
          cutLabel={inputContextCutLabel}
          deleteLabel={messages.filterDeleteRule}
          menuRef={inputContextMenuRef}
          pasteLabel={inputContextPasteLabel}
          onAction={(action) => void handleInputContextMenuAction(action)}
        />
      )}

      <SearchResultsPanel
        displayTotalFilterMatchedLineCountText={displayTotalFilterMatchedLineCountText}
        displayTotalMatchCountText={displayTotalMatchCountText}
        displayTotalMatchedLineCountText={displayTotalMatchedLineCountText}
        errorMessage={errorMessage}
        filterMatchCount={filterMatches.length}
        filterRulesPayloadLength={filterRulesPayload.length}
        hasAppliedResultFilterKeyword={hasAppliedResultFilterKeyword}
        hasMoreFilterMatches={hasMoreFilterMatches}
        hasMoreMatches={hasMoreMatches}
        isFilterMode={isFilterMode}
        isResultFilterActive={isResultFilterActive}
        isResultFilterSearching={isResultFilterSearching}
        isSearching={isSearching}
        keyword={keyword}
        matchCount={matches.length}
        messages={messages}
        minimizedResultWrapperRef={minimizedResultWrapperRef}
        plainTextResultEntryCount={plainTextResultEntries.length}
        renderedResultItems={renderedResultItems}
        resultFilterKeyword={resultFilterKeyword}
        resultFilterStepLoadingDirection={resultFilterStepLoadingDirection}
        resultListRef={resultListRef}
        resultPanelHeight={resultPanelHeight}
        resultPanelState={resultPanelState}
        resultPanelWrapperRef={resultPanelWrapperRef}
        visibleFilterMatchCount={visibleFilterMatches.length}
        visibleMatchCount={visibleMatches.length}
        onApplyResultFilter={handleResultFilterAction}
        onCancelPendingBatchLoad={cancelPendingBatchLoad}
        onClearResultFilter={handleClearResultFilter}
        onClose={handleCloseResultPanel}
        onCopy={() => void copyPlainTextResults()}
        onMinimize={() => setResultPanelState('minimized')}
        onNavigateResultFilterNext={handleResultFilterNext}
        onNavigateResultFilterPrev={handleResultFilterPrev}
        onOpenMinimized={handleReopenResultPanel}
        onRefresh={handleRefreshResults}
        onRequestStopResultFilterSearch={requestStopResultFilterSearch}
        onResizeMouseDown={handleResultPanelResizeMouseDown}
        onResultFilterKeywordChange={setResultFilterKeyword}
        onScroll={handleResultListScroll}
      />
    </>
  );
}

