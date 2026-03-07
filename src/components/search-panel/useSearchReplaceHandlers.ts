import { useCallback } from 'react';
import { applyResolvedReplaceAllResult } from './applySearchPanelResolvedReplaceAllResult';
import { applyResolvedReplaceCurrentResult } from './applySearchPanelResolvedReplaceCurrentResult';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import { resolvePreparedReplaceSearchResult } from './applySearchPanelReplaceSearchGuard';
import { resolveReplaceCurrentTargetState } from './resolveSearchPanelReplaceCurrentTargetState';
import { resolveReplaceAllSearchState, resolveReplaceCurrentSearchState } from './resolveSearchPanelReplaceState';
import type { SearchMode } from './types';
import { SEARCH_CHUNK_SIZE } from './utils';

type ReplaceSearchGuardOptions = Parameters<typeof resolvePreparedReplaceSearchResult>[0];
type ReplaceCurrentSuccessOptions = Parameters<typeof applyResolvedReplaceCurrentResult>[0];
type ReplaceAllSuccessOptions = Parameters<typeof applyResolvedReplaceAllResult>[0];

interface UseSearchReplaceHandlersOptions {
  activeTabId: string | null;
  activeTabLineCount: number | null;
  backendResultFilterKeyword: string;
  cachedSearchRef: ReplaceCurrentSuccessOptions['cachedSearchRef'];
  caseSensitive: boolean;
  chunkCursorRef: ReplaceCurrentSuccessOptions['chunkCursorRef'];
  countCacheRef: ReplaceCurrentSuccessOptions['countCacheRef'];
  currentMatchIndexRef: ReplaceCurrentSuccessOptions['currentMatchIndexRef'];
  effectiveSearchKeyword: string;
  executeSearch: ReplaceSearchGuardOptions['executeSearch'];
  keyword: string;
  navigateToMatch: ReplaceCurrentSuccessOptions['navigateToMatch'];
  noReplaceMatchesMessage: string;
  parseEscapeSequences: boolean;
  rememberReplaceValue: ReplaceCurrentSuccessOptions['rememberReplaceValue'];
  rememberSearchKeyword: ReplaceSearchGuardOptions['rememberSearchKeyword'];
  replaceAllFailedLabel: string;
  replaceCurrentFeedback: ReplaceCurrentSuccessOptions['feedbackMessage'];
  replaceFailedLabel: string;
  replacedAllFeedback: ReplaceAllSuccessOptions['formatFeedbackMessage'];
  replaceValue: string;
  searchMode: SearchMode;
  setCurrentMatchIndex: ReplaceCurrentSuccessOptions['setCurrentMatchIndex'];
  setErrorMessage: ReplaceCurrentSuccessOptions['setErrorMessage'];
  setFeedbackMessage: ReplaceCurrentSuccessOptions['setFeedbackMessage'];
  setMatches: ReplaceCurrentSuccessOptions['setMatches'];
  setSearchSessionId: ReplaceCurrentSuccessOptions['setSearchSessionId'];
  setTotalMatchCount: ReplaceCurrentSuccessOptions['setTotalMatchCount'];
  setTotalMatchedLineCount: ReplaceCurrentSuccessOptions['setTotalMatchedLineCount'];
  startTransition: ReplaceCurrentSuccessOptions['startTransition'];
  updateTab: ReplaceCurrentSuccessOptions['updateTab'];
}

export function useSearchReplaceHandlers({
  activeTabId,
  activeTabLineCount,
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
  noReplaceMatchesMessage,
  parseEscapeSequences,
  rememberReplaceValue,
  rememberSearchKeyword,
  replaceAllFailedLabel,
  replaceCurrentFeedback,
  replaceFailedLabel,
  replacedAllFeedback,
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
}: UseSearchReplaceHandlersOptions) {
  const handleReplaceCurrent = useCallback(async () => {
    if (!activeTabId || activeTabLineCount === null) {
      return;
    }

    const searchResult = await resolvePreparedReplaceSearchResult({
      executeSearch,
      keyword,
      noReplaceMatchesMessage,
      rememberSearchKeyword,
      setFeedbackMessage,
    });
    if (!searchResult) {
      return;
    }

    const { boundedCurrentIndex, targetMatch } = resolveReplaceCurrentTargetState({
      currentMatchIndex: currentMatchIndexRef.current,
      matches: searchResult.matches,
    });

    try {
      const result = await resolveReplaceCurrentSearchState({
        activeTabId,
        effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        replaceValue,
        parseEscapeSequences,
        targetStart: targetMatch.start,
        targetEnd: targetMatch.end,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      applyResolvedReplaceCurrentResult({
        activeTabId,
        boundedCurrentIndex,
        cachedSearchRef,
        caseSensitive,
        countCacheRef,
        currentMatchIndexRef,
        chunkCursorRef,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        fallbackLineCount: activeTabLineCount,
        feedbackMessage: replaceCurrentFeedback,
        navigateToMatch,
        noReplaceMatchesMessage,
        parseEscapeSequences,
        rememberReplaceValue,
        replaceValue,
        result,
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
    } catch (error) {
      applySearchPanelErrorMessage({
        error,
        prefix: replaceFailedLabel,
        setErrorMessage,
      });
    }
  }, [
    activeTabId,
    activeTabLineCount,
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
    noReplaceMatchesMessage,
    parseEscapeSequences,
    rememberReplaceValue,
    rememberSearchKeyword,
    replaceCurrentFeedback,
    replaceFailedLabel,
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
  ]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeTabId || activeTabLineCount === null) {
      return;
    }

    const searchResult = await resolvePreparedReplaceSearchResult({
      executeSearch,
      keyword,
      noReplaceMatchesMessage,
      rememberSearchKeyword,
      setFeedbackMessage,
    });
    if (!searchResult) {
      return;
    }

    try {
      const result = await resolveReplaceAllSearchState({
        activeTabId,
        effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        replaceValue,
        parseEscapeSequences,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      applyResolvedReplaceAllResult({
        activeTabId,
        cachedSearchRef,
        caseSensitive,
        countCacheRef,
        currentMatchIndexRef,
        chunkCursorRef,
        effectiveResultFilterKeyword: backendResultFilterKeyword,
        effectiveSearchKeyword,
        fallbackLineCount: activeTabLineCount,
        formatFeedbackMessage: replacedAllFeedback,
        navigateToMatch,
        noReplaceMatchesMessage,
        parseEscapeSequences,
        rememberReplaceValue,
        replaceValue,
        result,
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
    } catch (error) {
      applySearchPanelErrorMessage({
        error,
        prefix: replaceAllFailedLabel,
        setErrorMessage,
      });
    }
  }, [
    activeTabId,
    activeTabLineCount,
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
    noReplaceMatchesMessage,
    parseEscapeSequences,
    rememberReplaceValue,
    rememberSearchKeyword,
    replaceAllFailedLabel,
    replacedAllFeedback,
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
  ]);

  return {
    handleReplaceAll,
    handleReplaceCurrent,
  };
}