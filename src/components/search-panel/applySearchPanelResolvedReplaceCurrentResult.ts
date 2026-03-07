import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import { applyReplaceNextMatchNavigation, applyReplaceSuccessEffects } from './applySearchPanelReplaceSuccessEffects';
import { applyReplaceOperationGuard } from './applySearchPanelReplaceSearchGuard';
import { applyReplaceCurrentSearchResult } from './applySearchPanelRunResults';
import type { ReplaceCurrentAndSearchChunkBackendResult, SearchMatch, SearchMode } from './types';

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

interface SearchCountCacheSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  totalMatches: number;
  matchedLines: number;
}

interface ApplyResolvedReplaceCurrentResultOptions {
  activeTabId: string;
  boundedCurrentIndex: number;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  currentMatchIndexRef: MutableRefObject<number>;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  fallbackLineCount: number;
  feedbackMessage: string;
  navigateToMatch: (match: SearchMatch) => void;
  noReplaceMatchesMessage: string;
  parseEscapeSequences: boolean;
  rememberReplaceValue: (value: string) => void;
  replaceValue: string;
  result: ReplaceCurrentAndSearchChunkBackendResult;
  searchMode: SearchMode;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  setTotalMatchCount: (value: number) => void;
  setTotalMatchedLineCount: (value: number) => void;
  startTransition: TransitionStartFunction;
  updateTab: (tabId: string, updates: { lineCount: number; isDirty: boolean }) => void;
}

export function applyResolvedReplaceCurrentResult({
  activeTabId,
  boundedCurrentIndex,
  cachedSearchRef,
  caseSensitive,
  countCacheRef,
  currentMatchIndexRef,
  chunkCursorRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  fallbackLineCount,
  feedbackMessage,
  navigateToMatch,
  noReplaceMatchesMessage,
  parseEscapeSequences,
  rememberReplaceValue,
  replaceValue,
  result,
  searchMode,
  setCurrentMatchIndex,
  setErrorMessage,
  setFeedbackMessage,
  setMatches,
  setSearchSessionId,
  setTotalMatchCount,
  setTotalMatchedLineCount,
  startTransition,
  updateTab,
}: ApplyResolvedReplaceCurrentResultOptions) {
  if (applyReplaceOperationGuard({
    hasReplacement: result.replaced,
    noReplaceMatchesMessage,
    setFeedbackMessage,
  })) {
    return;
  }

  applyReplaceSuccessEffects({
    activeTabId,
    feedbackMessage,
    fallbackLineCount,
    nextLineCount: result.lineCount,
    rememberReplaceValue,
    replaceValue,
    setErrorMessage,
    setFeedbackMessage,
    updateTab,
  });

  const nextMatch = applyReplaceCurrentSearchResult({
    activeTabId,
    boundedCurrentIndex,
    cachedSearchRef,
    caseSensitive,
    countCacheRef,
    currentMatchIndexRef,
    chunkCursorRef,
    effectiveResultFilterKeyword,
    effectiveSearchKeyword,
    parseEscapeSequences,
    result,
    searchMode,
    setCurrentMatchIndex,
    setMatches,
    setSearchSessionId,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    startTransition,
  });

  applyReplaceNextMatchNavigation({
    navigateToMatch,
    nextMatch,
  });
}