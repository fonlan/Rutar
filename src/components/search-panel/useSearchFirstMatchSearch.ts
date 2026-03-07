import { useCallback, type MutableRefObject } from 'react';
import { applyResolvedSearchFirstMatchResult } from './applySearchPanelFirstMatchResult';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import { resolveSearchFirstMatchState } from './resolveSearchPanelFirstMatchState';
import type { SearchRunResult } from './types';

type FirstMatchResultOptions = Parameters<typeof applyResolvedSearchFirstMatchResult>[0];
type ResolveFirstMatchStateOptions = Parameters<typeof resolveSearchFirstMatchState>[0];

interface UseSearchFirstMatchSearchOptions {
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  cachedSearchRef: FirstMatchResultOptions['cachedSearchRef'];
  cancelPendingBatchLoad: () => void;
  caseSensitive: ResolveFirstMatchStateOptions['caseSensitive'];
  chunkCursorRef: FirstMatchResultOptions['chunkCursorRef'];
  effectiveSearchKeyword: ResolveFirstMatchStateOptions['effectiveSearchKeyword'];
  executeSearch: (
    forceRefresh?: boolean,
    silent?: boolean,
    resultFilterKeywordOverride?: string
  ) => Promise<SearchRunResult | null>;
  isFilterMode: boolean;
  keyword: string;
  parseEscapeSequences: FirstMatchResultOptions['parseEscapeSequences'];
  resetSearchState: FirstMatchResultOptions['resetSearchState'];
  runVersionRef: MutableRefObject<number>;
  searchFailedLabel: string;
  searchMode: ResolveFirstMatchStateOptions['searchMode'];
  setCurrentMatchIndex: FirstMatchResultOptions['setCurrentMatchIndex'];
  setErrorMessage: FirstMatchResultOptions['setErrorMessage'];
  setIsSearching: FirstMatchResultOptions['setIsSearching'];
  setMatches: FirstMatchResultOptions['setMatches'];
  setSearchSessionId: FirstMatchResultOptions['setSearchSessionId'];
  startTransition: FirstMatchResultOptions['startTransition'];
}

export function useSearchFirstMatchSearch({
  activeTabId,
  backendResultFilterKeyword,
  cachedSearchRef,
  cancelPendingBatchLoad,
  caseSensitive,
  chunkCursorRef,
  effectiveSearchKeyword,
  executeSearch,
  isFilterMode,
  keyword,
  parseEscapeSequences,
  resetSearchState,
  runVersionRef,
  searchFailedLabel,
  searchMode,
  setCurrentMatchIndex,
  setErrorMessage,
  setIsSearching,
  setMatches,
  setSearchSessionId,
  startTransition,
}: UseSearchFirstMatchSearchOptions) {
  return useCallback(async (reverse: boolean): Promise<SearchRunResult | null> => {
    cancelPendingBatchLoad();
    if (!activeTabId || !keyword || isFilterMode) {
      return null;
    }

    const runVersion = runVersionRef.current + 1;
    runVersionRef.current = runVersion;
    setIsSearching(true);

    try {
      const {
        documentVersion,
        firstMatch,
      } = await resolveSearchFirstMatchState({
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
  }, [
    activeTabId,
    backendResultFilterKeyword,
    cachedSearchRef,
    cancelPendingBatchLoad,
    caseSensitive,
    chunkCursorRef,
    effectiveSearchKeyword,
    executeSearch,
    isFilterMode,
    keyword,
    parseEscapeSequences,
    resetSearchState,
    runVersionRef,
    searchFailedLabel,
    searchMode,
    setCurrentMatchIndex,
    setErrorMessage,
    setIsSearching,
    setMatches,
    setSearchSessionId,
    startTransition,
  ]);
}