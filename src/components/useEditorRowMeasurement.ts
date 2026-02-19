import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorRowMeasurementParams {
  itemSize: number;
  wordWrap: boolean;
  lineNumberBottomSpacerHeightPx: number;
  tabLineCount: number;
  lineHeightPx: number;
  renderedFontSizePx: number;
  fontFamily: string | undefined;
  tabId: string;
  width: number;
  showLineNumbers: boolean;
  listRef: MutableRefObject<any>;
  lineNumberListRef: MutableRefObject<any>;
}

export function useEditorRowMeasurement({
  itemSize,
  wordWrap,
  lineNumberBottomSpacerHeightPx,
  tabLineCount,
  lineHeightPx,
  renderedFontSizePx,
  fontFamily,
  tabId,
  width,
  showLineNumbers,
  listRef,
  lineNumberListRef,
}: UseEditorRowMeasurementParams) {
  const rowHeightsRef = useRef<Map<number, number>>(new Map());

  const getListItemSize = useCallback(
    (index: number) => {
      if (!wordWrap) {
        return itemSize;
      }

      return rowHeightsRef.current.get(index) ?? itemSize;
    },
    [itemSize, wordWrap]
  );

  const getLineNumberListItemSize = useCallback(
    (index: number) => {
      if (index >= tabLineCount) {
        return lineNumberBottomSpacerHeightPx;
      }

      return getListItemSize(index);
    },
    [getListItemSize, lineNumberBottomSpacerHeightPx, tabLineCount]
  );

  const measureRenderedLineHeight = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (!wordWrap || !element) {
        return;
      }

      const measuredHeight = Math.max(itemSize, Math.round(element.scrollHeight));
      const previousHeight = rowHeightsRef.current.get(index);

      if (previousHeight !== undefined && Math.abs(previousHeight - measuredHeight) < 0.5) {
        return;
      }

      rowHeightsRef.current.set(index, measuredHeight);
      listRef.current?.resetAfterIndex?.(index);
      lineNumberListRef.current?.resetAfterIndex?.(index);
    },
    [itemSize, lineNumberListRef, listRef, wordWrap]
  );

  useEffect(() => {
    rowHeightsRef.current.clear();
    listRef.current?.resetAfterIndex?.(0, true);
    lineNumberListRef.current?.resetAfterIndex?.(0, true);
  }, [fontFamily, lineHeightPx, lineNumberListRef, listRef, renderedFontSizePx, showLineNumbers, tabId, tabLineCount, width, wordWrap]);

  return {
    getListItemSize,
    getLineNumberListItemSize,
    measureRenderedLineHeight,
  };
}
