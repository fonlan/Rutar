import type { MutableRefObject } from 'react';

interface ResetSearchPanelForInactiveTabOptions {
  defaultResultPanelHeight: number;
  defaultSidebarWidth: number;
  previousActiveTabIdRef: MutableRefObject<string | null>;
  resetFilterState: () => void;
  resetSearchState: () => void;
  setAppliedResultFilterKeyword: (value: string) => void;
  setCaseSensitive: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setIsOpen: (value: boolean) => void;
  setIsResultFilterSearching: (value: boolean) => void;
  setKeyword: (value: string) => void;
  setPanelMode: (value: 'find') => void;
  setParseEscapeSequences: (value: boolean) => void;
  setReplaceValue: (value: string) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelHeight: (value: number) => void;
  setResultPanelState: (value: 'closed') => void;
  setReverseSearch: (value: boolean) => void;
  setSearchMode: (value: 'literal') => void;
  setSearchSidebarWidth: (value: number) => void;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
}

export function resetSearchPanelForInactiveTab({
  defaultResultPanelHeight,
  defaultSidebarWidth,
  previousActiveTabIdRef,
  resetFilterState,
  resetSearchState,
  setAppliedResultFilterKeyword,
  setCaseSensitive,
  setErrorMessage,
  setFeedbackMessage,
  setIsOpen,
  setIsResultFilterSearching,
  setKeyword,
  setPanelMode,
  setParseEscapeSequences,
  setReplaceValue,
  setResultFilterKeyword,
  setResultPanelHeight,
  setResultPanelState,
  setReverseSearch,
  setSearchMode,
  setSearchSidebarWidth,
  stopResultFilterSearchRef,
}: ResetSearchPanelForInactiveTabOptions) {
  setIsOpen(false);
  setPanelMode('find');
  setResultPanelState('closed');
  setResultPanelHeight(defaultResultPanelHeight);
  setSearchSidebarWidth(defaultSidebarWidth);
  setKeyword('');
  setReplaceValue('');
  setSearchMode('literal');
  setCaseSensitive(false);
  setParseEscapeSequences(false);
  setReverseSearch(false);
  setResultFilterKeyword('');
  setAppliedResultFilterKeyword('');
  setIsResultFilterSearching(false);
  stopResultFilterSearchRef.current = true;
  resetSearchState();
  resetFilterState();
  setErrorMessage(null);
  setFeedbackMessage(null);
  previousActiveTabIdRef.current = null;
}