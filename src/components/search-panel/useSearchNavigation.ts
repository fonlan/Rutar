import { invoke } from '@tauri-apps/api/core';
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type TransitionStartFunction,
} from 'react';
import {
  applySearchCursorStepResult,
  applySearchCursorStepSuccessEffects,
} from './applySearchPanelCursorStepResult';
import {
  applyFilterLocalStepSelection,
  applyFilterNavigationSelection,
  applySearchLocalStepSelection,
} from './applySearchPanelNavigationSelection';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import { applyFilterResultFilterStepResult } from './applySearchPanelRunResults';
import { buildFilterStepRequest, buildSearchCursorStepRequest } from './buildSearchPanelRunRequests';
import { isFilterResultFilterStepBackendResult, isSearchCursorStepBackendResult } from './backendGuards';
import { loadMoreSearchPanelStepMatches } from './loadMoreSearchPanelStepMatches';
import {
  resolveCurrentFilterStepAnchor,
  resolveCurrentSearchCursorStepAnchor,
} from './resolveSearchPanelStepAnchors';
import { resolveFilterStepTarget } from './resolveSearchPanelStepTargets';
import { resolveSearchPanelResultFilterKeyword } from './resolveSearchPanelResultFilterKeyword';
import { hasSearchPanelMatches, hasSearchPanelTargetMatch } from './searchPanelStepGuards';
import { dispatchNavigateToLine, dispatchNavigateToMatch } from './utils';
import { FILTER_CHUNK_SIZE } from './utils';
import type {
  FilterMatch,
  FilterRuleInputPayload,
  FilterRunResult,
  SearchMatch,
  SearchMode,
  SearchRunResult,
} from './types';

type FilterStepResultOptions = Parameters<typeof applyFilterResultFilterStepResult>[0];
type SearchCursorStepResultOptions = Parameters<typeof applySearchCursorStepResult>[0];
type SearchCursorStepSuccessOptions = Parameters<typeof applySearchCursorStepSuccessEffects>[0];
type FilterNavigationSelectionOptions = Parameters<typeof applyFilterNavigationSelection>[0];
type SearchCursorStepAnchorOptions = Parameters<typeof resolveCurrentSearchCursorStepAnchor>[0];

export interface UseSearchNavigationOptions {
  // identity / common
  activeCursorPosition: SearchCursorStepAnchorOptions['activeCursorPosition'];
  activeTabId: string | null;
  appliedResultFilterKeyword: string;
  backendResultFilterKeyword: string;
  caseSensitive: boolean;
  effectiveSearchKeyword: string;
  filterMatches: FilterMatch[];
  filterRulesKey: FilterStepResultOptions['filterRulesKey'];
  filterRulesPayload: FilterRuleInputPayload[];
  isFilterMode: boolean;
  isResultFilterSearching: boolean;
  keyword: string;
  matches: SearchMatch[];
  resultFilterKeyword: string;
  searchMode: SearchMode;
  // labels
  filterFailedLabel: string;
  nextMatchLabel: string;
  prevMatchLabel: string;
  searchFailedLabel: string;
  // refs
  cachedFilterRef: FilterStepResultOptions['cachedFilterRef'];
  cachedSearchRef: SearchCursorStepResultOptions['cachedSearchRef'];
  chunkCursorRef: SearchCursorStepResultOptions['chunkCursorRef'];
  currentFilterMatchIndexRef: FilterNavigationSelectionOptions['currentFilterMatchIndexRef'];
  currentMatchIndexRef: SearchCursorStepResultOptions['currentMatchIndexRef'];
  filterCountCacheRef: FilterStepResultOptions['filterCountCacheRef'];
  filterLineCursorRef: FilterStepResultOptions['filterLineCursorRef'];
  loadMoreLockRef: MutableRefObject<boolean>;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
  // collaborators
  cancelPendingBatchLoad: () => void;
  executeFilter: (
    forceRefresh?: boolean,
    silent?: boolean,
    resultFilterKeywordOverride?: string,
  ) => Promise<FilterRunResult | null>;
  executeFirstMatchSearch: (reverse: boolean) => Promise<SearchRunResult | null>;
  executeSearch: (
    forceRefresh?: boolean,
    silent?: boolean,
    resultFilterKeywordOverride?: string,
  ) => Promise<SearchRunResult | null>;
  getSearchSidebarOccludedRightPx: () => number;
  loadMoreFilterMatches: () => Promise<FilterMatch[] | null>;
  loadMoreMatches: () => Promise<SearchMatch[] | null>;
  rememberSearchKeyword: (keyword: string) => void;
  requestStopResultFilterSearch: () => void;
  // setters
  setAppliedResultFilterKeyword: (keyword: string) => void;
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setErrorMessage: SearchCursorStepSuccessOptions['setErrorMessage'];
  setFeedbackMessage: SearchCursorStepSuccessOptions['setFeedbackMessage'];
  setFilterMatches: FilterStepResultOptions['setFilterMatches'];
  setFilterSessionId: FilterStepResultOptions['setFilterSessionId'];
  setIsResultFilterSearching: (value: boolean) => void;
  setMatches: SearchCursorStepResultOptions['setMatches'];
  setSearchSessionId: SearchCursorStepResultOptions['setSearchSessionId'];
  setTotalFilterMatchedLineCount: Dispatch<SetStateAction<number | null>>;
  startTransition: TransitionStartFunction;
}

export interface UseSearchNavigationResult {
  handleApplyResultFilter: () => Promise<void>;
  handleSelectMatch: (targetIndex: number) => void;
  navigateByStep: (step: number) => Promise<void>;
  navigateToFilterMatch: (targetMatch: FilterMatch) => void;
  navigateToMatch: (targetMatch: SearchMatch) => void;
}

export function useSearchNavigation(options: UseSearchNavigationOptions): UseSearchNavigationResult {
  const {
    activeCursorPosition,
    activeTabId,
    appliedResultFilterKeyword,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    filterMatches,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    matches,
    resultFilterKeyword,
    searchMode,
    filterFailedLabel,
    nextMatchLabel,
    prevMatchLabel,
    searchFailedLabel,
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    currentFilterMatchIndexRef,
    currentMatchIndexRef,
    filterCountCacheRef,
    filterLineCursorRef,
    loadMoreLockRef,
    stopResultFilterSearchRef,
    cancelPendingBatchLoad,
    executeFilter,
    executeFirstMatchSearch,
    executeSearch,
    getSearchSidebarOccludedRightPx,
    loadMoreFilterMatches,
    loadMoreMatches,
    rememberSearchKeyword,
    requestStopResultFilterSearch,
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
  } = options;

  // ----- match navigation (was useSearchMatchNavigation) -----

  const navigateToMatch = useCallback(
    (targetMatch: SearchMatch) => {
      if (!activeTabId) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      setCursorPosition(activeTabId, targetMatch.line, Math.max(1, targetMatch.column || 1));
      dispatchNavigateToMatch(activeTabId, targetMatch, occludedRightPx);
    },
    [activeTabId, getSearchSidebarOccludedRightPx, setCursorPosition],
  );

  const navigateToFilterMatch = useCallback(
    (targetMatch: FilterMatch) => {
      if (!activeTabId) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      dispatchNavigateToLine(
        activeTabId,
        targetMatch.line,
        Math.max(1, targetMatch.column || 1),
        Math.max(0, targetMatch.length || 0),
        targetMatch.lineText || '',
        occludedRightPx,
      );
    },
    [activeTabId, getSearchSidebarOccludedRightPx],
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
    [
      filterMatches,
      isFilterMode,
      matches,
      navigateToFilterMatch,
      navigateToMatch,
      setCurrentFilterMatchIndex,
      setCurrentMatchIndex,
      setFeedbackMessage,
    ],
  );

  // ----- step navigation (was useSearchStepNavigation) -----

  const navigateByStep = useCallback(
    async (step: number) => {
      const normalizedStep = step < 0 ? -1 : 1;
      const navigationFeedback = normalizedStep < 0 ? prevMatchLabel : nextMatchLabel;

      if (!isFilterMode && keyword.length > 0) {
        rememberSearchKeyword(keyword);
      }

      if (activeTabId && isFilterMode) {
        try {
          const filterStepAnchor = resolveCurrentFilterStepAnchor(
            filterMatches,
            currentFilterMatchIndexRef.current,
          );
          const stepResultValue = await invoke<unknown>(
            'step_result_filter_search_in_filter_document',
            buildFilterStepRequest({
              activeTabId,
              rules: filterRulesPayload,
              resultFilterKeyword: backendResultFilterKeyword,
              caseSensitive,
              ...filterStepAnchor,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            }),
          );

          if (isFilterResultFilterStepBackendResult(stepResultValue)) {
            const targetMatch = stepResultValue.targetMatch;
            if (!hasSearchPanelTargetMatch(targetMatch)) {
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
                activeTabId,
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
          applySearchPanelErrorMessage({
            error,
            prefix: filterFailedLabel,
            setErrorMessage,
          });
          return;
        }
      }

      if (isFilterMode) {
        if (filterMatches.length > 0) {
          const appendedMatches = await loadMoreSearchPanelStepMatches({
            currentIndex: currentFilterMatchIndexRef.current,
            loadMore: loadMoreFilterMatches,
            loadMoreLocked: loadMoreLockRef.current,
            matchCount: filterMatches.length,
            step,
          });
          applyFilterLocalStepSelection({
            appendedMatches,
            currentFilterMatchIndexRef,
            matches: filterMatches,
            navigationFeedback,
            navigateToFilterMatch,
            setCurrentFilterMatchIndex,
            setFeedbackMessage,
            step,
          });
          return;
        }

        const filterResult = await executeFilter();
        if (!hasSearchPanelMatches(filterResult)) {
          return;
        }

        applyFilterLocalStepSelection({
          currentFilterMatchIndexRef,
          matches: filterResult.matches,
          navigationFeedback,
          navigateToFilterMatch,
          setCurrentFilterMatchIndex,
          setFeedbackMessage,
          step,
        });

        return;
      }

      if (activeTabId && keyword) {
        try {
          const searchCursorStepAnchor = resolveCurrentSearchCursorStepAnchor({
            activeCursorPosition,
            currentIndex: currentMatchIndexRef.current,
            matches,
          });
          const stepResultValue = await invoke<unknown>(
            'search_step_from_cursor_in_document',
            buildSearchCursorStepRequest({
              activeTabId,
              effectiveSearchKeyword,
              searchMode,
              caseSensitive,
              effectiveResultFilterKeyword: backendResultFilterKeyword,
              ...searchCursorStepAnchor,
              step: normalizedStep,
            }),
          );

          if (isSearchCursorStepBackendResult(stepResultValue)) {
            const targetMatch = stepResultValue.targetMatch;
            if (!hasSearchPanelTargetMatch(targetMatch)) {
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
            applySearchCursorStepSuccessEffects({
              navigateToMatch,
              navigationFeedback,
              setErrorMessage,
              setFeedbackMessage,
              targetMatch,
            });
            return;
          }
        } catch (error) {
          applySearchPanelErrorMessage({
            error,
            prefix: searchFailedLabel,
            setErrorMessage,
          });
          return;
        }
      }

      if (keyword && matches.length > 0) {
        const appendedMatches = await loadMoreSearchPanelStepMatches({
          currentIndex: currentMatchIndexRef.current,
          loadMore: loadMoreMatches,
          loadMoreLocked: loadMoreLockRef.current,
          matchCount: matches.length,
          step,
        });
        applySearchLocalStepSelection({
          appendedMatches,
          currentMatchIndexRef,
          matches,
          navigationFeedback,
          navigateToMatch,
          setCurrentMatchIndex,
          setFeedbackMessage,
          step,
        });
        return;
      }

      const shouldReverse = step < 0;
      const searchResult = await executeFirstMatchSearch(shouldReverse);
      if (!hasSearchPanelMatches(searchResult)) {
        return;
      }

      applySearchLocalStepSelection({
        currentMatchIndexRef,
        matches: searchResult.matches,
        navigationFeedback,
        navigateToMatch,
        setCurrentMatchIndex,
        setFeedbackMessage,
        step,
      });
    },
    [
      activeCursorPosition,
      activeTabId,
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
      filterFailedLabel,
      isFilterMode,
      keyword,
      loadMoreFilterMatches,
      loadMoreLockRef,
      loadMoreMatches,
      matches,
      navigateToFilterMatch,
      navigateToMatch,
      nextMatchLabel,
      prevMatchLabel,
      rememberSearchKeyword,
      searchFailedLabel,
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
    ],
  );

  // ----- apply result filter (was useSearchApplyResultFilter) -----

  const handleApplyResultFilter = useCallback(async () => {
    cancelPendingBatchLoad();
    const {
      normalizedKeyword: nextResultFilterKeyword,
      trimmedKeyword: nextKeyword,
    } = resolveSearchPanelResultFilterKeyword({
      caseSensitive,
      resultFilterKeyword,
    });

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

    if (nextKeyword === appliedResultFilterKeyword.trim()) {
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
    setAppliedResultFilterKeyword,
    setIsResultFilterSearching,
    stopResultFilterSearchRef,
  ]);

  return {
    handleApplyResultFilter,
    handleSelectMatch,
    navigateByStep,
    navigateToFilterMatch,
    navigateToMatch,
  };
}
