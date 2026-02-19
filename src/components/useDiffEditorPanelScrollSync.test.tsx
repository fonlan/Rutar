import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDiffEditorPanelScrollSync } from './useDiffEditorPanelScrollSync';

interface ScrollerMetrics {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
}

function createScroller(metrics: ScrollerMetrics) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: metrics.scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: metrics.clientWidth });
  Object.defineProperty(element, 'scrollTop', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(element, 'scrollLeft', { configurable: true, writable: true, value: 0 });
  return element;
}

describe('useDiffEditorPanelScrollSync', () => {
  it('keeps the active drag side authoritative until pointerup', () => {
    const bindScrollerViewport = vi.fn(() => () => undefined);
    const sourceScroller = createScroller({
      scrollHeight: 1200,
      clientHeight: 200,
      scrollWidth: 800,
      clientWidth: 300,
    });
    const targetScroller = createScroller({
      scrollHeight: 1200,
      clientHeight: 200,
      scrollWidth: 800,
      clientWidth: 300,
    });

    const { result } = renderHook(() => useDiffEditorPanelScrollSync({
      defaultViewport: { topPercent: 0, heightPercent: 100 },
      bindScrollerViewport,
    }));

    act(() => {
      result.current.handleSourceScrollerRef(sourceScroller);
      result.current.handleTargetScrollerRef(targetScroller);
    });

    act(() => {
      sourceScroller.dispatchEvent(new Event('pointerdown'));
      sourceScroller.scrollTop = 300;
      sourceScroller.dispatchEvent(new Event('scroll'));
    });

    expect(targetScroller.scrollTop).toBe(300);

    act(() => {
      targetScroller.scrollTop = 120;
      targetScroller.dispatchEvent(new Event('scroll'));
    });

    expect(sourceScroller.scrollTop).toBe(300);
    expect(targetScroller.scrollTop).toBe(300);

    act(() => {
      window.dispatchEvent(new Event('pointerup'));
      targetScroller.scrollTop = 220;
      targetScroller.dispatchEvent(new Event('scroll'));
    });

    expect(sourceScroller.scrollTop).toBeCloseTo(220, 4);
  });

  it('applies wheel delta to both panels in the same event turn', () => {
    const bindScrollerViewport = vi.fn(() => () => undefined);
    const sourceScroller = createScroller({
      scrollHeight: 1200,
      clientHeight: 200,
      scrollWidth: 900,
      clientWidth: 300,
    });
    const targetScroller = createScroller({
      scrollHeight: 1800,
      clientHeight: 200,
      scrollWidth: 1500,
      clientWidth: 300,
    });

    const { result } = renderHook(() => useDiffEditorPanelScrollSync({
      defaultViewport: { topPercent: 0, heightPercent: 100 },
      bindScrollerViewport,
    }));

    act(() => {
      result.current.handleSourceScrollerRef(sourceScroller);
      result.current.handleTargetScrollerRef(targetScroller);
    });

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 150,
      deltaX: 40,
    });
    const dispatched = sourceScroller.dispatchEvent(wheelEvent);

    expect(dispatched).toBe(false);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(sourceScroller.scrollTop).toBeCloseTo(150, 4);
    expect(sourceScroller.scrollLeft).toBeCloseTo(40, 4);
    expect(targetScroller.scrollTop).toBeCloseTo(240, 4);
    expect(targetScroller.scrollLeft).toBeCloseTo(80, 4);
  });

  it('syncs target scroller immediately and does not wait for requestAnimationFrame', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const bindScrollerViewport = vi.fn(() => () => undefined);
    const sourceScroller = createScroller({
      scrollHeight: 1200,
      clientHeight: 200,
      scrollWidth: 900,
      clientWidth: 400,
    });
    const targetScroller = createScroller({
      scrollHeight: 1800,
      clientHeight: 200,
      scrollWidth: 1200,
      clientWidth: 400,
    });

    const { result } = renderHook(() => useDiffEditorPanelScrollSync({
      defaultViewport: { topPercent: 0, heightPercent: 100 },
      bindScrollerViewport,
    }));

    act(() => {
      result.current.handleSourceScrollerRef(sourceScroller);
      result.current.handleTargetScrollerRef(targetScroller);
    });

    act(() => {
      sourceScroller.scrollTop = 500;
      sourceScroller.scrollLeft = 50;
      sourceScroller.dispatchEvent(new Event('scroll'));
    });

    expect(targetScroller.scrollTop).toBeCloseTo(800, 4);
    expect(targetScroller.scrollLeft).toBeCloseTo(80, 4);
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('ignores mirrored target scroll events instead of re-syncing back', () => {
    const bindScrollerViewport = vi.fn(() => () => undefined);
    const sourceScroller = createScroller({
      scrollHeight: 1000,
      clientHeight: 200,
      scrollWidth: 900,
      clientWidth: 300,
    });
    const targetScroller = createScroller({
      scrollHeight: 1000,
      clientHeight: 200,
      scrollWidth: 900,
      clientWidth: 300,
    });

    const { result } = renderHook(() => useDiffEditorPanelScrollSync({
      defaultViewport: { topPercent: 0, heightPercent: 100 },
      bindScrollerViewport,
    }));

    act(() => {
      result.current.handleSourceScrollerRef(sourceScroller);
      result.current.handleTargetScrollerRef(targetScroller);
    });

    act(() => {
      sourceScroller.scrollTop = 300;
      sourceScroller.dispatchEvent(new Event('scroll'));
    });
    expect(targetScroller.scrollTop).toBe(300);

    sourceScroller.scrollTop = 450;
    act(() => {
      targetScroller.dispatchEvent(new Event('scroll'));
    });

    expect(sourceScroller.scrollTop).toBe(450);
  });

  it('does not swallow subsequent real target-side user scroll when mirrored event is missing', () => {
    const bindScrollerViewport = vi.fn(() => () => undefined);
    const sourceScroller = createScroller({
      scrollHeight: 1400,
      clientHeight: 200,
      scrollWidth: 1000,
      clientWidth: 300,
    });
    const targetScroller = createScroller({
      scrollHeight: 1400,
      clientHeight: 200,
      scrollWidth: 1000,
      clientWidth: 300,
    });

    const { result } = renderHook(() => useDiffEditorPanelScrollSync({
      defaultViewport: { topPercent: 0, heightPercent: 100 },
      bindScrollerViewport,
    }));

    act(() => {
      result.current.handleSourceScrollerRef(sourceScroller);
      result.current.handleTargetScrollerRef(targetScroller);
    });

    act(() => {
      sourceScroller.scrollTop = 400;
      sourceScroller.dispatchEvent(new Event('scroll'));
    });

    expect(targetScroller.scrollTop).toBe(400);

    act(() => {
      targetScroller.scrollTop = 220;
      targetScroller.dispatchEvent(new Event('scroll'));
    });

    expect(sourceScroller.scrollTop).toBeCloseTo(220, 4);
  });
});
