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

type ScrollSyncSide = 'source' | 'target';

interface ScrollPositionSnapshot {
  top: number;
  left: number;
}

const SCROLL_SYNC_EPSILON = 0.5;
const WHEEL_LINE_HEIGHT_PX = 16;

function isApproximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) <= SCROLL_SYNC_EPSILON;
}

function clampScroll(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function resolveWheelDeltaInPixels(event: WheelEvent, source: HTMLElement) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return {
      deltaX: event.deltaX * WHEEL_LINE_HEIGHT_PX,
      deltaY: event.deltaY * WHEEL_LINE_HEIGHT_PX,
    };
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      deltaX: event.deltaX * source.clientWidth,
      deltaY: event.deltaY * source.clientHeight,
    };
  }

  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
  };
}

export function useDiffEditorPanelScrollSync({
  defaultViewport,
  bindScrollerViewport,
}: UseDiffEditorPanelScrollSyncParams) {
  const [sourceViewport, setSourceViewport] = useState<ViewportMetrics>(defaultViewport);
  const [targetViewport, setTargetViewport] = useState<ViewportMetrics>(defaultViewport);
  const [sourceScroller, setSourceScroller] = useState<HTMLElement | null>(null);
  const [targetScroller, setTargetScroller] = useState<HTMLElement | null>(null);
  const mirroredScrollRef = useRef<Record<ScrollSyncSide, ScrollPositionSnapshot | null>>({
    source: null,
    target: null,
  });
  const activeDragSideRef = useRef<ScrollSyncSide | null>(null);

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

    const consumeMirroredScrollIfNeeded = (side: ScrollSyncSide, element: HTMLElement) => {
      const mirrored = mirroredScrollRef.current[side];
      if (!mirrored) {
        return false;
      }

      if (
        isApproximatelyEqual(element.scrollTop, mirrored.top)
        && isApproximatelyEqual(element.scrollLeft, mirrored.left)
      ) {
        mirroredScrollRef.current[side] = null;
        return true;
      }

      mirroredScrollRef.current[side] = null;
      return false;
    };

    const applyMirroredScrollPosition = (
      side: ScrollSyncSide,
      element: HTMLElement,
      nextTop: number,
      nextLeft: number
    ) => {
      if (
        isApproximatelyEqual(element.scrollTop, nextTop)
        && isApproximatelyEqual(element.scrollLeft, nextLeft)
      ) {
        return;
      }

      mirroredScrollRef.current[side] = {
        top: nextTop,
        left: nextLeft,
      };
      element.scrollTop = nextTop;
      element.scrollLeft = nextLeft;
    };

    const syncScrollPosition = (from: HTMLElement, to: HTMLElement, toSide: ScrollSyncSide) => {
      const fromMaxTop = Math.max(0, from.scrollHeight - from.clientHeight);
      const toMaxTop = Math.max(0, to.scrollHeight - to.clientHeight);
      const fromMaxLeft = Math.max(0, from.scrollWidth - from.clientWidth);
      const toMaxLeft = Math.max(0, to.scrollWidth - to.clientWidth);
      const verticalRatio = fromMaxTop <= 0 ? 0 : from.scrollTop / fromMaxTop;
      const horizontalRatio = fromMaxLeft <= 0 ? 0 : from.scrollLeft / fromMaxLeft;
      const nextTop = toMaxTop * verticalRatio;
      const nextLeft = toMaxLeft * horizontalRatio;
      applyMirroredScrollPosition(toSide, to, nextTop, nextLeft);
    };

    const createScrollHandler = (
      from: HTMLElement,
      to: HTMLElement,
      fromSide: ScrollSyncSide,
      toSide: ScrollSyncSide
    ) => () => {
      if (consumeMirroredScrollIfNeeded(fromSide, from)) {
        return;
      }

      const activeDragSide = activeDragSideRef.current;
      if (activeDragSide && activeDragSide !== fromSide) {
        syncScrollPosition(to, from, fromSide);
        return;
      }

      syncScrollPosition(from, to, toSide);
    };

    const createWheelHandler = (
      from: HTMLElement,
      to: HTMLElement,
      fromSide: ScrollSyncSide,
      toSide: ScrollSyncSide
    ) => (event: WheelEvent) => {
      if (!event.cancelable) {
        return;
      }

      event.preventDefault();

      const { deltaX, deltaY } = resolveWheelDeltaInPixels(event, from);
      const fromMaxTop = Math.max(0, from.scrollHeight - from.clientHeight);
      const fromMaxLeft = Math.max(0, from.scrollWidth - from.clientWidth);
      const nextFromTop = clampScroll(from.scrollTop + deltaY, fromMaxTop);
      const nextFromLeft = clampScroll(from.scrollLeft + deltaX, fromMaxLeft);
      const verticalRatio = fromMaxTop <= 0 ? 0 : nextFromTop / fromMaxTop;
      const horizontalRatio = fromMaxLeft <= 0 ? 0 : nextFromLeft / fromMaxLeft;
      const toMaxTop = Math.max(0, to.scrollHeight - to.clientHeight);
      const toMaxLeft = Math.max(0, to.scrollWidth - to.clientWidth);
      const nextToTop = toMaxTop * verticalRatio;
      const nextToLeft = toMaxLeft * horizontalRatio;

      applyMirroredScrollPosition(fromSide, from, nextFromTop, nextFromLeft);
      applyMirroredScrollPosition(toSide, to, nextToTop, nextToLeft);
    };

    const syncTargetFromSource = createScrollHandler(
      sourceScroller,
      targetScroller,
      'source',
      'target'
    );
    const syncSourceFromTarget = createScrollHandler(
      targetScroller,
      sourceScroller,
      'target',
      'source'
    );
    const syncWheelTargetFromSource = createWheelHandler(
      sourceScroller,
      targetScroller,
      'source',
      'target'
    );
    const syncWheelSourceFromTarget = createWheelHandler(
      targetScroller,
      sourceScroller,
      'target',
      'source'
    );
    const markSourceAsActiveDragSide = () => {
      activeDragSideRef.current = 'source';
    };
    const markTargetAsActiveDragSide = () => {
      activeDragSideRef.current = 'target';
    };
    const clearActiveDragSide = () => {
      activeDragSideRef.current = null;
    };

    sourceScroller.addEventListener('scroll', syncTargetFromSource, { passive: true });
    targetScroller.addEventListener('scroll', syncSourceFromTarget, { passive: true });
    sourceScroller.addEventListener('wheel', syncWheelTargetFromSource, { passive: false });
    targetScroller.addEventListener('wheel', syncWheelSourceFromTarget, { passive: false });
    sourceScroller.addEventListener('pointerdown', markSourceAsActiveDragSide, { passive: true });
    targetScroller.addEventListener('pointerdown', markTargetAsActiveDragSide, { passive: true });
    window.addEventListener('pointerup', clearActiveDragSide, { passive: true });
    window.addEventListener('pointercancel', clearActiveDragSide, { passive: true });
    window.addEventListener('blur', clearActiveDragSide);
    syncScrollPosition(sourceScroller, targetScroller, 'target');

    return () => {
      sourceScroller.removeEventListener('scroll', syncTargetFromSource);
      targetScroller.removeEventListener('scroll', syncSourceFromTarget);
      sourceScroller.removeEventListener('wheel', syncWheelTargetFromSource);
      targetScroller.removeEventListener('wheel', syncWheelSourceFromTarget);
      sourceScroller.removeEventListener('pointerdown', markSourceAsActiveDragSide);
      targetScroller.removeEventListener('pointerdown', markTargetAsActiveDragSide);
      window.removeEventListener('pointerup', clearActiveDragSide);
      window.removeEventListener('pointercancel', clearActiveDragSide);
      window.removeEventListener('blur', clearActiveDragSide);
      activeDragSideRef.current = null;
      mirroredScrollRef.current.source = null;
      mirroredScrollRef.current.target = null;
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
