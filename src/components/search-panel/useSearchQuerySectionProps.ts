import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { SearchMode } from './types';
import type { SearchQuerySectionProps } from './SearchQuerySection';

interface UseSearchQuerySectionPropsOptions {
  canReplace: boolean;
  caseSensitive: boolean;
  handleKeywordKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handlePickSearchTargetFile: () => void;
  handlePickSearchTargetFolder: () => void;
  handleReplaceAll: () => Promise<void>;
  handleReplaceCurrent: () => Promise<void>;
  includeSubdirectories: boolean;
  includeSubdirectoriesDisabled: boolean;
  isCrossFileMode: boolean;
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
  searchTarget: string;
  setCaseSensitive: (checked: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setIncludeSubdirectories: (checked: boolean) => void;
  setKeyword: (value: string) => void;
  setParseEscapeSequences: (checked: boolean) => void;
  setReplaceValue: (value: string) => void;
  setReverseSearch: (checked: boolean) => void;
  setSearchMode: (mode: SearchMode) => void;
  setSearchTarget: (value: string) => void;
  showIncludeSubdirectoriesToggle: boolean;
  toggleResultPanelAndRefresh: () => void;
}

export function useSearchQuerySectionProps({
  canReplace,
  caseSensitive,
  handleKeywordKeyDown,
  handlePickSearchTargetFile,
  handlePickSearchTargetFolder,
  handleReplaceAll,
  handleReplaceCurrent,
  includeSubdirectories,
  includeSubdirectoriesDisabled,
  isCrossFileMode,
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
  searchTarget,
  setCaseSensitive,
  setErrorMessage,
  setFeedbackMessage,
  setIncludeSubdirectories,
  setKeyword,
  setParseEscapeSequences,
  setReplaceValue,
  setReverseSearch,
  setSearchMode,
  setSearchTarget,
  showIncludeSubdirectoriesToggle,
  toggleResultPanelAndRefresh,
}: UseSearchQuerySectionPropsOptions): SearchQuerySectionProps {
  return useMemo(
    () => ({
      canReplace,
      caseSensitive,
      includeSubdirectories,
      includeSubdirectoriesDisabled,
      isCrossFileMode,
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
      searchTarget,
      showIncludeSubdirectoriesToggle,
      onCaseSensitiveChange: (checked) => {
        setCaseSensitive(checked);
        setErrorMessage(null);
        resetSearchState();
      },
      onIncludeSubdirectoriesChange: (checked) => {
        setIncludeSubdirectories(checked);
        setErrorMessage(null);
        setFeedbackMessage(null);
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
      onPickSearchTargetFile: handlePickSearchTargetFile,
      onPickSearchTargetFolder: handlePickSearchTargetFolder,
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
      onSearchTargetChange: (value) => {
        setSearchTarget(value);
        setErrorMessage(null);
        setFeedbackMessage(null);
      },
      onToggleAllResults: toggleResultPanelAndRefresh,
    }),
    [
      canReplace,
      caseSensitive,
      handleKeywordKeyDown,
      handlePickSearchTargetFile,
      handlePickSearchTargetFolder,
      handleReplaceAll,
      handleReplaceCurrent,
      includeSubdirectories,
      includeSubdirectoriesDisabled,
      isCrossFileMode,
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
      searchTarget,
      setCaseSensitive,
      setErrorMessage,
      setFeedbackMessage,
      setIncludeSubdirectories,
      setKeyword,
      setParseEscapeSequences,
      setReplaceValue,
      setReverseSearch,
      setSearchMode,
      setSearchTarget,
      showIncludeSubdirectoriesToggle,
      toggleResultPanelAndRefresh,
    ]
  );
}
