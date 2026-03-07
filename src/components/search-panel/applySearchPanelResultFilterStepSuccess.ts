import { applyFilterResultFilterSelection, applySearchResultFilterSelection } from './applySearchPanelResultFilterSelection';
import { applyFilterResultFilterStepResult, applySearchResultFilterStepResult } from './applySearchPanelRunResults';

type ApplyFilterResultFilterStepSuccessOptions =
  Parameters<typeof applyFilterResultFilterStepResult>[0] &
  Parameters<typeof applyFilterResultFilterSelection>[0];

type ApplySearchResultFilterStepSuccessOptions =
  Parameters<typeof applySearchResultFilterStepResult>[0] &
  Parameters<typeof applySearchResultFilterSelection>[0];

export function applyFilterResultFilterStepSuccess({
  activeTabId,
  cachedFilterRef,
  currentFilterMatchIndexRef,
  documentVersion,
  filterCountCacheRef,
  filterLineCursorRef,
  filterRulesKey,
  nextLine,
  nextMatches,
  resultFilterKeyword,
  scrollResultItemIntoView,
  setCurrentFilterMatchIndex,
  setErrorMessage,
  setFeedbackMessage,
  setFilterMatches,
  setFilterSessionId,
  setTotalFilterMatchedLineCount,
  startTransition,
  targetIndex,
  totalMatchedLines,
}: ApplyFilterResultFilterStepSuccessOptions) {
  applyFilterResultFilterStepResult({
    activeTabId,
    cachedFilterRef,
    documentVersion,
    filterCountCacheRef,
    filterLineCursorRef,
    filterRulesKey,
    nextLine,
    nextMatches,
    resultFilterKeyword,
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
}

export function applySearchResultFilterStepSuccess({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  countCacheRef,
  currentMatchIndexRef,
  documentVersion,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  nextMatches,
  nextOffset,
  parseEscapeSequences,
  scrollResultItemIntoView,
  searchMode,
  setCurrentMatchIndex,
  setErrorMessage,
  setFeedbackMessage,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
  targetIndex,
  totalMatchedLines,
  totalMatches,
}: ApplySearchResultFilterStepSuccessOptions) {
  applySearchResultFilterStepResult({
    activeTabId,
    cachedSearchRef,
    caseSensitive,
    chunkCursorRef,
    countCacheRef,
    documentVersion,
    effectiveResultFilterKeyword,
    effectiveSearchKeyword,
    nextMatches,
    nextOffset,
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
}
