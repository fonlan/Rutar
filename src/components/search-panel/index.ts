// Public barrel for src/components/search-panel.
// Re-exports only the public surface: components, top-level hooks, stable constants.
// Internal helpers stay reachable through relative paths inside this folder.

export { SearchSidebarBody } from './SearchSidebarBody';
export { SearchPanelOverlays } from './SearchPanelOverlays';
export { SearchSidebarChrome } from './SearchSidebarChrome';

export { useFilterRules } from './useFilterRules';

export { useSearchInput } from './useSearchInput';
export { useSearchPanelChrome } from './useSearchPanelChrome';
export { useSearchKeywordKeyDown } from './useSearchKeywordKeyDown';
export { useSearchNavigation } from './useSearchNavigation';
export { useSearchResultFilterStepNavigation } from './useSearchResultFilterStepNavigation';
export { useSearchReplaceHandlers } from './useSearchReplaceHandlers';
export { useSearchExecution } from './useSearchExecution';
export { useSearchQuerySectionProps } from './useSearchQuerySectionProps';
export { useSearchResultPanel } from './useSearchResultPanel';
export { useSearchSidebarFrame } from './useSearchSidebarFrame';
export { useSearchPanelStore } from './useSearchPanelStore';

export { SEARCH_SIDEBAR_DEFAULT_WIDTH, SEARCH_SIDEBAR_RIGHT_OFFSET } from './utils';
