import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import { useEditorContentSync } from './useEditorContentSync';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createTokenLines(startLine: number, endLine: number) {
  const count = Math.max(1, endLine - startLine);
  return Array.from({ length: count }, (_, index) => [
    {
      text: `line-${startLine + index + 1}`,
      type: 'plain',
    },
  ]);
}

function buildHookParams() {
  const contentRef = { current: null } as MutableRefObject<HTMLTextAreaElement | null>;
  const scrollContainerRef = { current: null } as MutableRefObject<HTMLDivElement | null>;
  const listRef = { current: null } as MutableRefObject<any>;

  return {
    maxLineRange: 2147483647,
    tabId: 'tab-use-editor-content-sync-test',
    height: 800,
    itemSize: 20,
    largeFetchBuffer: 0,
    isHugeEditableMode: false,
    usePlainLineRendering: false,
    contentRef,
    scrollContainerRef,
    listRef,
    isScrollbarDragRef: { current: false } as MutableRefObject<boolean>,
    currentRequestVersionRef: { current: 0 } as MutableRefObject<number>,
    hugeWindowLockedRef: { current: false } as MutableRefObject<boolean>,
    hugeWindowFollowScrollOnUnlockRef: { current: false } as MutableRefObject<boolean>,
    editableSegmentRef: { current: { startLine: 0, endLine: 0, text: '' } } as MutableRefObject<{
      startLine: number;
      endLine: number;
      text: string;
    }>,
    pendingRestoreScrollTopRef: { current: null } as MutableRefObject<number | null>,
    syncedTextRef: { current: '' } as MutableRefObject<string>,
    pendingSyncRequestedRef: { current: false } as MutableRefObject<boolean>,
    lineTokensLength: 1000,
    tokenStartLine: 0,
    setPlainLines: vi.fn(),
    setPlainStartLine: vi.fn(),
    setLineTokens: vi.fn(),
    setStartLine: vi.fn(),
    setTokenFallbackPlainLines: vi.fn(),
    setTokenFallbackPlainStartLine: vi.fn(),
    setEditableSegment: vi.fn(),
    normalizeLineText: (text: string) => text,
    normalizeEditableLineText: (text: string) => text,
    normalizeEditorText: (text: string) => text,
    setInputLayerText: vi.fn(),
    getEditableText: vi.fn(() => ''),
  };
}

describe('useEditorContentSync', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('deduplicates identical in-flight token range requests', async () => {
    const firstDeferred = createDeferred<Array<Array<{ text: string; type: string }>>>();

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        return firstDeferred.promise.then(() => createTokenLines(startLine, endLine));
      }

      if (command === 'get_visible_lines_chunk') {
        return ['line-1'];
      }

      return '';
    });

    const params = buildHookParams();
    const { result } = renderHook(() => useEditorContentSync(params));

    const first = result.current.syncVisibleTokens(500, { start: 20, stop: 30 });
    const second = result.current.syncVisibleTokens(500, { start: 20, stop: 30 });
    const third = result.current.syncVisibleTokens(500, { start: 20, stop: 30 });

    await waitFor(() => {
      const tokenCalls = invokeMock.mock.calls.filter(([command]) => command === 'get_syntax_token_lines');
      expect(tokenCalls.length).toBe(1);
    });

    firstDeferred.resolve([]);
    await Promise.all([first, second, third]);

    const tokenCalls = invokeMock.mock.calls.filter(([command]) => command === 'get_syntax_token_lines');
    expect(tokenCalls.length).toBe(1);
  });

  it('keeps only the latest pending token range while one request is in-flight', async () => {
    const firstDeferred = createDeferred<Array<Array<{ text: string; type: string }>>>();
    let tokenCallCount = 0;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_syntax_token_lines') {
        tokenCallCount += 1;
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        if (tokenCallCount === 1) {
          await firstDeferred.promise;
        }
        return createTokenLines(startLine, endLine);
      }

      if (command === 'get_visible_lines_chunk') {
        return ['line-1'];
      }

      return '';
    });

    const params = buildHookParams();
    const { result } = renderHook(() => useEditorContentSync(params));

    const first = result.current.syncVisibleTokens(500, { start: 20, stop: 30 });
    const second = result.current.syncVisibleTokens(500, { start: 120, stop: 130 });
    const third = result.current.syncVisibleTokens(500, { start: 121, stop: 131 });

    await waitFor(() => {
      const tokenCalls = invokeMock.mock.calls.filter(([command]) => command === 'get_syntax_token_lines');
      expect(tokenCalls.length).toBe(1);
    });

    firstDeferred.resolve([]);

    await waitFor(() => {
      const tokenCalls = invokeMock.mock.calls.filter(([command]) => command === 'get_syntax_token_lines');
      expect(tokenCalls.length).toBe(2);
    });
    await Promise.all([first, second, third]);

    const tokenCalls = invokeMock.mock.calls.filter(([command]) => command === 'get_syntax_token_lines');
    expect(tokenCalls.length).toBe(2);

    const firstPayload = tokenCalls[0][1] as { requestSerial?: number };
    const secondPayload = tokenCalls[1][1] as {
      startLine?: number;
      endLine?: number;
      requestSerial?: number;
    };
    expect(Number(secondPayload.startLine ?? 0)).toBe(121);
    expect(Number(secondPayload.endLine ?? 0)).toBe(131);
    expect(Number(secondPayload.requestSerial ?? 0)).toBeGreaterThan(Number(firstPayload.requestSerial ?? 0));
  });
});
