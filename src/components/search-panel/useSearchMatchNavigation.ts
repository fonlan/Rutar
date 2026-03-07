import { useCallback } from 'react';
import { dispatchNavigateToLine, dispatchNavigateToMatch } from './utils';
import type { FilterMatch, SearchMatch } from './types';

interface UseSearchMatchNavigationOptions {
  activeTabId: string | null;
  filterMatches: FilterMatch[];
  getSearchSidebarOccludedRightPx: () => number;
  isFilterMode: boolean;
  matches: SearchMatch[];
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setCurrentFilterMatchIndex: (value: number) => void;
  setCurrentMatchIndex: (value: number) => void;
  setFeedbackMessage: (value: string | null) => void;
}

interface UseSearchMatchNavigationResult {
  handleSelectMatch: (targetIndex: number) => void;
  navigateToFilterMatch: (targetMatch: FilterMatch) => void;
  navigateToMatch: (targetMatch: SearchMatch) => void;
}

export function useSearchMatchNavigation({
  activeTabId,
  filterMatches,
  getSearchSidebarOccludedRightPx,
  isFilterMode,
  matches,
  setCursorPosition,
  setCurrentFilterMatchIndex,
  setCurrentMatchIndex,
  setFeedbackMessage,
}: UseSearchMatchNavigationOptions): UseSearchMatchNavigationResult {
  const navigateToMatch = useCallback(
    (targetMatch: SearchMatch) => {
      if (!activeTabId) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      setCursorPosition(activeTabId, targetMatch.line, Math.max(1, targetMatch.column || 1));
      dispatchNavigateToMatch(activeTabId, targetMatch, occludedRightPx);
    },
    [activeTabId, getSearchSidebarOccludedRightPx, setCursorPosition]
  );

  const navigateToFilterMatch = useCallback(
    (targetMatch: FilterMatch) => {
      if (!activeTabId) {
        return;
      }

      const occludedRightPx = getSearchSidebarOccludedRightPx();

      dispatchNavigateToLine(
        activeTabId,
        targetMatch.line,
        Math.max(1, targetMatch.column || 1),
        Math.max(0, targetMatch.length || 0),
        targetMatch.lineText || '',
        occludedRightPx
      );
    },
    [activeTabId, getSearchSidebarOccludedRightPx]
  );

  const handleSelectMatch = useCallback(
    (targetIndex: number) => {
      if (isFilterMode) {
        if (targetIndex < 0 || targetIndex >= filterMatches.length) {
          return;
        }

        setCurrentFilterMatchIndex(targetIndex);
        setFeedbackMessage(null);
        navigateToFilterMatch(filterMatches[targetIndex]);
        return;
      }

      if (targetIndex < 0 || targetIndex >= matches.length) {
        return;
      }

      setCurrentMatchIndex(targetIndex);
      setFeedbackMessage(null);
      navigateToMatch(matches[targetIndex]);
    },
    [
      filterMatches,
      isFilterMode,
      matches,
      navigateToFilterMatch,
      navigateToMatch,
      setCurrentFilterMatchIndex,
      setCurrentMatchIndex,
      setFeedbackMessage,
    ]
  );

  return {
    handleSelectMatch,
    navigateToFilterMatch,
    navigateToMatch,
  };
}