import { useCallback } from 'react';
import type { WheelEvent } from 'react';

type ScrollElement = HTMLDivElement | HTMLTextAreaElement;

interface UseEditorLineNumberWheelParams {
  getRectangularSelectionScrollElement: () => ScrollElement | null;
  alignScrollOffset: (offset: number) => number;
}

export function useEditorLineNumberWheel({
  getRectangularSelectionScrollElement,
  alignScrollOffset,
}: UseEditorLineNumberWheelParams) {
  const handleLineNumberWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey) {
        return;
      }

      const scrollElement = getRectangularSelectionScrollElement();
      if (!scrollElement) {
        return;
      }

      const hasVerticalDelta = Math.abs(event.deltaY) > 0.001;
      const horizontalDelta = Math.abs(event.deltaX) > 0.001 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      const hasHorizontalDelta = Math.abs(horizontalDelta) > 0.001;

      if (!hasVerticalDelta && !hasHorizontalDelta) {
        return;
      }

      event.preventDefault();

      if (hasVerticalDelta) {
        const maxTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        const targetTop = Math.max(0, Math.min(maxTop, alignScrollOffset(scrollElement.scrollTop + event.deltaY)));
        if (Math.abs(scrollElement.scrollTop - targetTop) > 0.001) {
          scrollElement.scrollTop = targetTop;
        }
      }

      if (hasHorizontalDelta) {
        const maxLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
        const targetLeft = Math.max(
          0,
          Math.min(maxLeft, alignScrollOffset(scrollElement.scrollLeft + horizontalDelta))
        );

        if (Math.abs(scrollElement.scrollLeft - targetLeft) > 0.001) {
          scrollElement.scrollLeft = targetLeft;
        }
      }
    },
    [alignScrollOffset, getRectangularSelectionScrollElement]
  );

  return {
    handleLineNumberWheel,
  };
}
