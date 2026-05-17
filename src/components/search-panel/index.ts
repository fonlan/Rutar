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
export { useSearchMatchNavigation } from './useSearchMatchNavigation';
export { useSearchPanelSnapshotPersistence } from './useSearchPanelSnapshotPersistence';
export { useSearchApplyResultFilter } from './useSearchApplyResultFilter';
export { useSearchResultFilterStepNavigation } from './useSearchResultFilterStepNavigation';
export { useSearchStepNavigation } from './useSearchStepNavigation';
export { useSearchReplaceHandlers } from './useSearchReplaceHandlers';
export { useSearchFirstMatchSearch } from './useSearchFirstMatchSearch';
export { useSearchPanelRestoreEffect } from './useSearchPanelRestoreEffect';
export { useSearchBatchControl } from './useSearchBatchControl';
export { useSearchQuerySectionProps } from './useSearchQuerySectionProps';
export { useSearchResultPanel } from './useSearchResultPanel';
export { useSearchPanelLoadMoreHandlers } from './useSearchPanelLoadMoreHandlers';
export { useSearchPanelRunHandlers } from './useSearchPanelRunHandlers';
export { useSearchSidebarFrame } from './useSearchSidebarFrame';
export { useSearchPanelStore } from './useSearchPanelStore';

export { SEARCH_SIDEBAR_DEFAULT_WIDTH, SEARCH_SIDEBAR_RIGHT_OFFSET } from './utils';
