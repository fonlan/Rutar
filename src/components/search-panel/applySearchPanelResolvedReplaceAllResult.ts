import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import { applyReplaceNextMatchNavigation, applyReplaceSuccessEffects } from './applySearchPanelReplaceSuccessEffects';
import { applyReplaceOperationGuard } from './applySearchPanelReplaceSearchGuard';
import { applyReplaceAllSearchResult } from './applySearchPanelRunResults';
import type { ReplaceAllAndSearchChunkBackendResult, SearchMatch, SearchMode } from './types';

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

interface ApplyResolvedReplaceAllResultOptions {
  activeTabId: string;
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  caseSensitive: boolean;
  countCacheRef: MutableRefObject<SearchCountCacheSnapshot | null>;
  currentMatchIndexRef: MutableRefObject<number>;
  chunkCursorRef: MutableRefObject<number | null>;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  fallbackLineCount: number;
  formatFeedbackMessage: (replacedCount: number) => string;
  navigateToMatch: (match: SearchMatch) => void;
  noReplaceMatchesMessage: string;
  parseEscapeSequences: boolean;
  rememberReplaceValue: (value: string) => void;
  replaceValue: string;
  result: ReplaceAllAndSearchChunkBackendResult;
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

export function applyResolvedReplaceAllResult({
  activeTabId,
  cachedSearchRef,
  caseSensitive,
  countCacheRef,
  currentMatchIndexRef,
  chunkCursorRef,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  fallbackLineCount,
  formatFeedbackMessage,
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
}: ApplyResolvedReplaceAllResultOptions) {
  const replacedCount = result.replacedCount ?? 0;

  if (applyReplaceOperationGuard({
    hasReplacement: replacedCount > 0,
    noReplaceMatchesMessage,
    setFeedbackMessage,
  })) {
    return;
  }

  applyReplaceSuccessEffects({
    activeTabId,
    feedbackMessage: formatFeedbackMessage(replacedCount),
    fallbackLineCount,
    nextLineCount: result.lineCount,
    rememberReplaceValue,
    replaceValue,
    setErrorMessage,
    setFeedbackMessage,
    updateTab,
  });

  const nextMatch = applyReplaceAllSearchResult({
    activeTabId,
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