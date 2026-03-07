import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import { resolveFilterLoadMoreSessionState, resolveSearchLoadMoreSessionState } from './applySearchPanelLoadMoreSessionResults';
import { applySearchPanelErrorMessage } from './applySearchPanelErrorMessage';
import {
  applyFilterLoadMoreResult,
  applySearchLoadMoreResult,
} from './applySearchPanelRunResults';
import { resolveFilterLoadMoreFallbackState, resolveSearchLoadMoreFallbackState } from './resolveSearchPanelLoadMoreFallback';
import type {
  FilterMatch,
  FilterRuleInputPayload,
  SearchMatch,
  SearchMode,
} from './types';
import { FILTER_CHUNK_SIZE, SEARCH_CHUNK_SIZE } from './utils';

interface CachedSearchSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  sessionId: string | null;
}

interface CachedFilterSnapshot {
  tabId: string;
  rulesKey: string;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: FilterMatch[];
  nextLine: number | null;
  sessionId: string | null;
}

interface RunSearchPanelLoadMoreOperationOptions<TMatch> {
  errorPrefix: string;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreSessionRef: MutableRefObject<number>;
  resolveLoadMoreMatches: (sessionId: number) => Promise<TMatch[] | null>;
  setErrorMessage: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
}

interface UseSearchPanelLoadMoreHandlersOptions {
  activeTabId: string | null;
  backendResultFilterKeyword: string;
  cachedFilterRef: MutableRefObject<CachedFilterSnapshot | null>;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveSearchKeyword: string;
  filterFailedLabel: string;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  filterRulesPayload: FilterRuleInputPayload[];
  filterSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  filterSessionIdRef: MutableRefObject<string | null>;
  isFilterMode: boolean;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreSessionRef: MutableRefObject<number>;
  parseEscapeSequences: boolean;
  searchFailedLabel: string;
  searchMode: SearchMode;
  searchSessionCommandUnsupportedRef: MutableRefObject<boolean>;
  searchSessionIdRef: MutableRefObject<string | null>;
  setErrorMessage: (value: string | null) => void;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
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

export function useSearchPanelLoadMoreHandlers({
  activeTabId,
  backendResultFilterKeyword,
  cachedFilterRef,
  cachedSearchRef,
  caseSensitive,
  chunkCursorRef,
  effectiveSearchKeyword,
  filterFailedLabel,
  filterLineCursorRef,
  filterRulesKey,
  filterRulesPayload,
  filterSessionCommandUnsupportedRef,
  filterSessionIdRef,
  isFilterMode,
  loadMoreLockRef,
  loadMoreSessionRef,
  parseEscapeSequences,
  searchFailedLabel,
  searchMode,
  searchSessionCommandUnsupportedRef,
  searchSessionIdRef,
  setErrorMessage,
  setFilterMatches,
  setFilterSessionId,
  setIsSearching,
  setMatches,
  setSearchSessionId,
  startTransition,
}: UseSearchPanelLoadMoreHandlersOptions) {
  const loadMoreMatches = useCallback(async (): Promise<SearchMatch[] | null> => {
    if (!activeTabId || isFilterMode) {
      return null;
    }

    const startOffset = chunkCursorRef.current;
    if (startOffset === null) {
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
        let usedSessionMode = false;

        const searchSessionState = await resolveSearchLoadMoreSessionState({
          activeSearchSessionId: searchSessionIdRef.current,
          documentVersion,
          loadMoreSessionId: sessionId,
          loadMoreSessionRef,
          maxResults: SEARCH_CHUNK_SIZE,
          searchSessionCommandUnsupportedRef,
          setSearchSessionId,
        });
        if (searchSessionState.aborted) {
          return null;
        }
        if (searchSessionState.nextState) {
          usedSessionMode = true;
          appendedMatches = searchSessionState.nextState.matches;
          nextOffset = searchSessionState.nextState.nextOffset;
          documentVersion = searchSessionState.nextState.documentVersion;
        }

        if (!usedSessionMode) {
          const fallbackState = await resolveSearchLoadMoreFallbackState({
            activeTabId,
            cachedSearch: cachedSearchRef.current,
            cachedSearchRef,
            caseSensitive,
            chunkCursorRef,
            effectiveResultFilterKeyword: backendResultFilterKeyword,
            effectiveSearchKeyword,
            loadMoreSessionId: sessionId,
            loadMoreSessionRef,
            parseEscapeSequences,
            searchMode,
            setSearchSessionId,
            startOffset,
            maxResults: SEARCH_CHUNK_SIZE,
          });
          if (!fallbackState) {
            return null;
          }

          appendedMatches = fallbackState.appendedMatches;
          nextOffset = fallbackState.nextOffset;
          documentVersion = fallbackState.documentVersion;
        }

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

    const startLine = filterLineCursorRef.current;
    if (startLine === null) {
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
        let usedSessionMode = false;

        const filterSessionState = await resolveFilterLoadMoreSessionState({
          activeFilterSessionId: filterSessionIdRef.current,
          documentVersion,
          filterSessionCommandUnsupportedRef,
          loadMoreSessionId: sessionId,
          loadMoreSessionRef,
          maxResults: FILTER_CHUNK_SIZE,
          setFilterSessionId,
        });
        if (filterSessionState.aborted) {
          return null;
        }
        if (filterSessionState.nextState) {
          usedSessionMode = true;
          appendedMatches = filterSessionState.nextState.matches;
          nextLine = filterSessionState.nextState.nextLine;
          documentVersion = filterSessionState.nextState.documentVersion;
        }

        if (!usedSessionMode) {
          const fallbackState = await resolveFilterLoadMoreFallbackState({
            activeTabId,
            cachedFilter: cachedFilterRef.current,
            cachedFilterRef,
            caseSensitive,
            effectiveResultFilterKeyword: backendResultFilterKeyword,
            filterLineCursorRef,
            filterRulesKey,
            loadMoreSessionId: sessionId,
            loadMoreSessionRef,
            rules: filterRulesPayload,
            setFilterSessionId,
            startLine,
            maxResults: FILTER_CHUNK_SIZE,
          });
          if (!fallbackState) {
            return null;
          }

          appendedMatches = fallbackState.appendedMatches;
          nextLine = fallbackState.nextLine;
          documentVersion = fallbackState.documentVersion;
        }

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
    caseSensitive,
    filterFailedLabel,
    filterRulesKey,
    filterRulesPayload,
    setFilterSessionId,
  ]);

  return {
    loadMoreFilterMatches,
    loadMoreMatches,
  };
}