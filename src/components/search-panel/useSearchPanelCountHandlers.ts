import { invoke } from '@tauri-apps/api/core';
import { useCallback, type MutableRefObject } from 'react';
import {
  applyCachedFilterCountHit,
  applyCachedSearchCountHit,
  applyFilterCountResult,
  applySearchCountResult,
  handleFilterCountFailure,
  handleSearchCountFailure,
} from './applySearchPanelCountResults';
import { buildFilterCountRequest, buildSearchCountRequest } from './buildSearchPanelRunRequests';
import { matchesSearchPanelFilterCacheIdentity, matchesSearchPanelSearchCacheIdentity } from './matchesSearchPanelCacheIdentity';
import { matchesSearchPanelDocumentVersion } from './readSearchPanelDocumentVersion';
import { runSearchPanelVersionedAsyncOperation } from './searchPanelRunLifecycle';
import type { FilterCountBackendResult, SearchCountBackendResult } from './types';

type ApplySearchCountResultOptions = Parameters<typeof applySearchCountResult>[0];
type ApplyFilterCountResultOptions = Parameters<typeof applyFilterCountResult>[0];
type HandleSearchCountFailureOptions = Parameters<typeof handleSearchCountFailure>[0];
type HandleFilterCountFailureOptions = Parameters<typeof handleFilterCountFailure>[0];
type BuildSearchCountRequestOptions = Parameters<typeof buildSearchCountRequest>[0];
type BuildFilterCountRequestOptions = Parameters<typeof buildFilterCountRequest>[0];

interface UseSearchPanelCountHandlersOptions {
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  caseSensitive: BuildSearchCountRequestOptions['caseSensitive'];
  countCacheRef: ApplySearchCountResultOptions['countCacheRef'];
  countRunVersionRef: MutableRefObject<number>;
  effectiveSearchKeyword: BuildSearchCountRequestOptions['effectiveSearchKeyword'];
  filterCountCacheRef: ApplyFilterCountResultOptions['filterCountCacheRef'];
  filterCountRunVersionRef: MutableRefObject<number>;
  filterRulesKey: ApplyFilterCountResultOptions['filterRulesKey'];
  filterRulesPayload: BuildFilterCountRequestOptions['rules'];
  isFilterMode: boolean;
  keyword: string;
  parseEscapeSequences: ApplySearchCountResultOptions['parseEscapeSequences'];
  searchMode: BuildSearchCountRequestOptions['searchMode'];
  setTotalFilterMatchedLineCount: HandleFilterCountFailureOptions['setTotalFilterMatchedLineCount'];
  setTotalMatchCount: HandleSearchCountFailureOptions['setTotalMatchCount'];
  setTotalMatchedLineCount: HandleSearchCountFailureOptions['setTotalMatchedLineCount'];
}

export function useSearchPanelCountHandlers({
  activeTabId,
  backendResultFilterKeyword,
  caseSensitive,
  countCacheRef,
  countRunVersionRef,
  effectiveSearchKeyword,
  filterCountCacheRef,
  filterCountRunVersionRef,
  filterRulesKey,
  filterRulesPayload,
  isFilterMode,
  keyword,
  parseEscapeSequences,
  searchMode,
  setTotalFilterMatchedLineCount,
  setTotalMatchCount,
  setTotalMatchedLineCount,
}: UseSearchPanelCountHandlersOptions) {
  const executeCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTabId || !keyword || isFilterMode) {
      setTotalMatchCount(keyword ? 0 : null);
      setTotalMatchedLineCount(keyword ? 0 : null);
      return;
    }

    if (!forceRefresh) {
      const cached = countCacheRef.current;
      if (matchesSearchPanelSearchCacheIdentity(cached, {
        tabId: activeTabId,
        keyword: effectiveSearchKeyword,
        searchMode,
        caseSensitive,
        parseEscapeSequences,
        resultFilterKeyword: effectiveResultFilterKeyword,
      })) {
        if (await matchesSearchPanelDocumentVersion({
          activeTabId,
          cachedDocumentVersion: cached.documentVersion,
          warnLabel: 'Failed to read document version for count:',
        })) {
          applyCachedSearchCountHit({
            cached,
            setTotalMatchCount,
            setTotalMatchedLineCount,
          });
          return;
        }
      }
    }

    return runSearchPanelVersionedAsyncOperation({
      runVersionRef: countRunVersionRef,
      run: () => invoke<SearchCountBackendResult>(
        'search_count_in_document',
        buildSearchCountRequest({
          activeTabId,
          effectiveSearchKeyword,
          searchMode,
          caseSensitive,
          effectiveResultFilterKeyword,
        })
      ),
      applyResult: (result) => {
        applySearchCountResult({
          activeTabId,
          caseSensitive,
          countCacheRef,
          effectiveResultFilterKeyword,
          effectiveSearchKeyword,
          parseEscapeSequences,
          result,
          searchMode,
          setTotalMatchCount,
          setTotalMatchedLineCount,
        });
      },
      handleError: (error) => {
        handleSearchCountFailure({
          error,
          setTotalMatchCount,
          setTotalMatchedLineCount,
        });
      },
    });
  }, [
    activeTabId,
    backendResultFilterKeyword,
    caseSensitive,
    effectiveSearchKeyword,
    isFilterMode,
    keyword,
    parseEscapeSequences,
    searchMode,
    setTotalMatchCount,
    setTotalMatchedLineCount,
  ]);

  const executeFilterCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTabId) {
      setTotalFilterMatchedLineCount(null);
      return;
    }

    if (filterRulesPayload.length === 0) {
      setTotalFilterMatchedLineCount(0);
      return;
    }

    if (!forceRefresh) {
      const cached = filterCountCacheRef.current;
      if (matchesSearchPanelFilterCacheIdentity(cached, {
        tabId: activeTabId,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
      })) {
        if (await matchesSearchPanelDocumentVersion({
          activeTabId,
          cachedDocumentVersion: cached.documentVersion,
          warnLabel: 'Failed to read document version for filter count:',
        })) {
          applyCachedFilterCountHit({
            cached,
            setTotalFilterMatchedLineCount,
          });
          return;
        }
      }
    }

    return runSearchPanelVersionedAsyncOperation({
      runVersionRef: filterCountRunVersionRef,
      run: () => invoke<FilterCountBackendResult>(
        'filter_count_in_document',
        buildFilterCountRequest({
          activeTabId,
          rules: filterRulesPayload,
          effectiveResultFilterKeyword,
          caseSensitive,
        })
      ),
      applyResult: (result) => {
        applyFilterCountResult({
          activeTabId,
          effectiveResultFilterKeyword,
          filterCountCacheRef,
          filterRulesKey,
          result,
          setTotalFilterMatchedLineCount,
        });
      },
      handleError: (error) => {
        handleFilterCountFailure({
          error,
          setTotalFilterMatchedLineCount,
        });
      },
    });
  }, [
    activeTabId,
    backendResultFilterKeyword,
    caseSensitive,
    filterRulesKey,
    filterRulesPayload,
    setTotalFilterMatchedLineCount,
  ]);

  return {
    executeCountSearch,
    executeFilterCountSearch,
  };
}
