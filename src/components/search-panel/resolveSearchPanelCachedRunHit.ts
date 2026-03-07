import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  TransitionStartFunction,
} from 'react';
import {
  applyCachedFilterRunHit,
  applyCachedSearchRunHit,
} from './applySearchPanelRunResults';
import { matchesSearchPanelFilterCacheIdentity, matchesSearchPanelSearchCacheIdentity } from './matchesSearchPanelCacheIdentity';
import { matchesSearchPanelDocumentVersion } from './readSearchPanelDocumentVersion';
import type {
  FilterMatch,
  FilterRunResult,
  SearchMatch,
  SearchMode,
  SearchRunResult,
} from './types';

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

interface ResolveCachedSearchRunHitOptions {
  activeTabId: string;
  cached: CachedSearchSnapshot | null;
  caseSensitive: boolean;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  parseEscapeSequences: boolean;
  searchMode: SearchMode;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
}

interface ResolveCachedFilterRunHitOptions {
  activeTabId: string;
  cached: CachedFilterSnapshot | null;
  effectiveResultFilterKeyword: string;
  filterLineCursorRef: MutableRefObject<number | null>;
  filterRulesKey: string;
  setCurrentFilterMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setFilterMatches: Dispatch<SetStateAction<FilterMatch[]>>;
  setFilterSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
}

export async function resolveCachedSearchRunHit({
  activeTabId,
  cached,
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
}: ResolveCachedSearchRunHitOptions): Promise<SearchRunResult | null> {
  if (!matchesSearchPanelSearchCacheIdentity(cached, {
    tabId: activeTabId,
    keyword: effectiveSearchKeyword,
    searchMode,
    caseSensitive,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
  })) {
    return null;
  }

  if (!(await matchesSearchPanelDocumentVersion({
    activeTabId,
    cachedDocumentVersion: cached.documentVersion,
    warnLabel: 'Failed to read document version:',
  }))) {
    return null;
  }

  return applyCachedSearchRunHit({
    cached,
    chunkCursorRef,
    setCurrentMatchIndex,
    setErrorMessage,
    setMatches,
    setSearchSessionId,
    startTransition,
  });
}

export async function resolveCachedFilterRunHit({
  activeTabId,
  cached,
  effectiveResultFilterKeyword,
  filterLineCursorRef,
  filterRulesKey,
  setCurrentFilterMatchIndex,
  setErrorMessage,
  setFilterMatches,
  setFilterSessionId,
  startTransition,
}: ResolveCachedFilterRunHitOptions): Promise<FilterRunResult | null> {
  if (!matchesSearchPanelFilterCacheIdentity(cached, {
    tabId: activeTabId,
    rulesKey: filterRulesKey,
    resultFilterKeyword: effectiveResultFilterKeyword,
  })) {
    return null;
  }

  if (!(await matchesSearchPanelDocumentVersion({
    activeTabId,
    cachedDocumentVersion: cached.documentVersion,
    warnLabel: 'Failed to read document version for filter:',
  }))) {
    return null;
  }

  return applyCachedFilterRunHit({
    cached,
    filterLineCursorRef,
    setCurrentFilterMatchIndex,
    setErrorMessage,
    setFilterMatches,
    setFilterSessionId,
    startTransition,
  });
}
