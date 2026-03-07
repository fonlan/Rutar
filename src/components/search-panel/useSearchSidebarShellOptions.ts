import { useMemo } from 'react';
import type { FilterMatch, SearchMatch } from './types';
import { useSearchPanelViewProps } from './useSearchPanelViewProps';

type SearchSidebarShellOptions = Parameters<typeof useSearchPanelViewProps>[0]['searchSidebarShellOptions'];

interface UseSearchSidebarShellOptionsOptions
  extends Omit<SearchSidebarShellOptions, 'filterMatchCount' | 'matchCount'> {
  filterMatches: FilterMatch[];
  matches: SearchMatch[];
}

export function useSearchSidebarShellOptions({
  filterMatches,
  matches,
  ...options
}: UseSearchSidebarShellOptionsOptions): SearchSidebarShellOptions {
  return useMemo(
    () => ({
      ...options,
      filterMatchCount: filterMatches.length,
      matchCount: matches.length,
    }),
    [filterMatches.length, matches.length, options]
  );
}