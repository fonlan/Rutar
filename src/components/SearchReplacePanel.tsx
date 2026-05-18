import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ComponentProps } from 'react';
import { CrossFileReplaceDialog } from '@/components/search-panel/CrossFileReplaceDialog';
import { CrossFileResultsPanel } from '@/components/search-panel/CrossFileResultsPanel';
import type { FilterRulesEditorProps } from '@/components/search-panel/FilterRulesEditor';
import type { PathSearchMatch } from '@/components/search-panel/types';
import { evaluateCrossFileTarget } from '@/components/search-panel/crossFileTarget';
import { openFilePath } from '@/lib/openFile';
import { useStore } from '@/store/useStore';
import {
  SearchSidebarBody,
  SearchPanelOverlays,
  SearchSidebarChrome,
  useCrossFileSearch,
  useFilterRules,
  useSearchInput,
  useSearchPanelChrome,
  useSearchKeywordKeyDown,
  useSearchNavigation,
  useSearchResultFilterStepNavigation,
  useSearchReplace,
  useSearchExecution,
  useSearchQuerySectionProps,
  useSearchResultPanel,
  useSearchSidebarFrame,
  useSearchPanelStore,
  useSearchTargetPicker,
} from '@/components/search-panel';
export function SearchReplacePanel() {
  const {
    // Zustand selectors
    activeCursorPosition,
    activeTab,
    activeTabId,
    fontFamily,
    recentReplaceValues,
    recentSearchKeywords,
    setCursorPosition,
    updateSettings,
    updateTab,
    // Local state
    appliedResultFilterKeyword,
    caseSensitive,
    currentFilterMatchIndex,
    currentMatchIndex,
    errorMessage,
    feedbackMessage,
    filterMatches,
    includeSubdirectories,
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
    // Setters
    setAppliedResultFilterKeyword,
    setCaseSensitive,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterRuleGroups,
    setIncludeSubdirectories,
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
    // Session lifecycle
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
  } = useSearchPanelStore();

  const safeActiveTabId = activeTab?.id ?? null;

  const crossFileDecision = useMemo(
    () => evaluateCrossFileTarget(searchTarget, activeTab?.path ?? null),
    [searchTarget, activeTab?.path],
  );
  const isCrossFileMode = crossFileDecision.isCrossFile && !isFilterMode;
  const showIncludeSubdirectoriesToggle = isCrossFileMode && !crossFileDecision.hasWildcard;
  const includeSubdirectoriesDisabled = crossFileDecision.hasRecursiveGlob;
  const effectiveIncludeSubdirectories =
    crossFileDecision.hasWildcard || !isCrossFileMode ? false : includeSubdirectories;

  const {
    matches: crossFileMatches,
    totalFiles: crossFileTotalFiles,
    scannedFiles: crossFileScannedFiles,
    completed: crossFileCompleted,
    isSearching: crossFileIsSearching,
    isLoadingMore: crossFileIsLoadingMore,
    errorMessage: crossFileErrorMessage,
    fileErrors: crossFileFileErrors,
    hasRunOnce: crossFileHasRunOnce,
    runSearch: runCrossFileSearchInternal,
    loadMore: loadMoreCrossFileMatches,
    reset: resetCrossFileSearch,
  } = useCrossFileSearch({
    searchFailedLabel: messages.searchFailed,
  });

  useEffect(() => {
    if (!isCrossFileMode) {
      resetCrossFileSearch();
    }
  }, [isCrossFileMode, resetCrossFileSearch]);

  const runCrossFileSearch = useCallback(async () => {
    await runCrossFileSearchInternal({
      target: searchTarget,
      keyword,
      searchMode,
      caseSensitive,
      includeSubdirectories: effectiveIncludeSubdirectories,
    });
  }, [
    caseSensitive,
    effectiveIncludeSubdirectories,
    keyword,
    runCrossFileSearchInternal,
    searchMode,
    searchTarget,
  ]);

  const handleSelectCrossFileMatch = useCallback(
    async (match: PathSearchMatch) => {
      try {
        await openFilePath(match.filePath);
      } catch (error) {
        console.warn('Failed to open file from cross-file result:', error);
        return;
      }
      const state = useStore.getState();
      const tabId = state.activeTabId;
      if (!tabId) {
        return;
      }
      state.setCursorPosition(tabId, match.line, match.column);
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId,
            line: match.line,
            column: match.column,
            length: 0,
            lineText: match.lineText,
            occludedRightPx: 0,
            source: 'cross-file-search',
          },
        }),
      );
    },
    [],
  );

  const [isCrossFileReplaceDialogOpen, setIsCrossFileReplaceDialogOpen] = useState(false);

  const closeCrossFileReplaceDialog = useCallback(() => {
    setIsCrossFileReplaceDialogOpen(false);
  }, []);

  useEffect(() => {
    if (!isCrossFileMode) {
      setIsCrossFileReplaceDialogOpen(false);
    }
  }, [isCrossFileMode]);

  const crossFileResultsProps = useMemo<ComponentProps<typeof CrossFileResultsPanel>>(
    () => ({
      matches: crossFileMatches,
      totalFiles: crossFileTotalFiles,
      scannedFiles: crossFileScannedFiles,
      completed: crossFileCompleted,
      isSearching: crossFileIsSearching,
      isLoadingMore: crossFileIsLoadingMore,
      errorMessage: crossFileErrorMessage,
      fileErrors: crossFileFileErrors,
      hasRunOnce: crossFileHasRunOnce,
      keyword,
      resultListTextStyle,
      messages,
      onLoadMore: () => void loadMoreCrossFileMatches(),
      onSelectMatch: (match) => void handleSelectCrossFileMatch(match),
    }),
    [
      crossFileCompleted,
      crossFileErrorMessage,
      crossFileFileErrors,
      crossFileHasRunOnce,
      crossFileIsLoadingMore,
      crossFileIsSearching,
      crossFileMatches,
      crossFileScannedFiles,
      crossFileTotalFiles,
      handleSelectCrossFileMatch,
      keyword,
      loadMoreCrossFileMatches,
      messages,
      resultListTextStyle,
    ],
  );

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
    focusSearchInput,
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextMenu,
    inputContextMenuRef,
    rememberReplaceValue,
    rememberSearchKeyword,
  } = useSearchInput({
    isOpen,
    recentReplaceValues,
    recentSearchKeywords,
    searchInputRef,
    updateSettings,
  });

  const {
    addFilterRule,
    clearFilterRules,
    effectiveFilterRules,
    filterGroupNameInput,
    filterRuleDragState,
    filterRules,
    filterRulesKey,
    filterRulesPayload,
    handleDeleteFilterRuleGroup,
    handleExportFilterRuleGroups,
    handleImportFilterRuleGroups,
    handleLoadFilterRuleGroup,
    handleSaveFilterRuleGroup,
    handleSelectedFilterGroupChange,
    hasAnyConfiguredFilterRule,
    moveFilterRule,
    onFilterRuleDragEnd,
    onFilterRuleDragOver,
    onFilterRuleDragStart,
    onFilterRuleDrop,
    removeFilterRule,
    selectedFilterGroupName,
    setFilterGroupNameInput,
    updateFilterRule,
  } = useFilterRules({
    messages,
    normalizedFilterRuleGroups,
    resetFilterState,
    setErrorMessage,
    setFeedbackMessage,
    setFilterRuleGroups,
  });

  const {
    cancelPendingBatchLoad,
    executeFilter,
    executeFirstMatchSearch,
    executeSearch,
    loadMoreFilterMatches,
    loadMoreMatches,
    requestStopResultFilterSearch,
  } = useSearchExecution({
    activeTabId: safeActiveTabId,
    appliedResultFilterKeyword,
    backendResultFilterKeyword,
    cachedFilterRef,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    countCacheRef,
    currentFilterMatchIndex,
    currentMatchIndex,
    effectiveSearchKeyword,
    filterCountCacheRef,
    filterFailedLabel: messages.filterFailed,
    filterLineCursorRef,
    filterMatches,
    filterRulesKey,
    filterRulesPayload,
    filterRunVersionRef,
    filterSessionIdRef,
    isFilterMode,
    isOpen,
    keyword,
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    matches,
    panelMode,
    parseEscapeSequences,
    previousActiveTabIdRef,
    replaceValue,
    resetFilterState,
    resetSearchState,
    resultFilterKeyword,
    resultFilterStepRunVersionRef,
    resultPanelHeight,
    resultPanelState,
    reverseSearch,
    runVersionRef,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    searchSessionIdRef,
    searchSidebarWidth,
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
    setSearchSessionId,
    setSearchSidebarWidth,
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    startTransition,
    stopResultFilterSearchRef,
    tabSearchPanelStateRef,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  });

  const hasMoreMatches = chunkCursorRef.current !== null;
  const hasMoreFilterMatches = filterLineCursorRef.current !== null;

  const {
    handleApplyResultFilter,
    handleSelectMatch,
    navigateByStep,
    navigateToMatch,
  } = useSearchNavigation({
    activeCursorPosition,
    activeTabId: safeActiveTabId,
    appliedResultFilterKeyword,
    backendResultFilterKeyword,
    cachedFilterRef,
    cachedSearchRef,
    cancelPendingBatchLoad,
    caseSensitive,
    chunkCursorRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    effectiveSearchKeyword,
    executeFilter,
    executeFirstMatchSearch,
    executeSearch,
    filterCountCacheRef,
    filterLineCursorRef,
    filterMatches,
    filterRulesKey,
    filterRulesPayload,
    filterFailedLabel: messages.filterFailed,
    getSearchSidebarOccludedRightPx,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    loadMoreFilterMatches,
    loadMoreLockRef,
    loadMoreMatches,
    matches,
    nextMatchLabel: messages.nextMatch,
    prevMatchLabel: messages.prevMatch,
    rememberSearchKeyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
    searchFailedLabel: messages.searchFailed,
    searchMode,
    setAppliedResultFilterKeyword,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setCursorPosition,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterSessionId,
    setIsResultFilterSearching,
    setMatches,
    setSearchSessionId,
    setTotalFilterMatchedLineCount,
    startTransition,
    stopResultFilterSearchRef,
  });

  const { handleReplaceAll: handleInDocumentReplaceAll, handleReplaceCurrent } = useSearchReplace({
    activeTabId: safeActiveTabId,
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

  const crossFileReplaceAllHandler = useCallback(async () => {
    if (isCrossFileMode) {
      if (!keyword) {
        setFeedbackMessage(null);
        setErrorMessage(messages.noReplaceMatches);
        return;
      }
      setErrorMessage(null);
      setFeedbackMessage(null);
      setIsCrossFileReplaceDialogOpen(true);
      return;
    }
    await handleInDocumentReplaceAll();
  }, [
    handleInDocumentReplaceAll,
    isCrossFileMode,
    keyword,
    messages.noReplaceMatches,
    setErrorMessage,
    setFeedbackMessage,
  ]);

  const handleCrossFileReplaceCompleted = useCallback(
    ({
      totalReplaced,
      filesChanged,
      fileErrors,
    }: {
      totalReplaced: number;
      filesChanged: number;
      fileErrors: { filePath: string; error: string }[];
    }) => {
      setErrorMessage(null);
      if (fileErrors.length > 0) {
        setFeedbackMessage(
          messages.crossFileReplaceSuccessWithErrors(totalReplaced, filesChanged, fileErrors.length),
        );
      } else {
        setFeedbackMessage(messages.crossFileReplaceSuccess(totalReplaced, filesChanged));
      }

      void runCrossFileSearch();
    },
    [
      messages,
      runCrossFileSearch,
      setErrorMessage,
      setFeedbackMessage,
    ],
  );

  const handleCrossFileReplaceError = useCallback(
    (message: string) => {
      setFeedbackMessage(null);
      setErrorMessage(`${messages.crossFileReplaceFailed}: ${message}`);
    },
    [messages.crossFileReplaceFailed, setErrorMessage, setFeedbackMessage],
  );

  const handleKeywordKeyDown = useSearchKeywordKeyDown({
    executeFilter,
    executeSearch,
    isCrossFileMode,
    isFilterMode,
    isSearching,
    keyword,
    navigateByStep,
    rememberSearchKeyword,
    reverseSearch,
    runCrossFileSearch,
    searchInputRef,
    setIsOpen,
    setResultPanelState,
  });

  const navigateResultFilterByStepRef = useRef<((step: number) => Promise<void>) | null>(null);

  const {
    copyPlainTextResultEntries,
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
    handleResultListScroll,
    handleResultPanelResizeMouseDown,
    hasAppliedResultFilterKeyword,
    plainTextResultEntries,
    resultToggleTitle,
    scrollResultItemIntoView,
    toggleResultPanelAndRefresh,
  } = useSearchResultPanel({
    cancelPendingBatchLoad,
    executeFilter,
    executeSearch,
    filterMatchesLength: filterMatches.length,
    filterRulesPayloadLength: filterRulesPayload.length,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isOpen,
    isResultFilterSearching,
    isSearching,
    keyword,
    loadMoreDebounceRef,
    loadMoreFilterMatches,
    loadMoreLockRef,
    loadMoreMatches,
    matchesLength: matches.length,
    messages,
    navigateResultFilterByStepRef,
    onApplyResultFilter: handleApplyResultFilter,
    rememberSearchKeyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultListRef,
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

  const navigateResultFilterByStep = useSearchResultFilterStepNavigation({
    activeTabId: safeActiveTabId,
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

  navigateResultFilterByStepRef.current = navigateResultFilterByStep;

  const filterRulesEditorProps = useMemo<FilterRulesEditorProps>(
    () => ({
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
    }),
    [
      addFilterRule,
      clearFilterRules,
      effectiveFilterRules,
      filterGroupNameInput,
      filterRuleDragState,
      filterRules,
      filterToggleLabel,
      handleDeleteFilterRuleGroup,
      handleExportFilterRuleGroups,
      handleImportFilterRuleGroups,
      handleKeywordKeyDown,
      handleLoadFilterRuleGroup,
      handleSaveFilterRuleGroup,
      handleSelectedFilterGroupChange,
      hasAnyConfiguredFilterRule,
      messages,
      moveFilterRule,
      normalizedFilterRuleGroups,
      onFilterRuleDragEnd,
      onFilterRuleDragOver,
      onFilterRuleDragStart,
      onFilterRuleDrop,
      removeFilterRule,
      selectedFilterGroupName,
      setFilterGroupNameInput,
      toggleResultPanelAndRefresh,
      updateFilterRule,
    ]
  );

  const { handlePickSearchTargetFile, handlePickSearchTargetFolder } = useSearchTargetPicker({
    currentTarget: searchTarget,
    pickFileTitle: messages.searchTargetPickFile,
    pickFolderTitle: messages.searchTargetPickFolder,
    setErrorMessage,
    setFeedbackMessage,
    setSearchTarget,
  });

  const searchQuerySectionProps = useSearchQuerySectionProps({
    canReplace: !!activeTab,
    caseSensitive,
    handleKeywordKeyDown,
    handlePickSearchTargetFile,
    handlePickSearchTargetFolder,
    handleReplaceAll: crossFileReplaceAllHandler,
    handleReplaceCurrent,
    includeSubdirectories: effectiveIncludeSubdirectories,
    includeSubdirectoriesDisabled,
    isCrossFileMode,
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
    searchTarget,
    setCaseSensitive,
    setErrorMessage,
    setFeedbackMessage,
    setIncludeSubdirectories,
    setKeyword,
    setParseEscapeSequences,
    setReplaceValue,
    setReverseSearch,
    setSearchMode,
    setSearchTarget,
    showIncludeSubdirectoriesToggle,
    toggleResultPanelAndRefresh,
  });

  const {
    searchPanelOverlaysProps,
    searchSidebarBodyProps,
    searchSidebarChromeProps,
  } = useSearchPanelChrome({
    handleSearchUiBlurCapture,
    handleSearchUiFocusCapture,
    handleSearchUiPointerDownCapture,
    isSearchSidebarResizing,
    isSearchUiActive,
    searchSidebarContainerRef,
    startSearchSidebarResize,
    activeTabId,
    currentFilterMatchIndex,
    currentMatchIndex,
    effectiveFilterRulesLength: effectiveFilterRules.length,
    errorMessage,
    feedbackMessage,
    filterMatches,
    filterRulesPayloadLength: filterRulesPayload.length,
    fontFamily,
    hasActiveTab: !!activeTab,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isOpen,
    isResultFilterActive,
    isResultFilterSearching,
    isSearching,
    keyword,
    matches,
    messages,
    minimizedResultWrapperRef,
    panelMode,
    previousActiveTabIdRef,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultListRef,
    resultListTextStyle,
    resultPanelHeight,
    resultPanelState,
    resultPanelWrapperRef,
    reverseSearch,
    searchSidebarWidth,
    stopResultFilterSearchRef,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
    setAppliedResultFilterKeyword,
    setErrorMessage,
    setFeedbackMessage,
    setIsOpen,
    setIsResultFilterSearching,
    setPanelMode,
    setResultFilterKeyword,
    setResultPanelState,
    filterRulesEditorProps,
    searchQuerySectionProps,
    crossFileResultsProps,
    isCrossFileMode,
    focusSearchInput,
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextCopyLabel,
    inputContextCutLabel,
    inputContextMenu,
    inputContextMenuRef,
    inputContextPasteLabel,
    copyPlainTextResultEntries,
    copyPlainTextResults,
    displayTotalFilterMatchedLineCount,
    displayTotalFilterMatchedLineCountText,
    displayTotalMatchCount,
    displayTotalMatchCountText,
    displayTotalMatchedLineCountText,
    handleClearResultFilter,
    handleCloseResultPanel,
    handleRefreshResults,
    handleReopenResultPanel,
    handleResultFilterAction,
    handleResultFilterNext,
    handleResultFilterPrev,
    handleResultListScroll,
    handleResultPanelResizeMouseDown,
    hasAppliedResultFilterKeyword,
    plainTextResultEntryCount: plainTextResultEntries.length,
    handleSelectMatch,
    navigateByStep,
    cancelPendingBatchLoad,
    requestStopResultFilterSearch,
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

      <CrossFileReplaceDialog
        isOpen={isCrossFileReplaceDialogOpen}
        target={searchTarget}
        keyword={keyword}
        replaceValue={replaceValue}
        searchMode={searchMode}
        caseSensitive={caseSensitive}
        parseEscapeSequences={parseEscapeSequences}
        includeSubdirectories={effectiveIncludeSubdirectories}
        messages={messages}
        onClose={closeCrossFileReplaceDialog}
        onCompleted={handleCrossFileReplaceCompleted}
        onError={handleCrossFileReplaceError}
      />
    </>
  );
}
