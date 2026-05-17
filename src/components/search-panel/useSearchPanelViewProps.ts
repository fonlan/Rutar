import { useMemo } from 'react';
import type { FilterRulesEditorProps } from './FilterRulesEditor';
import { useSearchPanelOverlaysProps } from './useSearchPanelOverlaysProps';
import { useSearchQuerySectionProps } from './useSearchQuerySectionProps';
import { useSearchSidebarShellProps } from './useSearchSidebarShellProps';

type SearchQueryOptions = Omit<Parameters<typeof useSearchQuerySectionProps>[0], 'canReplace'>;
type SearchPanelOverlaysOptions = Parameters<typeof useSearchPanelOverlaysProps>[0];
type SearchSidebarShellOptions = Omit<
  Parameters<typeof useSearchSidebarShellProps>[0],
  'canReplace' | 'filterRulesEditorProps' | 'searchQuerySectionProps'
>;

type SearchSidebarShellResult = ReturnType<typeof useSearchSidebarShellProps>;

interface UseSearchPanelViewPropsOptions {
  filterRulesEditorProps: FilterRulesEditorProps;
  hasActiveTab: boolean;
  searchPanelOverlaysOptions: SearchPanelOverlaysOptions;
  searchQueryOptions: SearchQueryOptions;
  searchSidebarShellOptions: SearchSidebarShellOptions;
}

interface UseSearchPanelViewPropsResult extends SearchSidebarShellResult {
  searchPanelOverlaysProps: ReturnType<typeof useSearchPanelOverlaysProps>;
}

export function useSearchPanelViewProps({
  filterRulesEditorProps,
  hasActiveTab,
  searchPanelOverlaysOptions,
  searchQueryOptions,
  searchSidebarShellOptions,
}: UseSearchPanelViewPropsOptions): UseSearchPanelViewPropsResult {
  const searchQuerySectionProps = useSearchQuerySectionProps({
    canReplace: hasActiveTab,
    ...searchQueryOptions,
  });
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
