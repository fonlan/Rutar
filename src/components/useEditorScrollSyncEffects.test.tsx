import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MutableRefObject } from 'react';
import { useEditorScrollSyncEffects } from './useEditorScrollSyncEffects';

interface ScrollElementMetrics {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  scrollTop?: number;
  scrollLeft?: number;
}

function createScrollElement(metrics: ScrollElementMetrics) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: metrics.scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: metrics.clientWidth });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: metrics.scrollTop ?? 0,
  });
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: metrics.scrollLeft ?? 0,
  });
  return element;
}

function createScrollTextarea(metrics: ScrollElementMetrics) {
  const element = document.createElement('textarea');
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: metrics.scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: metrics.clientWidth });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: metrics.scrollTop ?? 0,
  });
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: metrics.scrollLeft ?? 0,
  });
  return element;
}

function buildHookParams({
  isHugeEditableMode,
  isScrollbarDrag,
}: {
  isHugeEditableMode: boolean;
  isScrollbarDrag: boolean;
}) {
  const contentElement = createScrollTextarea({
    scrollHeight: 1200,
    clientHeight: 300,
    scrollWidth: 800,
    clientWidth: 300,
    scrollTop: 40,
    scrollLeft: 260,
  });
  const scrollContainerElement = createScrollElement({
    scrollHeight: 1200,
    clientHeight: 300,
    scrollWidth: 800,
    clientWidth: 300,
    scrollTop: 40,
    scrollLeft: 260,
  });
  const listElement = createScrollElement({
    scrollHeight: 1200,
    clientHeight: 300,
    scrollWidth: 420,
    clientWidth: 300,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const lineNumberElement = createScrollElement({
    scrollHeight: 1200,
    clientHeight: 300,
    scrollWidth: 72,
    clientWidth: 72,
    scrollTop: 0,
    scrollLeft: 0,
  });

  const params = {
    isHugeEditableMode,
    showLineNumbers: true,
    tabId: 'tab-scroll-sync',
    tabLineCount: 100,
    editableSegmentStartLine: 0,
    editableSegmentEndLine: 200,
    alignScrollOffset: (offset: number) => offset,
    pendingRestoreScrollTopRef: { current: null } as MutableRefObject<number | null>,
    contentRef: { current: contentElement } as MutableRefObject<HTMLTextAreaElement | null>,
    scrollContainerRef: { current: scrollContainerElement } as MutableRefObject<HTMLDivElement | null>,
    listRef: { current: { _outerRef: listElement } } as MutableRefObject<any>,
    lineNumberListRef: { current: { _outerRef: lineNumberElement } } as MutableRefObject<any>,
    isScrollbarDragRef: { current: isScrollbarDrag } as MutableRefObject<boolean>,
    lastKnownContentScrollTopRef: { current: 0 } as MutableRefObject<number>,
    lastKnownContentScrollLeftRef: { current: 0 } as MutableRefObject<number>,
    lastKnownContainerScrollTopRef: { current: 0 } as MutableRefObject<number>,
    lastKnownContainerScrollLeftRef: { current: 0 } as MutableRefObject<number>,
  };

  return {
    params,
    contentElement,
    scrollContainerElement,
    listElement,
  };
}

describe('useEditorScrollSyncEffects', () => {
  it('clamps input-layer horizontal scroll to backdrop max to avoid dead dragging range', () => {
    const { params, contentElement, listElement } = buildHookParams({
      isHugeEditableMode: false,
      isScrollbarDrag: false,
    });

    const { result } = renderHook(() => useEditorScrollSyncEffects(params));

    act(() => {
      result.current.handleScroll();
    });

    expect(listElement.scrollLeft).toBe(120);
    expect(contentElement.scrollLeft).toBe(120);
  });

  it('clamps huge-mode container horizontal scroll while scrollbar drag sync is active', () => {
    const { params, scrollContainerElement, listElement } = buildHookParams({
      isHugeEditableMode: true,
      isScrollbarDrag: true,
    });

    const { result } = renderHook(() => useEditorScrollSyncEffects(params));

    act(() => {
      result.current.handleScroll();
    });

    expect(listElement.scrollLeft).toBe(120);
    expect(scrollContainerElement.scrollLeft).toBe(120);
  });
});
