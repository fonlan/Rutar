import type { SearchRunResult } from './types';

interface ApplyReplaceSearchResultGuardOptions {
  noReplaceMatchesMessage: string;
  searchResult: SearchRunResult | null;
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
