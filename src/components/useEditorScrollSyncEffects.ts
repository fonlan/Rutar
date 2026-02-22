import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorScrollSyncEffectsParams {
  isHugeEditableMode: boolean;
  showLineNumbers: boolean;
  tabId: string;
  tabLineCount: number;
  editableSegmentStartLine: number;
  editableSegmentEndLine: number;
  alignScrollOffset: (offset: number) => number;
  pendingRestoreScrollTopRef: MutableRefObject<number | null>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  listRef: MutableRefObject<any>;
  lineNumberListRef: MutableRefObject<any>;
  isScrollbarDragRef: MutableRefObject<boolean>;
  lastKnownContentScrollTopRef: MutableRefObject<number>;
  lastKnownContentScrollLeftRef: MutableRefObject<number>;
  lastKnownContainerScrollTopRef: MutableRefObject<number>;
  lastKnownContainerScrollLeftRef: MutableRefObject<number>;
}

export function useEditorScrollSyncEffects({
  isHugeEditableMode,
  showLineNumbers,
  tabId,
  tabLineCount,
  editableSegmentStartLine,
  editableSegmentEndLine,
  alignScrollOffset,
  pendingRestoreScrollTopRef,
  contentRef,
  scrollContainerRef,
  listRef,
  lineNumberListRef,
  isScrollbarDragRef,
  lastKnownContentScrollTopRef,
  lastKnownContentScrollLeftRef,
  lastKnownContainerScrollTopRef,
  lastKnownContainerScrollLeftRef,
}: UseEditorScrollSyncEffectsParams) {
  const updateLastKnownScrollOffsets = useCallback(() => {
    lastKnownContentScrollTopRef.current = contentRef.current?.scrollTop ?? 0;
    lastKnownContentScrollLeftRef.current = contentRef.current?.scrollLeft ?? 0;
    lastKnownContainerScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    lastKnownContainerScrollLeftRef.current = scrollContainerRef.current?.scrollLeft ?? 0;
  }, [
    contentRef,
    lastKnownContainerScrollLeftRef,
    lastKnownContainerScrollTopRef,
    lastKnownContentScrollLeftRef,
    lastKnownContentScrollTopRef,
    scrollContainerRef,
  ]);

  const handleScroll = useCallback(() => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;
    if (!scrollElement) {
      updateLastKnownScrollOffsets();
      return;
    }

    const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
    const currentScrollTop = scrollElement?.scrollTop ?? 0;
    if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - currentScrollTop) > 0.001) {
      lineNumberOuter.scrollTop = currentScrollTop;
    }

    if (scrollElement && listRef.current) {
      const listEl = listRef.current._outerRef;
      if (listEl) {
        const scrollTop = scrollElement.scrollTop;
        const scrollLeft = scrollElement.scrollLeft;
        const listMaxTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
        const listMaxLeft = Math.max(0, listEl.scrollWidth - listEl.clientWidth);
        const canClampVertical = listEl.scrollHeight > 0 && listEl.clientHeight > 0;
        const canClampHorizontal = listEl.scrollWidth > 0 && listEl.clientWidth > 0;
        const targetTop = canClampVertical ? Math.min(scrollTop, listMaxTop) : scrollTop;
        const targetLeft = canClampHorizontal ? Math.min(scrollLeft, listMaxLeft) : scrollLeft;

        if (isScrollbarDragRef.current) {
          if (Math.abs(listEl.scrollTop - targetTop) > 0.001) {
            listEl.scrollTop = targetTop;
          }

          if (Math.abs(listEl.scrollLeft - targetLeft) > 0.001) {
            listEl.scrollLeft = targetLeft;
          }

          updateLastKnownScrollOffsets();
          return;
        }

        if (Math.abs(listEl.scrollTop - targetTop) > 0.001) {
          listEl.scrollTop = targetTop;
        }

        if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - targetTop) > 0.001) {
          lineNumberOuter.scrollTop = targetTop;
        }

        if (Math.abs(listEl.scrollLeft - targetLeft) > 0.001) {
          listEl.scrollLeft = targetLeft;
        }

        if (canClampVertical && Math.abs(scrollElement.scrollTop - targetTop) > 0.001) {
          scrollElement.scrollTop = targetTop;
        }

        // Keep input-layer horizontal scroll as source of truth.
        // Avoid snapping it back based on backdrop width.
      }
    }
    updateLastKnownScrollOffsets();
  }, [
    contentRef,
    isHugeEditableMode,
    isScrollbarDragRef,
    lineNumberListRef,
    listRef,
    scrollContainerRef,
    updateLastKnownScrollOffsets,
  ]);

  useEffect(() => {
    if (!isHugeEditableMode) {
      pendingRestoreScrollTopRef.current = null;
      return;
    }

    const targetScrollTop = pendingRestoreScrollTopRef.current;
    if (targetScrollTop === null) {
      return;
    }

    pendingRestoreScrollTopRef.current = null;

    const alignedTop = alignScrollOffset(targetScrollTop);
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
        scrollContainerRef.current.scrollTop = alignedTop;
      }

      const listEl = listRef.current?._outerRef;
      if (listEl && Math.abs(listEl.scrollTop - alignedTop) > 0.001) {
        listEl.scrollTop = alignedTop;
      }

      const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
      if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - alignedTop) > 0.001) {
        lineNumberOuter.scrollTop = alignedTop;
      }
    });
  }, [
    alignScrollOffset,
    editableSegmentEndLine,
    editableSegmentStartLine,
    isHugeEditableMode,
    lineNumberListRef,
    listRef,
    pendingRestoreScrollTopRef,
    scrollContainerRef,
  ]);

  useEffect(() => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;
    if (!scrollElement) {
      return;
    }

    let rafId = 0;
    const onNativeScroll = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        handleScroll();
      });
    };

    scrollElement.addEventListener('scroll', onNativeScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', onNativeScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [contentRef, handleScroll, isHugeEditableMode, scrollContainerRef]);

  useEffect(() => {
    let firstRafId = 0;
    let secondRafId = 0;

    firstRafId = window.requestAnimationFrame(() => {
      handleScroll();
      secondRafId = window.requestAnimationFrame(() => {
        handleScroll();
      });
    });

    return () => {
      if (firstRafId) {
        window.cancelAnimationFrame(firstRafId);
      }

      if (secondRafId) {
        window.cancelAnimationFrame(secondRafId);
      }
    };
  }, [handleScroll, tabLineCount]);

  useEffect(() => {
    if (!showLineNumbers) {
      return;
    }

    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;
    const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
    if (!scrollElement || !lineNumberOuter) {
      return;
    }

    if (Math.abs(lineNumberOuter.scrollTop - scrollElement.scrollTop) > 0.001) {
      lineNumberOuter.scrollTop = scrollElement.scrollTop;
    }
  }, [
    contentRef,
    editableSegmentEndLine,
    editableSegmentStartLine,
    isHugeEditableMode,
    lineNumberListRef,
    scrollContainerRef,
    showLineNumbers,
    tabId,
    tabLineCount,
  ]);

  return {
    handleScroll,
  };
}
