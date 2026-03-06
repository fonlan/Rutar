import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { PanelMode, SearchOpenEventDetail, SearchResultPanelState } from './types';
import { dispatchSearchClose, getReservedLayoutHeight } from './utils';

interface UseSearchPanelShellEffectsOptions {
  activeTabId: string | null;
  focusSearchInput: () => void;
  hasActiveTab: boolean;
  isFilterMode: boolean;
  isOpen: boolean;
  keyword: string;
  minimizedResultWrapperRef: RefObject<HTMLDivElement | null>;
  navigateByStep: (step: number) => Promise<void>;
  previousActiveTabIdRef: MutableRefObject<string | null>;
  resultPanelState: SearchResultPanelState;
  resultPanelWrapperRef: RefObject<HTMLDivElement | null>;
  reverseSearch: boolean;
  setAppliedResultFilterKeyword: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setIsOpen: (value: boolean) => void;
  setIsResultFilterSearching: (value: boolean) => void;
  setPanelMode: (value: PanelMode) => void;
  setResultFilterKeyword: (value: string) => void;
  setResultPanelState: (value: SearchResultPanelState) => void;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
}

interface UseSearchPanelShellEffectsResult {
  searchSidebarBottomOffset: string;
  searchSidebarTopOffset: string;
}

export function useSearchPanelShellEffects({
  activeTabId,
  focusSearchInput,
  hasActiveTab,
  isFilterMode,
  isOpen,
  keyword,
  minimizedResultWrapperRef,
  navigateByStep,
  previousActiveTabIdRef,
  resultPanelState,
  resultPanelWrapperRef,
  reverseSearch,
  setAppliedResultFilterKeyword,
  setErrorMessage,
  setFeedbackMessage,
  setIsOpen,
  setIsResultFilterSearching,
  setPanelMode,
  setResultFilterKeyword,
  setResultPanelState,
  stopResultFilterSearchRef,
}: UseSearchPanelShellEffectsOptions): UseSearchPanelShellEffectsResult {
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

  return {
    searchSidebarBottomOffset,
    searchSidebarTopOffset,
  };
}