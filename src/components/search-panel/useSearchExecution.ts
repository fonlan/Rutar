import { invoke } from '@tauri-apps/api/core';
import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type TransitionStartFunction,
} from 'react';
import { applyFilterSessionRestoreResult, handleFilterSessionRestoreError } from './applyFilterSessionRestoreResult';
import { applyResolvedSearchFirstMatchResult } from './applySearchPanelFirstMatchResult';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import {
  resolveFilterLoadMoreSessionState,
  resolveSearchLoadMoreSessionState,
} from './applySearchPanelLoadMoreSessionResults';
import {
  applyFilterLoadMoreResult,
  applyFilterRunResult,
  applySearchLoadMoreResult,
  applySearchRunResult,
  createFilterRunSuccessResult,
  createSearchRunSuccessResult,
} from './applySearchPanelRunResults';
import { applySearchSessionRestoreResult, handleSearchSessionRestoreError } from './applySearchSessionRestoreResult';
import { isFilterSessionRestoreBackendResult, isSearchSessionRestoreBackendResult } from './backendGuards';
import { buildFilterSessionRestoreRequest, buildSearchSessionRestoreRequest } from './buildSearchPanelRestoreRequests';
import {
  createEmptyFilterRunResult,
  createEmptySearchRunResult,
  createFilterRunFailureResult,
  createSearchRunFailureResult,
} from './createSearchPanelRunResults';
import { finalizeSearchPanelRestoreCycle } from './finalizeSearchPanelRestoreCycle';
import { resetSearchPanelForInactiveTab } from './resetSearchPanelForInactiveTab';
import { resetSearchPanelForMissingSnapshot } from './resetSearchPanelForMissingSnapshot';
import { resolveCachedFilterRunHit, resolveCachedSearchRunHit } from './resolveSearchPanelCachedRunHit';
import { resolveSearchFirstMatchState } from './resolveSearchPanelFirstMatchState';
import { resolveFilterRunStartState, resolveSearchRunStartState } from './resolveSearchPanelRunStartState';
import { restoreSearchPanelSnapshotState } from './restoreSearchPanelSnapshotState';
import { isSearchPanelRunStale, runSearchPanelAsyncOperation } from './searchPanelRunLifecycle';
import type {
  FilterMatch,
  FilterRuleInputPayload,
  FilterRunResult,
  PanelMode,
  SearchMatch,
  SearchMode,
  SearchResultPanelState,
  SearchRunResult,
  TabSearchPanelSnapshot,
} from './types';
import {
  FILTER_CHUNK_SIZE,
  RESULT_PANEL_DEFAULT_HEIGHT,
  SEARCH_CHUNK_SIZE,
  SEARCH_SIDEBAR_DEFAULT_WIDTH,
} from './utils';

type ApplySearchRunOptions = Parameters<typeof applySearchRunResult>[0];
type ApplyFilterRunOptions = Parameters<typeof applyFilterRunResult>[0];
type RestoreSnapshotStateOptions = Parameters<typeof restoreSearchPanelSnapshotState>[0];
type ResetInactiveTabOptions = Parameters<typeof resetSearchPanelForInactiveTab>[0];
type FinalizeRestoreCycleOptions = Parameters<typeof finalizeSearchPanelRestoreCycle>[0];

interface RunSearchPanelLoadMoreOperationOptions<TMatch> {
  errorPrefix: string;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreSessionRef: MutableRefObject<number>;
  resolveLoadMoreMatches: (sessionId: number) => Promise<TMatch[] | null>;
  setErrorMessage: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
}

async function runSearchPanelLoadMoreOperation<TMatch>({
  errorPrefix,
  loadMoreLockRef,
  loadMoreSessionRef,
  resolveLoadMoreMatches,
  setErrorMessage,
  setIsSearching,
}: RunSearchPanelLoadMoreOperationOptions<TMatch>): Promise<TMatch[] | null> {
  if (loadMoreLockRef.current) {
    return null;
  }

  const sessionId = loadMoreSessionRef.current;
  loadMoreLockRef.current = true;
  setIsSearching(true);

  try {
    return await resolveLoadMoreMatches(sessionId);
  } catch (error) {
    if (sessionId !== loadMoreSessionRef.current) {
      return null;
    }

    applySearchPanelErrorMessage({
      error,
      prefix: errorPrefix,
      setErrorMessage,
    });
    return null;
  } finally {
    loadMoreLockRef.current = false;
    if (sessionId === loadMoreSessionRef.current) {
      setIsSearching(false);
    }
  }
}

export interface UseSearchExecutionOptions {
  // Identity / common
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  caseSensitive: boolean;
  effectiveSearchKeyword: string;
  filterRulesKey: string;
  filterRulesPayload: FilterRuleInputPayload[];
  isFilterMode: boolean;
  keyword: string;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  startTransition: TransitionStartFunction;
  // Labels
  filterFailedLabel: string;
  searchFailedLabel: string;
  // Refs (cache / cursor)
  cachedFilterRef: ApplyFilterRunOptions['cachedFilterRef'];
  cachedSearchRef: ApplySearchRunOptions['cachedSearchRef'];
  chunkCursorRef: ApplySearchRunOptions['chunkCursorRef'];
  countCacheRef: ApplySearchRunOptions['countCacheRef'];
  filterCountCacheRef: ApplyFilterRunOptions['filterCountCacheRef'];
  filterLineCursorRef: ApplyFilterRunOptions['filterLineCursorRef'];
  // Refs (lifecycle / version)
  filterRunVersionRef: MutableRefObject<number>;
  filterSessionIdRef: MutableRefObject<string | null>;
  loadMoreDebounceRef: MutableRefObject<number | null>;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreSessionRef: MutableRefObject<number>;
  previousActiveTabIdRef: FinalizeRestoreCycleOptions['previousActiveTabIdRef'];
  resultFilterStepRunVersionRef: MutableRefObject<number>;
  runVersionRef: MutableRefObject<number>;
  searchSessionIdRef: MutableRefObject<string | null>;
  sessionRestoreRunVersionRef: MutableRefObject<number>;
  stopResultFilterSearchRef: FinalizeRestoreCycleOptions['stopResultFilterSearchRef'];
  tabSearchPanelStateRef: MutableRefObject<Record<string, TabSearchPanelSnapshot>>;
  // Reset helpers
  resetFilterState: ResetInactiveTabOptions['resetFilterState'];
  resetSearchState: ResetInactiveTabOptions['resetSearchState'];
  // Setters
  setAppliedResultFilterKeyword: RestoreSnapshotStateOptions['setAppliedResultFilterKeyword'];
  setCaseSensitive: RestoreSnapshotStateOptions['setCaseSensitive'];
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: FinalizeRestoreCycleOptions['setFeedbackMessage'];
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  setIsOpen: RestoreSnapshotStateOptions['setIsOpen'];
  setIsResultFilterSearching: FinalizeRestoreCycleOptions['setIsResultFilterSearching'];
  setIsSearching: (value: boolean) => void;
  setKeyword: RestoreSnapshotStateOptions['setKeyword'];
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setPanelMode: RestoreSnapshotStateOptions['setPanelMode'];
  setParseEscapeSequences: RestoreSnapshotStateOptions['setParseEscapeSequences'];
  setReplaceValue: RestoreSnapshotStateOptions['setReplaceValue'];
  setResultFilterKeyword: RestoreSnapshotStateOptions['setResultFilterKeyword'];
  setResultFilterStepLoadingDirection: (value: 'prev' | 'next' | null) => void;
  setResultPanelHeight: RestoreSnapshotStateOptions['setResultPanelHeight'];
  setResultPanelState: RestoreSnapshotStateOptions['setResultPanelState'];
  setReverseSearch: RestoreSnapshotStateOptions['setReverseSearch'];
  setSearchMode: RestoreSnapshotStateOptions['setSearchMode'];
  setSearchSessionId: (value: string | null) => void;
  setSearchSidebarWidth: RestoreSnapshotStateOptions['setSearchSidebarWidth'];
  setTotalFilterMatchedLineCount: Dispatch<SetStateAction<number | null>>;
  setTotalMatchCount: Dispatch<SetStateAction<number | null>>;
  setTotalMatchedLineCount: Dispatch<SetStateAction<number | null>>;
  // Snapshot inputs (for persistence effect)
  appliedResultFilterKeyword: string;
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  filterMatches: FilterMatch[];
  isOpen: boolean;
  matches: SearchMatch[];
  panelMode: PanelMode;
  replaceValue: string;
  resultFilterKeyword: string;
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  reverseSearch: boolean;
  searchSidebarWidth: number;
  totalFilterMatchedLineCount: number | null;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
}

export interface UseSearchExecutionResult {
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
  loadMoreFilterMatches: () => Promise<FilterMatch[] | null>;
  loadMoreMatches: () => Promise<SearchMatch[] | null>;
  requestStopResultFilterSearch: () => void;
}

export function useSearchExecution(options: UseSearchExecutionOptions): UseSearchExecutionResult {
  const {
    activeTabId,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    keyword,
    parseEscapeSequences,
    searchMode,
    startTransition,
    filterFailedLabel,
    searchFailedLabel,
    cachedFilterRef,
    cachedSearchRef,
    chunkCursorRef,
    countCacheRef,
    filterCountCacheRef,
    filterLineCursorRef,
    filterRunVersionRef,
    filterSessionIdRef,
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    previousActiveTabIdRef,
    resultFilterStepRunVersionRef,
    runVersionRef,
    searchSessionIdRef,
    sessionRestoreRunVersionRef,
    stopResultFilterSearchRef,
    tabSearchPanelStateRef,
    resetFilterState,
    resetSearchState,
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
    appliedResultFilterKeyword,
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    isOpen,
    matches,
    panelMode,
    replaceValue,
    resultFilterKeyword,
    resultPanelHeight,
    resultPanelState,
    reverseSearch,
    searchSidebarWidth,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  } = options;

  // ----- batch control (was useSearchBatchControl) -----

  const requestStopResultFilterSearch = useCallback(() => {
    stopResultFilterSearchRef.current = true;
    runVersionRef.current += 1;
    filterRunVersionRef.current += 1;
  }, [filterRunVersionRef, runVersionRef, stopResultFilterSearchRef]);

  const cancelPendingBatchLoad = useCallback(() => {
    loadMoreSessionRef.current += 1;
    resultFilterStepRunVersionRef.current += 1;
    if (loadMoreDebounceRef.current !== null) {
      window.clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }
    setResultFilterStepLoadingDirection(null);
    if (loadMoreLockRef.current) {
      loadMoreLockRef.current = false;
      setIsSearching(false);
    }
  }, [
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    resultFilterStepRunVersionRef,
    setIsSearching,
    setResultFilterStepLoadingDirection,
  ]);

  // ----- run handlers (was useSearchPanelRunHandlers) -----

  const executeSearch = useCallback(
    async (
      forceRefresh = false,
      silent = false,
      resultFilterKeywordOverride?: string,
    ): Promise<SearchRunResult | null> => {
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
            totalMatchedLines,
            totalMatches,
          } = await resolveSearchRunStartState({
            activeTabId,
            caseSensitive,
            effectiveResultFilterKeyword,
            effectiveSearchKeyword,
            maxResults: SEARCH_CHUNK_SIZE,
            searchMode,
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
            startTransition,
            totalMatchedLines,
            totalMatches,
          });

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
    ],
  );

  const executeFilter = useCallback(
    async (
      forceRefresh = false,
      silent = false,
      resultFilterKeywordOverride?: string,
    ): Promise<FilterRunResult | null> => {
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
            totalMatchedLines,
          } = await resolveFilterRunStartState({
            activeTabId,
            caseSensitive,
            effectiveResultFilterKeyword,
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
            startTransition,
            totalMatchedLines,
          });

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
    ],
  );

  // ----- load more handlers (was useSearchPanelLoadMoreHandlers) -----

  const loadMoreMatches = useCallback(async (): Promise<SearchMatch[] | null> => {
    if (!activeTabId || isFilterMode) {
      return null;
    }

    if (chunkCursorRef.current === null) {
      return null;
    }

    return runSearchPanelLoadMoreOperation({
      errorPrefix: searchFailedLabel,
      loadMoreLockRef,
      loadMoreSessionRef,
      resolveLoadMoreMatches: async (sessionId) => {
        let appendedMatches: SearchMatch[] = [];
        let nextOffset: number | null = null;
        let documentVersion = cachedSearchRef.current?.documentVersion ?? 0;

        const searchSessionState = await resolveSearchLoadMoreSessionState({
          activeSearchSessionId: searchSessionIdRef.current,
          documentVersion,
          loadMoreSessionId: sessionId,
          loadMoreSessionRef,
          maxResults: SEARCH_CHUNK_SIZE,
          setSearchSessionId,
        });
        if (searchSessionState.aborted) {
          return null;
        }

        if (!searchSessionState.nextState) {
          return null;
        }
        appendedMatches = searchSessionState.nextState.matches;
        nextOffset = searchSessionState.nextState.nextOffset;
        documentVersion = searchSessionState.nextState.documentVersion;

        applySearchLoadMoreResult({
          activeTabId,
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
      },
      setErrorMessage,
      setIsSearching,
    });
  }, [
    activeTabId,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    isFilterMode,
    parseEscapeSequences,
    searchFailedLabel,
    searchMode,
    setSearchSessionId,
  ]);

  const loadMoreFilterMatches = useCallback(async (): Promise<FilterMatch[] | null> => {
    if (!activeTabId) {
      return null;
    }

    if (filterLineCursorRef.current === null) {
      return null;
    }

    return runSearchPanelLoadMoreOperation({
      errorPrefix: filterFailedLabel,
      loadMoreLockRef,
      loadMoreSessionRef,
      resolveLoadMoreMatches: async (sessionId) => {
        let appendedMatches: FilterMatch[] = [];
        let nextLine: number | null = null;
        let documentVersion = cachedFilterRef.current?.documentVersion ?? 0;

        const filterSessionState = await resolveFilterLoadMoreSessionState({
          activeFilterSessionId: filterSessionIdRef.current,
          documentVersion,
          loadMoreSessionId: sessionId,
          loadMoreSessionRef,
          maxResults: FILTER_CHUNK_SIZE,
          setFilterSessionId,
        });
        if (filterSessionState.aborted) {
          return null;
        }

        if (!filterSessionState.nextState) {
          return null;
        }
        appendedMatches = filterSessionState.nextState.matches;
        nextLine = filterSessionState.nextState.nextLine;
        documentVersion = filterSessionState.nextState.documentVersion;

        applyFilterLoadMoreResult({
          activeTabId,
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
      },
      setErrorMessage,
      setIsSearching,
    });
  }, [
    activeTabId,
    backendResultFilterKeyword,
    filterFailedLabel,
    filterRulesKey,
    setFilterSessionId,
  ]);

  // ----- first-match search (was useSearchFirstMatchSearch) -----

  const executeFirstMatchSearch = useCallback(
    async (reverse: boolean): Promise<SearchRunResult | null> => {
      cancelPendingBatchLoad();
      if (!activeTabId || !keyword || isFilterMode) {
        return null;
      }

      const runVersion = runVersionRef.current + 1;
      runVersionRef.current = runVersion;
      setIsSearching(true);

      try {
        const { documentVersion, firstMatch } = await resolveSearchFirstMatchState({
          activeTabId,
          caseSensitive,
          effectiveSearchKeyword,
          reverse,
          searchMode,
        });

        if (runVersionRef.current !== runVersion) {
          return null;
        }

        const immediateResult = applyResolvedSearchFirstMatchResult({
          activeTabId,
          cachedSearchRef,
          caseSensitive,
          chunkCursorRef,
          documentVersion,
          effectiveResultFilterKeyword: backendResultFilterKeyword,
          effectiveSearchKeyword,
          firstMatch,
          parseEscapeSequences,
          resetSearchState,
          searchMode,
          setCurrentMatchIndex,
          setErrorMessage,
          setIsSearching,
          setMatches,
          setSearchSessionId,
          startTransition,
        });

        if (!firstMatch) {
          return immediateResult;
        }

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
          prefix: searchFailedLabel,
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
    },
    [
      activeTabId,
      backendResultFilterKeyword,
      cancelPendingBatchLoad,
      caseSensitive,
      effectiveSearchKeyword,
      executeSearch,
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
      startTransition,
    ],
  );

  // ----- session restore effect (was useSearchPanelRestoreEffect) -----

  useEffect(() => {
    const restoreRunVersion = sessionRestoreRunVersionRef.current + 1;
    sessionRestoreRunVersionRef.current = restoreRunVersion;

    if (!activeTabId) {
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

    const nextSnapshot = tabSearchPanelStateRef.current[activeTabId];
    if (nextSnapshot) {
      const { restoredResultFilterKeyword } = restoreSearchPanelSnapshotState({
        activeTabId,
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
        activeTabId,
        restoredResultFilterKeyword,
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
              activeTabId,
              cachedSearchRef,
              chunkCursorRef,
              countCacheRef,
              parseEscapeSequences: snapshotParseEscapeSequences,
              restoreResult: restoreResultValue,
              restoredResultFilterKeyword,
              searchMode: snapshotSearchMode,
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
              sessionRestoreRunVersionRef,
            });
          });
      }

      const filterSessionRestoreRequest = buildFilterSessionRestoreRequest({
        activeTabId,
        filterRulesKey,
        filterRulesPayload,
        restoredResultFilterKeyword,
        snapshot: nextSnapshot,
      });

      if (filterSessionRestoreRequest) {
        const { invokeArgs, snapshotFilterDocumentVersion } = filterSessionRestoreRequest;

        void invoke<unknown>('filter_session_restore_in_document', invokeArgs)
          .then((restoreResultValue) => {
            if (restoreRunVersion !== sessionRestoreRunVersionRef.current) {
              return;
            }

            if (!isFilterSessionRestoreBackendResult(restoreResultValue)) {
              return;
            }

            applyFilterSessionRestoreResult({
              activeTabId,
              cachedFilterRef,
              filterCountCacheRef,
              filterLineCursorRef,
              filterRulesKey,
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
      activeTabId,
      previousActiveTabIdRef,
      setErrorMessage,
      setFeedbackMessage,
      setIsResultFilterSearching,
      stopResultFilterSearchRef,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, resetFilterState, resetSearchState, setFilterSessionId, setSearchSessionId]);

  // ----- snapshot persistence effect (was useSearchPanelSnapshotPersistence) -----

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    tabSearchPanelStateRef.current[activeTabId] = {
      isOpen,
      panelMode,
      resultPanelState,
      resultPanelHeight,
      searchSidebarWidth,
      keyword,
      replaceValue,
      searchMode,
      caseSensitive,
      parseEscapeSequences,
      reverseSearch,
      resultFilterKeyword,
      appliedResultFilterKeyword,
      matches,
      filterMatches,
      currentMatchIndex,
      currentFilterMatchIndex,
      totalMatchCount,
      totalMatchedLineCount,
      totalFilterMatchedLineCount,
      searchSessionId: searchSessionIdRef.current,
      filterSessionId: filterSessionIdRef.current,
      searchNextOffset: chunkCursorRef.current,
      filterNextLine: filterLineCursorRef.current,
      searchDocumentVersion: cachedSearchRef.current?.documentVersion ?? null,
      filterDocumentVersion: cachedFilterRef.current?.documentVersion ?? null,
      filterRulesKey: cachedFilterRef.current?.rulesKey ?? filterRulesKey,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTabId,
    appliedResultFilterKeyword,
    caseSensitive,
    parseEscapeSequences,
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    filterRulesKey,
    isOpen,
    keyword,
    matches,
    panelMode,
    replaceValue,
    resultFilterKeyword,
    resultPanelState,
    resultPanelHeight,
    searchSidebarWidth,
    reverseSearch,
    searchMode,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  ]);

  return {
    cancelPendingBatchLoad,
    executeFilter,
    executeFirstMatchSearch,
    executeSearch,
    loadMoreFilterMatches,
    loadMoreMatches,
    requestStopResultFilterSearch,
  };
}
