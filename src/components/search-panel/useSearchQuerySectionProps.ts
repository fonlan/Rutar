import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { SearchMode } from './types';
import type { SearchQuerySectionProps } from './SearchQuerySection';

interface UseSearchQuerySectionPropsOptions {
  canReplace: boolean;
  caseSensitive: boolean;
  handleKeywordKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleReplaceAll: () => Promise<void>;
  handleReplaceCurrent: () => Promise<void>;
  isReplaceMode: boolean;
  keyword: string;
  messages: ReturnType<typeof getSearchPanelMessages>;
  navigateByStep: (step: number) => Promise<void>;
  parseEscapeSequences: boolean;
  recentReplaceValues: string[];
  recentSearchKeywords: string[];
  replaceValue: string;
  resetSearchState: (clearTotals?: boolean) => void;
  resultToggleTitle: string;
  reverseSearch: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchMode: SearchMode;
  setCaseSensitive: (checked: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setKeyword: (value: string) => void;
  setParseEscapeSequences: (checked: boolean) => void;
  setReplaceValue: (value: string) => void;
  setReverseSearch: (checked: boolean) => void;
  setSearchMode: (mode: SearchMode) => void;
  toggleResultPanelAndRefresh: () => void;
}

export function useSearchQuerySectionProps({
  canReplace,
  caseSensitive,
  handleKeywordKeyDown,
  handleReplaceAll,
  handleReplaceCurrent,
  isReplaceMode,
  keyword,
  messages,
  navigateByStep,
  parseEscapeSequences,
  recentReplaceValues,
  recentSearchKeywords,
  replaceValue,
  resetSearchState,
  resultToggleTitle,
  reverseSearch,
  searchInputRef,
  searchMode,
  setCaseSensitive,
  setErrorMessage,
  setFeedbackMessage,
  setKeyword,
  setParseEscapeSequences,
  setReplaceValue,
  setReverseSearch,
  setSearchMode,
  toggleResultPanelAndRefresh,
}: UseSearchQuerySectionPropsOptions): SearchQuerySectionProps {
  return useMemo(
    () => ({
      canReplace,
      caseSensitive,
      isReplaceMode,
      keyword,
      messages,
      parseEscapeSequences,
      recentReplaceValues,
      recentSearchKeywords,
      replaceValue,
      resultToggleTitle,
      reverseSearch,
      searchInputRef,
      searchMode,
      onCaseSensitiveChange: (checked) => {
        setCaseSensitive(checked);
        setErrorMessage(null);
        resetSearchState();
      },
      onKeywordChange: (value) => {
        setKeyword(value);
        setFeedbackMessage(null);
        setErrorMessage(null);
        resetSearchState();
      },
      onKeywordClear: () => {
        setKeyword('');
        setFeedbackMessage(null);
        setErrorMessage(null);
        resetSearchState();
      },
      onKeywordKeyDown: handleKeywordKeyDown,
      onNavigateNext: () => void navigateByStep(1),
      onNavigatePrev: () => void navigateByStep(-1),
      onParseEscapeSequencesChange: setParseEscapeSequences,
      onReplaceAll: () => void handleReplaceAll(),
      onReplaceCurrent: () => void handleReplaceCurrent(),
      onReplaceValueChange: setReplaceValue,
      onReplaceValueClear: () => setReplaceValue(''),
      onReverseSearchChange: setReverseSearch,
      onSearchModeChange: (mode) => {
        setSearchMode(mode);
        setErrorMessage(null);
        resetSearchState();
      },
      onToggleAllResults: toggleResultPanelAndRefresh,
    }),
    [
      canReplace,
      caseSensitive,
      handleKeywordKeyDown,
      handleReplaceAll,
      handleReplaceCurrent,
      isReplaceMode,
      keyword,
      messages,
      navigateByStep,
      parseEscapeSequences,
      recentReplaceValues,
      recentSearchKeywords,
      replaceValue,
      resetSearchState,
      resultToggleTitle,
      reverseSearch,
      searchInputRef,
      searchMode,
      setCaseSensitive,
      setErrorMessage,
      setFeedbackMessage,
      setKeyword,
      setParseEscapeSequences,
      setReplaceValue,
      setReverseSearch,
      setSearchMode,
      toggleResultPanelAndRefresh,
    ]
  );
}
