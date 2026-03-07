import { useMemo } from 'react';
import { useFilterRulesEditorProps } from './useFilterRulesEditorProps';
import { useSearchPanelOverlaysProps } from './useSearchPanelOverlaysProps';
import { useSearchQuerySectionProps } from './useSearchQuerySectionProps';
import { useSearchSidebarShellProps } from './useSearchSidebarShellProps';

type SearchQueryOptions = Omit<Parameters<typeof useSearchQuerySectionProps>[0], 'canReplace'>;
type FilterRulesEditorOptions = Parameters<typeof useFilterRulesEditorProps>[0];
type SearchPanelOverlaysOptions = Parameters<typeof useSearchPanelOverlaysProps>[0];
type SearchSidebarShellOptions = Omit<
  Parameters<typeof useSearchSidebarShellProps>[0],
  'canReplace' | 'filterRulesEditorProps' | 'searchQuerySectionProps'
>;

type SearchSidebarShellResult = ReturnType<typeof useSearchSidebarShellProps>;

interface UseSearchPanelViewPropsOptions {
  filterRulesEditorOptions: FilterRulesEditorOptions;
  hasActiveTab: boolean;
  searchPanelOverlaysOptions: SearchPanelOverlaysOptions;
  searchQueryOptions: SearchQueryOptions;
  searchSidebarShellOptions: SearchSidebarShellOptions;
}

interface UseSearchPanelViewPropsResult extends SearchSidebarShellResult {
  searchPanelOverlaysProps: ReturnType<typeof useSearchPanelOverlaysProps>;
}

export function useSearchPanelViewProps({
  filterRulesEditorOptions,
  hasActiveTab,
  searchPanelOverlaysOptions,
  searchQueryOptions,
  searchSidebarShellOptions,
}: UseSearchPanelViewPropsOptions): UseSearchPanelViewPropsResult {
  const searchQuerySectionProps = useSearchQuerySectionProps({
    canReplace: hasActiveTab,
    ...searchQueryOptions,
  });
  const filterRulesEditorProps = useFilterRulesEditorProps(filterRulesEditorOptions);
  const { searchSidebarBodyProps, searchSidebarChromeProps } = useSearchSidebarShellProps({
    ...searchSidebarShellOptions,
    canReplace: hasActiveTab,
    filterRulesEditorProps,
    searchQuerySectionProps,
  });
  const searchPanelOverlaysProps = useSearchPanelOverlaysProps(searchPanelOverlaysOptions);

  return useMemo(
    () => ({
      searchPanelOverlaysProps,
      searchSidebarBodyProps,
      searchSidebarChromeProps,
    }),
    [searchPanelOverlaysProps, searchSidebarBodyProps, searchSidebarChromeProps]
  );
}