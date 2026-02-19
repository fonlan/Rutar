import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface UseDiffEditorSplitterParams {
  width: number;
  defaultRatio: number;
  minPanelWidthPx: number;
  splitterWidthPx: number;
  clampRatio: (value: number) => number;
}

export function useDiffEditorSplitter({
  width,
  defaultRatio,
  minPanelWidthPx,
  splitterWidthPx,
  clampRatio,
}: UseDiffEditorSplitterParams) {
  const [splitRatio, setSplitRatio] = useState(defaultRatio);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startRatio: number } | null>(null);

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || width <= 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startRatio: splitRatio,
      };
    },
    [splitRatio, width]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || width <= 0) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const nextRatio = clampRatio(dragState.startRatio + deltaX / width);
      setSplitRatio(nextRatio);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [clampRatio, width]);

  const availableWidth = Math.max(0, width);
  const contentWidth = Math.max(0, availableWidth - splitterWidthPx);
  const minimumPairWidth = minPanelWidthPx * 2;
  const rawLeftWidth = Math.round(contentWidth * splitRatio);
  const leftWidthPx =
    contentWidth <= minimumPairWidth
      ? Math.max(0, Math.round(contentWidth / 2))
      : Math.max(minPanelWidthPx, Math.min(contentWidth - minPanelWidthPx, rawLeftWidth));
  const rightWidthPx = Math.max(0, contentWidth - leftWidthPx);
  const separatorLeftPx = leftWidthPx;

  return {
    splitRatio,
    leftWidthPx,
    rightWidthPx,
    separatorLeftPx,
    handleSplitterPointerDown,
  };
}
