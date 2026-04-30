import type { FilterRunResult, SearchRunResult } from './types';

interface CreateEmptySearchRunResultOptions {
  resetSearchState: () => void;
  setErrorMessage: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
}

interface CreateSearchRunFailureResultOptions {
  error: unknown;
  resetSearchState: () => void;
  searchFailedLabel: string;
  setErrorMessage: (value: string | null) => void;
}

interface CreateEmptyFilterRunResultOptions {
  resetFilterState: (clearTotals?: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setIsSearching: (value: boolean) => void;
  setTotalFilterMatchedLineCount: (value: number) => void;
}

interface CreateFilterRunFailureResultOptions {
  error: unknown;
  filterFailedLabel: string;
  resetFilterState: () => void;
  setErrorMessage: (value: string | null) => void;
}

export function createEmptySearchRunResult({
  resetSearchState,
  setErrorMessage,
  setIsSearching,
}: CreateEmptySearchRunResultOptions): SearchRunResult {
  setErrorMessage(null);
  resetSearchState();
  setIsSearching(false);
  return {
    matches: [],
    documentVersion: 0,
    errorMessage: null,
    nextOffset: null,
  };
}

export function createSearchRunFailureResult({
  error,
  resetSearchState,
  searchFailedLabel,
  setErrorMessage,
}: CreateSearchRunFailureResultOptions): SearchRunResult {
  const readableError = error instanceof Error ? error.message : String(error);
  setErrorMessage(`${searchFailedLabel}: ${readableError}`);
  resetSearchState();

  return {
    matches: [],
    documentVersion: 0,
    errorMessage: readableError,
    nextOffset: null,
  };
}

export function createEmptyFilterRunResult({
  resetFilterState,
  setErrorMessage,
  setIsSearching,
  setTotalFilterMatchedLineCount,
}: CreateEmptyFilterRunResultOptions): FilterRunResult {
  setErrorMessage(null);
  resetFilterState(false);
  setTotalFilterMatchedLineCount(0);
  setIsSearching(false);
  return {
    matches: [],
    documentVersion: 0,
    errorMessage: null,
    nextLine: null,
  };
}

export function createFilterRunFailureResult({
  error,
  filterFailedLabel,
  resetFilterState,
  setErrorMessage,
}: CreateFilterRunFailureResultOptions): FilterRunResult {
  const readableError = error instanceof Error ? error.message : String(error);
  setErrorMessage(`${filterFailedLabel}: ${readableError}`);
  resetFilterState();

  return {
    matches: [],
    documentVersion: 0,
    errorMessage: readableError,
    nextLine: null,
  };
}