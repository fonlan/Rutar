import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewportMetrics {
  topPercent: number;
  heightPercent: number;
}

interface UseDiffEditorPanelScrollSyncParams {
  defaultViewport: ViewportMetrics;
  bindScrollerViewport: (
    scroller: HTMLElement | null,
    setViewport: (value: ViewportMetrics) => void
  ) => () => void;
}

export function useDiffEditorPanelScrollSync({
  defaultViewport,
  bindScrollerViewport,
}: UseDiffEditorPanelScrollSyncParams) {
  const [sourceViewport, setSourceViewport] = useState<ViewportMetrics>(defaultViewport);
  const [targetViewport, setTargetViewport] = useState<ViewportMetrics>(defaultViewport);
  const [sourceScroller, setSourceScroller] = useState<HTMLElement | null>(null);
  const [targetScroller, setTargetScroller] = useState<HTMLElement | null>(null);
  const scrollSyncLockRef = useRef(false);

  const handleSourceScrollerRef = useCallback((element: HTMLElement | null) => {
    setSourceScroller((previous) => (previous === element ? previous : element));
  }, []);

  const handleTargetScrollerRef = useCallback((element: HTMLElement | null) => {
    setTargetScroller((previous) => (previous === element ? previous : element));
  }, []);

  useEffect(() => bindScrollerViewport(sourceScroller, setSourceViewport), [bindScrollerViewport, sourceScroller]);
  useEffect(() => bindScrollerViewport(targetScroller, setTargetViewport), [bindScrollerViewport, targetScroller]);

  useEffect(() => {
    if (!sourceScroller || !targetScroller) {
      return;
    }

    const syncScrollPosition = (from: HTMLElement, to: HTMLElement) => {
      const fromMaxTop = Math.max(0, from.scrollHeight - from.clientHeight);
      const toMaxTop = Math.max(0, to.scrollHeight - to.clientHeight);
      const fromMaxLeft = Math.max(0, from.scrollWidth - from.clientWidth);
      const toMaxLeft = Math.max(0, to.scrollWidth - to.clientWidth);
      const verticalRatio = fromMaxTop <= 0 ? 0 : from.scrollTop / fromMaxTop;
      const horizontalRatio = fromMaxLeft <= 0 ? 0 : from.scrollLeft / fromMaxLeft;

      to.scrollTop = toMaxTop * verticalRatio;
      to.scrollLeft = toMaxLeft * horizontalRatio;
    };

    const createScrollHandler = (from: HTMLElement, to: HTMLElement) => () => {
      if (scrollSyncLockRef.current) {
        return;
      }

      scrollSyncLockRef.current = true;
      syncScrollPosition(from, to);
      window.requestAnimationFrame(() => {
        scrollSyncLockRef.current = false;
      });
    };

    const syncTargetFromSource = createScrollHandler(sourceScroller, targetScroller);
    const syncSourceFromTarget = createScrollHandler(targetScroller, sourceScroller);

    sourceScroller.addEventListener('scroll', syncTargetFromSource, { passive: true });
    targetScroller.addEventListener('scroll', syncSourceFromTarget, { passive: true });
    syncScrollPosition(sourceScroller, targetScroller);

    return () => {
      sourceScroller.removeEventListener('scroll', syncTargetFromSource);
      targetScroller.removeEventListener('scroll', syncSourceFromTarget);
      scrollSyncLockRef.current = false;
    };
  }, [sourceScroller, targetScroller]);

  return {
    sourceViewport,
    targetViewport,
    sourceScroller,
    targetScroller,
    handleSourceScrollerRef,
    handleTargetScrollerRef,
  };
}
