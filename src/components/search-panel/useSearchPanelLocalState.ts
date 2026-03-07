import { useState } from 'react';
import type {
  FilterMatch,
  FilterRuleGroupPayload,
  PanelMode,
  SearchMatch,
  SearchMode,
  SearchResultPanelState,
} from './types';
import { RESULT_PANEL_DEFAULT_HEIGHT, SEARCH_SIDEBAR_DEFAULT_WIDTH } from './utils';

export function useSearchPanelLocalState() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('find');
  const [keyword, setKeyword] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [parseEscapeSequences, setParseEscapeSequences] = useState(false);
  const [reverseSearch, setReverseSearch] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [filterRuleGroups, setFilterRuleGroups] = useState<FilterRuleGroupPayload[]>([]);
  const [filterMatches, setFilterMatches] = useState<FilterMatch[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null);
  const [totalMatchedLineCount, setTotalMatchedLineCount] = useState<number | null>(null);
  const [totalFilterMatchedLineCount, setTotalFilterMatchedLineCount] = useState<number | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [currentFilterMatchIndex, setCurrentFilterMatchIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [resultPanelState, setResultPanelState] = useState<SearchResultPanelState>('closed');
  const [isSearching, setIsSearching] = useState(false);
  const [resultFilterKeyword, setResultFilterKeyword] = useState('');
  const [appliedResultFilterKeyword, setAppliedResultFilterKeyword] = useState('');
  const [isResultFilterSearching, setIsResultFilterSearching] = useState(false);
  const [resultFilterStepLoadingDirection, setResultFilterStepLoadingDirection] = useState<'prev' | 'next' | null>(null);
  const [resultPanelHeight, setResultPanelHeight] = useState(RESULT_PANEL_DEFAULT_HEIGHT);
  const [searchSidebarWidth, setSearchSidebarWidth] = useState(SEARCH_SIDEBAR_DEFAULT_WIDTH);

  return {
    appliedResultFilterKeyword,
    caseSensitive,
    currentFilterMatchIndex,
    currentMatchIndex,
    errorMessage,
    feedbackMessage,
    filterMatches,
    filterRuleGroups,
    isOpen,
    isResultFilterSearching,
    isSearching,
    keyword,
    matches,
    panelMode,
    parseEscapeSequences,
    replaceValue,
    resultFilterKeyword,
    resultFilterStepLoadingDirection,
    resultPanelHeight,
    resultPanelState,
    reverseSearch,
    searchMode,
    searchSidebarWidth,
    setAppliedResultFilterKeyword,
    setCaseSensitive,
    setCurrentFilterMatchIndex,
    setCurrentMatchIndex,
    setErrorMessage,
    setFeedbackMessage,
    setFilterMatches,
    setFilterRuleGroups,
    setIsOpen,
    setIsResultFilterSearching,
    setIsSearching,
    setKeyword,
    setMatches,
    setPanelMode,
    setParseEscapeSequences,
    setReplaceValue,
    setResultFilterKeyword,
    setResultFilterStepLoadingDirection,
    setResultPanelHeight,
    setResultPanelState,
    setReverseSearch,
    setSearchMode,
    setSearchSidebarWidth,
    setTotalFilterMatchedLineCount,
    setTotalMatchCount,
    setTotalMatchedLineCount,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  };
}