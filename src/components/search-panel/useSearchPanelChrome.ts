import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  type UIEvent as ReactUIEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { FilterRulesEditorProps } from './FilterRulesEditor';
import type { SearchQuerySectionProps } from './SearchQuerySection';
import { SearchResultItems } from './SearchResultItems';
import type { SearchInputContextMenu } from './SearchInputContextMenu';
import type { SearchPanelOverlays } from './SearchPanelOverlays';
import type { SearchSidebarBody } from './SearchSidebarBody';
import type { SearchSidebarChrome } from './SearchSidebarChrome';
import type {
  FilterMatch,
  PanelMode,
  SearchMatch,
  SearchOpenEventDetail,
  SearchResultPanelState,
} from './types';
import { dispatchSearchClose, getReservedLayoutHeight, getSearchStatusText } from './utils';

type SearchInputContextMenuProps = ComponentProps<typeof SearchInputContextMenu>;
type InputContextMenuState = SearchInputContextMenuProps['contextMenu'] | null;
type InputContextMenuAction = Parameters<SearchInputContextMenuProps['onAction']>[0];

type SearchSidebarBodyProps = ComponentProps<typeof SearchSidebarBody>;
type SearchSidebarChromeProps = Omit<ComponentProps<typeof SearchSidebarChrome>, 'children'>;
type SearchPanelOverlaysProps = ComponentProps<typeof SearchPanelOverlays>;
type SearchResultItemsProps = ComponentProps<typeof SearchResultItems>;

interface UseSearchPanelChromeOptions {
  // === Sidebar frame outputs (from useSearchSidebarFrame) ===
  handleSearchUiBlurCapture: SearchSidebarChromeProps['onBlurCapture'];
  handleSearchUiFocusCapture: SearchSidebarChromeProps['onFocusCapture'];
  handleSearchUiPointerDownCapture: SearchSidebarChromeProps['onPointerDownCapture'];
  isSearchSidebarResizing: boolean;
  isSearchUiActive: boolean;
  searchSidebarContainerRef: RefObject<HTMLDivElement | null>;
  startSearchSidebarResize: SearchSidebarChromeProps['onResizePointerDown'];

  // === Store / derived state ===
  activeTabId: string | null;
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  effectiveFilterRulesLength: number;
  errorMessage: string | null;
  feedbackMessage: string | null;
  filterMatches: FilterMatch[];
  filterRulesPayloadLength: number;
  fontFamily: string;
  hasActiveTab: boolean;
  hasMoreFilterMatches: boolean;
  hasMoreMatches: boolean;
  isFilterMode: boolean;
  isOpen: boolean;
  isResultFilterActive: boolean;
  isResultFilterSearching: boolean;
  isSearching: boolean;
  keyword: string;
  matches: SearchMatch[];
  messages: ReturnType<typeof getSearchPanelMessages>;
  minimizedResultWrapperRef: RefObject<HTMLDivElement | null>;
  panelMode: PanelMode;
  previousActiveTabIdRef: MutableRefObject<string | null>;
  resultFilterKeyword: string;
  resultFilterStepLoadingDirection: 'next' | 'prev' | null;
  resultListRef: RefObject<HTMLDivElement | null>;
  resultListTextStyle: SearchResultItemsProps['resultListTextStyle'];
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  resultPanelWrapperRef: RefObject<HTMLDivElement | null>;
  reverseSearch: boolean;
  searchSidebarWidth: number;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
  visibleCurrentFilterMatchIndex: number;
  visibleCurrentMatchIndex: number;
  visibleFilterMatches: FilterMatch[];
  visibleMatches: SearchMatch[];

  // === Setters ===
  setAppliedResultFilterKeyword: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setIsOpen: (value: boolean) => void;
  setIsResultFilterSearching: (value: boolean) => void;
  setPanelMode: (value: PanelMode) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelState: Dispatch<SetStateAction<SearchResultPanelState>>;

  // === Composed props from other domains ===
  filterRulesEditorProps: FilterRulesEditorProps;
  searchQuerySectionProps: SearchQuerySectionProps;

  // === Input domain handlers ===
  focusSearchInput: () => void;
  handleInputContextMenuAction: (action: InputContextMenuAction) => void;
  handleSearchSidebarContextMenu: SearchSidebarChromeProps['onContextMenu'];
  inputContextCopyLabel: string;
  inputContextCutLabel: string;
  inputContextMenu: InputContextMenuState;
  inputContextMenuRef: RefObject<HTMLDivElement | null>;
  inputContextPasteLabel: string;

  // === Result-panel handlers / data ===
  copyPlainTextResultEntries: (entries: string[]) => Promise<void>;
  copyPlainTextResults: () => Promise<void>;
  displayTotalFilterMatchedLineCount: number | null;
  displayTotalFilterMatchedLineCountText: string;
  displayTotalMatchCount: number | null;
  displayTotalMatchCountText: string;
  displayTotalMatchedLineCountText: string;
  handleClearResultFilter: () => void;
  handleCloseResultPanel: () => void;
  handleRefreshResults: () => void;
  handleReopenResultPanel: () => void;
  handleResultFilterAction: () => void;
  handleResultFilterNext: () => void;
  handleResultFilterPrev: () => void;
  handleResultListScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  handleResultPanelResizeMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  hasAppliedResultFilterKeyword: boolean;
  plainTextResultEntryCount: number;

  // === Navigation handlers ===
  handleSelectMatch: SearchResultItemsProps['handleSelectMatch'];
  navigateByStep: (step: number) => Promise<void>;

  // === Batch control ===
  cancelPendingBatchLoad: () => void;
  requestStopResultFilterSearch: () => void;
}

interface UseSearchPanelChromeResult {
  searchPanelOverlaysProps: SearchPanelOverlaysProps;
  searchSidebarBodyProps: SearchSidebarBodyProps;
  searchSidebarBottomOffset: string;
  searchSidebarChromeProps: SearchSidebarChromeProps;
  searchSidebarTopOffset: string;
}

export function useSearchPanelChrome({
  // frame
  handleSearchUiBlurCapture,
  handleSearchUiFocusCapture,
  handleSearchUiPointerDownCapture,
  isSearchSidebarResizing,
  isSearchUiActive,
  searchSidebarContainerRef,
  startSearchSidebarResize,
  // store / derived
  activeTabId,
  currentFilterMatchIndex,
  currentMatchIndex,
  effectiveFilterRulesLength,
  errorMessage,
  feedbackMessage,
  filterMatches,
  filterRulesPayloadLength,
  fontFamily,
  hasActiveTab,
  hasMoreFilterMatches,
  hasMoreMatches,
  isFilterMode,
  isOpen,
  isResultFilterActive,
  isResultFilterSearching,
  isSearching,
  keyword,
  matches,
  messages,
  minimizedResultWrapperRef,
  panelMode,
  previousActiveTabIdRef,
  resultFilterKeyword,
  resultFilterStepLoadingDirection,
  resultListRef,
  resultListTextStyle,
  resultPanelHeight,
  resultPanelState,
  resultPanelWrapperRef,
  reverseSearch,
  searchSidebarWidth,
  stopResultFilterSearchRef,
  visibleCurrentFilterMatchIndex,
  visibleCurrentMatchIndex,
  visibleFilterMatches,
  visibleMatches,
  // setters
  setAppliedResultFilterKeyword,
  setErrorMessage,
  setFeedbackMessage,
  setIsOpen,
  setIsResultFilterSearching,
  setPanelMode,
  setResultFilterKeyword,
  setResultPanelState,
  // composed
  filterRulesEditorProps,
  searchQuerySectionProps,
  // input
  focusSearchInput,
  handleInputContextMenuAction,
  handleSearchSidebarContextMenu,
  inputContextCopyLabel,
  inputContextCutLabel,
  inputContextMenu,
  inputContextMenuRef,
  inputContextPasteLabel,
  // result-panel
  copyPlainTextResultEntries,
  copyPlainTextResults,
  displayTotalFilterMatchedLineCount,
  displayTotalFilterMatchedLineCountText,
  displayTotalMatchCount,
  displayTotalMatchCountText,
  displayTotalMatchedLineCountText,
  handleClearResultFilter,
  handleCloseResultPanel,
  handleRefreshResults,
  handleReopenResultPanel,
  handleResultFilterAction,
  handleResultFilterNext,
  handleResultFilterPrev,
  handleResultListScroll,
  handleResultPanelResizeMouseDown,
  hasAppliedResultFilterKeyword,
  plainTextResultEntryCount,
  // navigation
  handleSelectMatch,
  navigateByStep,
  // batch
  cancelPendingBatchLoad,
  requestStopResultFilterSearch,
}: UseSearchPanelChromeOptions): UseSearchPanelChromeResult {
  // === Shell effects (formerly useSearchPanelShellEffects) ===
  const [searchSidebarTopOffset, setSearchSidebarTopOffset] = useState('0px');
  const [searchSidebarBottomOffset, setSearchSidebarBottomOffset] = useState('0px');
  const previousIsOpenRef = useRef(false);

  useEffect(() => {
    const handleSearchOpen = (event: Event) => {
      if (!hasActiveTab) {
        return;
      }

      const customEvent = event as CustomEvent<SearchOpenEventDetail>;
      const openMode = customEvent.detail?.mode;
      const nextMode: PanelMode = openMode === 'replace' ? 'replace' : openMode === 'filter' ? 'filter' : 'find';

      setIsOpen(true);
      setPanelMode(nextMode);
      setResultPanelState('closed');
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      setErrorMessage(null);
      setFeedbackMessage(null);
      focusSearchInput();
    };

    window.addEventListener('rutar:search-open', handleSearchOpen as EventListener);
    return () => {
      window.removeEventListener('rutar:search-open', handleSearchOpen as EventListener);
    };
  }, [
    focusSearchInput,
    hasActiveTab,
    setAppliedResultFilterKeyword,
    setErrorMessage,
    setFeedbackMessage,
    setIsOpen,
    setIsResultFilterSearching,
    setPanelMode,
    setResultFilterKeyword,
    setResultPanelState,
    stopResultFilterSearchRef,
  ]);

  useEffect(() => {
    if (previousIsOpenRef.current && !isOpen) {
      const targetTabId = activeTabId ?? previousActiveTabIdRef.current;
      if (targetTabId) {
        dispatchSearchClose(targetTabId);
      }
    }

    previousIsOpenRef.current = isOpen;
  }, [activeTabId, isOpen, previousActiveTabIdRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    focusSearchInput();
  }, [focusSearchInput, isOpen]);

  const updateSearchSidebarTopOffset = useCallback(() => {
    const reservedTopHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="titlebar"], [data-layout-region="toolbar"]'))
    );
    const nextOffset = `${reservedTopHeight}px`;

    setSearchSidebarTopOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, []);

  const updateSearchSidebarBottomOffset = useCallback(() => {
    const reservedBottomHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="statusbar"]'))
    );

    let nextOffsetValue = reservedBottomHeight;

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const resultPanelOffset = Math.max(0, Math.ceil(window.innerHeight - rect.top));
        nextOffsetValue = Math.max(nextOffsetValue, resultPanelOffset);
      }
    }

    const nextOffset = `${nextOffsetValue}px`;
    setSearchSidebarBottomOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, [isOpen, minimizedResultWrapperRef, resultPanelState, resultPanelWrapperRef]);

  useEffect(() => {
    updateSearchSidebarTopOffset();
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    updateSearchSidebarBottomOffset();
  }, [updateSearchSidebarBottomOffset]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSearchSidebarTopOffset);

      return () => {
        window.removeEventListener('resize', updateSearchSidebarTopOffset);
      };
    }

    const titleAndToolbarElements = document.querySelectorAll<HTMLElement>(
      '[data-layout-region="titlebar"], [data-layout-region="toolbar"]'
    );
    const observer = new ResizeObserver(() => {
      updateSearchSidebarTopOffset();
    });

    titleAndToolbarElements.forEach((element) => {
      observer.observe(element);
    });

    window.addEventListener('resize', updateSearchSidebarTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarTopOffset);
    };
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSearchSidebarBottomOffset);

      return () => {
        window.removeEventListener('resize', updateSearchSidebarBottomOffset);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSearchSidebarBottomOffset();
    });

    const statusBarElement = document.querySelector<HTMLElement>('[data-layout-region="statusbar"]');
    if (statusBarElement) {
      observer.observe(statusBarElement);
    }

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        observer.observe(targetElement);
      }
    }

    window.addEventListener('resize', updateSearchSidebarBottomOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarBottomOffset);
    };
  }, [isOpen, minimizedResultWrapperRef, resultPanelState, resultPanelWrapperRef, updateSearchSidebarBottomOffset]);

  useEffect(() => {
    if (!hasActiveTab) {
      return;
    }

    const handleFindNextShortcuts = (event: KeyboardEvent) => {
      const key = event.key;
      if (key !== 'F3') {
        return;
      }

      event.preventDefault();

      if (!keyword && !isFilterMode) {
        if (!isOpen) {
          setIsOpen(true);
          focusSearchInput();
        }
        return;
      }

      const primaryStep = isFilterMode ? 1 : reverseSearch ? -1 : 1;
      const step = event.shiftKey ? -primaryStep : primaryStep;
      void navigateByStep(step);
    };

    window.addEventListener('keydown', handleFindNextShortcuts);
    return () => {
      window.removeEventListener('keydown', handleFindNextShortcuts);
    };
  }, [focusSearchInput, hasActiveTab, isFilterMode, isOpen, keyword, navigateByStep, reverseSearch, setIsOpen]);

  // === Status text (formerly useSearchSidebarShellProps) ===
  const matchCount = matches.length;
  const filterMatchCount = filterMatches.length;
  const hasConfiguredFilterRules = effectiveFilterRulesLength > 0;

  const statusText = useMemo(
    () =>
      getSearchStatusText({
        currentFilterMatchIndex,
        currentMatchIndex,
        errorMessage,
        filterMatchCount,
        hasConfiguredFilterRules,
        isFilterMode,
        isSearching,
        keyword,
        matchCount,
        messages,
        totalFilterMatchedLineCount: displayTotalFilterMatchedLineCount,
        totalMatchCount: displayTotalMatchCount,
      }),
    [
      currentFilterMatchIndex,
      currentMatchIndex,
      displayTotalFilterMatchedLineCount,
      displayTotalMatchCount,
      errorMessage,
      filterMatchCount,
      hasConfiguredFilterRules,
      isFilterMode,
      isSearching,
      keyword,
      matchCount,
      messages,
    ]
  );

  // === Sidebar shell props (formerly useSearchSidebarShellProps return) ===
  const handleSidebarClose = useCallback(() => setIsOpen(false), [setIsOpen]);
  const handleSidebarModeChange = useCallback(
    (mode: PanelMode) => {
      setPanelMode(mode);
      focusSearchInput();
    },
    [focusSearchInput, setPanelMode]
  );

  const searchSidebarBodyProps = useMemo<SearchSidebarBodyProps>(
    () => ({
      filterRulesEditorProps,
      isFilterMode,
      searchQuerySectionProps,
    }),
    [filterRulesEditorProps, isFilterMode, searchQuerySectionProps]
  );

  const searchSidebarChromeProps = useMemo<SearchSidebarChromeProps>(
    () => ({
      canReplace: hasActiveTab,
      errorMessage,
      feedbackMessage,
      isOpen,
      isSearchSidebarResizing,
      isSearchUiActive,
      messages,
      panelMode,
      searchSidebarBottomOffset,
      searchSidebarContainerRef,
      searchSidebarTopOffset,
      searchSidebarWidth,
      statusText,
      onBlurCapture: handleSearchUiBlurCapture,
      onClose: handleSidebarClose,
      onContextMenu: handleSearchSidebarContextMenu,
      onFocusCapture: handleSearchUiFocusCapture,
      onModeChange: handleSidebarModeChange,
      onPointerDownCapture: handleSearchUiPointerDownCapture,
      onResizePointerDown: startSearchSidebarResize,
    }),
    [
      errorMessage,
      feedbackMessage,
      handleSearchSidebarContextMenu,
      handleSearchUiBlurCapture,
      handleSearchUiFocusCapture,
      handleSearchUiPointerDownCapture,
      handleSidebarClose,
      handleSidebarModeChange,
      hasActiveTab,
      isOpen,
      isSearchSidebarResizing,
      isSearchUiActive,
      messages,
      panelMode,
      searchSidebarBottomOffset,
      searchSidebarContainerRef,
      searchSidebarTopOffset,
      searchSidebarWidth,
      startSearchSidebarResize,
      statusText,
    ]
  );

  // === Overlays props (formerly useSearchPanelOverlayOptions + useSearchPanelOverlaysProps) ===
  const visibleFilterMatchCount = visibleFilterMatches.length;
  const visibleMatchCount = visibleMatches.length;

  const searchResultItemsProps = useMemo<SearchResultItemsProps>(
    () => ({
      copyLabel: inputContextCopyLabel,
      copyPlainTextResultEntries,
      filterMatches,
      filterRulesPayloadLength,
      fontFamily,
      handleSelectMatch,
      isFilterMode,
      keyword,
      matches,
      messages,
      resultListTextStyle,
      resultPanelState,
      visibleCurrentFilterMatchIndex,
      visibleCurrentMatchIndex,
      visibleFilterMatches,
      visibleMatches,
    }),
    [
      copyPlainTextResultEntries,
      filterMatches,
      filterRulesPayloadLength,
      fontFamily,
      handleSelectMatch,
      inputContextCopyLabel,
      isFilterMode,
      keyword,
      matches,
      messages,
      resultListTextStyle,
      resultPanelState,
      visibleCurrentFilterMatchIndex,
      visibleCurrentMatchIndex,
      visibleFilterMatches,
      visibleMatches,
    ]
  );

  const renderedResultItems = useMemo(
    () => createElement(SearchResultItems, searchResultItemsProps),
    [searchResultItemsProps]
  );

  const resultsPanelProps = useMemo<SearchPanelOverlaysProps['resultsPanelProps']>(
    () => ({
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCountText,
      displayTotalMatchedLineCountText,
      errorMessage,
      filterMatchCount,
      filterRulesPayloadLength,
      hasAppliedResultFilterKeyword,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isResultFilterActive,
      isResultFilterSearching,
      isSearching,
      keyword,
      matchCount,
      messages,
      minimizedResultWrapperRef,
      plainTextResultEntryCount,
      renderedResultItems,
      resultFilterKeyword,
      resultFilterStepLoadingDirection,
      resultListRef,
      resultPanelHeight,
      resultPanelState,
      resultPanelWrapperRef,
      visibleFilterMatchCount,
      visibleMatchCount,
      onApplyResultFilter: handleResultFilterAction,
      onCancelPendingBatchLoad: cancelPendingBatchLoad,
      onClearResultFilter: handleClearResultFilter,
      onClose: handleCloseResultPanel,
      onCopy: () => void copyPlainTextResults(),
      onMinimize: () => setResultPanelState('minimized'),
      onNavigateResultFilterNext: handleResultFilterNext,
      onNavigateResultFilterPrev: handleResultFilterPrev,
      onOpenMinimized: handleReopenResultPanel,
      onRefresh: handleRefreshResults,
      onRequestStopResultFilterSearch: requestStopResultFilterSearch,
      onResizeMouseDown: handleResultPanelResizeMouseDown,
      onResultFilterKeywordChange: setResultFilterKeyword,
      onScroll: handleResultListScroll,
    }),
    [
      cancelPendingBatchLoad,
      copyPlainTextResults,
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCountText,
      displayTotalMatchedLineCountText,
      errorMessage,
      filterMatchCount,
      filterRulesPayloadLength,
      handleClearResultFilter,
      handleCloseResultPanel,
      handleRefreshResults,
      handleReopenResultPanel,
      handleResultFilterAction,
      handleResultFilterNext,
      handleResultFilterPrev,
      handleResultListScroll,
      handleResultPanelResizeMouseDown,
      hasAppliedResultFilterKeyword,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isResultFilterActive,
      isResultFilterSearching,
      isSearching,
      keyword,
      matchCount,
      messages,
      minimizedResultWrapperRef,
      plainTextResultEntryCount,
      renderedResultItems,
      requestStopResultFilterSearch,
      resultFilterKeyword,
      resultFilterStepLoadingDirection,
      resultListRef,
      resultPanelHeight,
      resultPanelState,
      resultPanelWrapperRef,
      setResultFilterKeyword,
      setResultPanelState,
      visibleFilterMatchCount,
      visibleMatchCount,
    ]
  );

  const inputContextMenuProps = useMemo<SearchPanelOverlaysProps['inputContextMenuProps']>(
    () => ({
      copyLabel: inputContextCopyLabel,
      cutLabel: inputContextCutLabel,
      deleteLabel: messages.filterDeleteRule,
      menuRef: inputContextMenuRef,
      pasteLabel: inputContextPasteLabel,
      onAction: (action) => void handleInputContextMenuAction(action),
    }),
    [
      handleInputContextMenuAction,
      inputContextCopyLabel,
      inputContextCutLabel,
      inputContextMenuRef,
      inputContextPasteLabel,
      messages.filterDeleteRule,
    ]
  );

  const searchPanelOverlaysProps = useMemo<SearchPanelOverlaysProps>(
    () => ({
      inputContextMenu,
      inputContextMenuProps,
      resultsPanelProps,
    }),
    [inputContextMenu, inputContextMenuProps, resultsPanelProps]
  );

  return useMemo(
    () => ({
      searchPanelOverlaysProps,
      searchSidebarBodyProps,
      searchSidebarBottomOffset,
      searchSidebarChromeProps,
      searchSidebarTopOffset,
    }),
    [
      searchPanelOverlaysProps,
      searchSidebarBodyProps,
      searchSidebarBottomOffset,
      searchSidebarChromeProps,
      searchSidebarTopOffset,
    ]
  );
}
