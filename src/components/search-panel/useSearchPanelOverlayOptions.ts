import { useMemo } from 'react';
import { useSearchPanelOverlaysProps } from './useSearchPanelOverlaysProps';

type SearchPanelOverlaysOptions = Parameters<typeof useSearchPanelOverlaysProps>[0];
type SearchResultItemsProps = SearchPanelOverlaysOptions['searchResultItemsProps'];

interface UseSearchPanelOverlayOptionsOptions {
  cancelPendingBatchLoad: SearchPanelOverlaysOptions['onCancelPendingBatchLoad'];
  copyLabel: SearchPanelOverlaysOptions['copyLabel'];
  copyPlainTextResults: SearchPanelOverlaysOptions['copyPlainTextResults'];
  cutLabel: SearchPanelOverlaysOptions['cutLabel'];
  displayTotalFilterMatchedLineCountText: SearchPanelOverlaysOptions['displayTotalFilterMatchedLineCountText'];
  displayTotalMatchCountText: SearchPanelOverlaysOptions['displayTotalMatchCountText'];
  displayTotalMatchedLineCountText: SearchPanelOverlaysOptions['displayTotalMatchedLineCountText'];
  errorMessage: SearchPanelOverlaysOptions['errorMessage'];
  filterMatches: SearchResultItemsProps['filterMatches'];
  filterRulesPayloadLength: SearchPanelOverlaysOptions['filterRulesPayloadLength'];
  fontFamily: SearchResultItemsProps['fontFamily'];
  handleClearResultFilter: SearchPanelOverlaysOptions['onClearResultFilter'];
  handleCloseResultPanel: SearchPanelOverlaysOptions['onClose'];
  handleInputContextMenuAction: SearchPanelOverlaysOptions['handleInputContextMenuAction'];
  handleRefreshResults: SearchPanelOverlaysOptions['onRefresh'];
  handleReopenResultPanel: SearchPanelOverlaysOptions['onOpenMinimized'];
  handleResultFilterAction: SearchPanelOverlaysOptions['onApplyResultFilter'];
  handleResultFilterNext: SearchPanelOverlaysOptions['onNavigateResultFilterNext'];
  handleResultFilterPrev: SearchPanelOverlaysOptions['onNavigateResultFilterPrev'];
  handleResultListScroll: SearchPanelOverlaysOptions['onScroll'];
  handleResultPanelResizeMouseDown: SearchPanelOverlaysOptions['onResizeMouseDown'];
  handleSelectMatch: SearchResultItemsProps['handleSelectMatch'];
  hasAppliedResultFilterKeyword: SearchPanelOverlaysOptions['hasAppliedResultFilterKeyword'];
  hasMoreFilterMatches: SearchPanelOverlaysOptions['hasMoreFilterMatches'];
  hasMoreMatches: SearchPanelOverlaysOptions['hasMoreMatches'];
  inputContextMenu: SearchPanelOverlaysOptions['inputContextMenu'];
  inputContextMenuRef: SearchPanelOverlaysOptions['menuRef'];
  isFilterMode: SearchPanelOverlaysOptions['isFilterMode'];
  isResultFilterActive: SearchPanelOverlaysOptions['isResultFilterActive'];
  isResultFilterSearching: SearchPanelOverlaysOptions['isResultFilterSearching'];
  isSearching: SearchPanelOverlaysOptions['isSearching'];
  keyword: SearchPanelOverlaysOptions['keyword'];
  matches: SearchResultItemsProps['matches'];
  messages: SearchResultItemsProps['messages'];
  minimizedResultWrapperRef: SearchPanelOverlaysOptions['minimizedResultWrapperRef'];
  pasteLabel: SearchPanelOverlaysOptions['pasteLabel'];
  plainTextResultEntryCount: SearchPanelOverlaysOptions['plainTextResultEntryCount'];
  requestStopResultFilterSearch: SearchPanelOverlaysOptions['onRequestStopResultFilterSearch'];
  resultFilterKeyword: SearchPanelOverlaysOptions['resultFilterKeyword'];
  resultFilterStepLoadingDirection: SearchPanelOverlaysOptions['resultFilterStepLoadingDirection'];
  resultListRef: SearchPanelOverlaysOptions['resultListRef'];
  resultListTextStyle: SearchResultItemsProps['resultListTextStyle'];
  resultPanelHeight: SearchPanelOverlaysOptions['resultPanelHeight'];
  resultPanelState: SearchResultItemsProps['resultPanelState'];
  resultPanelWrapperRef: SearchPanelOverlaysOptions['resultPanelWrapperRef'];
  setResultFilterKeyword: SearchPanelOverlaysOptions['onResultFilterKeywordChange'];
  setResultPanelState: SearchPanelOverlaysOptions['setResultPanelState'];
  visibleCurrentFilterMatchIndex: SearchResultItemsProps['visibleCurrentFilterMatchIndex'];
  visibleCurrentMatchIndex: SearchResultItemsProps['visibleCurrentMatchIndex'];
  visibleFilterMatches: SearchResultItemsProps['visibleFilterMatches'];
  visibleMatches: SearchResultItemsProps['visibleMatches'];
}

export function useSearchPanelOverlayOptions({
  cancelPendingBatchLoad,
  copyLabel,
  copyPlainTextResults,
  cutLabel,
  displayTotalFilterMatchedLineCountText,
  displayTotalMatchCountText,
  displayTotalMatchedLineCountText,
  errorMessage,
  filterMatches,
  filterRulesPayloadLength,
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
  pasteLabel,
  plainTextResultEntryCount,
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
}: UseSearchPanelOverlayOptionsOptions): SearchPanelOverlaysOptions {
  const searchResultItemsProps = useMemo(
    () => ({
      filterMatches,
      filterRulesPayloadLength,
      fontFamily,
      handleSelectMatch,
      isFilterMode,
      keyword,
      matches,
      messages,
      resultListTextStyle,
      resultPanelState,
      visibleCurrentFilterMatchIndex,
      visibleCurrentMatchIndex,
      visibleFilterMatches,
      visibleMatches,
    }),
    [
      filterMatches,
      filterRulesPayloadLength,
      fontFamily,
      handleSelectMatch,
      isFilterMode,
      keyword,
      matches,
      messages,
      resultListTextStyle,
      resultPanelState,
      visibleCurrentFilterMatchIndex,
      visibleCurrentMatchIndex,
      visibleFilterMatches,
      visibleMatches,
    ]
  );

  return useMemo(
    () => ({
      copyLabel,
      cutLabel,
      deleteLabel: messages.filterDeleteRule,
      menuRef: inputContextMenuRef,
      pasteLabel,
      handleInputContextMenuAction,
      copyPlainTextResults,
      inputContextMenu,
      setResultPanelState,
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCountText,
      displayTotalMatchedLineCountText,
      errorMessage,
      filterMatchCount: filterMatches.length,
      filterRulesPayloadLength,
      hasAppliedResultFilterKeyword,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isResultFilterActive,
      isResultFilterSearching,
      isSearching,
      keyword,
      matchCount: matches.length,
      messages,
      minimizedResultWrapperRef,
      plainTextResultEntryCount,
      searchResultItemsProps,
      resultFilterKeyword,
      resultFilterStepLoadingDirection,
      resultListRef,
      resultPanelHeight,
      resultPanelState,
      resultPanelWrapperRef,
      visibleFilterMatchCount: visibleFilterMatches.length,
      visibleMatchCount: visibleMatches.length,
      onApplyResultFilter: handleResultFilterAction,
      onCancelPendingBatchLoad: cancelPendingBatchLoad,
      onClearResultFilter: handleClearResultFilter,
      onClose: handleCloseResultPanel,
      onNavigateResultFilterNext: handleResultFilterNext,
      onNavigateResultFilterPrev: handleResultFilterPrev,
      onOpenMinimized: handleReopenResultPanel,
      onRefresh: handleRefreshResults,
      onRequestStopResultFilterSearch: requestStopResultFilterSearch,
      onResizeMouseDown: handleResultPanelResizeMouseDown,
      onResultFilterKeywordChange: setResultFilterKeyword,
      onScroll: handleResultListScroll,
    }),
    [
      cancelPendingBatchLoad,
      copyLabel,
      copyPlainTextResults,
      cutLabel,
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCountText,
      displayTotalMatchedLineCountText,
      errorMessage,
      filterMatches,
      filterRulesPayloadLength,
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
      pasteLabel,
      plainTextResultEntryCount,
      requestStopResultFilterSearch,
      resultFilterKeyword,
      resultFilterStepLoadingDirection,
      resultListRef,
      resultPanelHeight,
      resultPanelState,
      resultPanelWrapperRef,
      searchResultItemsProps,
      setResultFilterKeyword,
      setResultPanelState,
      visibleFilterMatches,
      visibleMatches,
    ]
  );
}