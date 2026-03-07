import { invoke } from '@tauri-apps/api/core';
import { useEffect, type MutableRefObject } from 'react';
import { applyFilterSessionRestoreResult, handleFilterSessionRestoreError } from './applyFilterSessionRestoreResult';
import { applySearchSessionRestoreResult, handleSearchSessionRestoreError } from './applySearchSessionRestoreResult';
import { buildFilterSessionRestoreRequest, buildSearchSessionRestoreRequest } from './buildSearchPanelRestoreRequests';
import { isFilterSessionRestoreBackendResult, isSearchSessionRestoreBackendResult } from './backendGuards';
import { finalizeSearchPanelRestoreCycle } from './finalizeSearchPanelRestoreCycle';
import { resetSearchPanelForInactiveTab } from './resetSearchPanelForInactiveTab';
import { resetSearchPanelForMissingSnapshot } from './resetSearchPanelForMissingSnapshot';
import { restoreSearchPanelSnapshotState } from './restoreSearchPanelSnapshotState';
import type { FilterRuleInputPayload, TabSearchPanelSnapshot } from './types';
import { RESULT_PANEL_DEFAULT_HEIGHT, SEARCH_SIDEBAR_DEFAULT_WIDTH } from './utils';

type ResetInactiveTabOptions = Parameters<typeof resetSearchPanelForInactiveTab>[0];
type RestoreSnapshotStateOptions = Parameters<typeof restoreSearchPanelSnapshotState>[0];
type FinalizeRestoreCycleOptions = Parameters<typeof finalizeSearchPanelRestoreCycle>[0];

interface UseSearchPanelRestoreEffectOptions {
  activeTabId: string | null;
  cachedFilterRef: RestoreSnapshotStateOptions['cachedFilterRef'];
  cachedSearchRef: RestoreSnapshotStateOptions['cachedSearchRef'];
  chunkCursorRef: RestoreSnapshotStateOptions['chunkCursorRef'];
  countCacheRef: RestoreSnapshotStateOptions['countCacheRef'];
  filterCountCacheRef: RestoreSnapshotStateOptions['filterCountCacheRef'];
  filterLineCursorRef: RestoreSnapshotStateOptions['filterLineCursorRef'];
  filterRulesKey: string;
  filterRulesPayload: FilterRuleInputPayload[];
  filterSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  previousActiveTabIdRef: FinalizeRestoreCycleOptions['previousActiveTabIdRef'];
  resetFilterState: ResetInactiveTabOptions['resetFilterState'];
  resetSearchState: ResetInactiveTabOptions['resetSearchState'];
  searchSessionRestoreCommandUnsupportedRef: MutableRefObject<boolean>;
  sessionRestoreRunVersionRef: MutableRefObject<number>;
  setAppliedResultFilterKeyword: RestoreSnapshotStateOptions['setAppliedResultFilterKeyword'];
  setCaseSensitive: RestoreSnapshotStateOptions['setCaseSensitive'];
  setCurrentFilterMatchIndex: RestoreSnapshotStateOptions['setCurrentFilterMatchIndex'];
  setCurrentMatchIndex: RestoreSnapshotStateOptions['setCurrentMatchIndex'];
  setErrorMessage: FinalizeRestoreCycleOptions['setErrorMessage'];
  setFeedbackMessage: FinalizeRestoreCycleOptions['setFeedbackMessage'];
  setFilterMatches: RestoreSnapshotStateOptions['setFilterMatches'];
  setFilterSessionId: RestoreSnapshotStateOptions['setFilterSessionId'];
  setIsOpen: RestoreSnapshotStateOptions['setIsOpen'];
  setIsResultFilterSearching: FinalizeRestoreCycleOptions['setIsResultFilterSearching'];
  setKeyword: RestoreSnapshotStateOptions['setKeyword'];
  setMatches: RestoreSnapshotStateOptions['setMatches'];
  setPanelMode: RestoreSnapshotStateOptions['setPanelMode'];
  setParseEscapeSequences: RestoreSnapshotStateOptions['setParseEscapeSequences'];
  setReplaceValue: RestoreSnapshotStateOptions['setReplaceValue'];
  setResultFilterKeyword: RestoreSnapshotStateOptions['setResultFilterKeyword'];
  setResultPanelHeight: RestoreSnapshotStateOptions['setResultPanelHeight'];
  setResultPanelState: RestoreSnapshotStateOptions['setResultPanelState'];
  setReverseSearch: RestoreSnapshotStateOptions['setReverseSearch'];
  setSearchMode: RestoreSnapshotStateOptions['setSearchMode'];
  setSearchSessionId: RestoreSnapshotStateOptions['setSearchSessionId'];
  setSearchSidebarWidth: RestoreSnapshotStateOptions['setSearchSidebarWidth'];
  setTotalFilterMatchedLineCount: RestoreSnapshotStateOptions['setTotalFilterMatchedLineCount'];
  setTotalMatchCount: RestoreSnapshotStateOptions['setTotalMatchCount'];
  setTotalMatchedLineCount: RestoreSnapshotStateOptions['setTotalMatchedLineCount'];
  stopResultFilterSearchRef: FinalizeRestoreCycleOptions['stopResultFilterSearchRef'];
  tabSearchPanelStateRef: MutableRefObject<Record<string, TabSearchPanelSnapshot>>;
}

export function useSearchPanelRestoreEffect({
  activeTabId,
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
}: UseSearchPanelRestoreEffectOptions) {
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
        searchSessionRestoreCommandUnsupported: searchSessionRestoreCommandUnsupportedRef.current,
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
              searchSessionRestoreCommandUnsupportedRef,
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
              searchSessionRestoreCommandUnsupportedRef,
              sessionRestoreRunVersionRef,
            });
          });
      }

      const filterSessionRestoreRequest = buildFilterSessionRestoreRequest({
        activeTabId,
        filterRulesKey,
        filterRulesPayload,
        filterSessionRestoreCommandUnsupported: filterSessionRestoreCommandUnsupportedRef.current,
        restoredResultFilterKeyword,
        snapshot: nextSnapshot,
      });

      if (filterSessionRestoreRequest) {
        const {
          invokeArgs,
          snapshotFilterDocumentVersion,
        } = filterSessionRestoreRequest;

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
              filterSessionRestoreCommandUnsupportedRef,
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
              filterSessionRestoreCommandUnsupportedRef,
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
  }, [activeTabId, resetFilterState, resetSearchState, setFilterSessionId, setSearchSessionId]);
}