import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';
import { SEARCH_SIDEBAR_MAX_WIDTH, SEARCH_SIDEBAR_MIN_WIDTH } from './utils';
import { useSearchSidebarInteraction } from './useSearchSidebarInteraction';

interface UseSearchSidebarFrameOptions {
  isOpen: boolean;
  searchSidebarWidth: number;
  setSearchSidebarWidth: (value: number) => void;
}

export function useSearchSidebarFrame({
  isOpen,
  searchSidebarWidth,
  setSearchSidebarWidth,
}: UseSearchSidebarFrameOptions) {
  const {
    containerRef: searchSidebarContainerRef,
    isResizing: isSearchSidebarResizing,
    startResize: startSearchSidebarResize,
  } = useResizableSidebarWidth({
    width: searchSidebarWidth,
    minWidth: SEARCH_SIDEBAR_MIN_WIDTH,
    maxWidth: SEARCH_SIDEBAR_MAX_WIDTH,
    onWidthChange: setSearchSidebarWidth,
    resizeEdge: 'left',
  });

  const {
    getSearchSidebarOccludedRightPx,
    handleSearchUiBlurCapture,
    handleSearchUiFocusCapture,
    handleSearchUiPointerDownCapture,
    isSearchUiActive,
  } = useSearchSidebarInteraction({
    isOpen,
    searchSidebarContainerRef,
  });

  return {
    getSearchSidebarOccludedRightPx,
    handleSearchUiBlurCapture,
    handleSearchUiFocusCapture,
    handleSearchUiPointerDownCapture,
    isSearchSidebarResizing,
    isSearchUiActive,
    searchSidebarContainerRef,
    startSearchSidebarResize,
  };
}