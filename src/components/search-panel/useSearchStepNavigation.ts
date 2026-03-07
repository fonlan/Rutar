import { invoke } from '@tauri-apps/api/core';
import { useCallback, type MutableRefObject } from 'react';
import { applySearchCursorStepResult, applySearchCursorStepSuccessEffects } from './applySearchPanelCursorStepResult';
import { applyFilterLocalStepSelection, applyFilterNavigationSelection, applySearchLocalStepSelection } from './applySearchPanelNavigationSelection';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import { applyFilterResultFilterStepResult } from './applySearchPanelRunResults';
import { buildFilterStepRequest, buildSearchCursorStepRequest } from './buildSearchPanelRunRequests';
import { isFilterResultFilterStepBackendResult, isMissingInvokeCommandError, isSearchCursorStepBackendResult } from './backendGuards';
import { loadMoreSearchPanelStepMatches } from './loadMoreSearchPanelStepMatches';
import { resolveCurrentFilterStepAnchor, resolveCurrentSearchCursorStepAnchor } from './resolveSearchPanelStepAnchors';
import { resolveFilterStepTarget } from './resolveSearchPanelStepTargets';
import { hasSearchPanelMatches, hasSearchPanelTargetMatch } from './searchPanelStepGuards';
import type {
  FilterMatch,
  FilterRuleInputPayload,
  FilterRunResult,
  SearchMatch,
  SearchMode,
  SearchRunResult,
} from './types';
import { FILTER_CHUNK_SIZE } from './utils';

type FilterStepResultOptions = Parameters<typeof applyFilterResultFilterStepResult>[0];
type SearchCursorStepResultOptions = Parameters<typeof applySearchCursorStepResult>[0];
type SearchCursorStepSuccessOptions = Parameters<typeof applySearchCursorStepSuccessEffects>[0];
type FilterNavigationSelectionOptions = Parameters<typeof applyFilterNavigationSelection>[0];
type SearchCursorStepAnchorOptions = Parameters<typeof resolveCurrentSearchCursorStepAnchor>[0];

interface UseSearchStepNavigationOptions {
  activeCursorPosition: SearchCursorStepAnchorOptions['activeCursorPosition'];
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  cachedFilterRef: FilterStepResultOptions['cachedFilterRef'];
  cachedSearchRef: SearchCursorStepResultOptions['cachedSearchRef'];
  caseSensitive: boolean;
  chunkCursorRef: SearchCursorStepResultOptions['chunkCursorRef'];
  currentFilterMatchIndexRef: FilterNavigationSelectionOptions['currentFilterMatchIndexRef'];
  currentMatchIndexRef: SearchCursorStepResultOptions['currentMatchIndexRef'];
  effectiveSearchKeyword: string;
  executeFilter: () => Promise<FilterRunResult | null>;
  executeFirstMatchSearch: (reverse: boolean) => Promise<SearchRunResult | null>;
  filterCountCacheRef: FilterStepResultOptions['filterCountCacheRef'];
  filterLineCursorRef: FilterStepResultOptions['filterLineCursorRef'];
  filterMatches: FilterMatch[];
  filterRulesKey: FilterStepResultOptions['filterRulesKey'];
  filterRulesPayload: FilterRuleInputPayload[];
  filterStepCommandUnsupportedRef: MutableRefObject<boolean>;
  filterFailedLabel: string;
  isFilterMode: boolean;
  keyword: string;
  loadMoreFilterMatches: () => Promise<FilterMatch[] | null>;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreMatches: () => Promise<SearchMatch[] | null>;
  matches: SearchMatch[];
  navigateToFilterMatch: FilterNavigationSelectionOptions['navigateToFilterMatch'];
  navigateToMatch: SearchCursorStepSuccessOptions['navigateToMatch'];
  nextMatchLabel: string;
  prevMatchLabel: string;
  rememberSearchKeyword: (keyword: string) => void;
  searchCursorStepCommandUnsupportedRef: MutableRefObject<boolean>;
  searchFailedLabel: string;
  searchMode: SearchMode;
  setCurrentFilterMatchIndex: FilterNavigationSelectionOptions['setCurrentFilterMatchIndex'];
  setCurrentMatchIndex: SearchCursorStepResultOptions['setCurrentMatchIndex'];
  setErrorMessage: SearchCursorStepSuccessOptions['setErrorMessage'];
  setFeedbackMessage: SearchCursorStepSuccessOptions['setFeedbackMessage'];
  setFilterMatches: FilterStepResultOptions['setFilterMatches'];
  setFilterSessionId: FilterStepResultOptions['setFilterSessionId'];
  setMatches: SearchCursorStepResultOptions['setMatches'];
  setSearchSessionId: SearchCursorStepResultOptions['setSearchSessionId'];
  setTotalFilterMatchedLineCount: FilterStepResultOptions['setTotalFilterMatchedLineCount'];
  startTransition: SearchCursorStepResultOptions['startTransition'];
}

export function useSearchStepNavigation({
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
  filterStepCommandUnsupportedRef,
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
  searchCursorStepCommandUnsupportedRef,
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
}: UseSearchStepNavigationOptions) {
  return useCallback(
    async (step: number) => {
      const normalizedStep = step < 0 ? -1 : 1;
      const navigationFeedback = normalizedStep < 0 ? prevMatchLabel : nextMatchLabel;

      if (!isFilterMode && keyword.length > 0) {
        rememberSearchKeyword(keyword);
      }

      if (activeTabId && isFilterMode && !filterStepCommandUnsupportedRef.current) {
        try {
          const filterStepAnchor = resolveCurrentFilterStepAnchor(
            filterMatches,
            currentFilterMatchIndexRef.current
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
            })
          );

          if (isFilterResultFilterStepBackendResult(stepResultValue)) {
            filterStepCommandUnsupportedRef.current = false;

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
          if (isMissingInvokeCommandError(error, 'step_result_filter_search_in_filter_document')) {
            filterStepCommandUnsupportedRef.current = true;
          } else {
            applySearchPanelErrorMessage({
              error,
              prefix: filterFailedLabel,
              setErrorMessage,
            });
            return;
          }
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

      if (activeTabId && keyword && !searchCursorStepCommandUnsupportedRef.current) {
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
            })
          );

          if (isSearchCursorStepBackendResult(stepResultValue)) {
            searchCursorStepCommandUnsupportedRef.current = false;

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
          if (isMissingInvokeCommandError(error, 'search_step_from_cursor_in_document')) {
            searchCursorStepCommandUnsupportedRef.current = true;
          } else {
            applySearchPanelErrorMessage({
              error,
              prefix: searchFailedLabel,
              setErrorMessage,
            });
            return;
          }
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
      filterStepCommandUnsupportedRef,
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
      searchCursorStepCommandUnsupportedRef,
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
    ]
  );
}