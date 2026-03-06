import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from 'react';

interface UseSearchSidebarInteractionOptions {
  isOpen: boolean;
  searchSidebarContainerRef: RefObject<HTMLDivElement | null>;
}

export function useSearchSidebarInteraction({
  isOpen,
  searchSidebarContainerRef,
}: UseSearchSidebarInteractionOptions) {
  const [isSearchUiFocused, setIsSearchUiFocused] = useState(false);
  const [isSearchUiPointerActive, setIsSearchUiPointerActive] = useState(false);
  const [isSearchUiPinnedActive, setIsSearchUiPinnedActive] = useState(false);
  const blurUpdateTimerRef = useRef<number | null>(null);

  const isTargetInsideSearchSidebar = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      return false;
    }

    return !!searchSidebarContainerRef.current?.contains(target);
  }, [searchSidebarContainerRef]);

  const getSearchSidebarOccludedRightPx = useCallback(() => {
    if (!isOpen) {
      return 0;
    }

    const sidebarElement = searchSidebarContainerRef.current;
    if (!sidebarElement) {
      return 0;
    }

    const rect = sidebarElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }

    return Math.max(0, window.innerWidth - rect.left);
  }, [isOpen, searchSidebarContainerRef]);

  const syncSearchSidebarFocusFromDom = useCallback(() => {
    setIsSearchUiFocused(isTargetInsideSearchSidebar(document.activeElement));
  }, [isTargetInsideSearchSidebar]);

  const handleSearchUiPointerDownCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiPointerActive(true);
    setIsSearchUiPinnedActive(true);
    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiFocusCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      if (isTargetInsideSearchSidebar(event.relatedTarget)) {
        return;
      }

      if (isSearchUiPointerActive) {
        return;
      }

      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
      }

      blurUpdateTimerRef.current = window.setTimeout(() => {
        if (!isSearchUiPointerActive) {
          syncSearchSidebarFocusFromDom();
        }
        blurUpdateTimerRef.current = null;
      }, 40);
    },
    [isSearchUiPointerActive, isTargetInsideSearchSidebar, syncSearchSidebarFocusFromDom]
  );

  useEffect(() => {
    if (!isSearchUiPointerActive) {
      return;
    }

    const handlePointerEnd = () => {
      setIsSearchUiPointerActive(false);
      window.requestAnimationFrame(() => {
        syncSearchSidebarFocusFromDom();
      });
    };

    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    return () => {
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [isSearchUiPointerActive, syncSearchSidebarFocusFromDom]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setIsSearchUiFocused(false);
    setIsSearchUiPointerActive(false);
    setIsSearchUiPinnedActive(false);
  }, [isOpen]);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      if (isTargetInsideSearchSidebar(event.target)) {
        return;
      }

      setIsSearchUiPinnedActive(false);
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    };
  }, [isTargetInsideSearchSidebar]);

  useEffect(() => {
    return () => {
      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
        blurUpdateTimerRef.current = null;
      }
    };
  }, []);

  return {
    getSearchSidebarOccludedRightPx,
    handleSearchUiBlurCapture,
    handleSearchUiFocusCapture,
    handleSearchUiPointerDownCapture,
    isSearchUiActive: isSearchUiFocused || isSearchUiPointerActive || isSearchUiPinnedActive,
  };
}
