import {
  useCallback,
  useEffect,
  type MutableRefObject,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import type { SearchResultPanelState } from './types';

interface UseSearchResultsViewportOptions {
  filterMatchesLength: number;
  filterRulesPayloadLength: number;
  hasMoreFilterMatches: boolean;
  hasMoreMatches: boolean;
  isFilterMode: boolean;
  isOpen: boolean;
  isSearching: boolean;
  keyword: string;
  loadMoreDebounceRef: MutableRefObject<number | null>;
  loadMoreFilterMatches: () => Promise<unknown[] | null | undefined>;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreMatches: () => Promise<unknown[] | null | undefined>;
  matchesLength: number;
  resultListRef: RefObject<HTMLDivElement | null>;
  resultPanelState: SearchResultPanelState;
}

interface UseSearchResultsViewportResult {
  handleResultListScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  scrollResultItemIntoView: (itemIndex: number) => void;
}

export function useSearchResultsViewport({
  filterMatchesLength,
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
  matchesLength,
  resultListRef,
  resultPanelState,
}: UseSearchResultsViewportOptions): UseSearchResultsViewportResult {
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
          cancelled ||
          isSearching ||
          loadMoreLockRef.current ||
          (isFilterMode ? !hasMoreFilterMatches : !hasMoreMatches)
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

  const scrollResultItemIntoView = useCallback((itemIndex: number) => {
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
  }, [resultListRef]);

  return {
    handleResultListScroll,
    scrollResultItemIntoView,
  };
}