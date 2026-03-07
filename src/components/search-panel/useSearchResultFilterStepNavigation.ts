import { invoke } from '@tauri-apps/api/core';
import { useCallback, type MutableRefObject } from 'react';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import { resolveGuardedFilterResultFilterStepSelection, resolveGuardedSearchResultFilterStepSelection } from './applySearchPanelResultFilterSelection';
import { applyFilterResultFilterStepSuccess, applySearchResultFilterStepSuccess } from './applySearchPanelResultFilterStepSuccess';
import { buildFilterStepRequest, buildSearchResultFilterStepRequest } from './buildSearchPanelRunRequests';
import { resolveCurrentFilterStepAnchor, resolveCurrentSearchResultFilterStepAnchor } from './resolveSearchPanelStepAnchors';
import { resolveSearchPanelResultFilterKeyword } from './resolveSearchPanelResultFilterKeyword';
import { beginResultFilterStepRun, finalizeResultFilterStepRun, isResultFilterStepRunStale } from './resultFilterStepRunLifecycle';
import type {
  FilterMatch,
  FilterResultFilterStepBackendResult,
  FilterRuleInputPayload,
  SearchMatch,
  SearchMode,
  SearchResultFilterStepBackendResult,
} from './types';
import { FILTER_CHUNK_SIZE, SEARCH_CHUNK_SIZE } from './utils';

type FilterStepSuccessOptions = Parameters<typeof applyFilterResultFilterStepSuccess>[0];
type SearchStepSuccessOptions = Parameters<typeof applySearchResultFilterStepSuccess>[0];
type ResultFilterStepLoadingDirection = 'next' | 'prev' | null;

interface UseSearchResultFilterStepNavigationOptions {
  activeTabId: string | null;
  cachedFilterRef: FilterStepSuccessOptions['cachedFilterRef'];
  cachedSearchRef: SearchStepSuccessOptions['cachedSearchRef'];
  caseSensitive: boolean;
  chunkCursorRef: SearchStepSuccessOptions['chunkCursorRef'];
  countCacheRef: SearchStepSuccessOptions['countCacheRef'];
  currentFilterMatchIndexRef: MutableRefObject<number>;
  currentMatchIndexRef: MutableRefObject<number>;
  effectiveSearchKeyword: string;
  filterCountCacheRef: FilterStepSuccessOptions['filterCountCacheRef'];
  filterLineCursorRef: FilterStepSuccessOptions['filterLineCursorRef'];
  filterMatches: FilterMatch[];
  filterRulesKey: FilterStepSuccessOptions['filterRulesKey'];
  filterRulesPayload: FilterRuleInputPayload[];
  isFilterMode: boolean;
  isResultFilterSearching: boolean;
  isSearching: boolean;
  keyword: string;
  loadMoreLockRef: MutableRefObject<boolean>;
  matches: SearchMatch[];
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  resultFilterStepNoMatch: (keyword: string) => string;
  resultFilterStepRunVersionRef: MutableRefObject<number>;
  scrollResultItemIntoView: FilterStepSuccessOptions['scrollResultItemIntoView'];
  searchFailedLabel: string;
  searchMode: SearchMode;
  setCurrentFilterMatchIndex: FilterStepSuccessOptions['setCurrentFilterMatchIndex'];
  setCurrentMatchIndex: SearchStepSuccessOptions['setCurrentMatchIndex'];
  setErrorMessage: FilterStepSuccessOptions['setErrorMessage'];
  setFeedbackMessage: FilterStepSuccessOptions['setFeedbackMessage'];
  setFilterMatches: FilterStepSuccessOptions['setFilterMatches'];
  setFilterSessionId: FilterStepSuccessOptions['setFilterSessionId'];
  setIsSearching: (value: boolean) => void;
  setMatches: SearchStepSuccessOptions['setMatches'];
  setResultFilterStepLoadingDirection: (value: ResultFilterStepLoadingDirection) => void;
  setSearchSessionId: SearchStepSuccessOptions['setSearchSessionId'];
  setTotalFilterMatchedLineCount: FilterStepSuccessOptions['setTotalFilterMatchedLineCount'];
  setTotalMatchCount: SearchStepSuccessOptions['setTotalMatchCount'];
  setTotalMatchedLineCount: SearchStepSuccessOptions['setTotalMatchedLineCount'];
  startTransition: FilterStepSuccessOptions['startTransition'];
}

export function useSearchResultFilterStepNavigation({
  activeTabId,
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
  resultFilterStepNoMatch,
  resultFilterStepRunVersionRef,
  scrollResultItemIntoView,
  searchFailedLabel,
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
}: UseSearchResultFilterStepNavigationOptions) {
  return useCallback(
    async (step: number) => {
      if (!activeTabId || isSearching || isResultFilterSearching) {
        return;
      }

      const {
        normalizedKeyword: effectiveResultFilterKeyword,
        trimmedKeyword: keywordForJump,
      } = resolveSearchPanelResultFilterKeyword({
        caseSensitive,
        resultFilterKeyword,
      });
      if (!keywordForJump) {
        return;
      }

      const normalizedStep = step < 0 ? -1 : 1;
      const direction = normalizedStep > 0 ? 'next' : 'prev';
      const noMatchMessage = resultFilterStepNoMatch(keywordForJump);
      const runVersion = beginResultFilterStepRun({
        direction,
        loadMoreLockRef,
        resultFilterStepRunVersionRef,
        setIsSearching,
        setResultFilterStepLoadingDirection,
      });

      try {
        if (isFilterMode) {
          const filterStepAnchor = resolveCurrentFilterStepAnchor(
            filterMatches,
            currentFilterMatchIndexRef.current
          );

          const stepResult = await invoke<FilterResultFilterStepBackendResult>(
            'step_result_filter_search_in_filter_document',
            buildFilterStepRequest({
              activeTabId,
              rules: filterRulesPayload,
              resultFilterKeyword: keywordForJump,
              caseSensitive,
              ...filterStepAnchor,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            })
          );
          if (isResultFilterStepRunStale({ resultFilterStepRunVersionRef, runVersion })) {
            return;
          }

          const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
          setTotalFilterMatchedLineCount(totalMatchedLines);
          const resolvedFilterStepSelection = resolveGuardedFilterResultFilterStepSelection({
            batchMatches: stepResult.batchMatches,
            matches: filterMatches,
            noMatchMessage,
            setFeedbackMessage,
            targetIndexInBatch: stepResult.targetIndexInBatch,
            targetMatch: stepResult.targetMatch,
          });
          if (!resolvedFilterStepSelection) {
            return;
          }

          const { nextMatches, targetIndex } = resolvedFilterStepSelection;
          const documentVersion = stepResult.documentVersion ?? 0;
          applyFilterResultFilterStepSuccess({
            activeTabId,
            cachedFilterRef,
            currentFilterMatchIndexRef,
            documentVersion,
            filterCountCacheRef,
            filterLineCursorRef,
            filterRulesKey,
            nextLine: stepResult.nextLine ?? null,
            nextMatches,
            resultFilterKeyword: effectiveResultFilterKeyword,
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
          });
          return;
        }

        if (!keyword) {
          return;
        }

        const searchResultFilterStepAnchor = resolveCurrentSearchResultFilterStepAnchor(
          matches,
          currentMatchIndexRef.current
        );

        const stepResult = await invoke<SearchResultFilterStepBackendResult>(
          'step_result_filter_search_in_document',
          buildSearchResultFilterStepRequest({
            activeTabId,
            effectiveSearchKeyword,
            searchMode,
            caseSensitive,
            effectiveResultFilterKeyword: keywordForJump,
            ...searchResultFilterStepAnchor,
            step: normalizedStep,
            maxResults: SEARCH_CHUNK_SIZE,
          })
        );
        if (isResultFilterStepRunStale({ resultFilterStepRunVersionRef, runVersion })) {
          return;
        }

        const totalMatches = stepResult.totalMatches ?? 0;
        const totalMatchedLines = stepResult.totalMatchedLines ?? 0;
        setTotalMatchCount(totalMatches);
        setTotalMatchedLineCount(totalMatchedLines);
        const resolvedSearchStepSelection = resolveGuardedSearchResultFilterStepSelection({
          batchMatches: stepResult.batchMatches,
          matches,
          noMatchMessage,
          setFeedbackMessage,
          targetIndexInBatch: stepResult.targetIndexInBatch,
          targetMatch: stepResult.targetMatch,
        });
        if (!resolvedSearchStepSelection) {
          return;
        }

        const { nextMatches, targetIndex } = resolvedSearchStepSelection;
        const documentVersion = stepResult.documentVersion ?? 0;
        applySearchResultFilterStepSuccess({
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
          nextOffset: stepResult.nextOffset ?? null,
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
        });
        return;
      } catch (error) {
        if (isResultFilterStepRunStale({ resultFilterStepRunVersionRef, runVersion })) {
          return;
        }

        applySearchPanelErrorMessage({
          error,
          prefix: searchFailedLabel,
          setErrorMessage,
        });
      } finally {
        finalizeResultFilterStepRun({
          loadMoreLockRef,
          resultFilterStepRunVersionRef,
          runVersion,
          setIsSearching,
          setResultFilterStepLoadingDirection,
        });
      }
    },
    [
      activeTabId,
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
      resultFilterStepNoMatch,
      resultFilterStepRunVersionRef,
      scrollResultItemIntoView,
      searchFailedLabel,
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
    ]
  );
}