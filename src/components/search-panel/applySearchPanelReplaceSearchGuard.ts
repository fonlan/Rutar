import type { SearchRunResult } from './types';

interface ApplyReplaceSearchResultGuardOptions {
  noReplaceMatchesMessage: string;
  searchResult: SearchRunResult | null;
  setFeedbackMessage: (value: string | null) => void;
}

interface ApplyPreparedReplaceSearchResultOptions extends ApplyReplaceSearchResultGuardOptions {
  keyword: string;
  rememberSearchKeyword: (value: string) => void;
}

interface ResolvePreparedReplaceSearchResultOptions {
  executeSearch: () => Promise<SearchRunResult | null>;
  keyword: string;
  noReplaceMatchesMessage: string;
  rememberSearchKeyword: (value: string) => void;
  setFeedbackMessage: (value: string | null) => void;
}

interface ApplyReplaceOperationGuardOptions {
  hasReplacement: boolean;
  noReplaceMatchesMessage: string;
  setFeedbackMessage: (value: string | null) => void;
}

export function applyReplaceSearchResultGuard({
  noReplaceMatchesMessage,
  searchResult,
  setFeedbackMessage,
}: ApplyReplaceSearchResultGuardOptions): SearchRunResult | null {
  if (!searchResult || searchResult.matches.length === 0) {
    setFeedbackMessage(noReplaceMatchesMessage);
    return null;
  }

  return searchResult;
}

export function applyPreparedReplaceSearchResult({
  keyword,
  noReplaceMatchesMessage,
  rememberSearchKeyword,
  searchResult,
  setFeedbackMessage,
}: ApplyPreparedReplaceSearchResultOptions): SearchRunResult | null {
  rememberSearchKeyword(keyword);
  return applyReplaceSearchResultGuard({
    noReplaceMatchesMessage,
    searchResult,
    setFeedbackMessage,
  });
}

export async function resolvePreparedReplaceSearchResult({
  executeSearch,
  keyword,
  noReplaceMatchesMessage,
  rememberSearchKeyword,
  setFeedbackMessage,
}: ResolvePreparedReplaceSearchResultOptions): Promise<SearchRunResult | null> {
  return applyPreparedReplaceSearchResult({
    keyword,
    noReplaceMatchesMessage,
    rememberSearchKeyword,
    searchResult: await executeSearch(),
    setFeedbackMessage,
  });
}

export function applyReplaceOperationGuard({
  hasReplacement,
  noReplaceMatchesMessage,
  setFeedbackMessage,
}: ApplyReplaceOperationGuardOptions): boolean {
  if (hasReplacement) {
    return false;
  }

  setFeedbackMessage(noReplaceMatchesMessage);
  return true;
}