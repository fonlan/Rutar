import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { FilterMatch, SearchMatch, SearchResultPanelState } from './types';
import {
  getPlainTextResultEntries,
  RESULT_PANEL_MAX_HEIGHT,
  RESULT_PANEL_MIN_HEIGHT,
  writePlainTextToClipboard,
} from './utils';

interface UseSearchResultPanelControlsOptions {
  cancelPendingBatchLoad: () => void;
  executeFilter: (forceRefresh?: boolean) => Promise<unknown>;
  executeSearch: (forceRefresh?: boolean) => Promise<unknown>;
  filterRulesPayloadLength: number;
  isFilterMode: boolean;
  isResultFilterSearching: boolean;
  isSearching: boolean;
  keyword: string;
  messages: ReturnType<typeof getSearchPanelMessages>;
  navigateResultFilterByStep: (step: number) => Promise<void>;
  onApplyResultFilter: () => Promise<void>;
  rememberSearchKeyword: (value: string) => void;
  requestStopResultFilterSearch: () => void;
  resultFilterStepLoadingDirection: 'prev' | 'next' | null;
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  setAppliedResultFilterKeyword: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelHeight: (value: number) => void;
  setResultPanelState: Dispatch<SetStateAction<SearchResultPanelState>>;
  visibleFilterMatches: FilterMatch[];
  visibleMatches: SearchMatch[];
}

export function useSearchResultPanelControls({
  cancelPendingBatchLoad,
  executeFilter,
  executeSearch,
  filterRulesPayloadLength,
  isFilterMode,
  isResultFilterSearching,
  isSearching,
  keyword,
  messages,
  navigateResultFilterByStep,
  onApplyResultFilter,
  rememberSearchKeyword,
  requestStopResultFilterSearch,
  resultFilterStepLoadingDirection,
  resultPanelHeight,
  resultPanelState,
  setAppliedResultFilterKeyword,
  setErrorMessage,
  setFeedbackMessage,
  setResultFilterKeyword,
  setResultPanelHeight,
  setResultPanelState,
  visibleFilterMatches,
  visibleMatches,
}: UseSearchResultPanelControlsOptions) {
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

  const handleResultPanelResizeMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
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
  }, [resultPanelHeight, setResultPanelHeight]);

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

  const handleClearResultFilter = useCallback(() => {
    setResultFilterKeyword('');
    setAppliedResultFilterKeyword('');
  }, [setAppliedResultFilterKeyword, setResultFilterKeyword]);

  const handleResultFilterPrev = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'prev') {
      cancelPendingBatchLoad();
      return;
    }

    void navigateResultFilterByStep(-1);
  }, [cancelPendingBatchLoad, navigateResultFilterByStep, resultFilterStepLoadingDirection]);

  const handleResultFilterNext = useCallback(() => {
    if (resultFilterStepLoadingDirection === 'next') {
      cancelPendingBatchLoad();
      return;
    }

    void navigateResultFilterByStep(1);
  }, [cancelPendingBatchLoad, navigateResultFilterByStep, resultFilterStepLoadingDirection]);

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

  return {
    copyPlainTextResults,
    filterToggleLabel,
    handleClearResultFilter,
    handleCloseResultPanel,
    handleRefreshResults,
    handleReopenResultPanel,
    handleResultFilterAction,
    handleResultFilterNext,
    handleResultFilterPrev,
    handleResultPanelResizeMouseDown,
    plainTextResultEntries,
    resultToggleTitle,
    toggleResultPanelAndRefresh,
  };
}
