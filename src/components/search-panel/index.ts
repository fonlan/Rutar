// Public barrel for src/components/search-panel.
// Re-exports only the public surface: components, top-level hooks, stable constants.
// Internal helpers stay reachable through relative paths inside this folder.

export { SearchSidebarBody } from './SearchSidebarBody';
export { SearchPanelOverlays } from './SearchPanelOverlays';
export { SearchSidebarChrome } from './SearchSidebarChrome';

export { useFilterRuleEditorState } from './useFilterRuleEditorState';
export { useFilterRulesEditorOptions } from './useFilterRulesEditorOptions';
export { useFilterRuleGroupPersistence } from './useFilterRuleGroupPersistence';

export { useSearchPanelInputSupport } from './useSearchPanelInputSupport';
export { useSearchKeywordKeyDown } from './useSearchInputInteractions';
export { useSearchMatchNavigation } from './useSearchMatchNavigation';
export { useSearchPanelDerivedState } from './useSearchPanelDerivedState';
export { useSearchPanelOverlayOptions } from './useSearchPanelOverlayOptions';
export { useSearchPanelLocalState } from './useSearchPanelLocalState';
export { useSearchPanelUiState } from './useSearchPanelUiState';
export { useSearchPanelRuntimeRefs } from './useSearchPanelRuntimeRefs';
export { useSearchPanelSnapshotPersistence } from './useSearchPanelSnapshotPersistence';
export { useSearchApplyResultFilter } from './useSearchApplyResultFilter';
export { useSearchResultFilterStepNavigation } from './useSearchResultFilterStepNavigation';
export { useSearchStepNavigation } from './useSearchStepNavigation';
export { useSearchReplaceHandlers } from './useSearchReplaceHandlers';
export { useSearchFirstMatchSearch } from './useSearchFirstMatchSearch';
export { useSearchPanelRestoreEffect } from './useSearchPanelRestoreEffect';
export { useSearchPanelResetState } from './useSearchPanelResetState';
export { useSearchBatchControl } from './useSearchBatchControl';
export { useSearchSidebarShellOptions } from './useSearchSidebarShellOptions';
export { useSearchPanelShellEffects } from './useSearchPanelShellEffects';
export { useSearchPanelViewProps } from './useSearchPanelViewProps';
export { useSearchQueryOptions } from './useSearchQueryOptions';
export { useSearchResultPanelState } from './useSearchResultPanelState';
export { useSearchSessionLifecycle } from './useSearchSessionLifecycle';
export { useSearchResultsViewport } from './useSearchResultsViewport';
export { useSearchPanelLoadMoreHandlers } from './useSearchPanelLoadMoreHandlers';
export { useSearchPanelRunHandlers } from './useSearchPanelRunHandlers';
export { useSearchSidebarFrame } from './useSearchSidebarFrame';
export { useSearchPanelStoreState } from './useSearchPanelStoreState';

export { SEARCH_SIDEBAR_DEFAULT_WIDTH, SEARCH_SIDEBAR_RIGHT_OFFSET } from './utils';
