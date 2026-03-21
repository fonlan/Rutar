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

function buildHookParams(): Parameters<typeof useEditorContentSync>[0] {
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
    getSelectionOffsetsInElement: () => null,
    codeUnitOffsetToLineColumn: (_: string, __: number) => ({ line: 1, column: 0 }),
    getCodeUnitOffsetFromLineColumn: (text: string, _line: number, _column: number) => text.length,
    syncSelectionAfterEditableSegmentSwapRef: { current: null } as MutableRefObject<(() => void) | null>,
  };
}

describe('useEditorContentSync', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('restores huge editable selection and triggers swap sync callback', async () => {
    const params = buildHookParams();
    const syncAfterSwap = vi.fn();
    const segmentLines = Array.from({ length: 120 }, (_, index) => `line-${index + 1}`);
    const initialText = segmentLines.join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = initialText;

    const getOffsetFromLineColumn = (text: string, line: number, column: number) => {
      const targetLine = Math.max(1, Math.floor(line));
      const targetColumn = Math.max(1, Math.floor(column));
      const lines = text.split('\n');
      const safeLineIndex = Math.max(0, Math.min(lines.length - 1, targetLine - 1));
      let offset = 0;
      for (let index = 0; index < safeLineIndex; index += 1) {
        offset += lines[index].length + 1;
      }
      return offset + Math.min(lines[safeLineIndex].length, targetColumn - 1);
    };

    const getLineColumnFromOffset = (text: string, offset: number) => {
      const safeOffset = Math.max(0, Math.min(text.length, Math.floor(offset)));
      const prefix = text.slice(0, safeOffset);
      const line = prefix.split('\n').length;
      const lastNewline = prefix.lastIndexOf('\n');
      return {
        line,
        column: safeOffset - (lastNewline + 1),
      };
    };

    const selectionStart = getOffsetFromLineColumn(initialText, 15, 1);
    const selectionEnd = getOffsetFromLineColumn(initialText, 15, 6);
    textarea.setSelectionRange(selectionStart, selectionEnd);

    params.isHugeEditableMode = true;
    params.contentRef.current = textarea;
    params.editableSegmentRef.current = {
      startLine: 0,
      endLine: 120,
      text: initialText,
    };
    params.getEditableText = vi.fn(() => textarea.value);
    params.getSelectionOffsetsInElement = vi.fn(() => ({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
      isCollapsed: (textarea.selectionStart ?? 0) === (textarea.selectionEnd ?? 0),
    }));
    params.codeUnitOffsetToLineColumn = vi.fn((text: string, offset: number) => getLineColumnFromOffset(text, offset));
    params.getCodeUnitOffsetFromLineColumn = vi.fn((text: string, line: number, column: number) =>
      getOffsetFromLineColumn(text, line, column)
    );
    params.setInputLayerText = vi.fn((element: HTMLTextAreaElement, nextText: string) => {
      element.value = nextText;
    });
    params.syncSelectionAfterEditableSegmentSwapRef = { current: syncAfterSwap };

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines_chunk') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        return Array.from({ length: Math.max(1, endLine - startLine) }, (_, index) => `line-${startLine + index + 1}`);
      }
      if (command === 'get_syntax_token_lines') {
        return createTokenLines(Number(payload?.startLine ?? 0), Number(payload?.endLine ?? 1));
      }
      return '';
    });

    const { result } = renderHook(() => useEditorContentSync(params));
    await result.current.syncVisibleTokens(22000, { start: 10, stop: 20 });

    expect(textarea.value).toContain('line-11');
    expect(textarea.selectionStart).toBe(getOffsetFromLineColumn(textarea.value, 5, 1));
    expect(textarea.selectionEnd).toBe(getOffsetFromLineColumn(textarea.value, 5, 6));
    expect(syncAfterSwap).toHaveBeenCalledTimes(1);
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

  it('keeps existing token cache when syntax response is empty and requests plain fallback lines', async () => {
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_syntax_token_lines') {
        return [];
      }

      if (command === 'get_visible_lines_chunk') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        return Array.from({ length: Math.max(1, endLine - startLine) }, (_, index) => `fallback-${startLine + index + 1}`);
      }

      return '';
    });

    const params = buildHookParams();
    const setLineTokens = vi.fn();
    const setStartLine = vi.fn();
    params.setLineTokens = setLineTokens;
    params.setStartLine = setStartLine;

    const { result } = renderHook(() => useEditorContentSync(params));
    await result.current.syncVisibleTokens(500, { start: 20, stop: 30 });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('get_visible_lines_chunk', {
        id: params.tabId,
        startLine: 20,
        endLine: 30,
      });
    });
    expect(setLineTokens).not.toHaveBeenCalled();
    expect(setStartLine).not.toHaveBeenCalled();
  });
});
