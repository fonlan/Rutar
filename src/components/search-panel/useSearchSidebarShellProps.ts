import { useMemo, type ComponentProps } from 'react';
import { SearchSidebarBody } from './SearchSidebarBody';
import { SearchSidebarChrome } from './SearchSidebarChrome';
import { getSearchStatusText } from './utils';

type SearchSidebarBodyProps = ComponentProps<typeof SearchSidebarBody>;
type SearchSidebarChromeProps = Omit<ComponentProps<typeof SearchSidebarChrome>, 'children'>;

interface UseSearchSidebarShellPropsOptions
  extends Omit<SearchSidebarChromeProps, 'onClose' | 'onModeChange' | 'statusText'>,
    SearchSidebarBodyProps {
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  displayTotalFilterMatchedLineCount: number | null;
  displayTotalMatchCount: number | null;
  filterMatchCount: number;
  focusSearchInput: () => void;
  hasConfiguredFilterRules: boolean;
  isSearching: boolean;
  keyword: string;
  matchCount: number;
  setIsOpen: (value: boolean) => void;
  setPanelMode: (mode: SearchSidebarChromeProps['panelMode']) => void;
}

interface UseSearchSidebarShellPropsResult {
  searchSidebarBodyProps: SearchSidebarBodyProps;
  searchSidebarChromeProps: SearchSidebarChromeProps;
}

export function useSearchSidebarShellProps({
  currentFilterMatchIndex,
  currentMatchIndex,
  displayTotalFilterMatchedLineCount,
  displayTotalMatchCount,
  filterMatchCount,
  focusSearchInput,
  hasConfiguredFilterRules,
  isSearching,
  keyword,
  matchCount,
  setIsOpen,
  setPanelMode,
  filterRulesEditorProps,
  isFilterMode,
  searchQuerySectionProps,
  ...chromeProps
}: UseSearchSidebarShellPropsOptions): UseSearchSidebarShellPropsResult {
  const statusText = useMemo(
    () =>
      getSearchStatusText({
        currentFilterMatchIndex,
        currentMatchIndex,
        errorMessage: chromeProps.errorMessage,
        filterMatchCount,
        hasConfiguredFilterRules,
        isFilterMode,
        isSearching,
        keyword,
        matchCount,
        messages: chromeProps.messages,
        totalFilterMatchedLineCount: displayTotalFilterMatchedLineCount,
        totalMatchCount: displayTotalMatchCount,
      }),
    [
      chromeProps.errorMessage,
      chromeProps.messages,
      currentFilterMatchIndex,
      currentMatchIndex,
      displayTotalFilterMatchedLineCount,
      displayTotalMatchCount,
      filterMatchCount,
      hasConfiguredFilterRules,
      isFilterMode,
      isSearching,
      keyword,
      matchCount,
    ]
  );

  return useMemo(
    () => ({
      searchSidebarBodyProps: {
        filterRulesEditorProps,
        isFilterMode,
        searchQuerySectionProps,
      },
      searchSidebarChromeProps: {
        ...chromeProps,
        statusText,
        onClose: () => setIsOpen(false),
        onModeChange: (mode) => {
          setPanelMode(mode);
          focusSearchInput();
        },
      },
    }),
    [
      chromeProps,
      filterRulesEditorProps,
      focusSearchInput,
      isFilterMode,
      searchQuerySectionProps,
      setIsOpen,
      setPanelMode,
      statusText,
    ]
  );
}