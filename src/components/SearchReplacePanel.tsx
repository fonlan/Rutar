import { invoke } from '@tauri-apps/api/core';
import {
  startTransition,
  useCallback,
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
import { useSearchResultFilterStepNavigation } from '@/components/search-panel/useSearchResultFilterStepNavigation';
import { useSearchStepNavigation } from '@/components/search-panel/useSearchStepNavigation';
import { useSearchReplaceHandlers } from '@/components/search-panel/useSearchReplaceHandlers';
import { useSearchFirstMatchSearch } from '@/components/search-panel/useSearchFirstMatchSearch';
import { useSearchPanelRestoreEffect } from '@/components/search-panel/useSearchPanelRestoreEffect';
import { isSearchPanelRunStale, runSearchPanelAsyncOperation, runSearchPanelVersionedAsyncOperation } from '@/components/search-panel/searchPanelRunLifecycle';
import { resolveFilterRunStartState, resolveSearchRunStartState } from '@/components/search-panel/resolveSearchPanelRunStartState';
import { resolveCachedFilterRunHit, resolveCachedSearchRunHit } from '@/components/search-panel/resolveSearchPanelCachedRunHit';
import { applyCachedFilterCountHit, applyCachedSearchCountHit, applyFilterCountResult, applySearchCountResult, handleFilterCountFailure, handleSearchCountFailure } from '@/components/search-panel/applySearchPanelCountResults';
import { applyFilterRunResult, applySearchRunResult, createFilterRunSuccessResult, createSearchRunSuccessResult } from '@/components/search-panel/applySearchPanelRunResults';
import { createEmptyFilterRunResult, createEmptySearchRunResult, createFilterRunFailureResult, createSearchRunFailureResult } from '@/components/search-panel/createSearchPanelRunFallbacks';
import { buildFilterCountRequest, buildSearchCountRequest } from '@/components/search-panel/buildSearchPanelRunRequests';
import { matchesSearchPanelDocumentVersion } from '@/components/search-panel/readSearchPanelDocumentVersion';
import { matchesSearchPanelFilterCacheIdentity, matchesSearchPanelSearchCacheIdentity } from '@/components/search-panel/matchesSearchPanelCacheIdentity';
import { useSearchPanelResetState } from '@/components/search-panel/useSearchPanelResetState';
import { useSearchBatchControl } from '@/components/search-panel/useSearchBatchControl';
import { useSearchSidebarShellOptions } from '@/components/search-panel/useSearchSidebarShellOptions';
import { useSearchPanelShellEffects } from '@/components/search-panel/useSearchPanelShellEffects';
import { useSearchPanelViewProps } from '@/components/search-panel/useSearchPanelViewProps';
import { useSearchQueryOptions } from '@/components/search-panel/useSearchQueryOptions';
import { useSearchResultPanelState } from '@/components/search-panel/useSearchResultPanelState';
import { useSearchSessionLifecycle } from '@/components/search-panel/useSearchSessionLifecycle';
import { useSearchResultsViewport } from '@/components/search-panel/useSearchResultsViewport';
import { useSearchPanelLoadMoreHandlers } from '@/components/search-panel/useSearchPanelLoadMoreHandlers';
import { useSearchSidebarFrame } from '@/components/search-panel/useSearchSidebarFrame';
import { useSearchPanelStoreState } from '@/components/search-panel/useSearchPanelStoreState';
import type {
  FilterCountBackendResult,
  FilterRunResult,
  SearchCountBackendResult,
  SearchRunResult,
} from '@/components/search-panel/types';
import {
  FILTER_CHUNK_SIZE,
  SEARCH_CHUNK_SIZE,
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
      if (matchesSearchPanelSearchCacheIdentity(cached, {
        tabId: activeTab.id,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: effectiveResultFilterKeyword,
      })) {
        if (await matchesSearchPanelDocumentVersion({
          activeTabId: activeTab.id,
          cachedDocumentVersion: cached.documentVersion,
          warnLabel: 'Failed to read document version for count:',
        })) {
          applyCachedSearchCountHit({
            cached,
            setTotalMatchCount,
            setTotalMatchedLineCount,
          });
          return;
        }
      }
    }

    return runSearchPanelVersionedAsyncOperation({
      runVersionRef: countRunVersionRef,
      run: () => invoke<SearchCountBackendResult>(
        'search_count_in_document',
        buildSearchCountRequest({
          activeTabId: activeTab.id,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          effectiveResultFilterKeyword,
        })
      ),
      applyResult: (result) => {
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
      },
      handleError: (error) => {
        handleSearchCountFailure({
          error,
          setTotalMatchCount,
          setTotalMatchedLineCount,
        });
      },
    });
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
      if (matchesSearchPanelFilterCacheIdentity(cached, {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
      })) {
        if (await matchesSearchPanelDocumentVersion({
          activeTabId: activeTab.id,
          cachedDocumentVersion: cached.documentVersion,
          warnLabel: 'Failed to read document version for filter count:',
        })) {
          applyCachedFilterCountHit({
            cached,
            setTotalFilterMatchedLineCount,
          });
          return;
        }
      }
    }

    return runSearchPanelVersionedAsyncOperation({
      runVersionRef: filterCountRunVersionRef,
      run: () => invoke<FilterCountBackendResult>(
        'filter_count_in_document',
        buildFilterCountRequest({
          activeTabId: activeTab.id,
          rules: filterRulesPayload,
          effectiveResultFilterKeyword,
          caseSensitive,
        })
      ),
      applyResult: (result) => {
        applyFilterCountResult({
          activeTabId: activeTab.id,
          effectiveResultFilterKeyword,
          filterCountCacheRef,
          filterRulesKey,
          result,
          setTotalFilterMatchedLineCount,
        });
      },
      handleError: (error) => {
        handleFilterCountFailure({
          error,
          setTotalFilterMatchedLineCount,
        });
      },
    });
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
      const cachedResult = await resolveCachedSearchRunHit({
        activeTabId: activeTab.id,
        cached: cachedSearchRef.current,
        caseSensitive,
        chunkCursorRef,
        effectiveResultFilterKeyword,
        effectiveSearchKeyword,
        parseEscapeSequences,
        searchMode,
        setCurrentMatchIndex,
        setErrorMessage,
        setMatches,
        setSearchSessionId,
        startTransition,
      });
      if (cachedResult) {
        return cachedResult;
      }
    }

    return runSearchPanelAsyncOperation({
      runVersionRef,
      setIsSearching,
      silent,
      run: async (runVersion) => {
        const {
          documentVersion,
          nextMatches,
          nextOffset,
          sessionId,
          shouldRunCountFallback,
          totalMatchedLines,
          totalMatches,
        } = await resolveSearchRunStartState({
          activeTabId: activeTab.id,
          caseSensitive,
          effectiveResultFilterKeyword,
          effectiveSearchKeyword,
          maxResults: SEARCH_CHUNK_SIZE,
          searchMode,
          searchSessionCommandUnsupportedRef,
        });

        if (isSearchPanelRunStale({ runVersion, runVersionRef })) {
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

        return createSearchRunSuccessResult({
          matches: nextMatches,
          documentVersion,
          nextOffset,
        });
      },
      handleError: (error, runVersion) => {
        if (isSearchPanelRunStale({ runVersion, runVersionRef })) {
          return null;
        }

        return createSearchRunFailureResult({
          error,
          resetSearchState,
          searchFailedLabel: messages.searchFailed,
          setErrorMessage,
        });
      },
    });
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
      const cachedResult = await resolveCachedFilterRunHit({
        activeTabId: activeTab.id,
        cached: cachedFilterRef.current,
        effectiveResultFilterKeyword,
        filterLineCursorRef,
        filterRulesKey,
        setCurrentFilterMatchIndex,
        setErrorMessage,
        setFilterMatches,
        setFilterSessionId,
        startTransition,
      });
      if (cachedResult) {
        return cachedResult;
      }
    }

    return runSearchPanelAsyncOperation({
      runVersionRef: filterRunVersionRef,
      setIsSearching,
      silent,
      run: async (runVersion) => {
        const {
          documentVersion,
          nextLine,
          nextMatches,
          sessionId,
          shouldRunCountFallback,
          totalMatchedLines,
        } = await resolveFilterRunStartState({
          activeTabId: activeTab.id,
          caseSensitive,
          effectiveResultFilterKeyword,
          filterSessionCommandUnsupportedRef,
          maxResults: FILTER_CHUNK_SIZE,
          rules: filterRulesPayload,
        });

        if (isSearchPanelRunStale({ runVersion, runVersionRef: filterRunVersionRef })) {
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

        return createFilterRunSuccessResult({
          matches: nextMatches,
          documentVersion,
          nextLine,
        });
      },
      handleError: (error, runVersion) => {
        if (isSearchPanelRunStale({ runVersion, runVersionRef: filterRunVersionRef })) {
          return null;
        }

        return createFilterRunFailureResult({
          error,
          filterFailedLabel: messages.filterFailed,
          resetFilterState,
          setErrorMessage,
        });
      },
    });
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

  const {
    loadMoreMatches,
    loadMoreFilterMatches,
  } = useSearchPanelLoadMoreHandlers({
    activeTabId,
    backendResultFilterKeyword,
    cachedFilterRef,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    effectiveSearchKeyword,
    filterFailedLabel: messages.filterFailed,
    filterLineCursorRef,
    filterRulesKey,
    filterRulesPayload,
    filterSessionCommandUnsupportedRef,
    filterSessionIdRef,
    isFilterMode,
    loadMoreLockRef,
    loadMoreSessionRef,
    parseEscapeSequences,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    searchSessionCommandUnsupportedRef,
    searchSessionIdRef,
    setErrorMessage,
    setFilterMatches,
    setFilterSessionId,
    setIsSearching,
    setMatches,
    setSearchSessionId,
    startTransition,
  });

  const executeFirstMatchSearch = useSearchFirstMatchSearch({
    activeTabId: activeTab?.id ?? null,
    backendResultFilterKeyword,
    cachedSearchRef,
    cancelPendingBatchLoad,
    caseSensitive,
    chunkCursorRef,
    effectiveSearchKeyword,
    executeSearch,
    isFilterMode,
    keyword,
    parseEscapeSequences,
    resetSearchState,
    runVersionRef,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    setCurrentMatchIndex,
    setErrorMessage,
    setIsSearching,
    setMatches,
    setSearchSessionId,
    startTransition,
  });

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

  const navigateByStep = useSearchStepNavigation({
    activeCursorPosition,
    activeTabId: activeTab?.id ?? null,
    backendResultFilterKeyword,
    cachedFilterRef,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    effectiveSearchKeyword,
    executeFilter,
    executeFirstMatchSearch,
    filterCountCacheRef,
    filterLineCursorRef,
    filterMatches,
    filterRulesKey,
    filterRulesPayload,
    filterStepCommandUnsupportedRef,
    filterFailedLabel: messages.filterFailed,
    isFilterMode,
    keyword,
    loadMoreFilterMatches,
    loadMoreLockRef,
    loadMoreMatches,
    matches,
    navigateToFilterMatch,
    navigateToMatch,
    nextMatchLabel: messages.nextMatch,
    prevMatchLabel: messages.prevMatch,
    rememberSearchKeyword,
    searchCursorStepCommandUnsupportedRef,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterSessionId,
    setMatches,
    setSearchSessionId,
    setTotalFilterMatchedLineCount,
    startTransition,
  });

  const { handleReplaceAll, handleReplaceCurrent } = useSearchReplaceHandlers({
    activeTabId: activeTab?.id ?? null,
    activeTabLineCount: activeTab?.lineCount ?? null,
    backendResultFilterKeyword,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    countCacheRef,
    currentMatchIndexRef,
    effectiveSearchKeyword,
    executeSearch,
    keyword,
    navigateToMatch,
    noReplaceMatchesMessage: messages.noReplaceMatches,
    parseEscapeSequences,
    rememberReplaceValue,
    rememberSearchKeyword,
    replaceAllFailedLabel: messages.replaceAllFailed,
    replaceCurrentFeedback: messages.replacedCurrent,
    replaceFailedLabel: messages.replaceFailed,
    replacedAllFeedback: messages.replacedAll,
    replaceValue,
    searchMode,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setMatches,
    setSearchSessionId,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    startTransition,
    updateTab,
  });

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

  useSearchPanelRestoreEffect({
    activeTabId: activeTab?.id ?? null,
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    filterCountCacheRef,
    filterLineCursorRef,
    filterRulesKey,
    filterRulesPayload,
    filterSessionRestoreCommandUnsupportedRef,
    previousActiveTabIdRef,
    resetFilterState,
    resetSearchState,
    searchSessionRestoreCommandUnsupportedRef,
    sessionRestoreRunVersionRef,
    setAppliedResultFilterKeyword,
    setCaseSensitive,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterSessionId,
    setIsOpen,
    setIsResultFilterSearching,
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
    stopResultFilterSearchRef,
    tabSearchPanelStateRef,
  });

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

  const navigateResultFilterByStep = useSearchResultFilterStepNavigation({
    activeTabId: activeTab?.id ?? null,
    cachedFilterRef,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    countCacheRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    effectiveSearchKeyword,
    filterCountCacheRef,
    filterLineCursorRef,
    filterMatches,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    isResultFilterSearching,
    isSearching,
    keyword,
    loadMoreLockRef,
    matches,
    parseEscapeSequences,
    resultFilterKeyword,
    resultFilterStepNoMatch: messages.resultFilterStepNoMatch,
    resultFilterStepRunVersionRef,
    scrollResultItemIntoView,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterSessionId,
    setIsSearching,
    setMatches,
    setResultFilterStepLoadingDirection,
    setSearchSessionId,
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    startTransition,
  });

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


