import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  type UIEvent as ReactUIEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { FilterMatch, SearchMatch, SearchResultPanelState } from './types';
import {
  getDisplayCountText,
  getPlainTextResultEntries,
  RESULT_PANEL_MAX_HEIGHT,
  RESULT_PANEL_MIN_HEIGHT,
  writePlainTextToClipboard,
} from './utils';

interface UseSearchResultPanelOptions {
  cancelPendingBatchLoad: () => void;
  executeFilter: (forceRefresh?: boolean) => Promise<unknown>;
  executeSearch: (forceRefresh?: boolean) => Promise<unknown>;
  filterMatchesLength: number;
  filterRulesPayloadLength: number;
  hasMoreFilterMatches: boolean;
  hasMoreMatches: boolean;
  isFilterMode: boolean;
  isOpen: boolean;
  isResultFilterSearching: boolean;
  isSearching: boolean;
  keyword: string;
  loadMoreDebounceRef: MutableRefObject<number | null>;
  loadMoreFilterMatches: () => Promise<unknown[] | null | undefined>;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreMatches: () => Promise<unknown[] | null | undefined>;
  matchesLength: number;
  messages: ReturnType<typeof getSearchPanelMessages>;
  navigateResultFilterByStepRef: MutableRefObject<((step: number) => Promise<void>) | null>;
  onApplyResultFilter: () => Promise<void>;
  rememberSearchKeyword: (value: string) => void;
  requestStopResultFilterSearch: () => void;
  resultFilterKeyword: string;
  resultFilterStepLoadingDirection: 'prev' | 'next' | null;
  resultListRef: RefObject<HTMLDivElement | null>;
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  setAppliedResultFilterKeyword: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelHeight: (value: number) => void;
  setResultPanelState: Dispatch<SetStateAction<SearchResultPanelState>>;
  totalFilterMatchedLineCount: number | null;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
  visibleFilterMatches: FilterMatch[];
  visibleMatches: SearchMatch[];
}

export function useSearchResultPanel({
  cancelPendingBatchLoad,
  executeFilter,
  executeSearch,
  filterMatchesLength,
  filterRulesPayloadLength,
  hasMoreFilterMatches,
  hasMoreMatches,
  isFilterMode,
  isOpen,
  isResultFilterSearching,
  isSearching,
  keyword,
  loadMoreDebounceRef,
  loadMoreFilterMatches,
  loadMoreLockRef,
  loadMoreMatches,
  matchesLength,
  messages,
  navigateResultFilterByStepRef,
  onApplyResultFilter,
  rememberSearchKeyword,
  requestStopResultFilterSearch,
  resultFilterKeyword,
  resultFilterStepLoadingDirection,
  resultListRef,
  resultPanelHeight,
  resultPanelState,
  setAppliedResultFilterKeyword,
  setErrorMessage,
  setFeedbackMessage,
  setResultFilterKeyword,
  setResultPanelHeight,
  setResultPanelState,
  totalFilterMatchedLineCount,
  totalMatchCount,
  totalMatchedLineCount,
  visibleFilterMatches,
  visibleMatches,
}: UseSearchResultPanelOptions) {
  // --- viewport (formerly useSearchResultsViewport) ---
  const handleResultListScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!isOpen || resultPanelState !== 'open') {
        return;
      }

      if (isFilterMode) {
        if (filterRulesPayloadLength === 0 || !hasMoreFilterMatches || isSearching || loadMoreLockRef.current) {
          return;
        }
      } else if (!keyword || !hasMoreMatches || isSearching || loadMoreLockRef.current) {
        return;
      }

      const target = event.currentTarget;
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining > 32) {
        return;
      }

      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }

      loadMoreDebounceRef.current = window.setTimeout(() => {
        loadMoreDebounceRef.current = null;
        if (isFilterMode) {
          void loadMoreFilterMatches();
          return;
        }

        void loadMoreMatches();
      }, 40);
    },
    [
      filterRulesPayloadLength,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isOpen,
      isSearching,
      keyword,
      loadMoreDebounceRef,
      loadMoreFilterMatches,
      loadMoreLockRef,
      loadMoreMatches,
      resultPanelState,
    ]
  );

  useEffect(() => {
    return () => {
      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }
    };
  }, [loadMoreDebounceRef]);

  useEffect(() => {
    if (resultPanelState !== 'open') {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayloadLength === 0 || filterMatchesLength === 0 || !hasMoreFilterMatches || isSearching) {
        return;
      }
    } else if (!keyword || matchesLength === 0 || !hasMoreMatches || isSearching) {
      return;
    }

    let cancelled = false;

    const fillVisibleResultViewport = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (
          cancelled
          || isSearching
          || loadMoreLockRef.current
          || (isFilterMode ? !hasMoreFilterMatches : !hasMoreMatches)
        ) {
          return;
        }

        const container = resultListRef.current;
        if (!container) {
          return;
        }

        if (container.scrollHeight > container.clientHeight + 1) {
          return;
        }

        const appended = isFilterMode ? await loadMoreFilterMatches() : await loadMoreMatches();
        if (!appended || appended.length === 0) {
          return;
        }
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      void fillVisibleResultViewport();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    filterMatchesLength,
    filterRulesPayloadLength,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isSearching,
    keyword,
    loadMoreFilterMatches,
    loadMoreLockRef,
    loadMoreMatches,
    matchesLength,
    resultListRef,
    resultPanelState,
  ]);

  const scrollResultItemIntoView = useCallback(
    (itemIndex: number) => {
      const container = resultListRef.current;
      if (!container || itemIndex < 0) {
        return;
      }

      const itemElements = container.querySelectorAll<HTMLButtonElement>('button[data-result-item="true"]');
      const targetElement = itemElements.item(itemIndex);
      if (!targetElement) {
        return;
      }

      const targetTop = targetElement.offsetTop;
      const targetBottom = targetTop + targetElement.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const verticalPadding = Math.max(8, Math.floor(container.clientHeight * 0.2));

      if (targetTop < viewTop) {
        container.scrollTop = Math.max(0, targetTop - verticalPadding);
        return;
      }

      if (targetBottom > viewBottom) {
        container.scrollTop = Math.max(0, targetTop - verticalPadding);
      }
    },
    [resultListRef]
  );

  // --- controls (formerly useSearchResultPanelControls) ---
  const resizeDragStateRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);

  const plainTextResultEntries = useMemo(
    () => getPlainTextResultEntries({
      filterRulesPayloadLength,
      isFilterMode,
      keyword,
      visibleFilterMatches,
      visibleMatches,
    }),
    [filterRulesPayloadLength, isFilterMode, keyword, visibleFilterMatches, visibleMatches]
  );

  useEffect(() => {
    if (resultPanelState === 'closed') {
      cancelPendingBatchLoad();
    }
  }, [cancelPendingBatchLoad, resultPanelState]);

  useEffect(() => {
    return () => {
      resizeDragStateRef.current = null;
      document.body.style.userSelect = '';
    };
  }, []);

  const handleResultPanelResizeMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      resizeDragStateRef.current = {
        startY: event.clientY,
        startHeight: resultPanelHeight,
      };

      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dragState = resizeDragStateRef.current;
        if (!dragState) {
          return;
        }

        const delta = dragState.startY - moveEvent.clientY;
        const nextHeight = Math.max(
          RESULT_PANEL_MIN_HEIGHT,
          Math.min(RESULT_PANEL_MAX_HEIGHT, dragState.startHeight + delta)
        );
        setResultPanelHeight(nextHeight);
      };

      const onMouseUp = () => {
        resizeDragStateRef.current = null;
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [resultPanelHeight, setResultPanelHeight]
  );

  const copyPlainTextResults = useCallback(async () => {
    if (plainTextResultEntries.length === 0) {
      setFeedbackMessage(messages.copyResultsEmpty);
      setErrorMessage(null);
      return;
    }

    try {
      await writePlainTextToClipboard(plainTextResultEntries.join('\n'));
      setFeedbackMessage(messages.copyResultsSuccess(plainTextResultEntries.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`${messages.copyResultsFailed}: ${readableError}`);
    }
  }, [messages, plainTextResultEntries, setErrorMessage, setFeedbackMessage]);

  const copyPlainTextResultEntries = useCallback(
    async (entries: string[]) => {
      if (entries.length === 0) {
        setFeedbackMessage(messages.copyResultsEmpty);
        setErrorMessage(null);
        return;
      }

      try {
        await writePlainTextToClipboard(entries.join('\n'));
        setFeedbackMessage(messages.copyResultsSuccess(entries.length));
        setErrorMessage(null);
      } catch (error) {
        const readableError = error instanceof Error ? error.message : 'Unknown error';
        setErrorMessage(`${messages.copyResultsFailed}: ${readableError}`);
      }
    },
    [messages, setErrorMessage, setFeedbackMessage]
  );

  const handleClearResultFilter = useCallback(() => {
    setResultFilterKeyword('');
    setAppliedResultFilterKeyword('');
  }, [setAppliedResultFilterKeyword, setResultFilterKeyword]);

  const handleResultFilterPrev = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'prev') {
      cancelPendingBatchLoad();
      return;
    }

    const nav = navigateResultFilterByStepRef.current;
    if (nav) {
      void nav(-1);
    }
  }, [cancelPendingBatchLoad, navigateResultFilterByStepRef, resultFilterStepLoadingDirection]);

  const handleResultFilterNext = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'next') {
      cancelPendingBatchLoad();
      return;
    }

    const nav = navigateResultFilterByStepRef.current;
    if (nav) {
      void nav(1);
    }
  }, [cancelPendingBatchLoad, navigateResultFilterByStepRef, resultFilterStepLoadingDirection]);

  const handleResultFilterAction = useCallback(() => {
    if (isResultFilterSearching) {
      requestStopResultFilterSearch();
      return;
    }

    void onApplyResultFilter();
  }, [isResultFilterSearching, onApplyResultFilter, requestStopResultFilterSearch]);

  const handleRefreshResults = useCallback(() => {
    cancelPendingBatchLoad();
    if (isFilterMode) {
      void executeFilter(true);
      return;
    }

    void executeSearch(true);
  }, [cancelPendingBatchLoad, executeFilter, executeSearch, isFilterMode]);

  const handleCloseResultPanel = useCallback(() => {
    cancelPendingBatchLoad();
    setResultPanelState('closed');
  }, [cancelPendingBatchLoad, setResultPanelState]);

  const handleReopenResultPanel = useCallback(() => {
    setResultPanelState('open');

    if (!isSearching) {
      if (isFilterMode) {
        if (filterRulesPayloadLength > 0) {
          void executeFilter();
        }
      } else if (keyword) {
        void executeSearch();
      }
    }
  }, [
    executeFilter,
    executeSearch,
    filterRulesPayloadLength,
    isFilterMode,
    isSearching,
    keyword,
    setResultPanelState,
  ]);

  const isResultPanelOpen = resultPanelState === 'open';
  const resultToggleTitle = isResultPanelOpen ? messages.collapseResults : messages.expandResults;
  const filterToggleLabel = isResultPanelOpen ? messages.collapse : messages.filterRun;

  const toggleResultPanelAndRefresh = useCallback(() => {
    setResultPanelState((previous) => (previous === 'open' ? 'minimized' : 'open'));

    if (isSearching) {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayloadLength > 0) {
        void executeFilter();
      }
      return;
    }

    if (keyword) {
      rememberSearchKeyword(keyword);
      void executeSearch();
    }
  }, [
    executeFilter,
    executeSearch,
    filterRulesPayloadLength,
    isFilterMode,
    isSearching,
    keyword,
    rememberSearchKeyword,
    setResultPanelState,
  ]);

  // --- state (formerly useSearchResultPanelState top-level derived values) ---
  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalFilterMatchedLineCount = totalFilterMatchedLineCount;
  const displayTotalMatchCountText = getDisplayCountText(displayTotalMatchCount, messages.counting);
  const displayTotalMatchedLineCountText = getDisplayCountText(displayTotalMatchedLineCount, messages.counting);
  const displayTotalFilterMatchedLineCountText = getDisplayCountText(
    displayTotalFilterMatchedLineCount,
    messages.counting
  );
  const hasAppliedResultFilterKeyword = resultFilterKeyword.trim().length > 0;

  return {
    copyPlainTextResultEntries,
    copyPlainTextResults,
    displayTotalFilterMatchedLineCount,
    displayTotalFilterMatchedLineCountText,
    displayTotalMatchCount,
    displayTotalMatchCountText,
    displayTotalMatchedLineCount,
    displayTotalMatchedLineCountText,
    filterToggleLabel,
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
    plainTextResultEntries,
    resultToggleTitle,
    scrollResultItemIntoView,
    toggleResultPanelAndRefresh,
  };
}
