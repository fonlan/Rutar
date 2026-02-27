import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { useEditorVisibleItemsRendered } from './useEditorVisibleItemsRendered';

function buildHookParams(overrides?: Partial<Parameters<typeof useEditorVisibleItemsRendered>[0]>) {
  const syncVisibleTokens = vi.fn(async () => undefined);

  return {
    params: {
      isHugeEditableMode: false,
      pendingSyncRequestedRef: { current: false } as MutableRefObject<boolean>,
      syncInFlightRef: { current: false } as MutableRefObject<boolean>,
      isComposingRef: { current: false } as MutableRefObject<boolean>,
      isScrollbarDragRef: { current: false } as MutableRefObject<boolean>,
      largeFetchBuffer: 50,
      tabLineCount: 500,
      tabLargeFileMode: false,
      editableSegmentStartLine: 0,
      editableSegmentEndLine: 0,
      usePlainLineRendering: false,
      plainLinesLength: 0,
      plainStartLine: 0,
      lineTokensLength: 100,
      startLine: 0,
      requestTimeoutRef: { current: null } as MutableRefObject<any>,
      hugeEditableFetchDebounceMs: 24,
      largeFileFetchDebounceMs: 12,
      normalFileFetchDebounceMs: 50,
      scrollbarDragFetchDebounceMs: 8,
      syncVisibleTokens,
      ...overrides,
    },
    syncVisibleTokens,
  };
}

describe('useEditorVisibleItemsRendered', () => {
  it('keeps normal visible range and debounce when not in fast-jump path', () => {
    vi.useFakeTimers();
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { params, syncVisibleTokens } = buildHookParams({
      lineTokensLength: 0,
    });

    const { result } = renderHook(() => useEditorVisibleItemsRendered(params));

    act(() => {
      result.current.onItemsRendered({ visibleStartIndex: 10, visibleStopIndex: 20 });
    });

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(syncVisibleTokens).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(syncVisibleTokens).toHaveBeenCalledTimes(1);
    expect(syncVisibleTokens).toHaveBeenCalledWith(500, {
      start: 10,
      stop: 20,
    });

    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('keeps start at visible line, expands stop, and shortens debounce when a fast jump is detected', () => {
    vi.useFakeTimers();
    const nowValues = [0, 20];
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowValues.shift() ?? 20);
    const { params, syncVisibleTokens } = buildHookParams({
      lineTokensLength: 100,
      startLine: 0,
    });

    const { result } = renderHook(() => useEditorVisibleItemsRendered(params));

    act(() => {
      result.current.onItemsRendered({ visibleStartIndex: 10, visibleStopIndex: 20 });
    });

    act(() => {
      result.current.onItemsRendered({ visibleStartIndex: 220, visibleStopIndex: 230 });
    });

    act(() => {
      vi.advanceTimersByTime(11);
    });
    expect(syncVisibleTokens).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(syncVisibleTokens).toHaveBeenCalledTimes(1);
    expect(syncVisibleTokens).toHaveBeenCalledWith(500, {
      start: 220,
      stop: 387,
    });

    nowSpy.mockRestore();
    vi.useRealTimers();
  });
});
