import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorSearchHorizontalNavigationParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  wordWrap: boolean;
  searchNavigateHorizontalMarginPx: number;
  searchNavigateMinVisibleTextWidthPx: number;
  getEditableText: (element: HTMLTextAreaElement) => string;
  measureTextWidthByEditorStyle: (element: HTMLTextAreaElement, text: string) => number;
  alignScrollOffset: (offset: number) => number;
}

export function useEditorSearchHorizontalNavigation({
  contentRef,
  wordWrap,
  searchNavigateHorizontalMarginPx,
  searchNavigateMinVisibleTextWidthPx,
  getEditableText,
  measureTextWidthByEditorStyle,
  alignScrollOffset,
}: UseEditorSearchHorizontalNavigationParams) {
  const estimateLineTextForNavigation = useCallback(
    (lineNumber: number, incomingLineText: string) => {
      if (incomingLineText) {
        return incomingLineText;
      }

      if (!contentRef.current || lineNumber <= 0) {
        return '';
      }

      const allText = getEditableText(contentRef.current);
      if (!allText) {
        return '';
      }

      const lines = allText.split('\n');
      const lineIndex = lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        return '';
      }

      return lines[lineIndex] ?? '';
    },
    [contentRef, getEditableText]
  );

  const getFallbackSearchSidebarOcclusionPx = useCallback(() => {
    const sidebarElement = document.querySelector<HTMLElement>('[data-rutar-search-sidebar="true"]');
    if (!sidebarElement) {
      return 0;
    }

    const rect = sidebarElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }

    return Math.max(0, window.innerWidth - rect.left);
  }, []);

  const ensureSearchMatchVisibleHorizontally = useCallback(
    (
      scrollElement: HTMLDivElement | HTMLTextAreaElement | null,
      lineNumber: number,
      columnNumber: number,
      matchLength: number,
      incomingLineText: string,
      occludedRightPx: number,
      lineListElement?: HTMLDivElement
    ) => {
      if (!scrollElement || wordWrap) {
        return;
      }

      const textareaElement = contentRef.current;
      if (!textareaElement) {
        return;
      }

      const lineText = estimateLineTextForNavigation(lineNumber, incomingLineText);
      const zeroBasedStart = Math.max(0, columnNumber - 1);
      const safeStart = Math.min(zeroBasedStart, lineText.length);
      const safeLength = Math.max(1, matchLength || 1);
      const safeEnd = Math.min(lineText.length, safeStart + safeLength);

      const prefixWidth = measureTextWidthByEditorStyle(textareaElement, lineText.slice(0, safeStart));
      const matchWidth = Math.max(
        measureTextWidthByEditorStyle(textareaElement, lineText.slice(safeStart, safeEnd)),
        measureTextWidthByEditorStyle(textareaElement, lineText.charAt(safeStart) || ' ')
      );

      const style = window.getComputedStyle(textareaElement);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;

      const fallbackOccludedRightPx = getFallbackSearchSidebarOcclusionPx();
      const effectiveOccludedRight = Math.max(0, occludedRightPx, fallbackOccludedRightPx);
      const baseVisibleWidth = Math.max(
        0,
        scrollElement.clientWidth - paddingLeft - paddingRight - searchNavigateHorizontalMarginPx * 2
      );
      const availableVisibleWidth = Math.max(
        searchNavigateMinVisibleTextWidthPx,
        baseVisibleWidth - effectiveOccludedRight
      );

      const targetStartX = Math.max(0, prefixWidth - searchNavigateHorizontalMarginPx);
      const targetEndX = Math.max(
        targetStartX,
        prefixWidth + matchWidth + searchNavigateHorizontalMarginPx
      );

      let nextScrollLeft = scrollElement.scrollLeft;
      const viewportStartX = nextScrollLeft;
      const viewportEndX = viewportStartX + availableVisibleWidth;

      if (targetEndX > viewportEndX) {
        nextScrollLeft = targetEndX - availableVisibleWidth;
      } else if (targetStartX < viewportStartX) {
        nextScrollLeft = targetStartX;
      }

      const maxScrollableWidthByElement = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
      const maxScrollableWidthByTextarea = Math.max(0, textareaElement.scrollWidth - textareaElement.clientWidth);
      const maxScrollableWidthByList = lineListElement
        ? Math.max(0, lineListElement.scrollWidth - lineListElement.clientWidth)
        : 0;
      const maxScrollableWidth = Math.max(
        maxScrollableWidthByElement,
        maxScrollableWidthByTextarea,
        maxScrollableWidthByList
      );

      const alignedNextScrollLeft = alignScrollOffset(Math.max(0, Math.min(nextScrollLeft, maxScrollableWidth)));
      if (Math.abs(scrollElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        scrollElement.scrollLeft = alignedNextScrollLeft;
      }

      if (lineListElement && Math.abs(lineListElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        lineListElement.scrollLeft = alignedNextScrollLeft;
      }
    },
    [
      alignScrollOffset,
      contentRef,
      estimateLineTextForNavigation,
      getFallbackSearchSidebarOcclusionPx,
      measureTextWidthByEditorStyle,
      searchNavigateHorizontalMarginPx,
      searchNavigateMinVisibleTextWidthPx,
      wordWrap,
    ]
  );

  return {
    ensureSearchMatchVisibleHorizontally,
  };
}
