import { invoke } from '@tauri-apps/api/core';
import {
  startTransition,
  useCallback,
  useEffect,
} from 'react';
import { SearchSidebarBody } from '@/components/search-panel/SearchSidebarBody';
import { SearchPanelOverlays } from '@/components/search-panel/SearchPanelOverlays';
import { SearchSidebarChrome } from '@/components/search-panel/SearchSidebarChrome';
import { useFilterRuleEditorState } from '@/components/search-panel/useFilterRuleEditorState';
import { useFilterRulesEditorOptions } from '@/components/search-panel/useFilterRulesEditorOptions';
import { useFilterRuleGroupPersistence } from '@/components/search-panel/useFilterRuleGroupPersistence';
import { useSearchPanelInputSupport } from '@/components/search-panel/useSearchPanelInputSupport';
import { useSearchKeywordKeyDown } from '@/components/search-panel/useSearchInputInteractions';
import { useSearchMatchNavigation } from '@/components/search-panel/useSearchMatchNavigation';
import { useSearchPanelDerivedState } from '@/components/search-panel/useSearchPanelDerivedState';
import { useSearchPanelOverlayOptions } from '@/components/search-panel/useSearchPanelOverlayOptions';
import { useSearchPanelLocalState } from '@/components/search-panel/useSearchPanelLocalState';
import { useSearchPanelUiState } from '@/components/search-panel/useSearchPanelUiState';
import { useSearchPanelRuntimeRefs } from '@/components/search-panel/useSearchPanelRuntimeRefs';
import { useSearchPanelSnapshotPersistence } from '@/components/search-panel/useSearchPanelSnapshotPersistence';
import { useSearchApplyResultFilter } from '@/components/search-panel/useSearchApplyResultFilter';
import { resetSearchPanelForInactiveTab } from '@/components/search-panel/resetSearchPanelForInactiveTab';
import { restoreSearchPanelSnapshotState } from '@/components/search-panel/restoreSearchPanelSnapshotState';
import { resetSearchPanelForMissingSnapshot } from '@/components/search-panel/resetSearchPanelForMissingSnapshot';
import { applySearchSessionRestoreResult, handleSearchSessionRestoreError } from '@/components/search-panel/applySearchSessionRestoreResult';
import { applyFilterSessionRestoreResult, handleFilterSessionRestoreError } from '@/components/search-panel/applyFilterSessionRestoreResult';
import { applySearchCursorStepResult } from '@/components/search-panel/applySearchPanelCursorStepResult';
import { applyReplaceNextMatchNavigation, applyReplaceSuccessEffects } from '@/components/search-panel/applySearchPanelReplaceSuccessEffects';
import { applyPreparedReplaceSearchResult, applyReplaceOperationGuard } from '@/components/search-panel/applySearchPanelReplaceSearchGuard';
import { applyFilterNavigationSelection, applySearchNavigationSelection } from '@/components/search-panel/applySearchPanelNavigationSelection';
import { applyFilterResultFilterSelection, applySearchResultFilterSelection } from '@/components/search-panel/applySearchPanelResultFilterSelection';
import { applyEmptySearchFirstMatchResult, applyImmediateSearchFirstMatchResult } from '@/components/search-panel/applySearchPanelFirstMatchResult';
import { applyFilterSessionNextResult, applySearchSessionNextResult, handleFilterSessionNextError, handleSearchSessionNextError } from '@/components/search-panel/applySearchPanelLoadMoreSessionResults';
import { getFilterLoadMoreFallbackParams, getSearchLoadMoreFallbackParams, handleFilterLoadMoreVersionMismatch, handleSearchLoadMoreVersionMismatch } from '@/components/search-panel/resolveSearchPanelLoadMoreFallback';
import { applySearchPanelErrorMessage } from '@/components/search-panel/applySearchPanelErrorMessage';
import { resolveCurrentFilterMatch, resolveCurrentSearchMatch } from '@/components/search-panel/resolveSearchPanelCurrentMatch';
import { resolveFilterStepAnchor, resolveSearchCursorStepAnchor, resolveSearchResultFilterStepAnchor } from '@/components/search-panel/resolveSearchPanelStepAnchors';
import { resolveSearchPanelBoundedIndex, resolveSearchPanelStepCandidateIndex, resolveSearchPanelWrappedIndex } from '@/components/search-panel/resolveSearchPanelBoundedIndex';
import { resolveFilterStepTarget, resolveSearchPanelResultFilterStepSelection, resolveSearchStepTarget } from '@/components/search-panel/resolveSearchPanelStepTargets';
import { finalizeSearchPanelRestoreCycle } from '@/components/search-panel/finalizeSearchPanelRestoreCycle';
import { buildFilterSessionRestoreRequest, buildSearchSessionRestoreRequest } from '@/components/search-panel/buildSearchPanelRestoreRequests';
import { applyFilterCountResult, applySearchCountResult, handleFilterCountFailure, handleSearchCountFailure } from '@/components/search-panel/applySearchPanelCountResults';
import { applyCachedFilterRunResult, applyCachedSearchRunResult, applyFilterLoadMoreResult, applyFilterResultFilterStepResult, applyFilterRunResult, applyReplaceAllSearchResult, applyReplaceCurrentSearchResult, applySearchLoadMoreResult, applySearchResultFilterStepResult, applySearchRunResult } from '@/components/search-panel/applySearchPanelRunResults';
import { createEmptyFilterRunResult, createEmptySearchRunResult, createFilterRunFailureResult, createSearchRunFailureResult } from '@/components/search-panel/createSearchPanelRunFallbacks';
import { buildDocumentVersionRequest, buildFilterChunkRequest, buildFilterCountRequest, buildFilterSessionNextRequest, buildFilterSessionStartRequest, buildFilterStepRequest, buildReplaceAllRequest, buildReplaceCurrentRequest, buildSearchChunkRequest, buildSearchCountRequest, buildSearchCursorStepRequest, buildSearchFirstRequest, buildSearchResultFilterStepRequest, buildSearchSessionNextRequest, buildSearchSessionStartRequest } from '@/components/search-panel/buildSearchPanelRunRequests';
import { useSearchPanelResetState } from '@/components/search-panel/useSearchPanelResetState';
import { useSearchBatchControl } from '@/components/search-panel/useSearchBatchControl';
import { useSearchSidebarShellOptions } from '@/components/search-panel/useSearchSidebarShellOptions';
import { useSearchPanelShellEffects } from '@/components/search-panel/useSearchPanelShellEffects';
import { useSearchPanelViewProps } from '@/components/search-panel/useSearchPanelViewProps';
import { useSearchQueryOptions } from '@/components/search-panel/useSearchQueryOptions';
import { useSearchResultPanelState } from '@/components/search-panel/useSearchResultPanelState';
import { useSearchSessionLifecycle } from '@/components/search-panel/useSearchSessionLifecycle';
import { useSearchResultsViewport } from '@/components/search-panel/useSearchResultsViewport';
import { useSearchSidebarFrame } from '@/components/search-panel/useSearchSidebarFrame';
import { useSearchPanelStoreState } from '@/components/search-panel/useSearchPanelStoreState';
import {
  isFilterResultFilterStepBackendResult,
  isFilterSessionRestoreBackendResult,
  isFilterSessionStartBackendResult,
  isMissingInvokeCommandError,
  isSearchCursorStepBackendResult,
  isSearchSessionRestoreBackendResult,
  isSearchSessionStartBackendResult,
} from '@/components/search-panel/backendGuards';
import type {
  FilterChunkBackendResult,
  FilterCountBackendResult,
  FilterMatch,
  FilterRunResult,
  FilterResultFilterStepBackendResult,
  ReplaceAllAndSearchChunkBackendResult,
  ReplaceCurrentAndSearchChunkBackendResult,
  SearchChunkBackendResult,
  SearchCountBackendResult,
  SearchFirstBackendResult,
  SearchMatch,
  SearchResultFilterStepBackendResult,
  SearchRunResult,
} from '@/components/search-panel/types';
import {
  FILTER_CHUNK_SIZE,
  RESULT_PANEL_DEFAULT_HEIGHT,
  SEARCH_CHUNK_SIZE,
  SEARCH_SIDEBAR_DEFAULT_WIDTH,
} from '@/components/search-panel/utils';
export function SearchReplacePanel() {
  const {
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
  } = useSearchPanelStoreState();

  const {
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
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  } = useSearchPanelLocalState();

  const {
    inputContextCopyLabel,
    inputContextCutLabel,
    inputContextPasteLabel,
    isFilterMode,
    isReplaceMode,
    messages,
    normalizedFilterRuleGroups,
    resultListTextStyle,
  } = useSearchPanelUiState({
    filterRuleGroups,
    fontFamily,
    fontSize,
    language,
    panelMode,
  });
  const {
    getSearchSidebarOccludedRightPx,
    handleSearchUiBlurCapture,
    handleSearchUiFocusCapture,
    handleSearchUiPointerDownCapture,
    isSearchSidebarResizing,
    isSearchUiActive,
    searchSidebarContainerRef,
    startSearchSidebarResize,
  } = useSearchSidebarFrame({
    isOpen,
    searchSidebarWidth,
    setSearchSidebarWidth,
  });

  const {
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
  } = useSearchPanelRuntimeRefs();

  const {
    focusSearchInput,
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextMenu,
    inputContextMenuRef,
    rememberReplaceValue,
    rememberSearchKeyword,
  } = useSearchPanelInputSupport({
    isOpen,
    recentReplaceValues,
    recentSearchKeywords,
    searchInputRef,
    updateSettings,
  });

  const { cancelPendingBatchLoad, requestStopResultFilterSearch } = useSearchBatchControl({
    countRunVersionRef,
    filterCountRunVersionRef,
    filterRunVersionRef,
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    resultFilterStepRunVersionRef,
    runVersionRef,
    setIsSearching,
    setResultFilterStepLoadingDirection,
    stopResultFilterSearchRef,
  });

  const { setFilterSessionId, setSearchSessionId } = useSearchSessionLifecycle({
    filterSessionIdRef,
    searchSessionIdRef,
  });

  const { resetFilterState, resetSearchState } = useSearchPanelResetState({
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    currentFilterMatchIndex,
    currentFilterMatchIndexRef,
    currentMatchIndex,
    currentMatchIndexRef,
    filterCountCacheRef,
    filterLineCursorRef,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setFilterMatches,
    setFilterSessionId,
    setMatches,
    setSearchSessionId,
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,
  });

  const {
    addFilterRule,
    clearFilterRules,
    filterGroupNameInput,
    filterRuleDragState,
    filterRules,
    handleLoadFilterRuleGroup,
    handleSelectedFilterGroupChange,
    moveFilterRule,
    onFilterRuleDragEnd,
    onFilterRuleDragOver,
    onFilterRuleDragStart,
    onFilterRuleDrop,
    removeFilterRule,
    selectedFilterGroupName,
    setFilterGroupNameInput,
    setSelectedFilterGroupName,
    updateFilterRule,
  } = useFilterRuleEditorState({
    messages,
    normalizedFilterRuleGroups,
    resetFilterState,
    setErrorMessage,
    setFeedbackMessage,
  });

  const {
    backendResultFilterKeyword,
    effectiveFilterRules,
    effectiveSearchKeyword,
    filterRulesKey,
    filterRulesPayload,
    hasAnyConfiguredFilterRule,
    isResultFilterActive,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  } = useSearchPanelDerivedState({
    appliedResultFilterKeyword,
    caseSensitive,
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    filterRules,
    keyword,
    matches,
    parseEscapeSequences,
  });

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
          const currentDocumentVersion = await invoke<number>(
            'get_document_version',
            buildDocumentVersionRequest({
              activeTabId: activeTab.id,
            })
          );

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
      const result = await invoke<SearchCountBackendResult>(
        'search_count_in_document',
        buildSearchCountRequest({
          activeTabId: activeTab.id,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          effectiveResultFilterKeyword,
        })
      );

      if (countRunVersionRef.current !== runId) {
        return;
      }

      applySearchCountResult({
        activeTabId: activeTab.id,
        caseSensitive,
        countCacheRef,
        effectiveResultFilterKeyword,
        effectiveSearchKeyword,
        parseEscapeSequences,
        result,
        searchMode,
        setTotalMatchCount,
        setTotalMatchedLineCount,
      });
    } catch (error) {
      if (countRunVersionRef.current !== runId) {
        return;
      }

      handleSearchCountFailure({
        error,
        setTotalMatchCount,
        setTotalMatchedLineCount,
      });
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
          const currentDocumentVersion = await invoke<number>(
            'get_document_version',
            buildDocumentVersionRequest({
              activeTabId: activeTab.id,
            })
          );

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
      const result = await invoke<FilterCountBackendResult>(
        'filter_count_in_document',
        buildFilterCountRequest({
          activeTabId: activeTab.id,
          rules: filterRulesPayload,
          effectiveResultFilterKeyword,
          caseSensitive,
        })
      );

      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      applyFilterCountResult({
        activeTabId: activeTab.id,
        effectiveResultFilterKeyword,
        filterCountCacheRef,
        filterRulesKey,
        result,
        setTotalFilterMatchedLineCount,
      });
    } catch (error) {
      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      handleFilterCountFailure({
        error,
        setTotalFilterMatchedLineCount,
      });
    }
  }, [activeTab, backendResultFilterKeyword, caseSensitive, filterRulesKey, filterRulesPayload]);


  const executeSearch = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<SearchRunResult | null> => {
      const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;
      cancelPendingBatchLoad();

    if (!activeTab || isFilterMode) {
      return null;
    }

    if (!keyword) {
      return createEmptySearchRunResult({
        resetSearchState,
        setErrorMessage,
        setIsSearching,
      });
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
          const currentDocumentVersion = await invoke<number>(
            'get_document_version',
            buildDocumentVersionRequest({
              activeTabId: activeTab.id,
            })
          );

          if (currentDocumentVersion === cached.documentVersion) {
            applyCachedSearchRunResult({
              cached,
              chunkCursorRef,
              setCurrentMatchIndex,
              setErrorMessage,
              setMatches,
              setSearchSessionId,
              startTransition,
            });

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
          sessionStartResult = await invoke<unknown>(
            'search_session_start_in_document',
            buildSearchSessionStartRequest({
              activeTabId: activeTab.id,
              caseSensitive,
              effectiveResultFilterKeyword,
              effectiveSearchKeyword,
              maxResults: SEARCH_CHUNK_SIZE,
              searchMode,
            })
          );
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
        const backendResult = await invoke<SearchChunkBackendResult>(
          'search_in_document_chunk',
          buildSearchChunkRequest({
            activeTabId: activeTab.id,
            caseSensitive,
            effectiveResultFilterKeyword,
            effectiveSearchKeyword,
            maxResults: SEARCH_CHUNK_SIZE,
            searchMode,
            startOffset: 0,
          })
        );

        nextMatches = backendResult.matches || [];
        documentVersion = backendResult.documentVersion ?? 0;
        nextOffset = backendResult.nextOffset ?? null;
      }

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      applySearchRunResult({
        activeTabId: activeTab.id,
        caseSensitive,
        chunkCursorRef,
        countCacheRef,
        documentVersion,
        effectiveResultFilterKeyword,
        effectiveSearchKeyword,
        nextMatches,
        nextOffset,
        parseEscapeSequences,
        cachedSearchRef,
        searchMode,
        sessionId,
        setCurrentMatchIndex,
        setErrorMessage,
        setMatches,
        setSearchSessionId,
        setTotalMatchCount,
        setTotalMatchedLineCount,
        shouldRunCountFallback,
        startTransition,
        totalMatchedLines,
        totalMatches,
      });
      if (shouldRunCountFallback) {
        void executeCountSearch(forceRefresh, effectiveResultFilterKeyword);
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

      return createSearchRunFailureResult({
        error,
        resetSearchState,
        searchFailedLabel: messages.searchFailed,
        setErrorMessage,
      });
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
      return createEmptyFilterRunResult({
        resetFilterState,
        setErrorMessage,
        setIsSearching,
        setTotalFilterMatchedLineCount,
      });
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
          const currentDocumentVersion = await invoke<number>(
            'get_document_version',
            buildDocumentVersionRequest({
              activeTabId: activeTab.id,
            })
          );

          if (currentDocumentVersion === cached.documentVersion) {
            applyCachedFilterRunResult({
              cached,
              filterLineCursorRef,
              setCurrentFilterMatchIndex,
              setErrorMessage,
              setFilterMatches,
              setFilterSessionId,
              startTransition,
            });

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
          sessionStartResult = await invoke<unknown>(
            'filter_session_start_in_document',
            buildFilterSessionStartRequest({
              activeTabId: activeTab.id,
              caseSensitive,
              effectiveResultFilterKeyword,
              maxResults: FILTER_CHUNK_SIZE,
              rules: filterRulesPayload,
            })
          );
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
        const backendResult = await invoke<FilterChunkBackendResult>(
          'filter_in_document_chunk',
          buildFilterChunkRequest({
            activeTabId: activeTab.id,
            caseSensitive,
            effectiveResultFilterKeyword,
            maxResults: FILTER_CHUNK_SIZE,
            rules: filterRulesPayload,
            startLine: 0,
          })
        );

        nextMatches = backendResult.matches || [];
        documentVersion = backendResult.documentVersion ?? 0;
        nextLine = backendResult.nextLine ?? null;
      }

      if (filterRunVersionRef.current !== runVersion) {
        return null;
      }

      applyFilterRunResult({
        activeTabId: activeTab.id,
        cachedFilterRef,
        documentVersion,
        effectiveResultFilterKeyword,
        filterCountCacheRef,
        filterLineCursorRef,
        filterRulesKey,
        nextLine,
        nextMatches,
        sessionId,
        setCurrentFilterMatchIndex,
        setErrorMessage,
        setFilterMatches,
        setFilterSessionId,
        setTotalFilterMatchedLineCount,
        shouldRunCountFallback,
        startTransition,
        totalMatchedLines,
      });
      if (shouldRunCountFallback) {
        void executeFilterCountSearch(forceRefresh, effectiveResultFilterKeyword);
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

      return createFilterRunFailureResult({
        error,
        filterFailedLabel: messages.filterFailed,
        resetFilterState,
        setErrorMessage,
      });
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
          const sessionNextResult = await invoke<unknown>(
            'search_session_next_in_document',
            buildSearchSessionNextRequest({
              sessionId: activeSearchSessionId,
              maxResults: SEARCH_CHUNK_SIZE,
            })
          );
          if (sessionId !== loadMoreSessionRef.current) {
            return null;
          }

          const nextSearchSessionState = applySearchSessionNextResult({
            documentVersion,
            result: sessionNextResult,
            searchSessionCommandUnsupportedRef,
            setSearchSessionId,
          });
          if (nextSearchSessionState) {
            usedSessionMode = true;
            appendedMatches = nextSearchSessionState.matches;
            nextOffset = nextSearchSessionState.nextOffset;
            documentVersion = nextSearchSessionState.documentVersion;
          }
        } catch (error) {
          handleSearchSessionNextError({
            error,
            searchSessionCommandUnsupportedRef,
            setSearchSessionId,
          });
        }
      }

      if (!usedSessionMode) {
        const params = getSearchLoadMoreFallbackParams({
          activeTabId: activeTab.id,
          cachedSearch: cachedSearchRef.current,
          caseSensitive,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
          effectiveSearchKeyword,
          parseEscapeSequences,
          searchMode,
        });
        if (!params) {
          return null;
        }

        const backendResult = await invoke<SearchChunkBackendResult>(
          'search_in_document_chunk',
          buildSearchChunkRequest({
            activeTabId: activeTab.id,
            effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            effectiveResultFilterKeyword: backendResultFilterKeyword,
            startOffset,
            maxResults: SEARCH_CHUNK_SIZE,
          })
        );

        if (sessionId !== loadMoreSessionRef.current) {
          return null;
        }

        if (backendResult.documentVersion !== params.documentVersion) {
          handleSearchLoadMoreVersionMismatch({
            cachedSearchRef,
            chunkCursorRef,
            setSearchSessionId,
          });
          return null;
        }

        appendedMatches = backendResult.matches || [];
        nextOffset = backendResult.nextOffset ?? null;
        documentVersion = params.documentVersion;
      }

      applySearchLoadMoreResult({
        activeTabId: activeTab.id,
        appendedMatches,
        cachedSearchRef,
        caseSensitive,
        chunkCursorRef,
        documentVersion,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        nextOffset,
        parseEscapeSequences,
        searchMode,
        sessionId: searchSessionIdRef.current,
        setMatches,
        startTransition,
      });

      return appendedMatches;
    } catch (error) {
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      applySearchPanelErrorMessage({
        error,
        prefix: messages.searchFailed,
        setErrorMessage,
      });
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
          const sessionNextResult = await invoke<unknown>(
            'filter_session_next_in_document',
            buildFilterSessionNextRequest({
              sessionId: activeFilterSessionId,
              maxResults: FILTER_CHUNK_SIZE,
            })
          );
          if (sessionId !== loadMoreSessionRef.current) {
            return null;
          }

          const nextFilterSessionState = applyFilterSessionNextResult({
            documentVersion,
            filterSessionCommandUnsupportedRef,
            result: sessionNextResult,
            setFilterSessionId,
          });
          if (nextFilterSessionState) {
            usedSessionMode = true;
            appendedMatches = nextFilterSessionState.matches;
            nextLine = nextFilterSessionState.nextLine;
            documentVersion = nextFilterSessionState.documentVersion;
          }
        } catch (error) {
          handleFilterSessionNextError({
            error,
            filterSessionCommandUnsupportedRef,
            setFilterSessionId,
          });
        }
      }

      if (!usedSessionMode) {
        const params = getFilterLoadMoreFallbackParams({
          activeTabId: activeTab.id,
          cachedFilter: cachedFilterRef.current,
          filterRulesKey,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
        });
        if (!params) {
          return null;
        }

        const backendResult = await invoke<FilterChunkBackendResult>(
          'filter_in_document_chunk',
          buildFilterChunkRequest({
            activeTabId: activeTab.id,
            rules: filterRulesPayload,
            effectiveResultFilterKeyword: backendResultFilterKeyword,
            caseSensitive,
            startLine,
            maxResults: FILTER_CHUNK_SIZE,
          })
        );

        if (sessionId !== loadMoreSessionRef.current) {
          return null;
        }

        if (backendResult.documentVersion !== params.documentVersion) {
          handleFilterLoadMoreVersionMismatch({
            cachedFilterRef,
            filterLineCursorRef,
            setFilterSessionId,
          });
          return null;
        }

        appendedMatches = backendResult.matches || [];
        nextLine = backendResult.nextLine ?? null;
        documentVersion = params.documentVersion;
      }

      applyFilterLoadMoreResult({
        activeTabId: activeTab.id,
        appendedMatches,
        cachedFilterRef,
        documentVersion,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        filterLineCursorRef,
        filterRulesKey,
        nextLine,
        sessionId: filterSessionIdRef.current,
        setFilterMatches,
        startTransition,
      });

      return appendedMatches;
    } catch (error) {
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      applySearchPanelErrorMessage({
        error,
        prefix: messages.filterFailed,
        setErrorMessage,
      });
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
      const firstResult = await invoke<SearchFirstBackendResult>(
        'search_first_in_document',
        buildSearchFirstRequest({
          activeTabId: activeTab.id,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          reverse,
        })
      );

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const documentVersion = firstResult.documentVersion ?? 0;
      const firstMatch = firstResult.firstMatch;

      if (!firstMatch) {
        return applyEmptySearchFirstMatchResult({
          activeTabId: activeTab.id,
          cachedSearchRef,
          caseSensitive,
          chunkCursorRef,
          documentVersion,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
          effectiveSearchKeyword,
          parseEscapeSequences,
          resetSearchState,
          searchMode,
          setErrorMessage,
          setIsSearching,
          setSearchSessionId,
        });
      }

      const immediateResult = applyImmediateSearchFirstMatchResult({
        activeTabId: activeTab.id,
        cachedSearchRef,
        caseSensitive,
        chunkCursorRef,
        documentVersion,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        firstMatch,
        parseEscapeSequences,
        searchMode,
        setCurrentMatchIndex,
        setErrorMessage,
        setMatches,
        setSearchSessionId,
        startTransition,
      });

      void (async () => {
        const chunkResult = await executeSearch(true, false);
        if (!chunkResult) {
          return;
        }
      })();

      return immediateResult;
    } catch (error) {
      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = applySearchPanelErrorMessage({
        error,
        prefix: messages.searchFailed,
        setErrorMessage,
      });
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

  const {
    handleSelectMatch,
    navigateToFilterMatch,
    navigateToMatch,
  } = useSearchMatchNavigation({
    activeTabId: activeTab?.id ?? null,
    filterMatches,
    getSearchSidebarOccludedRightPx,
    isFilterMode,
    matches,
    setCursorPosition,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setFeedbackMessage,
  });

  const hasMoreMatches = chunkCursorRef.current !== null;
  const hasMoreFilterMatches = filterLineCursorRef.current !== null;

  const { handleResultListScroll, scrollResultItemIntoView } = useSearchResultsViewport({
    filterMatchesLength: filterMatches.length,
    filterRulesPayloadLength: filterRulesPayload.length,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isOpen,
    isSearching,
    keyword,
    loadMoreDebounceRef,
    loadMoreFilterMatches,
    loadMoreLockRef,
    loadMoreMatches,
    matchesLength: matches.length,
    resultListRef,
    resultPanelState,
  });

  const navigateByStep = useCallback(
    async (step: number) => {
      const normalizedStep = step < 0 ? -1 : 1;
      const navigationFeedback = normalizedStep < 0 ? messages.prevMatch : messages.nextMatch;

      if (!isFilterMode && keyword.length > 0) {
        rememberSearchKeyword(keyword);
      }

      if (activeTab && isFilterMode && !filterStepCommandUnsupportedRef.current) {
        try {
          const currentFilterMatch = resolveCurrentFilterMatch(
            filterMatches,
            currentFilterMatchIndexRef.current
          );
          const filterStepAnchor = resolveFilterStepAnchor(currentFilterMatch);
          const stepResultValue = await invoke<unknown>(
            'step_result_filter_search_in_filter_document',
            buildFilterStepRequest({
              activeTabId: activeTab.id,
              rules: filterRulesPayload,
              resultFilterKeyword: backendResultFilterKeyword,
              caseSensitive,
              ...filterStepAnchor,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            })
          );

          if (isFilterResultFilterStepBackendResult(stepResultValue)) {
            filterStepCommandUnsupportedRef.current = false;

            const targetMatch = stepResultValue.targetMatch;
            if (!targetMatch) {
              return;
            }

            const resolvedFilterStepTarget = resolveFilterStepTarget({
              batchMatches: stepResultValue.batchMatches,
              matches: filterMatches,
              targetIndexInBatch: stepResultValue.targetIndexInBatch,
              targetMatch,
            });

            if (resolvedFilterStepTarget) {
              const { nextMatches: stepBatchMatches, targetIndex } = resolvedFilterStepTarget;
              const documentVersion = stepResultValue.documentVersion ?? 0;
              const totalMatchedLines = stepResultValue.totalMatchedLines ?? 0;
              applyFilterResultFilterStepResult({
                activeTabId: activeTab.id,
                cachedFilterRef,
                documentVersion,
                filterCountCacheRef,
                filterLineCursorRef,
                filterRulesKey,
                nextLine: stepResultValue.nextLine ?? null,
                nextMatches: stepBatchMatches,
                resultFilterKeyword: backendResultFilterKeyword,
                setFilterMatches,
                setFilterSessionId,
                setTotalFilterMatchedLineCount,
                startTransition,
                totalMatchedLines,
              });
              applyFilterNavigationSelection({
                currentFilterMatchIndexRef,
                matches: stepBatchMatches,
                navigationFeedback,
                navigateToFilterMatch,
                nextIndex: targetIndex,
                setCurrentFilterMatchIndex,
                setFeedbackMessage,
              });
              return;
            }
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'step_result_filter_search_in_filter_document')) {
            filterStepCommandUnsupportedRef.current = true;
          } else {
            applySearchPanelErrorMessage({
              error,
              prefix: messages.filterFailed,
              setErrorMessage,
            });
            return;
          }
        }
      }

      if (isFilterMode) {
        if (filterMatches.length > 0) {
          const candidateIndex = resolveSearchPanelStepCandidateIndex(
            currentFilterMatchIndexRef.current,
            filterMatches.length,
            step
          );

          if (candidateIndex < 0) {
            const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, filterMatches.length);
            applyFilterNavigationSelection({
              currentFilterMatchIndexRef,
              matches: filterMatches,
              navigationFeedback,
              navigateToFilterMatch,
              nextIndex,
              setCurrentFilterMatchIndex,
              setFeedbackMessage,
            });
            return;
          }

          if (candidateIndex >= filterMatches.length && !loadMoreLockRef.current) {
            const appended = await loadMoreFilterMatches();
            if (appended && appended.length > 0) {
              const expandedMatches = [...filterMatches, ...appended];
              const nextIndex = candidateIndex;
              applyFilterNavigationSelection({
                currentFilterMatchIndexRef,
                matches: expandedMatches,
                navigationFeedback,
                navigateToFilterMatch,
                nextIndex,
                setCurrentFilterMatchIndex,
                setFeedbackMessage,
              });
              return;
            }
          }

          const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, filterMatches.length);
          applyFilterNavigationSelection({
            currentFilterMatchIndexRef,
            matches: filterMatches,
            navigationFeedback,
            navigateToFilterMatch,
            nextIndex,
            setCurrentFilterMatchIndex,
            setFeedbackMessage,
          });
          return;
        }

        const filterResult = await executeFilter();
        if (!filterResult || filterResult.matches.length === 0) {
          return;
        }

        const candidateIndex = resolveSearchPanelStepCandidateIndex(
          currentFilterMatchIndexRef.current,
          filterResult.matches.length,
          step
        );
        const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, filterResult.matches.length);

        applyFilterNavigationSelection({
          currentFilterMatchIndexRef,
          matches: filterResult.matches,
          navigationFeedback,
          navigateToFilterMatch,
          nextIndex,
          setCurrentFilterMatchIndex,
          setFeedbackMessage,
        });

        return;
      }

      if (activeTab && keyword && !searchCursorStepCommandUnsupportedRef.current) {
        try {
          const currentSearchMatch = resolveCurrentSearchMatch(
            matches,
            currentMatchIndexRef.current
          );
          const searchCursorStepAnchor = resolveSearchCursorStepAnchor({
            activeCursorPosition,
            currentSearchMatch,
          });
          const stepResultValue = await invoke<unknown>(
            'search_step_from_cursor_in_document',
            buildSearchCursorStepRequest({
              activeTabId: activeTab.id,
              effectiveSearchKeyword,
              searchMode,
              caseSensitive,
              effectiveResultFilterKeyword: backendResultFilterKeyword,
              ...searchCursorStepAnchor,
              step: normalizedStep,
            })
          );

          if (isSearchCursorStepBackendResult(stepResultValue)) {
            searchCursorStepCommandUnsupportedRef.current = false;

            const targetMatch = stepResultValue.targetMatch;
            if (!targetMatch) {
              return;
            }
            applySearchCursorStepResult({
              cachedSearchRef,
              chunkCursorRef,
              currentMatchIndexRef,
              matches,
              setCurrentMatchIndex,
              setMatches,
              setSearchSessionId,
              startTransition,
              targetMatch,
            });
            setErrorMessage(null);
            setFeedbackMessage(navigationFeedback);
            navigateToMatch(targetMatch);
            return;
          }
        } catch (error) {
          if (isMissingInvokeCommandError(error, 'search_step_from_cursor_in_document')) {
            searchCursorStepCommandUnsupportedRef.current = true;
          } else {
            applySearchPanelErrorMessage({
              error,
              prefix: messages.searchFailed,
              setErrorMessage,
            });
            return;
          }
        }
      }

      if (keyword && matches.length > 0) {
        const candidateIndex = resolveSearchPanelStepCandidateIndex(
          currentMatchIndexRef.current,
          matches.length,
          step
        );

        if (candidateIndex < 0) {
          const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, matches.length);
          applySearchNavigationSelection({
            currentMatchIndexRef,
            matches,
            navigationFeedback,
            navigateToMatch,
            nextIndex,
            setCurrentMatchIndex,
            setFeedbackMessage,
          });
          return;
        }

        if (candidateIndex >= matches.length && !loadMoreLockRef.current) {
          const appended = await loadMoreMatches();
          if (appended && appended.length > 0) {
            const expandedMatches = [...matches, ...appended];
            const nextIndex = candidateIndex;
            applySearchNavigationSelection({
              currentMatchIndexRef,
              matches: expandedMatches,
              navigationFeedback,
              navigateToMatch,
              nextIndex,
              setCurrentMatchIndex,
              setFeedbackMessage,
            });
            return;
          }
        }

        const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, matches.length);

        applySearchNavigationSelection({
          currentMatchIndexRef,
          matches,
          navigationFeedback,
          navigateToMatch,
          nextIndex,
          setCurrentMatchIndex,
          setFeedbackMessage,
        });
        return;
      }

      const shouldReverse = step < 0;
      const searchResult = await executeFirstMatchSearch(shouldReverse);
      if (!searchResult || searchResult.matches.length === 0) {
        return;
      }

      const candidateIndex = resolveSearchPanelStepCandidateIndex(
        currentMatchIndexRef.current,
        searchResult.matches.length,
        step
      );
      const nextIndex = resolveSearchPanelWrappedIndex(candidateIndex, searchResult.matches.length);

      applySearchNavigationSelection({
        currentMatchIndexRef,
        matches: searchResult.matches,
        navigationFeedback,
        navigateToMatch,
        nextIndex,
        setCurrentMatchIndex,
        setFeedbackMessage,
      });

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

    const searchResult = applyPreparedReplaceSearchResult({
      keyword,
      noReplaceMatchesMessage: messages.noReplaceMatches,
      rememberSearchKeyword,
      searchResult: await executeSearch(),
      setFeedbackMessage,
    });
    if (!searchResult) {
      return;
    }

    const boundedCurrentIndex = resolveSearchPanelBoundedIndex(currentMatchIndexRef.current, searchResult.matches.length);
    const targetMatch = searchResult.matches[boundedCurrentIndex];

    try {
      const result = await invoke<ReplaceCurrentAndSearchChunkBackendResult>(
        'replace_current_and_search_chunk_in_document',
        buildReplaceCurrentRequest({
          activeTabId: activeTab.id,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          replaceValue,
          parseEscapeSequences,
          targetStart: targetMatch.start,
          targetEnd: targetMatch.end,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
          maxResults: SEARCH_CHUNK_SIZE,
        })
      );

      if (applyReplaceOperationGuard({
        hasReplacement: result.replaced,
        noReplaceMatchesMessage: messages.noReplaceMatches,
        setFeedbackMessage,
      })) {
        return;
      }

      applyReplaceSuccessEffects({
        activeTabId: activeTab.id,
        feedbackMessage: messages.replacedCurrent,
        fallbackLineCount: activeTab.lineCount,
        nextLineCount: result.lineCount,
        rememberReplaceValue,
        replaceValue,
        setErrorMessage,
        setFeedbackMessage,
        updateTab,
      });

      const nextMatch = applyReplaceCurrentSearchResult({
        activeTabId: activeTab.id,
        boundedCurrentIndex,
        cachedSearchRef,
        caseSensitive,
        countCacheRef,
        currentMatchIndexRef,
        chunkCursorRef,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        parseEscapeSequences,
        result,
        searchMode,
        setCurrentMatchIndex,
        setMatches,
        setSearchSessionId,
        setTotalMatchCount,
        setTotalMatchedLineCount,
        startTransition,
      });

      applyReplaceNextMatchNavigation({
        navigateToMatch,
        nextMatch,
      });
    } catch (error) {
      applySearchPanelErrorMessage({
        error,
        prefix: messages.replaceFailed,
        setErrorMessage,
      });
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

    const searchResult = applyPreparedReplaceSearchResult({
      keyword,
      noReplaceMatchesMessage: messages.noReplaceMatches,
      rememberSearchKeyword,
      searchResult: await executeSearch(),
      setFeedbackMessage,
    });
    if (!searchResult) {
      return;
    }

    try {
      const result = await invoke<ReplaceAllAndSearchChunkBackendResult>(
        'replace_all_and_search_chunk_in_document',
        buildReplaceAllRequest({
          activeTabId: activeTab.id,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          replaceValue,
          parseEscapeSequences,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
          maxResults: SEARCH_CHUNK_SIZE,
        })
      );

      const replacedCount = result.replacedCount ?? 0;

      if (applyReplaceOperationGuard({
        hasReplacement: replacedCount > 0,
        noReplaceMatchesMessage: messages.noReplaceMatches,
        setFeedbackMessage,
      })) {
        return;
      }

      applyReplaceSuccessEffects({
        activeTabId: activeTab.id,
        feedbackMessage: messages.replacedAll(replacedCount),
        fallbackLineCount: activeTab.lineCount,
        nextLineCount: result.lineCount,
        rememberReplaceValue,
        replaceValue,
        setErrorMessage,
        setFeedbackMessage,
        updateTab,
      });

      const nextMatch = applyReplaceAllSearchResult({
        activeTabId: activeTab.id,
        cachedSearchRef,
        caseSensitive,
        countCacheRef,
        currentMatchIndexRef,
        chunkCursorRef,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        parseEscapeSequences,
        result,
        searchMode,
        setCurrentMatchIndex,
        setMatches,
        setSearchSessionId,
        setTotalMatchCount,
        setTotalMatchedLineCount,
        startTransition,
      });

      applyReplaceNextMatchNavigation({
        navigateToMatch,
        nextMatch,
      });
    } catch (error) {
      applySearchPanelErrorMessage({
        error,
        prefix: messages.replaceAllFailed,
        setErrorMessage,
      });
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

  const handleKeywordKeyDown = useSearchKeywordKeyDown({
    executeFilter,
    executeSearch,
    isFilterMode,
    isSearching,
    keyword,
    navigateByStep,
    rememberSearchKeyword,
    reverseSearch,
    searchInputRef,
    setIsOpen,
    setResultPanelState,
  });


  const {
    handleDeleteFilterRuleGroup,
    handleExportFilterRuleGroups,
    handleImportFilterRuleGroups,
    handleSaveFilterRuleGroup,
  } = useFilterRuleGroupPersistence({
    filterGroupNameInput,
    filterRulesPayload,
    messages,
    normalizedFilterRuleGroups,
    selectedFilterGroupName,
    setErrorMessage,
    setFeedbackMessage,
    setFilterGroupNameInput,
    setFilterRuleGroups,
    setSelectedFilterGroupName,
  });

  const { searchSidebarBottomOffset, searchSidebarTopOffset } = useSearchPanelShellEffects({
    activeTabId,
    focusSearchInput,
    hasActiveTab: !!activeTab,
    isFilterMode,
    isOpen,
    keyword,
    minimizedResultWrapperRef,
    navigateByStep,
    previousActiveTabIdRef,
    resultPanelState,
    resultPanelWrapperRef,
    reverseSearch,
    setAppliedResultFilterKeyword,
    setErrorMessage,
    setFeedbackMessage,
    setIsOpen,
    setIsResultFilterSearching,
    setPanelMode,
    setResultFilterKeyword,
    setResultPanelState,
    stopResultFilterSearchRef,
  });

  useEffect(() => {
    const restoreRunVersion = sessionRestoreRunVersionRef.current + 1;
    sessionRestoreRunVersionRef.current = restoreRunVersion;

    if (!activeTab) {
      resetSearchPanelForInactiveTab({
        defaultResultPanelHeight: RESULT_PANEL_DEFAULT_HEIGHT,
        defaultSidebarWidth: SEARCH_SIDEBAR_DEFAULT_WIDTH,
        previousActiveTabIdRef,
        resetFilterState,
        resetSearchState,
        setAppliedResultFilterKeyword,
        setCaseSensitive,
        setErrorMessage,
        setFeedbackMessage,
        setIsOpen,
        setIsResultFilterSearching,
        setKeyword,
        setPanelMode,
        setParseEscapeSequences,
        setReplaceValue,
        setResultFilterKeyword,
        setResultPanelHeight,
        setResultPanelState,
        setReverseSearch,
        setSearchMode,
        setSearchSidebarWidth,
        stopResultFilterSearchRef,
      });
      return;
    }

    const nextSnapshot = tabSearchPanelStateRef.current[activeTab.id];
    if (nextSnapshot) {
      const { restoredResultFilterKeyword } = restoreSearchPanelSnapshotState({
        activeTabId: activeTab.id,
        cachedFilterRef,
        cachedSearchRef,
        defaultResultPanelHeight: RESULT_PANEL_DEFAULT_HEIGHT,
        defaultSidebarWidth: SEARCH_SIDEBAR_DEFAULT_WIDTH,
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
        snapshot: nextSnapshot,
      });

      const searchSessionRestoreRequest = buildSearchSessionRestoreRequest({
        activeTabId: activeTab.id,
        restoredResultFilterKeyword,
        searchSessionRestoreCommandUnsupported: searchSessionRestoreCommandUnsupportedRef.current,
        snapshot: nextSnapshot,
      });

      if (searchSessionRestoreRequest) {
        const {
          invokeArgs,
          snapshotCaseSensitive,
          snapshotDocumentVersion,
          snapshotEffectiveKeyword,
          snapshotParseEscapeSequences,
          snapshotSearchMode,
        } = searchSessionRestoreRequest;

        void invoke<unknown>('search_session_restore_in_document', invokeArgs)
          .then((restoreResultValue) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (!isSearchSessionRestoreBackendResult(restoreResultValue)) {
              return;
            }

            applySearchSessionRestoreResult({
              activeTabId: activeTab.id,
              cachedSearchRef,
              chunkCursorRef,
              countCacheRef,
              parseEscapeSequences: snapshotParseEscapeSequences,
              restoreResult: restoreResultValue,
              restoredResultFilterKeyword,
              searchMode: snapshotSearchMode,
              searchSessionRestoreCommandUnsupportedRef,
              setSearchSessionId,
              setTotalMatchCount,
              setTotalMatchedLineCount,
              snapshotCaseSensitive,
              snapshotDocumentVersion,
              snapshotEffectiveKeyword,
            });
          })
          .catch((error) => {
            handleSearchSessionRestoreError({
              error,
              restoreRunVersion,
              searchSessionRestoreCommandUnsupportedRef,
              sessionRestoreRunVersionRef,
            });
          });
      }

      const filterSessionRestoreRequest = buildFilterSessionRestoreRequest({
        activeTabId: activeTab.id,
        filterRulesKey,
        filterRulesPayload,
        filterSessionRestoreCommandUnsupported: filterSessionRestoreCommandUnsupportedRef.current,
        restoredResultFilterKeyword,
        snapshot: nextSnapshot,
      });

      if (filterSessionRestoreRequest) {
        const {
          invokeArgs,
          snapshotFilterDocumentVersion,
        } = filterSessionRestoreRequest;

        void invoke<unknown>('filter_session_restore_in_document', invokeArgs)
          .then((restoreResultValue) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (!isFilterSessionRestoreBackendResult(restoreResultValue)) {
              return;
            }

            applyFilterSessionRestoreResult({
              activeTabId: activeTab.id,
              cachedFilterRef,
              filterCountCacheRef,
              filterLineCursorRef,
              filterRulesKey,
              filterSessionRestoreCommandUnsupportedRef,
              restoreResult: restoreResultValue,
              restoredResultFilterKeyword,
              setFilterSessionId,
              setTotalFilterMatchedLineCount,
              snapshotFilterDocumentVersion,
            });
          })
          .catch((error) => {
            handleFilterSessionRestoreError({
              error,
              filterSessionRestoreCommandUnsupportedRef,
              restoreRunVersion,
              sessionRestoreRunVersionRef,
            });
          });
      }
    } else {
      resetSearchPanelForMissingSnapshot({
        cachedFilterRef,
        cachedSearchRef,
        chunkCursorRef,
        countCacheRef,
        defaultResultPanelHeight: RESULT_PANEL_DEFAULT_HEIGHT,
        defaultSidebarWidth: SEARCH_SIDEBAR_DEFAULT_WIDTH,
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
      });
    }

    finalizeSearchPanelRestoreCycle({
      activeTabId: activeTab.id,
      previousActiveTabIdRef,
      setErrorMessage,
      setFeedbackMessage,
      setIsResultFilterSearching,
      stopResultFilterSearchRef,
    });
  }, [activeTab?.id, resetFilterState, resetSearchState, setFilterSessionId, setSearchSessionId]);

  useSearchPanelSnapshotPersistence({
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
  });

  const handleApplyResultFilter = useSearchApplyResultFilter({
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
    setAppliedResultFilterKeyword,
    setIsResultFilterSearching,
    stopResultFilterSearchRef,
  });

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
          const currentFilterMatch = resolveCurrentFilterMatch(
            filterMatches,
            currentFilterMatchIndexRef.current
          );
          const filterStepAnchor = resolveFilterStepAnchor(currentFilterMatch);

          const stepResult = await invoke<FilterResultFilterStepBackendResult>(
            'step_result_filter_search_in_filter_document',
            buildFilterStepRequest({
              activeTabId: activeTab.id,
              rules: filterRulesPayload,
              resultFilterKeyword: keywordForJump,
              caseSensitive,
              ...filterStepAnchor,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            })
          );
          if (runVersion !== resultFilterStepRunVersionRef.current) {
            return;
          }

          const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
          setTotalFilterMatchedLineCount(totalMatchedLines);
          const filterStepSelection = resolveSearchPanelResultFilterStepSelection({
            batchMatches: stepResult.batchMatches,
            matches: filterMatches,
            targetIndexInBatch: stepResult.targetIndexInBatch,
            targetMatch: stepResult.targetMatch,
            resolveTarget: resolveFilterStepTarget,
          });

          if (filterStepSelection.kind === 'missing-target') {
            return;
          }

          if (filterStepSelection.kind === 'no-match') {
            setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
            return;
          }

          const { nextMatches, targetIndex } = filterStepSelection;
          const documentVersion = stepResult.documentVersion ?? 0;
          applyFilterResultFilterStepResult({
            activeTabId: activeTab.id,
            cachedFilterRef,
            documentVersion,
            filterCountCacheRef,
            filterLineCursorRef,
            filterRulesKey,
            nextLine: stepResult.nextLine ?? null,
            nextMatches,
            resultFilterKeyword: effectiveResultFilterKeyword,
            setFilterMatches,
            setFilterSessionId,
            setTotalFilterMatchedLineCount,
            startTransition,
            totalMatchedLines,
          });
          applyFilterResultFilterSelection({
            currentFilterMatchIndexRef,
            scrollResultItemIntoView,
            setCurrentFilterMatchIndex,
            setErrorMessage,
            setFeedbackMessage,
            targetIndex,
          });
          return;
        }

        if (!keyword) {
          return;
        }

        const currentSearchMatch = resolveCurrentSearchMatch(
          matches,
          currentMatchIndexRef.current
        );
        const searchResultFilterStepAnchor = resolveSearchResultFilterStepAnchor(currentSearchMatch);

        const stepResult = await invoke<SearchResultFilterStepBackendResult>(
          'step_result_filter_search_in_document',
          buildSearchResultFilterStepRequest({
            activeTabId: activeTab.id,
            effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            effectiveResultFilterKeyword: keywordForJump,
            ...searchResultFilterStepAnchor,
            step: normalizedStep,
            maxResults: SEARCH_CHUNK_SIZE,
          })
        );
        if (runVersion !== resultFilterStepRunVersionRef.current) {
          return;
        }

        const totalMatches = stepResult.totalMatches ?? 0;
        const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
        setTotalMatchCount(totalMatches);
        setTotalMatchedLineCount(totalMatchedLines);
        const searchStepSelection = resolveSearchPanelResultFilterStepSelection({
          batchMatches: stepResult.batchMatches,
          matches,
          targetIndexInBatch: stepResult.targetIndexInBatch,
          targetMatch: stepResult.targetMatch,
          resolveTarget: resolveSearchStepTarget,
        });

        if (searchStepSelection.kind === 'missing-target') {
          return;
        }

        if (searchStepSelection.kind === 'no-match') {
          setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
          return;
        }

        const { nextMatches, targetIndex } = searchStepSelection;
        const documentVersion = stepResult.documentVersion ?? 0;
        applySearchResultFilterStepResult({
          activeTabId: activeTab.id,
          cachedSearchRef,
          caseSensitive,
          chunkCursorRef,
          countCacheRef,
          documentVersion,
          effectiveResultFilterKeyword,
          effectiveSearchKeyword,
          nextMatches,
          nextOffset: stepResult.nextOffset ?? null,
          parseEscapeSequences,
          searchMode,
          setMatches,
          setSearchSessionId,
          setTotalMatchCount,
          setTotalMatchedLineCount,
          startTransition,
          totalMatchedLines,
          totalMatches,
        });
        applySearchResultFilterSelection({
          currentMatchIndexRef,
          scrollResultItemIntoView,
          setCurrentMatchIndex,
          setErrorMessage,
          setFeedbackMessage,
          targetIndex,
        });
        return;
      } catch (error) {
        if (runVersion !== resultFilterStepRunVersionRef.current) {
          return;
        }
        applySearchPanelErrorMessage({
          error,
          prefix: messages.searchFailed,
          setErrorMessage,
        });
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
  const {
    copyPlainTextResults,
    displayTotalFilterMatchedLineCount,
    displayTotalFilterMatchedLineCountText,
    displayTotalMatchCount,
    displayTotalMatchCountText,
    displayTotalMatchedLineCountText,
    filterToggleLabel,
    handleClearResultFilter,
    handleCloseResultPanel,
    handleRefreshResults,
    handleReopenResultPanel,
    handleResultFilterAction,
    handleResultFilterNext,
    handleResultFilterPrev,
    handleResultPanelResizeMouseDown,
    hasAppliedResultFilterKeyword,
    plainTextResultEntries,
    resultToggleTitle,
    toggleResultPanelAndRefresh,
  } = useSearchResultPanelState({
    cancelPendingBatchLoad,
    executeFilter,
    executeSearch,
    filterRulesPayloadLength: filterRulesPayload.length,
    isFilterMode,
    isResultFilterSearching,
    isSearching,
    keyword,
    messages,
    navigateResultFilterByStep,
    onApplyResultFilter: handleApplyResultFilter,
    rememberSearchKeyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultPanelHeight,
    resultPanelState,
    setAppliedResultFilterKeyword,
    setErrorMessage,
    setFeedbackMessage,
    setResultFilterKeyword,
    setResultPanelHeight,
    setResultPanelState,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
    visibleFilterMatches,
    visibleMatches,
  });

  const searchPanelOverlaysOptions = useSearchPanelOverlayOptions({
    cancelPendingBatchLoad,
    copyLabel: inputContextCopyLabel,
    copyPlainTextResults,
    cutLabel: inputContextCutLabel,
    displayTotalFilterMatchedLineCountText,
    displayTotalMatchCountText,
    displayTotalMatchedLineCountText,
    errorMessage,
    filterMatches,
    filterRulesPayloadLength: filterRulesPayload.length,
    fontFamily,
    handleClearResultFilter,
    handleCloseResultPanel,
    handleInputContextMenuAction,
    handleRefreshResults,
    handleReopenResultPanel,
    handleResultFilterAction,
    handleResultFilterNext,
    handleResultFilterPrev,
    handleResultListScroll,
    handleResultPanelResizeMouseDown,
    handleSelectMatch,
    hasAppliedResultFilterKeyword,
    hasMoreFilterMatches,
    hasMoreMatches,
    inputContextMenu,
    inputContextMenuRef,
    isFilterMode,
    isResultFilterActive,
    isResultFilterSearching,
    isSearching,
    keyword,
    matches,
    messages,
    minimizedResultWrapperRef,
    pasteLabel: inputContextPasteLabel,
    plainTextResultEntryCount: plainTextResultEntries.length,
    requestStopResultFilterSearch,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultListRef,
    resultListTextStyle,
    resultPanelHeight,
    resultPanelState,
    resultPanelWrapperRef,
    setResultFilterKeyword,
    setResultPanelState,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  });

  const searchSidebarShellOptions = useSearchSidebarShellOptions({
    currentFilterMatchIndex,
    currentMatchIndex,
    displayTotalFilterMatchedLineCount,
    displayTotalMatchCount,
    errorMessage,
    feedbackMessage,
    filterMatches,
    focusSearchInput,
    hasConfiguredFilterRules: effectiveFilterRules.length > 0,
    isFilterMode,
    isOpen,
    isSearchSidebarResizing,
    isSearchUiActive,
    isSearching,
    keyword,
    matches,
    messages,
    panelMode,
    searchSidebarBottomOffset,
    searchSidebarContainerRef,
    searchSidebarTopOffset,
    searchSidebarWidth,
    setIsOpen,
    setPanelMode,
    onBlurCapture: handleSearchUiBlurCapture,
    onContextMenu: handleSearchSidebarContextMenu,
    onFocusCapture: handleSearchUiFocusCapture,
    onPointerDownCapture: handleSearchUiPointerDownCapture,
    onResizePointerDown: startSearchSidebarResize,
  });

  const filterRulesEditorOptions = useFilterRulesEditorOptions({
    effectiveFilterRules,
    filterGroupNameInput,
    filterRuleDragState,
    filterRules,
    filterToggleLabel,
    handleDeleteFilterRuleGroup,
    handleExportFilterRuleGroups,
    handleImportFilterRuleGroups,
    handleSaveFilterRuleGroup,
    hasAnyConfiguredFilterRule,
    messages,
    normalizedFilterRuleGroups,
    onAddFilterRule: addFilterRule,
    onFilterGroupNameInputChange: setFilterGroupNameInput,
    onKeywordKeyDown: handleKeywordKeyDown,
    onLoadFilterRuleGroup: handleLoadFilterRuleGroup,
    onMoveFilterRule: moveFilterRule,
    onRemoveFilterRule: removeFilterRule,
    onRuleDragEnd: onFilterRuleDragEnd,
    onRuleDragOver: onFilterRuleDragOver,
    onRuleDragStart: onFilterRuleDragStart,
    onRuleDrop: onFilterRuleDrop,
    onSelectedFilterGroupChange: handleSelectedFilterGroupChange,
    onToggleResultPanelAndRefresh: toggleResultPanelAndRefresh,
    onUpdateFilterRule: updateFilterRule,
    onClearFilterRules: clearFilterRules,
    selectedFilterGroupName,
    setFilterGroupNameInput,
  });

  const searchQueryOptions = useSearchQueryOptions({
    caseSensitive,
    handleKeywordKeyDown,
    handleReplaceAll,
    handleReplaceCurrent,
    isReplaceMode,
    keyword,
    messages,
    navigateByStep,
    parseEscapeSequences,
    recentReplaceValues,
    recentSearchKeywords,
    replaceValue,
    resetSearchState,
    resultToggleTitle,
    reverseSearch,
    searchInputRef,
    searchMode,
    setCaseSensitive,
    setErrorMessage,
    setFeedbackMessage,
    setKeyword,
    setParseEscapeSequences,
    setReplaceValue,
    setReverseSearch,
    setSearchMode,
    toggleResultPanelAndRefresh,
  });

  const { searchSidebarBodyProps, searchSidebarChromeProps, searchPanelOverlaysProps } = useSearchPanelViewProps({
    hasActiveTab: !!activeTab,
    searchQueryOptions,
    filterRulesEditorOptions,
    searchSidebarShellOptions,
    searchPanelOverlaysOptions,
  });
  if (!activeTab) {
    return null;
  }

  return (
    <>
      <SearchSidebarChrome {...searchSidebarChromeProps}>
        <SearchSidebarBody {...searchSidebarBodyProps} />
      </SearchSidebarChrome>

      <SearchPanelOverlays {...searchPanelOverlaysProps} />
    </>
  );
}


