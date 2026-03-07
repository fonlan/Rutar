import type { SearchMode } from './types';

interface SearchPanelSearchCacheIdentity {
  caseSensitive: boolean;
  keyword: string;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  searchMode: SearchMode;
  tabId: string;
}

interface SearchPanelFilterCacheIdentity {
  resultFilterKeyword: string;
  rulesKey: string;
  tabId: string;
}

export function matchesSearchPanelSearchCacheIdentity<TCache extends SearchPanelSearchCacheIdentity>(
  cached: TCache | null | undefined,
  expected: SearchPanelSearchCacheIdentity
): cached is TCache {
  return !!cached &&
    cached.tabId === expected.tabId &&
    cached.keyword === expected.keyword &&
    cached.searchMode === expected.searchMode &&
    cached.caseSensitive === expected.caseSensitive &&
    cached.parseEscapeSequences === expected.parseEscapeSequences &&
    cached.resultFilterKeyword === expected.resultFilterKeyword;
}

export function matchesSearchPanelFilterCacheIdentity<TCache extends SearchPanelFilterCacheIdentity>(
  cached: TCache | null | undefined,
  expected: SearchPanelFilterCacheIdentity
): cached is TCache {
  return !!cached &&
    cached.tabId === expected.tabId &&
    cached.rulesKey === expected.rulesKey &&
    cached.resultFilterKeyword === expected.resultFilterKeyword;
}
