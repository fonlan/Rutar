import { useCallback, type MutableRefObject, type TransitionStartFunction } from 'react';
import {
  applyFilterRunResult,
  applySearchRunResult,
  createFilterRunSuccessResult,
  createSearchRunSuccessResult,
} from './applySearchPanelRunResults';
import {
  createEmptyFilterRunResult,
  createEmptySearchRunResult,
  createFilterRunFailureResult,
  createSearchRunFailureResult,
} from './createSearchPanelRunFallbacks';
import { resolveCachedFilterRunHit, resolveCachedSearchRunHit } from './resolveSearchPanelCachedRunHit';
import { resolveFilterRunStartState, resolveSearchRunStartState } from './resolveSearchPanelRunStartState';
import { isSearchPanelRunStale, runSearchPanelAsyncOperation } from './searchPanelRunLifecycle';
import type { FilterRunResult, SearchRunResult } from './types';
import { FILTER_CHUNK_SIZE, SEARCH_CHUNK_SIZE } from './utils';

type ApplySearchRunOptions = Parameters<typeof applySearchRunResult>[0];
type ApplyFilterRunOptions = Parameters<typeof applyFilterRunResult>[0];
type CreateEmptySearchRunOptions = Parameters<typeof createEmptySearchRunResult>[0];
type CreateEmptyFilterRunOptions = Parameters<typeof createEmptyFilterRunResult>[0];
type CreateSearchRunFailureOptions = Parameters<typeof createSearchRunFailureResult>[0];
type CreateFilterRunFailureOptions = Parameters<typeof createFilterRunFailureResult>[0];
type ResolveSearchRunStartStateOptions = Parameters<typeof resolveSearchRunStartState>[0];
type ResolveFilterRunStartStateOptions = Parameters<typeof resolveFilterRunStartState>[0];
type ResolveCachedFilterRunHitOptions = Parameters<typeof resolveCachedFilterRunHit>[0];

interface UseSearchPanelRunHandlersOptions {
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  cachedFilterRef: ApplyFilterRunOptions['cachedFilterRef'];
  cachedSearchRef: ApplySearchRunOptions['cachedSearchRef'];
  cancelPendingBatchLoad: () => void;
  caseSensitive: ResolveSearchRunStartStateOptions['caseSensitive'];
  chunkCursorRef: ApplySearchRunOptions['chunkCursorRef'];
  countCacheRef: ApplySearchRunOptions['countCacheRef'];
  effectiveSearchKeyword: ResolveSearchRunStartStateOptions['effectiveSearchKeyword'];
  executeCountSearch: (forceRefresh?: boolean, resultFilterKeywordOverride?: string) => Promise<unknown>;
  executeFilterCountSearch: (forceRefresh?: boolean, resultFilterKeywordOverride?: string) => Promise<unknown>;
  filterCountCacheRef: ApplyFilterRunOptions['filterCountCacheRef'];
  filterFailedLabel: CreateFilterRunFailureOptions['filterFailedLabel'];
  filterLineCursorRef: ApplyFilterRunOptions['filterLineCursorRef'];
  filterRulesKey: ResolveCachedFilterRunHitOptions['filterRulesKey'];
  filterRulesPayload: ResolveFilterRunStartStateOptions['rules'];
  filterRunVersionRef: MutableRefObject<number>;
  filterSessionCommandUnsupportedRef: ResolveFilterRunStartStateOptions['filterSessionCommandUnsupportedRef'];
  isFilterMode: boolean;
  keyword: string;
  parseEscapeSequences: ApplySearchRunOptions['parseEscapeSequences'];
  resetFilterState: CreateEmptyFilterRunOptions['resetFilterState'];
  resetSearchState: CreateEmptySearchRunOptions['resetSearchState'];
  runVersionRef: MutableRefObject<number>;
  searchFailedLabel: CreateSearchRunFailureOptions['searchFailedLabel'];
  searchMode: ResolveSearchRunStartStateOptions['searchMode'];
  searchSessionCommandUnsupportedRef: ResolveSearchRunStartStateOptions['searchSessionCommandUnsupportedRef'];
  setCurrentFilterMatchIndex: ApplyFilterRunOptions['setCurrentFilterMatchIndex'];
  setCurrentMatchIndex: ApplySearchRunOptions['setCurrentMatchIndex'];
  setErrorMessage: ApplySearchRunOptions['setErrorMessage'];
  setFilterMatches: ApplyFilterRunOptions['setFilterMatches'];
  setFilterSessionId: ApplyFilterRunOptions['setFilterSessionId'];
  setIsSearching: CreateEmptySearchRunOptions['setIsSearching'];
  setMatches: ApplySearchRunOptions['setMatches'];
  setSearchSessionId: ApplySearchRunOptions['setSearchSessionId'];
  setTotalFilterMatchedLineCount: ApplyFilterRunOptions['setTotalFilterMatchedLineCount'];
  setTotalMatchCount: ApplySearchRunOptions['setTotalMatchCount'];
  setTotalMatchedLineCount: ApplySearchRunOptions['setTotalMatchedLineCount'];
  startTransition: TransitionStartFunction;
}

export function useSearchPanelRunHandlers({
  activeTabId,
  backendResultFilterKeyword,
  cachedFilterRef,
  cachedSearchRef,
  cancelPendingBatchLoad,
  caseSensitive,
  chunkCursorRef,
  countCacheRef,
  effectiveSearchKeyword,
  executeCountSearch,
  executeFilterCountSearch,
  filterCountCacheRef,
  filterFailedLabel,
  filterLineCursorRef,
  filterRulesKey,
  filterRulesPayload,
  filterRunVersionRef,
  filterSessionCommandUnsupportedRef,
  isFilterMode,
  keyword,
  parseEscapeSequences,
  resetFilterState,
  resetSearchState,
  runVersionRef,
  searchFailedLabel,
  searchMode,
  searchSessionCommandUnsupportedRef,
  setCurrentFilterMatchIndex,
  setCurrentMatchIndex,
  setErrorMessage,
  setFilterMatches,
  setFilterSessionId,
  setIsSearching,
  setMatches,
  setSearchSessionId,
  setTotalFilterMatchedLineCount,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
}: UseSearchPanelRunHandlersOptions) {
  const executeSearch = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<SearchRunResult | null> => {
      const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;
      cancelPendingBatchLoad();

      if (!activeTabId || isFilterMode) {
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
          activeTabId,
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
            activeTabId,
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
            searchFailedLabel,
            setErrorMessage,
          });
        },
      });
    },
    [
      activeTabId,
      backendResultFilterKeyword,
      cancelPendingBatchLoad,
      caseSensitive,
      effectiveSearchKeyword,
      executeCountSearch,
      isFilterMode,
      keyword,
      parseEscapeSequences,
      resetSearchState,
      searchFailedLabel,
      searchMode,
      setCurrentMatchIndex,
      setErrorMessage,
      setIsSearching,
      setMatches,
      setSearchSessionId,
      setTotalMatchCount,
      setTotalMatchedLineCount,
      startTransition,
    ]
  );

  const executeFilter = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<FilterRunResult | null> => {
      const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;
      cancelPendingBatchLoad();

      if (!activeTabId) {
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
          activeTabId,
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
            activeTabId,
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
            activeTabId,
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
            filterFailedLabel,
            resetFilterState,
            setErrorMessage,
          });
        },
      });
    },
    [
      activeTabId,
      backendResultFilterKeyword,
      cancelPendingBatchLoad,
      caseSensitive,
      executeFilterCountSearch,
      filterFailedLabel,
      filterRulesKey,
      filterRulesPayload,
      resetFilterState,
      setCurrentFilterMatchIndex,
      setErrorMessage,
      setFilterMatches,
      setFilterSessionId,
      setIsSearching,
      setTotalFilterMatchedLineCount,
      startTransition,
    ]
  );

  return {
    executeFilter,
    executeSearch,
  };
}
