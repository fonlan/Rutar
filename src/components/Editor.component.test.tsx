import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { GO_TO_LINE_DIALOG_REQUEST_EVENT } from '@/lib/goToLineDialog';
import { Editor } from './Editor';
import { type FileTab, useStore } from '@/store/useStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: vi.fn(async () => ''),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useResizeObserver', () => ({
  useResizeObserver: () => ({
    ref: () => undefined,
    width: 960,
    height: 540,
  }),
}));

const invokeMock = vi.mocked(invoke);
const readClipboardTextMock = vi.mocked(readClipboardText);
const openUrlMock = vi.mocked(openUrl);

function restoreProperty(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

function createTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: 'tab-editor-component',
    name: 'main.ts',
    path: 'C:\\repo\\main.ts',
    encoding: 'UTF-8',
    lineEnding: 'LF',
    lineCount: 6,
    largeFileMode: false,
    ...overrides,
  };
}

async function waitForEditorTextarea(container: HTMLElement) {
  await waitFor(() => {
    expect(container.querySelector('textarea.editor-input-layer')).toBeTruthy();
  });

  return container.querySelector('textarea.editor-input-layer') as HTMLTextAreaElement;
}

async function waitForEditorText(
  textarea: HTMLTextAreaElement,
  expectedText = 'alpha\nbeta\n'
) {
  await waitFor(() => {
    expect(textarea.value).toBe(expectedText);
  });
}

function createClipboardLikeEvent(
  type: 'copy' | 'cut' | 'paste',
  options?: {
    getDataText?: string;
    setData?: ReturnType<typeof vi.fn>;
    getData?: ReturnType<typeof vi.fn>;
  }
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clipboardData?: {
      setData: (mime: string, text: string) => void;
      getData: (mime: string) => string;
    };
  };

  const setData = options?.setData ?? vi.fn();
  const getData = options?.getData ?? vi.fn(() => options?.getDataText ?? '');
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      setData,
      getData,
    },
  });

  return { event, setData, getData };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

async function clickLineNumber(
  container: HTMLElement,
  lineNumber: number,
  options?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; detail?: number }
) {
  await waitFor(() => {
    expect(container.querySelectorAll('div.cursor-pointer.select-none').length).toBeGreaterThan(0);
  });

  const lineElement = Array.from(container.querySelectorAll('div.cursor-pointer.select-none')).find(
    (element) => element.textContent === String(lineNumber)
  );
  expect(lineElement).toBeTruthy();

  fireEvent.click(lineElement as Element, options ?? {});
}

async function openLineNumberContextMenu(
  container: HTMLElement,
  lineNumber: number,
  position?: { clientX?: number; clientY?: number }
) {
  await waitFor(() => {
    expect(container.querySelectorAll('div.cursor-pointer.select-none').length).toBeGreaterThan(0);
  });

  const lineElement = Array.from(container.querySelectorAll('div.cursor-pointer.select-none')).find(
    (element) => element.textContent === String(lineNumber)
  );
  expect(lineElement).toBeTruthy();

  fireEvent.contextMenu(lineElement as Element, {
    clientX: position?.clientX ?? 220,
    clientY: position?.clientY ?? 180,
  });
}

describe('Editor component', () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    readClipboardTextMock.mockResolvedValue('');
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({
      language: 'en-US',
      showLineNumbers: true,
      wordWrap: false,
    });

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return ['alpha', 'beta'];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });
  });

  it('renders input layer and loads initial text from backend', async () => {
    const tab = createTab();

    const { container } = render(<Editor tab={tab} />);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea.editor-input-layer');
    expect(textarea).toBeTruthy();
    const editorRoot = textarea?.closest('div[class*="editor-syntax-"]');
    expect(editorRoot?.className).not.toContain('focus-within:ring-1');
    expect(editorRoot?.className).not.toContain('focus-within:ring-inset');
    expect(editorRoot?.className).not.toContain('focus-within:ring-ring/40');

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('get_visible_lines', {
        id: tab.id,
        startLine: 0,
        endLine: 2147483647,
      });
    });

    expect(textarea?.value).toBe('alpha\nbeta\n');
  });

  it('restores last rendered text immediately when switching back to a visited tab', async () => {
    const firstTab = createTab({
      id: 'tab-switch-restore-first',
      lineCount: 4,
    });
    const secondTab = createTab({
      id: 'tab-switch-restore-second',
      lineCount: 4,
      name: 'second.ts',
      path: 'C:\\repo\\second.ts',
    });
    const firstTabSecondLoadDeferred = createDeferred<string>();
    let firstTabLoadCount = 0;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        const id = String(payload?.id ?? '');
        if (id === firstTab.id) {
          firstTabLoadCount += 1;
          if (firstTabLoadCount >= 2) {
            return firstTabSecondLoadDeferred.promise;
          }

          return 'first-tab-line\n';
        }
        if (id === secondTab.id) {
          return 'second-tab-line\n';
        }

        return 'fallback\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        const id = String(payload?.id ?? '');
        const linePrefix = id === firstTab.id ? 'first' : 'second';
        return Array.from({ length: count }, (_, index) => [
          {
            text: `${linePrefix}-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return ['chunk-line'];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={firstTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'first-tab-line\n');

    rerender(<Editor tab={secondTab} />);
    await waitForEditorText(textarea, 'second-tab-line\n');

    rerender(<Editor tab={firstTab} />);
    await waitFor(() => {
      expect(textarea.value).toBe('first-tab-line\n');
    });

    await act(async () => {
      firstTabSecondLoadDeferred.resolve('first-tab-line\n');
      await Promise.resolve();
    });
  });

  it('restores visited normal-tab snapshot immediately when switching back from huge mode', async () => {
    const normalTab = createTab({
      id: 'tab-switch-huge-to-normal-restore',
      lineCount: 6,
    });
    const hugeTab = createTab({
      id: 'tab-switch-huge-to-normal-huge',
      lineCount: 22000,
      name: 'huge-file.ts',
      path: 'C:\\repo\\huge-file.ts',
    });
    const normalSecondLoadDeferred = createDeferred<string>();
    let normalLoadCount = 0;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        const id = String(payload?.id ?? '');
        if (id === normalTab.id) {
          normalLoadCount += 1;
          if (normalLoadCount >= 2) {
            return normalSecondLoadDeferred.promise;
          }
          return 'normal-tab-line\n';
        }

        return 'fallback\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        if (id === hugeTab.id) {
          return ['huge-line-1', 'huge-line-2'];
        }
        return ['normal-tab-line'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={normalTab} />);
    let textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'normal-tab-line\n');

    rerender(<Editor tab={hugeTab} />);
    textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'huge-line-1\nhuge-line-2');

    rerender(<Editor tab={normalTab} />);
    textarea = await waitForEditorTextarea(container);
    await waitFor(() => {
      expect(textarea.value).toBe('normal-tab-line\n');
    });

    await act(async () => {
      normalSecondLoadDeferred.resolve('normal-tab-line\n');
      await Promise.resolve();
    });
  });

  it('uses plain-line fetching path when largeFileMode is enabled', async () => {
    const tab = createTab({
      id: 'tab-large-file-mode',
      lineCount: 5000,
      largeFileMode: true,
    });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_visible_lines_chunk',
        expect.objectContaining({
          id: tab.id,
        })
      );
    });

    expect(
      invokeMock.mock.calls.some(
        ([command, payload]) =>
          command === 'get_syntax_token_lines' &&
          typeof payload === 'object' &&
          payload !== null &&
          'id' in payload &&
          (payload as { id?: string }).id === tab.id
      )
    ).toBe(false);
  });

  it('ignores stale plain-line chunk response when a newer request completes first', async () => {
    const tab = createTab({
      id: 'tab-large-file-stale-guard',
      lineCount: 5000,
      largeFileMode: true,
    });
    let chunkCallCount = 0;
    let resolveFirstChunk: ((value: string[]) => void) | null = null;
    const firstChunkPromise = new Promise<string[]>((resolve) => {
      resolveFirstChunk = resolve;
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        chunkCallCount += 1;
        if (chunkCallCount === 1) {
          return firstChunkPromise;
        }
        return ['new-plain-a', 'new-plain-b'];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 2,
            column: 1,
            length: 1,
            lineText: 'new-plain-a',
          },
        })
      );
    });

    await waitFor(() => {
      expect(container.textContent).toContain('new-plain-a');
      expect(chunkCallCount).toBeGreaterThanOrEqual(2);
    });

    await act(async () => {
      resolveFirstChunk?.(['old-plain-a', 'old-plain-b']);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('new-plain-a');
    expect(container.textContent).not.toContain('old-plain-a');
  });

  it('does not highlight current line when highlightCurrentLine setting is disabled', async () => {
    useStore.getState().updateSettings({
      highlightCurrentLine: false,
    });
    const tab = createTab({ id: 'tab-no-current-line-highlight', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      const highlighted = Array.from(container.querySelectorAll('.editor-line')).some((line) =>
        line.className.includes('bg-violet-300/35')
      );
      expect(highlighted).toBe(false);
    });
  });

  it('clips current line highlight to content box so left text padding stays unhighlighted', async () => {
    useStore.getState().updateSettings({
      highlightCurrentLine: true,
    });
    const tab = createTab({ id: 'tab-current-line-highlight-content-box', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      const highlightedLine = Array.from(container.querySelectorAll<HTMLElement>('.editor-line')).find((line) =>
        line.className.includes('bg-violet-300/35')
      );
      expect(highlightedLine).toBeTruthy();
      expect(highlightedLine?.style.backgroundClip).toBe('content-box');
    });
  });

  it('keeps current line highlight free of long color transitions', async () => {
    useStore.getState().updateSettings({
      highlightCurrentLine: true,
    });
    const tab = createTab({ id: 'tab-current-line-highlight-no-delay-transition', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      const highlightedLine = Array.from(container.querySelectorAll<HTMLElement>('.editor-line')).find((line) =>
        line.className.includes('bg-violet-300/35')
      );
      expect(highlightedLine).toBeTruthy();
      expect(highlightedLine?.className.includes('duration-1000')).toBe(false);
    });
  });

  it('updates current line highlight on selectionchange without waiting for raf flush even during pointer-active click', async () => {
    useStore.getState().updateSettings({
      highlightCurrentLine: true,
    });
    const tab = createTab({ id: 'tab-current-line-highlight-selectionchange-immediate', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    let nextRafId = 0;
    const pendingRafCallbacks = new Map<number, FrameRequestCallback>();

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextRafId;
      pendingRafCallbacks.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn((id: number) => {
      pendingRafCallbacks.delete(id);
    }) as typeof window.cancelAnimationFrame;

    try {
      await act(async () => {
        textarea.focus();
        textarea.setSelectionRange(0, 0);
        fireEvent.pointerDown(textarea, {
          button: 0,
          clientX: 24,
          clientY: 24,
        });
        textarea.setSelectionRange(6, 6);
        document.dispatchEvent(new Event('selectionchange'));
      });

      const highlightedLine = Array.from(container.querySelectorAll<HTMLElement>('.editor-line')).find((line) =>
        line.className.includes('bg-violet-300/35')
      );
      expect(highlightedLine?.textContent).toContain('line-2');
    } finally {
      fireEvent.pointerUp(textarea, {
        button: 0,
        clientX: 24,
        clientY: 24,
      });
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('highlights only finite positive diff lines after normalization', async () => {
    const tab = createTab({
      id: 'tab-diff-highlight-normalize',
      lineCount: 12,
    });

    const { container } = render(<Editor tab={tab} diffHighlightLines={[2.9, -1, Number.NaN, 0, Number.POSITIVE_INFINITY]} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      const lineRows = Array.from(container.querySelectorAll('.editor-line'));
      expect(lineRows.length).toBeGreaterThanOrEqual(2);
      expect(lineRows[1]?.className.includes('bg-red-500/10')).toBe(true);
      expect(lineRows[0]?.className.includes('bg-red-500/10')).toBe(false);
    });
  });

  it('renders unsaved change marker in line-number gutter padding for modified lines', async () => {
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return ['alpha', 'beta'];
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [2];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const tab = createTab({ id: 'tab-line-number-unsaved-marker', lineCount: 12, isDirty: true });
    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('get_unsaved_change_line_numbers', { id: tab.id });
      const marker = screen.getByTestId('line-number-unsaved-marker-2');
      expect(marker).toBeTruthy();
      expect(marker.className).toContain('top-0');
      expect(marker.className).toContain('bottom-0');
      expect(marker.className).toContain('w-[3px]');
    });

    expect(screen.queryByTestId('line-number-unsaved-marker-1')).toBeNull();
  });

  it('skips unsaved change marker diff lookup for large files', async () => {
    const tab = createTab({
      id: 'tab-line-number-unsaved-marker-large-file',
      lineCount: 5000,
      largeFileMode: true,
      isDirty: true,
    });

    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_visible_lines_chunk',
        expect.objectContaining({
          id: tab.id,
        })
      );
    });

    expect(
      invokeMock.mock.calls.some(
        ([command, payload]) =>
          command === 'get_unsaved_change_line_numbers'
          && typeof payload === 'object'
          && payload !== null
          && (payload as { id?: string }).id === tab.id
      )
    ).toBe(false);
    expect(screen.queryByTestId('line-number-unsaved-marker-1')).toBeNull();
  });

  it('renders wrapped line layout when wordWrap is enabled', async () => {
    useStore.getState().updateSettings({
      wordWrap: true,
    });
    const tab = createTab({
      id: 'tab-word-wrap-layout',
      lineCount: 12,
    });

    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      expect(container.querySelector('.editor-line .min-w-0.flex-1')).toBeTruthy();
    });
  });

  it('handles non-array plain-line chunk result without crashing', async () => {
    const tab = createTab({
      id: 'tab-large-file-chunk-non-array',
      lineCount: 5000,
      largeFileMode: true,
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        return 'not-an-array' as unknown as string[];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_visible_lines_chunk',
        expect.objectContaining({ id: tab.id })
      );
    });
  });

  it('logs error when plain-line chunk fetch throws', async () => {
    const tab = createTab({
      id: 'tab-large-file-chunk-throw',
      lineCount: 5000,
      largeFileMode: true,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        throw new Error('chunk-fetch-failed');
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      return undefined;
    });

    try {
      const { container } = render(<Editor tab={tab} />);
      const textarea = await waitForEditorTextarea(container);
      await waitForEditorText(textarea);

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith('Fetch visible lines error:', expect.any(Error));
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs error when syntax-token fetch throws', async () => {
    const tab = createTab({ id: 'tab-token-fetch-throw', lineCount: 12 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        throw new Error('token-fetch-failed');
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      return undefined;
    });

    try {
      const { container } = render(<Editor tab={tab} />);
      const textarea = await waitForEditorTextarea(container);
      await waitForEditorText(textarea);

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith('Fetch error:', expect.any(Error));
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('ignores non-array syntax-token fetch result without updating token cache', async () => {
    const tab = createTab({ id: 'tab-token-fetch-non-array', lineCount: 12 });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        return { invalid: true } as unknown as Array<Array<{ text: string; type: string }>>;
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_syntax_token_lines',
        expect.objectContaining({
          id: tab.id,
        })
      );
    });
  });

  it('renders plain-line fallback while syntax tokens are still loading after fast navigation', async () => {
    const tab = createTab({ id: 'tab-token-fallback-on-fast-navigate', lineCount: 400 });
    const lines = Array.from({ length: 400 }, (_, index) => `line-${index + 1}`);
    const fullText = `${lines.join('\n')}\n`;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return fullText;
      }
      if (command === 'get_visible_lines_chunk') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);
        return lines.slice(safeStart, safeEnd);
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        if (startLine >= 120) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 120);
          });
          return Array.from({ length: count }, (_, index) => [
            {
              text: `token-line-${startLine + index + 1}`,
              type: 'plain',
            },
          ]);
        }
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 400;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 400,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, fullText);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 220,
            column: 1,
            length: 0,
            lineText: 'line-220',
          },
        })
      );
    });

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, callPayload]) =>
            command === 'get_visible_lines_chunk'
            && Number((callPayload as { startLine?: number } | undefined)?.startLine ?? 0) >= 120
        )
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText('line-220')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText('token-line-220')).toBeTruthy();
    });
  });

  it('handles non-array huge editable chunk result without crashing', async () => {
    const tab = createTab({ id: 'tab-huge-chunk-non-array', lineCount: 22000 });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        return 'not-an-array' as unknown as string[];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_visible_lines_chunk',
        expect.objectContaining({
          id: tab.id,
        })
      );
    });
  });

  it('logs error when huge editable chunk fetch throws', async () => {
    const tab = createTab({ id: 'tab-huge-chunk-throw', lineCount: 22000 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        throw new Error('huge-chunk-fetch-failed');
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    try {
      const { container } = render(<Editor tab={tab} />);
      await waitForEditorTextarea(container);

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith('Fetch editable segment error:', expect.any(Error));
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('ignores stale huge editable chunk response when newer request already won', async () => {
    const tab = createTab({ id: 'tab-huge-chunk-stale-guard', lineCount: 22000 });
    let chunkCallCount = 0;
    let resolveFirstChunk: ((value: string[]) => void) | null = null;
    const firstChunkPromise = new Promise<string[]>((resolve) => {
      resolveFirstChunk = resolve;
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        chunkCallCount += 1;
        if (chunkCallCount === 1) {
          return firstChunkPromise;
        }
        return ['new-huge-a', 'new-huge-b'];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 200,
            column: 1,
            length: 1,
            lineText: 'new-huge-a',
          },
        })
      );
    });

    await waitFor(() => {
      expect(textarea.value).toContain('new-huge-a');
      expect(chunkCallCount).toBeGreaterThanOrEqual(2);
    });

    await act(async () => {
      resolveFirstChunk?.(['old-huge-a', 'old-huge-b']);
      await Promise.resolve();
    });

    expect(textarea.value).toContain('new-huge-a');
    expect(textarea.value).not.toContain('old-huge-a');
  });

  it('defers huge visible-token sync while composition lock is active, then resumes after unlock', async () => {
    const tab = createTab({ id: 'tab-huge-window-lock-sync', lineCount: 22000 });
    let chunkCallCount = 0;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        chunkCallCount += 1;
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => `huge-line-${startLine + index + 1}`);
      }
      if (command === 'replace_line_range') {
        return tab.lineCount;
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: tab.lineCount,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    await waitFor(() => {
      expect(chunkCallCount).toBeGreaterThan(0);
    });

    fireEvent.compositionStart(textarea);

    const beforeLockedRefresh = chunkCallCount;
    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            lineCount: tab.lineCount,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(() => {
      expect(chunkCallCount).toBeGreaterThan(beforeLockedRefresh);
    });

    expect(chunkCallCount - beforeLockedRefresh).toBe(1);

    fireEvent.compositionEnd(textarea);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    const beforeUnlockedRefresh = chunkCallCount;
    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            lineCount: tab.lineCount,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(
      () => {
        expect(chunkCallCount).toBeGreaterThanOrEqual(beforeUnlockedRefresh + 2);
      },
      { timeout: 1500 }
    );
  });

  it('resets huge editable textarea internal scroll offsets after force refresh sync', async () => {
    const tab = createTab({ id: 'tab-huge-scroll-reset', lineCount: 22000 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'alpha\nbeta');

    textarea.scrollTop = 24;
    textarea.scrollLeft = 18;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            lineCount: tab.lineCount,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(() => {
      expect(textarea.scrollTop).toBe(0);
      expect(textarea.scrollLeft).toBe(0);
    });
  });

  it('shows disabled copy/cut/delete in context menu when there is no selection', async () => {
    const tab = createTab({ id: 'tab-context-disabled' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = container.querySelector('textarea.editor-input-layer');
    expect(textarea).toBeTruthy();

    fireEvent.contextMenu(textarea as HTMLTextAreaElement, {
      clientX: 100,
      clientY: 100,
    });

    expect(await screen.findByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cut' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Paste' })).toBeEnabled();
  });

  it('adds bookmark from context menu action', async () => {
    const tab = createTab({ id: 'tab-context-bookmark' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = container.querySelector('textarea.editor-input-layer');
    expect(textarea).toBeTruthy();

    fireEvent.contextMenu(textarea as HTMLTextAreaElement, {
      clientX: 120,
      clientY: 120,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Bookmark' }));
    expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([1]);
  });

  it('shows remove-enabled/add-disabled when context line already bookmarked', async () => {
    const tab = createTab({ id: 'tab-context-bookmark-flags' });
    useStore.setState((state) => ({
      ...state,
      bookmarksByTab: {
        ...state.bookmarksByTab,
        [tab.id]: [1],
      },
    }));

    const { container } = render(<Editor tab={tab} />);
    const textarea = container.querySelector('textarea.editor-input-layer');
    expect(textarea).toBeTruthy();

    fireEvent.contextMenu(textarea as HTMLTextAreaElement, {
      clientX: 140,
      clientY: 140,
    });

    expect(await screen.findByRole('button', { name: 'Add Bookmark' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Bookmark' })).toBeEnabled();
  });

  it('toggles bookmark and opens bookmark sidebar on line-number double click', async () => {
    const tab = createTab({ id: 'tab-line-number-bookmark', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(container.querySelectorAll('div.cursor-pointer.select-none').length).toBeGreaterThan(0);
    });
    const lineOne = Array.from(container.querySelectorAll('div.cursor-pointer.select-none')).find(
      (element) => element.textContent === '1'
    );
    expect(lineOne).toBeTruthy();

    fireEvent.click(lineOne as Element, { detail: 2 });

    expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([1]);
    expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
  });

  it('selects the clicked line content on line-number single click', async () => {
    const tab = createTab({ id: 'tab-line-number-single-click', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await clickLineNumber(container, 2);

    await waitFor(() => {
      expect(textarea.selectionStart).toBe(6);
      expect(textarea.selectionEnd).toBe(11);
    });
  });

  it('uses preventScroll when first-click focusing from line number gutter', async () => {
    const tab = createTab({ id: 'tab-line-number-first-click-prevent-scroll', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);
    textarea.blur();
    expect(document.activeElement).not.toBe(textarea);

    const focusDescriptor = Object.getOwnPropertyDescriptor(textarea, 'focus');
    const focusMock = vi.fn();
    Object.defineProperty(textarea, 'focus', {
      configurable: true,
      value: focusMock,
    });
    try {
      await clickLineNumber(container, 1);

      expect(focusMock).toHaveBeenCalled();
      expect(focusMock).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      restoreProperty(textarea, 'focus', focusDescriptor);
    }
  });

  it('prevents default and propagation on line-number mouse down', async () => {
    const tab = createTab({ id: 'tab-line-number-mousedown', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);
    await clickLineNumber(container, 1);

    const lineOne = Array.from(container.querySelectorAll('div.cursor-pointer.select-none')).find(
      (element) => element.textContent === '1'
    );
    expect(lineOne).toBeTruthy();

    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    lineOne?.dispatchEvent(mouseDownEvent);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });

  it('shows line-number context menu with current-line select and bookmark actions', async () => {
    const tab = createTab({ id: 'tab-line-number-context-menu', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);

    await openLineNumberContextMenu(container, 1, { clientX: 180, clientY: 220 });

    expect(await screen.findByRole('button', { name: 'Select Current Line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Current Line to Bookmark' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('executes line-number context menu actions using click and double-click behaviors', async () => {
    const tab = createTab({ id: 'tab-line-number-context-actions', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await openLineNumberContextMenu(container, 2);
    fireEvent.click(await screen.findByRole('button', { name: 'Select Current Line' }));

    await waitFor(() => {
      expect(textarea.selectionStart).toBe(6);
      expect(textarea.selectionEnd).toBe(11);
    });

    await openLineNumberContextMenu(container, 2);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Current Line to Bookmark' }));

    expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([2]);
    expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
  });

  it('reserves bottom spacer in line-number list for horizontal scrollbar safety area', async () => {
    const tab = createTab({ id: 'tab-line-number-bottom-spacer', lineCount: 8 });
    const { container } = render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(container.querySelectorAll('div.cursor-pointer.select-none').length).toBe(tab.lineCount);
    });

    const spacer = await screen.findByTestId('line-number-bottom-spacer');
    expect(spacer).toBeTruthy();
    expect(spacer).toHaveStyle({ height: '14px' });
    expect(spacer).toBeEmptyDOMElement();
  });

  it('runs cleanup action from context submenu and updates dirty line count', async () => {
    const tab = createTab({ id: 'tab-cleanup-action', lineCount: 9 });
    useStore.getState().addTab(tab);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'cleanup_document') {
        if (payload?.action === 'remove_empty_lines') {
          return 5;
        }
        return 2;
      }

      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      return undefined;
    });

    const updatedEvents: Array<{ tabId: string }> = [];
    const updatedListener = (event: Event) => {
      updatedEvents.push((event as CustomEvent).detail as { tabId: string });
    };
    window.addEventListener('rutar:document-updated', updatedListener as EventListener);

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    fireEvent.contextMenu(textarea, { clientX: 180, clientY: 180 });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Empty Lines' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('cleanup_document', {
        id: tab.id,
        action: 'remove_empty_lines',
      });
    });

    const current = useStore.getState().tabs.find((item) => item.id === tab.id);
    expect(current?.lineCount).toBe(5);
    expect(current?.isDirty).toBe(true);
    expect(updatedEvents).toContainEqual({ tabId: tab.id });
    window.removeEventListener('rutar:document-updated', updatedListener as EventListener);
  });

  it('updates submenu alignment when hovering edit and convert menu groups', async () => {
    const tab = createTab({ id: 'tab-context-submenu-hover' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    fireEvent.contextMenu(textarea, { clientX: 220, clientY: 180 });

    const editLabel = await screen.findByText('Edit');
    fireEvent.mouseEnter(editLabel.closest('div') as Element);

    const convertLabel = await screen.findByText('Convert');
    fireEvent.mouseEnter(convertLabel.closest('div') as Element);

    expect(screen.getByRole('button', { name: 'Base64 Encode' })).toBeInTheDocument();
  });

  it('handles navigate-to-line event and updates cursor position', async () => {
    const tab = createTab({ id: 'tab-navigate-event', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 2,
            column: 3,
            length: 2,
            lineText: 'beta',
          },
        })
      );
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(2);
      expect(cursor?.column).toBe(3);
      expect(textarea.scrollTop).toBeGreaterThanOrEqual(0);
    });
  });

  it('handles navigate-to-outline event and moves caret to line start', async () => {
    const tab = createTab({ id: 'tab-navigate-outline-event', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-outline', {
          detail: {
            tabId: tab.id,
            line: 2,
            column: 4,
            length: 2,
            lineText: 'beta',
            source: 'outline',
          },
        })
      );
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(2);
      expect(cursor?.column).toBe(1);
      expect(textarea.selectionStart).toBe(6);
      expect(textarea.selectionEnd).toBe(6);
    });
  });

  it('clears previous outline flash timer when navigate-to-outline is fired repeatedly', async () => {
    const tab = createTab({ id: 'tab-navigate-outline-repeat', lineCount: 12 });
    render(<Editor tab={tab} />);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    try {
      act(() => {
        window.dispatchEvent(
          new CustomEvent('rutar:navigate-to-outline', {
            detail: {
              tabId: tab.id,
              line: 2,
              column: 4,
              length: 2,
              lineText: 'beta',
              source: 'outline',
            },
          })
        );
      });

      act(() => {
        window.dispatchEvent(
          new CustomEvent('rutar:navigate-to-outline', {
            detail: {
              tabId: tab.id,
              line: 3,
              column: 2,
              length: 1,
              lineText: 'gamma',
              source: 'outline',
            },
          })
        );
      });

      await waitFor(() => {
        const cursor = useStore.getState().cursorPositionByTab[tab.id];
        expect(cursor?.line).toBe(3);
        expect(cursor?.column).toBe(1);
        expect(clearTimeoutSpy).toHaveBeenCalled();
      });
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it('clears outline flash timer when active tab changes', async () => {
    const firstTab = createTab({ id: 'tab-outline-switch-a', lineCount: 12 });
    const secondTab = createTab({ id: 'tab-outline-switch-b', lineCount: 12 });
    const { rerender } = render(<Editor tab={firstTab} />);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    try {
      act(() => {
        window.dispatchEvent(
          new CustomEvent('rutar:navigate-to-outline', {
            detail: {
              tabId: firstTab.id,
              line: 2,
              column: 2,
              length: 1,
              lineText: 'beta',
              source: 'outline',
            },
          })
        );
      });

      rerender(<Editor tab={secondTab} />);

      await waitFor(() => {
        const cursor = useStore.getState().cursorPositionByTab[secondTab.id];
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(cursor?.line).toBe(1);
        expect(cursor?.column).toBe(1);
      });
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it('keeps saved cursor position when switching to another tab', async () => {
    const firstTab = createTab({ id: 'tab-switch-cursor-keep-a', lineCount: 12 });
    const secondTab = createTab({ id: 'tab-switch-cursor-keep-b', lineCount: 12 });
    useStore.getState().setCursorPosition(secondTab.id, 4, 3);

    const { container, rerender } = render(<Editor tab={firstTab} />);
    await waitForEditorTextarea(container);

    rerender(<Editor tab={secondTab} />);

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[secondTab.id];
      expect(cursor?.line).toBe(4);
      expect(cursor?.column).toBe(3);
    });
  });

  it('restores textarea caret to saved tab cursor after switching tabs', async () => {
    const firstTab = createTab({ id: 'tab-switch-caret-restore-a', lineCount: 12 });
    const secondTab = createTab({ id: 'tab-switch-caret-restore-b', lineCount: 12 });
    useStore.getState().setCursorPosition(secondTab.id, 2, 3);

    const { container, rerender } = render(<Editor tab={firstTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    rerender(<Editor tab={secondTab} />);
    await waitForEditorText(textarea);

    await waitFor(() => {
      // "alpha\nbeta\n": line 2, column 3 maps to code-unit offset 8.
      expect(textarea.selectionStart).toBe(8);
      expect(textarea.selectionEnd).toBe(8);
    });
  });

  it('keeps scroll position isolated per tab when switching', async () => {
    const firstTab = createTab({ id: 'tab-switch-scroll-a', lineCount: 12 });
    const secondTab = createTab({
      id: 'tab-switch-scroll-b',
      lineCount: 12,
      name: 'second-scroll.ts',
      path: 'C:\\repo\\second-scroll.ts',
    });

    const { container, rerender } = render(<Editor tab={firstTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      textarea.scrollTop = 80;
    });
    expect(textarea.scrollTop).toBe(80);

    rerender(<Editor tab={secondTab} />);
    await waitForEditorText(textarea);

    act(() => {
      textarea.scrollTop = 12;
    });
    expect(textarea.scrollTop).toBe(12);

    rerender(<Editor tab={firstTab} />);
    await waitForEditorText(textarea);

    await waitFor(() => {
      expect(textarea.scrollTop).toBe(80);
      expect(textarea.scrollTop).not.toBe(12);
    });
  });

  it('does not reload document on selectionchange in the same tab', async () => {
    const tab = createTab({ id: 'tab-click-after-scroll-no-top-reset', lineCount: 400 });
    const longLines = Array.from({ length: 400 }, (_, index) => `line-${index + 1}`);
    const longText = `${longLines.join('\n')}\n`;

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return longText;
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        return longLines.slice(startLine, endLine);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 400;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 400,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, longText);

    const lineThirtyOffset = longText.indexOf('line-30');
    expect(lineThirtyOffset).toBeGreaterThanOrEqual(0);
    const beforeSelectionGetVisibleLinesCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines'
        && typeof payload === 'object'
        && payload !== null
        && 'id' in payload
        && (payload as { id?: string }).id === tab.id
    ).length;

    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(lineThirtyOffset, lineThirtyOffset);
      document.dispatchEvent(new Event('selectionchange'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(30);
    });
    const afterSelectionGetVisibleLinesCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines'
        && typeof payload === 'object'
        && payload !== null
        && 'id' in payload
        && (payload as { id?: string }).id === tab.id
    ).length;
    expect(afterSelectionGetVisibleLinesCalls).toBe(beforeSelectionGetVisibleLinesCalls);
  });

  it('restores huge-tab viewport and cursor anchor from saved cursor when no snapshot exists yet', async () => {
    const firstTab = createTab({ id: 'tab-before-huge-restore', lineCount: 12 });
    const hugeTab = createTab({
      id: 'tab-huge-restore-no-snapshot',
      lineCount: 22000,
      name: 'huge-restore.ts',
      path: 'C:\\repo\\huge-restore.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    useStore.getState().setCursorPosition(hugeTab.id, 200, 2);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);
        return hugeLines.slice(safeStart, safeEnd);
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={firstTab} />);
    await waitForEditorTextarea(container);

    rerender(<Editor tab={hugeTab} />);

    await waitFor(() => {
      const scrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;
      expect(scrollContainer).toBeTruthy();
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(200);
      expect(cursor?.column).toBe(2);
    });
  });

  it('loads huge-tab bootstrap segment around saved cursor instead of always from top', async () => {
    const normalTab = createTab({
      id: 'tab-normal-before-huge-bootstrap-anchor',
      lineCount: 12,
      name: 'normal-bootstrap-anchor.ts',
      path: 'C:\\repo\\normal-bootstrap-anchor.ts',
    });
    const hugeTab = createTab({
      id: 'tab-huge-bootstrap-anchor',
      lineCount: 22000,
      name: 'huge-bootstrap-anchor.ts',
      path: 'C:\\repo\\huge-bootstrap-anchor.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    useStore.getState().setCursorPosition(hugeTab.id, 320, 1);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);

        if (id === hugeTab.id) {
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={normalTab} />);
    await waitForEditorTextarea(container);

    const beforeHugeCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines_chunk'
        && typeof payload === 'object'
        && payload !== null
        && (payload as { id?: string }).id === hugeTab.id
    ).length;

    rerender(<Editor tab={hugeTab} />);
    await waitFor(() => {
      const afterHugeCalls = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === 'get_visible_lines_chunk'
          && typeof payload === 'object'
          && payload !== null
          && (payload as { id?: string }).id === hugeTab.id
      );
      expect(afterHugeCalls.length).toBeGreaterThan(beforeHugeCalls);
    });

    const hugeCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines_chunk'
        && typeof payload === 'object'
        && payload !== null
        && (payload as { id?: string }).id === hugeTab.id
    );
    const firstNewHugeCall = hugeCalls[beforeHugeCalls]?.[1] as { startLine?: number } | undefined;
    expect(firstNewHugeCall).toBeTruthy();
    expect(Number(firstNewHugeCall?.startLine ?? 0)).toBeGreaterThan(0);
  });

  it('keeps huge-tab cursor state when switching through a normal tab', async () => {
    const hugeTab = createTab({
      id: 'tab-huge-switch-preserve-scroll',
      lineCount: 22000,
      name: 'huge-switch.ts',
      path: 'C:\\repo\\huge-switch.ts',
    });
    const normalTab = createTab({
      id: 'tab-normal-between-huge-switch',
      lineCount: 12,
      name: 'normal-between.ts',
      path: 'C:\\repo\\normal-between.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    useStore.getState().setCursorPosition(hugeTab.id, 320, 1);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        if (id === hugeTab.id) {
          const startLine = Number(payload?.startLine ?? 0);
          const endLine = Number(payload?.endLine ?? startLine + 1);
          const safeStart = Math.max(0, startLine);
          const safeEnd = Math.max(safeStart + 1, endLine);
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={normalTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    rerender(<Editor tab={hugeTab} />);
    await waitFor(() => {
      const scrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;
      expect(scrollContainer).toBeTruthy();
    });

    rerender(<Editor tab={normalTab} />);
    await waitForEditorText(textarea);

    rerender(<Editor tab={hugeTab} />);

    await waitFor(() => {
      const restoredScrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;
      expect(restoredScrollContainer).toBeTruthy();
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(1);
      expect(cursor?.line).not.toBe(1);
    });
  });

  it('does not overwrite saved huge-tab cursor during bootstrap selectionchange on tab switch', async () => {
    const normalTab = createTab({
      id: 'tab-normal-before-huge-bootstrap-selectionchange',
      lineCount: 12,
      name: 'normal-bootstrap.ts',
      path: 'C:\\repo\\normal-bootstrap.ts',
    });
    const hugeTab = createTab({
      id: 'tab-huge-bootstrap-selectionchange',
      lineCount: 22000,
      name: 'huge-bootstrap.ts',
      path: 'C:\\repo\\huge-bootstrap.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    const deferredHugeChunk = createDeferred<string[]>();
    let deferredChunkUsed = false;

    useStore.getState().setCursorPosition(hugeTab.id, 320, 2);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);

        if (id === hugeTab.id && !deferredChunkUsed) {
          deferredChunkUsed = true;
          return deferredHugeChunk.promise;
        }
        if (id === hugeTab.id) {
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={normalTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    rerender(<Editor tab={hugeTab} />);

    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      document.dispatchEvent(new Event('selectionchange'));
      await Promise.resolve();
    });

    expect(useStore.getState().cursorPositionByTab[hugeTab.id]?.line).toBe(320);
    expect(useStore.getState().cursorPositionByTab[hugeTab.id]?.column).toBe(2);

    await act(async () => {
      deferredHugeChunk.resolve(hugeLines.slice(0, 600));
      await Promise.resolve();
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(2);
    });
  });

  it('prefers saved huge cursor anchor when restored snapshot scroll is zero', async () => {
    const normalTab = createTab({
      id: 'tab-normal-before-huge-snapshot-zero',
      lineCount: 12,
      name: 'normal-snapshot-zero.ts',
      path: 'C:\\repo\\normal-snapshot-zero.ts',
    });
    const hugeTab = createTab({
      id: 'tab-huge-snapshot-zero',
      lineCount: 22000,
      name: 'huge-snapshot-zero.ts',
      path: 'C:\\repo\\huge-snapshot-zero.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    useStore.getState().setCursorPosition(hugeTab.id, 320, 1);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);

        if (id === hugeTab.id) {
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={normalTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    rerender(<Editor tab={hugeTab} />);
    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(1);
    });

    const firstHugeScrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;
    act(() => {
      firstHugeScrollContainer.scrollTop = 0;
    });
    fireEvent.scroll(firstHugeScrollContainer);

    rerender(<Editor tab={normalTab} />);
    await waitForEditorText(textarea);

    rerender(<Editor tab={hugeTab} />);
    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(1);
      expect(cursor?.line).not.toBe(1);
    });
  });

  it('ignores selectionchange from outside editor focus so huge-tab saved cursor is not clobbered', async () => {
    const normalTab = createTab({
      id: 'tab-normal-before-huge-outside-selectionchange',
      lineCount: 12,
      name: 'normal-outside-selectionchange.ts',
      path: 'C:\\repo\\normal-outside-selectionchange.ts',
    });
    const hugeTab = createTab({
      id: 'tab-huge-outside-selectionchange',
      lineCount: 22000,
      name: 'huge-outside-selectionchange.ts',
      path: 'C:\\repo\\huge-outside-selectionchange.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);
    useStore.getState().setCursorPosition(hugeTab.id, 320, 1);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);

        if (id === hugeTab.id) {
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const externalInput = document.createElement('input');
    document.body.appendChild(externalInput);

    try {
      const { container, rerender } = render(<Editor tab={normalTab} />);
      const textarea = await waitForEditorTextarea(container);
      await waitForEditorText(textarea);

      rerender(<Editor tab={hugeTab} />);

      await waitFor(() => {
        const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
        expect(cursor?.line).toBe(320);
        expect(cursor?.column).toBe(1);
      });

      await act(async () => {
        externalInput.focus();
        textarea.setSelectionRange(0, 0);
        document.dispatchEvent(new Event('selectionchange'));
        await Promise.resolve();
      });

      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(1);
    } finally {
      externalInput.remove();
    }
  });

  it('prefers saved huge cursor anchor when snapshot segment does not contain saved cursor line', async () => {
    const normalTab = createTab({
      id: 'tab-normal-before-huge-snapshot-miss',
      lineCount: 12,
      name: 'normal-snapshot-miss.ts',
      path: 'C:\\repo\\normal-snapshot-miss.ts',
    });
    const hugeTab = createTab({
      id: 'tab-huge-snapshot-miss',
      lineCount: 22000,
      name: 'huge-snapshot-miss.ts',
      path: 'C:\\repo\\huge-snapshot-miss.ts',
    });
    const hugeLines = Array.from({ length: 22000 }, (_, index) => `line-${index + 1}`);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_visible_lines_chunk') {
        const id = String(payload?.id ?? '');
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const safeStart = Math.max(0, startLine);
        const safeEnd = Math.max(safeStart + 1, endLine);

        if (id === hugeTab.id) {
          return hugeLines.slice(safeStart, safeEnd);
        }

        return ['alpha', 'beta'];
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 22000;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 22000,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }

      return undefined;
    });

    const { container, rerender } = render(<Editor tab={hugeTab} />);
    const hugeTextarea = await waitForEditorTextarea(container);
    await waitFor(() => {
      expect(container.querySelector('.editor-scroll-stable')).toBeTruthy();
      expect(hugeTextarea.value.length).toBeGreaterThan(0);
    });

    rerender(<Editor tab={normalTab} />);
    const normalTextarea = await waitForEditorTextarea(container);
    await waitForEditorText(normalTextarea);

    useStore.getState().setCursorPosition(hugeTab.id, 320, 1);

    rerender(<Editor tab={hugeTab} />);
    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[hugeTab.id];
      expect(cursor?.line).toBe(320);
      expect(cursor?.column).toBe(1);
      expect(cursor?.line).not.toBe(1);
    });
  });

  it('handles navigate-to-line event in huge-editable mode and updates scroll container', async () => {
    const tab = createTab({ id: 'tab-navigate-huge-mode', lineCount: 22000 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'alpha\nbeta');

    await waitFor(() => {
      expect(container.querySelector('.editor-scroll-stable')).toBeTruthy();
    });
    const scrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;
    const initialChunkCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines_chunk' &&
        typeof payload === 'object' &&
        payload !== null &&
        'id' in payload &&
        (payload as { id?: string }).id === tab.id
    ).length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 200,
            column: 2,
            length: 3,
            lineText: 'beta',
          },
        })
      );
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      const chunkCalls = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === 'get_visible_lines_chunk' &&
          typeof payload === 'object' &&
          payload !== null &&
          'id' in payload &&
          (payload as { id?: string }).id === tab.id
      ).length;
      expect(cursor?.line).toBe(200);
      expect(cursor?.column).toBe(2);
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
      expect(chunkCalls).toBeGreaterThan(initialChunkCalls);
    });
  });

  it('re-aligns huge-mode scroll after temporary overwrite during navigate-to-line', async () => {
    const tab = createTab({ id: 'tab-navigate-huge-mode-realign', lineCount: 22000 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'alpha\nbeta');

    await waitFor(() => {
      expect(container.querySelector('.editor-scroll-stable')).toBeTruthy();
    });
    const scrollContainer = container.querySelector('.editor-scroll-stable') as HTMLDivElement;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 600,
            column: 1,
            length: 0,
            lineText: 'alpha',
            source: 'shortcut',
          },
        })
      );

      // Simulate scroll state being overwritten by asynchronous sync pipeline.
      scrollContainer.scrollTop = 0;
    });

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    });
  });

  it('ignores navigate-to-line event when detail is missing or tab id mismatches', async () => {
    const tab = createTab({ id: 'tab-navigate-ignore', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(new CustomEvent('rutar:navigate-to-line'));
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: 'another-tab',
            line: 5,
            column: 3,
          },
        })
      );
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(1);
      expect(cursor?.column).toBe(1);
      expect(container.querySelectorAll('mark[class*=\"bg-yellow\"]').length).toBe(0);
    });
  });

  it('normalizes invalid navigate-to-line payload values to safe defaults', async () => {
    const tab = createTab({ id: 'tab-navigate-normalize-invalid', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: Number.NaN,
            column: -4,
            length: Number.NaN,
            lineText: 1234,
            occludedRightPx: Number.NaN,
          },
        })
      );
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(1);
      expect(cursor?.column).toBe(1);
    });
  });

  it('handles external paste-text event for active tab', async () => {
    const tab = createTab({ id: 'tab-external-paste' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(0, 5);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:paste-text', {
          detail: {
            tabId: tab.id,
            text: 'ZZ',
          },
        })
      );
    });

    await waitFor(() => {
      expect(textarea.value).toBe('ZZ\nbeta\n');
    });
  });

  it('ignores external paste-text event when tab id mismatches', async () => {
    const tab = createTab({ id: 'tab-external-paste-ignore' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(0, 5);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:paste-text', {
          detail: {
            tabId: 'other-tab',
            text: 'ZZ',
          },
        })
      );
    });

    await waitFor(() => {
      expect(textarea.value).toBe('alpha\nbeta\n');
    });
  });

  it('treats non-string external paste-text as empty text', async () => {
    const tab = createTab({ id: 'tab-external-paste-non-string' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(0, 5);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:paste-text', {
          detail: {
            tabId: tab.id,
            text: 123,
          },
        })
      );
    });

    await waitFor(() => {
      expect(textarea.value).toBe('\nbeta\n');
    });
  });

  it('ignores external paste-text event when detail payload is missing', async () => {
    const tab = createTab({ id: 'tab-external-paste-missing-detail' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(new CustomEvent('rutar:paste-text'));
    });

    await waitFor(() => {
      expect(textarea.value).toBe('alpha\nbeta\n');
    });
  });

  it('logs warning when external paste handler runs after unmount and editor input is unavailable', async () => {
    const tab = createTab({ id: 'tab-external-paste-after-unmount' });
    const originalAddEventListener = window.addEventListener.bind(window);
    let pasteListener: EventListener | null = null;
    const addEventListenerSpy = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'rutar:paste-text') {
          pasteListener = listener as EventListener;
        }
        originalAddEventListener(type, listener, options);
      }) as typeof window.addEventListener);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const view = render(<Editor tab={tab} />);
      const textarea = await waitForEditorTextarea(view.container);
      await waitForEditorText(textarea);

      expect(pasteListener).toBeTruthy();
      view.unmount();

      act(() => {
        pasteListener?.(
          new CustomEvent('rutar:paste-text', {
            detail: {
              tabId: tab.id,
              text: 'ZZ',
            },
          })
        );
      });

      expect(warnSpy).toHaveBeenCalledWith('Failed to paste text into editor.');
    } finally {
      warnSpy.mockRestore();
      addEventListenerSpy.mockRestore();
    }
  });

  it('cleans drag cursor styles on unmount after text drag starts', async () => {
    const tab = createTab({ id: 'tab-text-drag-cleanup' });
    const { container, unmount } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, textarea.value.length);

    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');
    const elementRemoveSpy = vi.spyOn(textarea.style, 'removeProperty');

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 7,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, {
        pointerId: 7,
        clientX: 40,
        clientY: 40,
      });

      await waitFor(() => {
        expect(document.body.style.cursor).toBe('copy');
        expect(textarea.style.cursor).toBe('copy');
      });

      unmount();

      expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
    } finally {
      bodyRemoveSpy.mockRestore();
      elementRemoveSpy.mockRestore();
    }
  });

  it('runs unmount drag-cursor cleanup branch when blur listener is not registered', async () => {
    const tab = createTab({ id: 'tab-text-drag-unmount-final-cleanup' });
    const originalAddEventListener = window.addEventListener.bind(window);
    const addEventListenerSpy = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'blur') {
          return;
        }
        originalAddEventListener(type, listener, options);
      }) as typeof window.addEventListener);

    const { container, unmount } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, textarea.value.length);
    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');
    const elementRemoveSpy = vi.spyOn(textarea.style, 'removeProperty');

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 107,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, {
        pointerId: 107,
        clientX: 42,
        clientY: 42,
      });

      await waitFor(() => {
        expect(document.body.style.cursor).toBe('copy');
        expect(textarea.style.cursor).toBe('copy');
      });

      unmount();

      expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
    } finally {
      bodyRemoveSpy.mockRestore();
      elementRemoveSpy.mockRestore();
      addEventListenerSpy.mockRestore();
    }
  });

  it('cleans drag cursor styles when active tab changes', async () => {
    const firstTab = createTab({ id: 'tab-drag-cleanup-switch-a' });
    const secondTab = createTab({ id: 'tab-drag-cleanup-switch-b' });
    const { container, rerender } = render(<Editor tab={firstTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, textarea.value.length);
    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 9,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, {
        pointerId: 9,
        clientX: 40,
        clientY: 40,
      });

      await waitFor(() => {
        expect(document.body.style.cursor).toBe('copy');
      });

      rerender(<Editor tab={secondTab} />);

      await waitFor(() => {
        expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
      });
    } finally {
      bodyRemoveSpy.mockRestore();
    }
  });

  it('cleans textarea drag cursor styles on immediate tab switch', async () => {
    const firstTab = createTab({ id: 'tab-drag-cleanup-switch-immediate-a' });
    const secondTab = createTab({ id: 'tab-drag-cleanup-switch-immediate-b' });
    const { container, rerender } = render(<Editor tab={firstTab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, textarea.value.length);
    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');
    const elementRemoveSpy = vi.spyOn(textarea.style, 'removeProperty');

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 10,
        clientX: 12,
        clientY: 12,
      });
      fireEvent.pointerMove(window, {
        pointerId: 10,
        clientX: 44,
        clientY: 44,
      });

      expect(document.body.style.cursor).toBe('copy');
      expect(textarea.style.cursor).toBe('copy');

      rerender(<Editor tab={secondTab} />);

      await waitFor(() => {
        expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
        expect(elementRemoveSpy).toHaveBeenCalledWith('cursor');
      });
    } finally {
      bodyRemoveSpy.mockRestore();
      elementRemoveSpy.mockRestore();
    }
  });

  it('cleans textarea drag cursor styles on immediate unmount', async () => {
    const tab = createTab({ id: 'tab-text-drag-unmount-immediate-cleanup' });
    const { container, unmount } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, textarea.value.length);
    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');
    const elementRemoveSpy = vi.spyOn(textarea.style, 'removeProperty');

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 110,
        clientX: 12,
        clientY: 12,
      });
      fireEvent.pointerMove(window, {
        pointerId: 110,
        clientX: 44,
        clientY: 44,
      });

      expect(document.body.style.cursor).toBe('copy');
      expect(textarea.style.cursor).toBe('copy');

      unmount();

      expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
    } finally {
      bodyRemoveSpy.mockRestore();
      elementRemoveSpy.mockRestore();
    }
  });

  it('applies text drag move on pointerup and clears drag cursor styles', async () => {
    const tab = createTab({ id: 'tab-text-drag-apply-on-pointerup' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, 5);
    const bodyRemoveSpy = vi.spyOn(document.body.style, 'removeProperty');
    const elementRemoveSpy = vi.spyOn(textarea.style, 'removeProperty');
    const originalText = textarea.value;

    try {
      fireEvent.pointerDown(textarea, {
        button: 0,
        pointerId: 133,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, {
        pointerId: 133,
        clientX: 40,
        clientY: 80,
      });

      await waitFor(() => {
        expect(document.body.style.cursor).toBe('copy');
        expect(textarea.style.cursor).toBe('copy');
      });

      fireEvent.pointerUp(window, {
        pointerId: 133,
      });

      await waitFor(() => {
        expect(bodyRemoveSpy).toHaveBeenCalledWith('cursor');
        expect(elementRemoveSpy).toHaveBeenCalledWith('cursor');
        expect(document.body.style.cursor).toBe('');
      });

      expect(textarea.value).not.toBe(originalText);
    } finally {
      bodyRemoveSpy.mockRestore();
      elementRemoveSpy.mockRestore();
    }
  });

  it('keeps text unchanged when text drag drop target stays inside original selection', async () => {
    const tab = createTab({ id: 'tab-text-drag-drop-inside-selection' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.setSelectionRange(0, 5);
    const originalText = textarea.value;

    fireEvent.pointerDown(textarea, {
      button: 0,
      pointerId: 134,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 134,
      clientX: 40,
      clientY: 10,
    });

    await waitFor(() => {
      expect(document.body.style.cursor).toBe('copy');
    });

    fireEvent.pointerUp(window, {
      pointerId: 134,
    });

    await waitFor(() => {
      expect(document.body.style.cursor).toBe('');
      expect(textarea.style.cursor).toBe('');
    });
    expect(textarea.value).toBe(originalText);
  });

  it('keeps editor user-select styles unchanged when pointerup occurs without scrollbar drag', async () => {
    const tab = createTab({ id: 'tab-scrollbar-guard-pointerup' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.style.userSelect = 'none';
    textarea.style.webkitUserSelect = 'none';

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(textarea.style.userSelect).toBe('none');
    expect(textarea.style.webkitUserSelect).toBe('none');
  });

  it('keeps search highlight until search-close is sent for active tab', async () => {
    const tab = createTab({ id: 'tab-search-close-event', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 2,
            column: 1,
            length: 2,
            lineText: 'beta',
          },
        })
      );
    });

    await waitFor(() => {
      expect(container.querySelectorAll('mark[class*="bg-yellow"]').length).toBeGreaterThan(0);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:search-close', {
          detail: {
            tabId: 'another-tab',
          },
        })
      );
    });

    await waitFor(() => {
      expect(container.querySelectorAll('mark[class*="bg-yellow"]').length).toBeGreaterThan(0);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:search-close', {
          detail: {
            tabId: tab.id,
          },
        })
      );
    });

    await waitFor(() => {
      expect(container.querySelectorAll('mark[class*="bg-yellow"]').length).toBe(0);
    });
  });

  it('ignores search-close event when detail is missing', async () => {
    const tab = createTab({ id: 'tab-search-close-no-detail', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: {
            tabId: tab.id,
            line: 2,
            column: 1,
            length: 2,
            lineText: 'beta',
          },
        })
      );
    });

    await waitFor(() => {
      expect(container.querySelectorAll('mark[class*="bg-yellow"]').length).toBeGreaterThan(0);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('rutar:search-close'));
    });

    await waitFor(() => {
      expect(container.querySelectorAll('mark[class*="bg-yellow"]').length).toBeGreaterThan(0);
    });
  });

  it('handles force-refresh event with preserveCaret and updates line count', async () => {
    const tab = createTab({ id: 'tab-force-refresh', lineCount: 6 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(2, 2);
    textarea.scrollTop = 84;
    textarea.scrollLeft = 16;
    const nativeSetSelectionRange = textarea.setSelectionRange.bind(textarea);
    const selectionRangeSpy = vi.spyOn(textarea, 'setSelectionRange').mockImplementation((start, end, direction) => {
      nativeSetSelectionRange(start, end, direction);
      // Simulate native caret sync pulling viewport to top so preserveScroll must restore it.
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            lineCount: 9,
            preserveCaret: true,
            preserveScroll: true,
          },
        })
      );
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      expect(currentTab?.lineCount).toBe(9);
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(2);
      expect(textarea.scrollTop).toBe(84);
      expect(textarea.scrollLeft).toBe(16);
    });
    selectionRangeSpy.mockRestore();
  });

  it('ignores force-refresh event when tab id does not match', async () => {
    const tab = createTab({ id: 'tab-force-refresh-ignore', lineCount: 6 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const initialGetVisibleLinesCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines' &&
        typeof payload === 'object' &&
        payload !== null &&
        'id' in payload &&
        (payload as { id?: string }).id === tab.id
    ).length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: 'other-tab',
            lineCount: 15,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      const getVisibleLinesCalls = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === 'get_visible_lines' &&
          typeof payload === 'object' &&
          payload !== null &&
          'id' in payload &&
          (payload as { id?: string }).id === tab.id
      ).length;
      expect(currentTab?.lineCount).toBe(6);
      expect(getVisibleLinesCalls).toBe(initialGetVisibleLinesCalls);
    });
  });

  it('handles force-refresh event without preserveCaret and updates line count', async () => {
    const tab = createTab({ id: 'tab-force-refresh-no-preserve', lineCount: 6 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(2, 2);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            lineCount: 10,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      const getVisibleLinesCalls = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === 'get_visible_lines' &&
          typeof payload === 'object' &&
          payload !== null &&
          'id' in payload &&
          (payload as { id?: string }).id === tab.id
      ).length;
      expect(currentTab?.lineCount).toBe(10);
      expect(getVisibleLinesCalls).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles force-refresh event without lineCount and keeps current line count', async () => {
    const tab = createTab({ id: 'tab-force-refresh-without-line-count', lineCount: 6 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const initialGetVisibleLinesCalls = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === 'get_visible_lines' &&
        typeof payload === 'object' &&
        payload !== null &&
        'id' in payload &&
        (payload as { id?: string }).id === tab.id
    ).length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            preserveCaret: false,
          },
        })
      );
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      const getVisibleLinesCalls = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === 'get_visible_lines' &&
          typeof payload === 'object' &&
          payload !== null &&
          'id' in payload &&
          (payload as { id?: string }).id === tab.id
      ).length;
      expect(currentTab?.lineCount).toBe(6);
      expect(getVisibleLinesCalls).toBeGreaterThan(initialGetVisibleLinesCalls);
    });
  });

  it('runs sort action from context submenu and triggers cleanup command', async () => {
    const tab = createTab({ id: 'tab-sort-action', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    fireEvent.contextMenu(textarea, { clientX: 185, clientY: 185 });
    const sortMenuLabel = await screen.findByText('Sort');
    fireEvent.mouseEnter(sortMenuLabel.closest('div') as Element);
    fireEvent.click(screen.getByText('Sort Lines Ascending'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('cleanup_document', {
        id: tab.id,
        action: 'sort_lines_ascending',
      });
    });
  });

  it('converts selected text with Base64 Encode and replaces selection', async () => {
    const tab = createTab({ id: 'tab-base64-encode' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'convert_text_base64') {
        if (payload?.action === 'base64_encode') {
          return 'ENCODED';
        }
        return '';
      }

      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      return undefined;
    });

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    fireEvent.contextMenu(textarea, { clientX: 220, clientY: 140 });
    fireEvent.click(await screen.findByRole('button', { name: 'Base64 Encode' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('convert_text_base64', {
        text: 'alpha',
        action: 'base64_encode',
      });
    });

    expect(textarea.value).toBe('ENCODED\nbeta\n');
  });

  it('shows decode error toast when Base64 Decode fails', async () => {
    const tab = createTab({ id: 'tab-base64-decode-fail' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    const toast = screen.getByRole('status');

    expect(toast.className).toContain('opacity-0');

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'convert_text_base64') {
        if (payload?.action === 'base64_decode') {
          throw new Error('decode-failed');
        }
        return '';
      }

      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      return undefined;
    });

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    fireEvent.contextMenu(textarea, { clientX: 240, clientY: 180 });
    fireEvent.click(await screen.findByRole('button', { name: 'Base64 Decode' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('convert_text_base64', {
        text: 'alpha',
        action: 'base64_decode',
      });
      expect(toast.className).toContain('opacity-100');
    });
  });

  it('copies Base64 encode result to clipboard from context submenu', async () => {
    const tab = createTab({ id: 'tab-base64-copy-result' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'convert_text_base64') {
        if (payload?.action === 'base64_encode') {
          return 'QkFTRTY0';
        }
        return '';
      }

      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      return undefined;
    });

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.contextMenu(textarea, { clientX: 260, clientY: 200 });
      fireEvent.click(await screen.findByRole('button', { name: 'Copy Base64 Encode Result' }));

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('convert_text_base64', {
          text: 'alpha',
          action: 'base64_encode',
        });
        expect(writeText).toHaveBeenCalledWith('QkFTRTY0');
      });
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('copies Base64 decode result to clipboard from context submenu', async () => {
    const tab = createTab({ id: 'tab-base64-copy-decode-result' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'convert_text_base64') {
        if (payload?.action === 'base64_decode') {
          return 'decoded-text';
        }
        return '';
      }

      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 2,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      return undefined;
    });

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.contextMenu(textarea, { clientX: 280, clientY: 210 });

      const bookmarkMenuLabel = await screen.findByText('Bookmark');
      fireEvent.mouseEnter(bookmarkMenuLabel.closest('div') as Element);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Base64 Decode Result' }));

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('convert_text_base64', {
          text: 'alpha',
          action: 'base64_decode',
        });
        expect(writeText).toHaveBeenCalledWith('decoded-text');
      });
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('toggles line comments with Ctrl+/ and updates tab metadata', async () => {
    const tab = createTab({ id: 'tab-key-toggle-comment', lineCount: 6, path: 'C:\\repo\\main.ts' });
    useStore.getState().addTab(tab);

    const updatedEvents: Array<{ tabId: string }> = [];
    const updatedListener = (event: Event) => {
      updatedEvents.push((event as CustomEvent).detail as { tabId: string });
    };
    window.addEventListener('rutar:document-updated', updatedListener as EventListener);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'toggle_line_comments') {
        return {
          changed: true,
          lineCount: 7,
          documentVersion: 2,
          selectionStartChar: 0,
          selectionEndChar: 3,
        };
      }

      if (command === 'get_visible_lines') {
        return '//alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      return undefined;
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    fireEvent.keyDown(textarea, { key: '/', ctrlKey: true });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'toggle_line_comments',
        expect.objectContaining({
          id: tab.id,
          startChar: 0,
          endChar: 5,
          isCollapsed: false,
          prefix: '//',
        })
      );
    });

    const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
    expect(currentTab?.lineCount).toBe(7);
    expect(currentTab?.isDirty).toBe(true);
    expect(updatedEvents).toContainEqual({ tabId: tab.id });
    window.removeEventListener('rutar:document-updated', updatedListener as EventListener);
  });

  it('returns early when toggle-line-comment backend reports unchanged', async () => {
    const tab = createTab({ id: 'tab-key-toggle-comment-unchanged', lineCount: 6 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);
    const updatedEvents: Array<{ tabId: string }> = [];
    const updatedListener = (event: Event) => {
      updatedEvents.push((event as CustomEvent).detail as { tabId: string });
    };
    window.addEventListener('rutar:document-updated', updatedListener as EventListener);

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    fireEvent.keyDown(textarea, { key: '/', ctrlKey: true });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'toggle_line_comments',
        expect.objectContaining({
          id: tab.id,
          isCollapsed: false,
        })
      );
    });

    expect(updatedEvents).toEqual([]);
    expect(invokeMock.mock.calls.some((call) => call[0] === 'edit_text')).toBe(false);
    expect(invokeMock.mock.calls.some((call) => call[0] === 'replace_line_range')).toBe(false);
    window.removeEventListener('rutar:document-updated', updatedListener as EventListener);
  });

  it('logs error when toggle-line-comment backend throws', async () => {
    const tab = createTab({ id: 'tab-key-toggle-comment-error' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'toggle_line_comments') {
        throw new Error('toggle-failed');
      }
      if (command === 'get_visible_lines') {
        return 'alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      return undefined;
    });

    try {
      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.keyDown(textarea, { key: '/', ctrlKey: true });

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to toggle line comments:',
          expect.any(Error)
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('requests go-to-line dialog when Ctrl+G is pressed', async () => {
    const tab = createTab({ id: 'tab-shortcut-goto-line', lineCount: 12 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);
    const requestedEvents: Array<{ tabId: string; maxLineNumber: number; initialLineNumber: number }> = [];
    const requestListener = (event: Event) => {
      requestedEvents.push((event as CustomEvent).detail as {
        tabId: string;
        maxLineNumber: number;
        initialLineNumber: number;
      });
    };
    window.addEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, requestListener as EventListener);

    try {
      textarea.focus();
      fireEvent.keyDown(textarea, { key: 'g', ctrlKey: true });

      await waitFor(() => {
        expect(requestedEvents).toEqual([
          {
            tabId: tab.id,
            maxLineNumber: 12,
            initialLineNumber: 1,
          },
        ]);
      });
    } finally {
      window.removeEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, requestListener as EventListener);
    }
  });

  it('does not request go-to-line dialog when Ctrl+G is pressed with Shift', async () => {
    const tab = createTab({ id: 'tab-shortcut-goto-line-shift', lineCount: 6 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);
    const requestListener = vi.fn();
    window.addEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, requestListener as EventListener);

    try {
      textarea.focus();
      fireEvent.keyDown(textarea, { key: 'g', ctrlKey: true, shiftKey: true });
      expect(requestListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, requestListener as EventListener);
    }
  });

  it('restores caret for collapsed selection after toggle-line-comment succeeds', async () => {
    const tab = createTab({ id: 'tab-key-toggle-comment-collapsed' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'toggle_line_comments') {
        return {
          changed: true,
          lineCount: 6,
          documentVersion: 2,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'get_visible_lines') {
        return '//alpha\nbeta\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, (_, index) => [
          {
            text: `line-${startLine + index + 1}`,
            type: 'plain',
          },
        ]);
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 2;
      }
      return undefined;
    });

    textarea.focus();
    textarea.setSelectionRange(3, 3);
    fireEvent.keyDown(textarea, { key: '/', ctrlKey: true });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'toggle_line_comments',
        expect.objectContaining({
          id: tab.id,
          isCollapsed: true,
        })
      );
      expect(textarea.selectionStart).toBe(0);
      expect(textarea.selectionEnd).toBe(0);
    });
  });

  it('falls back to execCommand paste when clipboard plugin read fails', async () => {
    const tab = createTab({ id: 'tab-paste-fallback' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const execCommand = vi.fn(() => false);

    try {
      readClipboardTextMock.mockRejectedValueOnce(new Error('clipboard-read-failed'));
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      fireEvent.contextMenu(textarea, { clientX: 320, clientY: 260 });
      fireEvent.click(await screen.findByRole('button', { name: 'Paste' }));

      await waitFor(() => {
        expect(execCommand).toHaveBeenCalledWith('paste');
      });

      const warnMessages = warnSpy.mock.calls.map((call) => String(call[0] ?? ''));
      expect(
        warnMessages.some((message) => message.includes('Failed to read clipboard text via Tauri clipboard plugin'))
      ).toBe(true);
      expect(
        warnMessages.some((message) => message.includes('Paste command blocked. Use Ctrl+V in editor.'))
      ).toBe(true);
    } finally {
      restoreProperty(document, 'execCommand', originalExecCommand);
      warnSpy.mockRestore();
    }
  });

  it('deletes selected line-number range with Delete key', async () => {
    const tab = createTab({ id: 'tab-line-selection-delete' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    await clickLineNumber(container, 2, { ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Delete' });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'edit_text',
        expect.objectContaining({
          id: tab.id,
          newText: 'alpha\n',
        })
      );
    });

    expect(textarea.value).toBe('alpha\n');
  });

  it('handles native copy event for line-number multi-selection', async () => {
    const tab = createTab({ id: 'tab-native-copy-line-selection' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await clickLineNumber(container, 2, { ctrlKey: true });
    const { event, setData } = createClipboardLikeEvent('copy');
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/plain', 'beta\n');
  });

  it('copies selected line-number range with Ctrl+C without editing document', async () => {
    const tab = createTab({ id: 'tab-line-selection-copy' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      await clickLineNumber(container, 2, { ctrlKey: true });
      fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('beta\n');
      });

      expect(
        invokeMock.mock.calls.some(
          (call) => call[0] === 'edit_text' || call[0] === 'replace_line_range'
        )
      ).toBe(false);
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('logs warning when line-number copy clipboard write fails', async () => {
    const tab = createTab({ id: 'tab-line-selection-copy-warn' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard-failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      await clickLineNumber(container, 2, { ctrlKey: true });
      fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('beta\n');
      });
      expect(warnSpy).toHaveBeenCalledWith('Failed to write line selection to clipboard.');
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
      warnSpy.mockRestore();
    }
  });

  it('cuts selected line-number range with Ctrl+X and updates text', async () => {
    const tab = createTab({ id: 'tab-line-selection-cut' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      await clickLineNumber(container, 1, { ctrlKey: true });
      fireEvent.keyDown(textarea, { key: 'x', ctrlKey: true });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('alpha\n');
        expect(invokeMock).toHaveBeenCalledWith(
          'edit_text',
          expect.objectContaining({
            id: tab.id,
            newText: 'beta\n',
          })
        );
      });

      expect(textarea.value).toBe('beta\n');
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('handles native cut event for line-number multi-selection and edits content', async () => {
    const tab = createTab({ id: 'tab-native-cut-line-selection' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    await clickLineNumber(container, 1, { ctrlKey: true });
    const { event, setData } = createClipboardLikeEvent('cut');
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/plain', 'alpha\n');

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'edit_text',
        expect.objectContaining({
          id: tab.id,
          newText: 'beta\n',
        })
      );
      expect(textarea.value).toBe('beta\n');
    });
  });

  it('closes context menu on outside pointerdown, Escape, blur and scroll events', async () => {
    const tab = createTab({ id: 'tab-context-close-external-events' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const openContextMenu = async () => {
      fireEvent.contextMenu(textarea, { clientX: 320, clientY: 240 });
      await screen.findByRole('button', { name: 'Copy' });
    };

    await openContextMenu();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });

    await openContextMenu();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });

    await openContextMenu();
    act(() => {
      fireEvent.blur(window);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });

    await openContextMenu();
    act(() => {
      fireEvent.scroll(window);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });
  });

  it('copies selected text from context menu', async () => {
    const tab = createTab({ id: 'tab-context-copy' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.contextMenu(textarea, { clientX: 340, clientY: 260 });
      fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('alpha');
      });
      expect(textarea.value).toBe('alpha\nbeta\n');
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('logs warning when context-menu copy clipboard write fails', async () => {
    const tab = createTab({ id: 'tab-context-copy-warn' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard-write-failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.contextMenu(textarea, { clientX: 350, clientY: 260 });
      fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('alpha');
      });
      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith('Failed to write selection to clipboard.');
      });
      expect(textarea.value).toBe('alpha\nbeta\n');
    } finally {
      warnSpy.mockRestore();
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('cuts selected text from context menu and syncs edit', async () => {
    const tab = createTab({ id: 'tab-context-cut' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
      fireEvent.contextMenu(textarea, { clientX: 360, clientY: 280 });
      fireEvent.click(await screen.findByRole('button', { name: 'Cut' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('alpha\nbeta\n');
        expect(invokeMock).toHaveBeenCalledWith(
          'edit_text',
          expect.objectContaining({
            id: tab.id,
            newText: '',
          })
        );
      });

      expect(textarea.value).toBe('');
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('inserts newline on Enter and syncs text diff', async () => {
    const tab = createTab({ id: 'tab-enter-insert-newline' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: false });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'edit_text',
        expect.objectContaining({
          id: tab.id,
          newText: '\n',
        })
      );
      expect(textarea.value).toBe('alpha\n\nbeta\n');
    });
  });

  it('deletes selected text from context menu and syncs edit', async () => {
    const tab = createTab({ id: 'tab-context-delete' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.contextMenu(textarea, { clientX: 380, clientY: 300 });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'edit_text',
        expect.objectContaining({
          id: tab.id,
          newText: '',
        })
      );
    });

    expect(textarea.value).toBe('');
  });

  it('selects all text from context menu action', async () => {
    const tab = createTab({ id: 'tab-context-select-all' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.focus();
    textarea.setSelectionRange(2, 2);
    fireEvent.contextMenu(textarea, { clientX: 400, clientY: 320 });
    fireEvent.click(await screen.findByRole('button', { name: 'Select All' }));

    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
  });

  it('opens http hyperlink on ctrl+left click', async () => {
    const tab = createTab({ id: 'tab-link-open-ctrl-click' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.value = 'https://example.com/docs\nbeta\n';
    fireEvent.pointerDown(textarea, {
      button: 0,
      ctrlKey: true,
      clientX: 0,
      clientY: 0,
    });

    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith('https://example.com/docs');
    });
  });

  it('uses backend pair line/column positions when provided', async () => {
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'a()\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, () => [
          {
            text: 'a()',
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return ['a()'];
      }
      if (command === 'find_matching_pair_offsets') {
        if (String(payload?.text ?? '').startsWith('a()')) {
          return {
            leftOffset: 0,
            rightOffset: 0,
            leftLine: 1,
            leftColumn: 2,
            rightLine: 1,
            rightColumn: 3,
          };
        }
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 1;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 1,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      return undefined;
    });

    const tab = createTab({ id: 'tab-pair-highlight-backend-positions', lineCount: 1 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, 'a()\n');

    act(() => {
      textarea.focus();
      textarea.setSelectionRange(1, 1);
    });
    fireEvent.select(textarea);

    await waitFor(() => {
      const hasPairQueryAtCaret = invokeMock.mock.calls.some(
        ([command, params]) =>
          command === 'find_matching_pair_offsets'
          && typeof params === 'object'
          && params !== null
          && (params as { offset?: number }).offset === 1
          && String((params as { text?: string }).text ?? '').startsWith('a()')
      );
      expect(hasPairQueryAtCaret).toBe(true);
    });

    await waitFor(() => {
      const marks = Array.from(container.querySelectorAll('mark'))
        .filter((element) => (element.className ?? '').includes('ring-sky-500/45'))
        .map((element) => element.textContent ?? '');
      expect(marks).toEqual(['(', ')']);
    });
  });

  it('skips pair-highlight backend lookup for plain-text syntax mode', async () => {
    const plainText = 'a()';
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return plainText;
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, () => [
          {
            text: plainText,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return [plainText];
      }
      if (command === 'find_matching_pair_offsets') {
        return {
          leftOffset: 0,
          rightOffset: 2,
          leftLine: 1,
          leftColumn: 1,
          rightLine: 1,
          rightColumn: 3,
        };
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 1;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 1,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }
      return undefined;
    });

    const tab = createTab({
      id: 'tab-pair-highlight-skip-plain-text',
      lineCount: 1,
      syntaxOverride: 'plain_text',
    });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, plainText);
    const pairHighlightCallsBeforeSelection = invokeMock.mock.calls.filter(
      ([command]) => command === 'find_matching_pair_offsets'
    ).length;

    act(() => {
      textarea.focus();
      textarea.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(1);
      expect(cursor?.column).toBe(2);
    });

    await waitFor(() => {
      const pairHighlightCallsAfterSelection = invokeMock.mock.calls.filter(
        ([command]) => command === 'find_matching_pair_offsets'
      );
      expect(pairHighlightCallsAfterSelection).toHaveLength(pairHighlightCallsBeforeSelection);
    });
  });

  it('skips pair-highlight backend lookup for ultra-long single-line text', async () => {
    const longJson = `{"payload":"${'x'.repeat(210_000)}"}`;
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return longJson;
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, () => [
          {
            text: longJson,
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return [longJson];
      }
      if (command === 'find_matching_pair_offsets') {
        return {
          leftOffset: 0,
          rightOffset: 0,
          leftLine: 1,
          leftColumn: 1,
          rightLine: 1,
          rightColumn: 2,
        };
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 1;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 1,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }
      if (command === 'get_unsaved_change_line_numbers') {
        return [];
      }
      return undefined;
    });

    const tab = createTab({ id: 'tab-pair-highlight-skip-ultra-long-single-line', lineCount: 1 });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea, longJson);
    const pairHighlightCallsBeforeSelection = invokeMock.mock.calls.filter(
      ([command]) => command === 'find_matching_pair_offsets'
    ).length;

    const caretOffset = longJson.length - 2;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(caretOffset, caretOffset);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await waitFor(() => {
      const cursor = useStore.getState().cursorPositionByTab[tab.id];
      expect(cursor?.line).toBe(1);
      expect(cursor?.column).toBe(caretOffset + 1);
    });

    await waitFor(() => {
      const pairHighlightCallsAfterSelection = invokeMock.mock.calls.filter(
        ([command]) => command === 'find_matching_pair_offsets'
      );
      expect(pairHighlightCallsAfterSelection).toHaveLength(pairHighlightCallsBeforeSelection);
    });
  });

  it('renders detected http hyperlinks with underline and blue text style', async () => {
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === 'get_visible_lines') {
        return 'visit https://example.com/docs\n';
      }
      if (command === 'get_syntax_token_lines') {
        const startLine = Number(payload?.startLine ?? 0);
        const endLine = Number(payload?.endLine ?? startLine + 1);
        const count = Math.max(1, endLine - startLine);
        return Array.from({ length: count }, () => [
          {
            text: 'visit https://example.com/docs',
            type: 'plain',
          },
        ]);
      }
      if (command === 'get_visible_lines_chunk') {
        return ['visit https://example.com/docs'];
      }
      if (command === 'find_matching_pair_offsets') {
        return null;
      }
      if (command === 'edit_text' || command === 'replace_line_range' || command === 'cleanup_document') {
        return 1;
      }
      if (command === 'toggle_line_comments') {
        return {
          changed: false,
          lineCount: 1,
          documentVersion: 1,
          selectionStartChar: 0,
          selectionEndChar: 0,
        };
      }
      if (command === 'convert_text_base64') {
        return '';
      }
      if (command === 'get_rectangular_selection_text') {
        return '';
      }

      return undefined;
    });

    const tab = createTab({ id: 'tab-link-underline', lineCount: 1 });
    const { container } = render(<Editor tab={tab} />);
    await waitForEditorTextarea(container);

    await waitFor(() => {
      const underlinedLink = Array.from(container.querySelectorAll('span')).find(
        (element) =>
          element.textContent === 'https://example.com/docs' &&
          element.className.includes('underline') &&
          element.className.includes('text-sky-600')
      );
      expect(underlinedLink).toBeTruthy();
    });
  });

  it('shows hand cursor and hover hint when hovering detected hyperlink, then resets on leave', async () => {
    const tab = createTab({ id: 'tab-link-hover-cursor' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.value = 'https://example.com/docs\nbeta\n';
    fireEvent.pointerMove(textarea, {
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('pointer');
    expect(textarea.title).toBe('Ctrl+Left Click to open');

    textarea.value = 'plain text\nbeta\n';
    fireEvent.pointerMove(textarea, {
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('');
    expect(textarea.title).toBe('');

    textarea.value = 'https://example.com/docs\nbeta\n';
    fireEvent.pointerMove(textarea, {
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('pointer');
    expect(textarea.title).toBe('Ctrl+Left Click to open');
    fireEvent.pointerLeave(textarea);
    expect(textarea.style.cursor).toBe('');
    expect(textarea.title).toBe('');
  });

  it('uses native selection paint during primary drag selection and suppresses link hover affordance', async () => {
    const tab = createTab({ id: 'tab-link-hover-suppressed-while-dragging' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.value = 'https://example.com/docs\nbeta\n';

    fireEvent.pointerDown(textarea, {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });

    expect(textarea.style.getPropertyValue('--editor-native-selection-bg')).toBe(
      'hsl(217 91% 60% / 0.28)'
    );

    fireEvent.pointerMove(textarea, {
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('');
    expect(textarea.title).toBe('');

    fireEvent.pointerUp(window);
    await waitFor(() => {
      expect(textarea.style.getPropertyValue('--editor-native-selection-bg')).toBe('');
    });

    fireEvent.pointerMove(textarea, {
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('pointer');
    expect(textarea.title).toBe('Ctrl+Left Click to open');
  });

  it('keeps text selection highlight after pointerup when drag selection ends', async () => {
    const tab = createTab({ id: 'tab-drag-selection-highlight-after-pointerup' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    fireEvent.pointerDown(textarea, {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));

    fireEvent.pointerUp(window);

    await waitFor(() => {
      const hasTextSelectionHighlight = Array.from(
        container.querySelectorAll('.editor-line mark')
      ).some((element) => element.className.includes('bg-blue-400/35'));
      expect(hasTextSelectionHighlight).toBe(true);
    });
  });

  it('does not clear native drag highlight in the same frame as pointerup', async () => {
    const tab = createTab({ id: 'tab-drag-selection-no-release-flicker' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    fireEvent.pointerDown(textarea, {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));

    fireEvent.pointerUp(window);
    expect(textarea.style.getPropertyValue('--editor-native-selection-bg')).toBe(
      'hsl(217 91% 60% / 0.28)'
    );

    await waitFor(() => {
      expect(textarea.style.getPropertyValue('--editor-native-selection-bg')).toBe('');
    });

    await waitFor(() => {
      const hasTextSelectionHighlight = Array.from(
        container.querySelectorAll('.editor-line mark')
      ).some((element) => element.className.includes('bg-blue-400/35'));
      expect(hasTextSelectionHighlight).toBe(true);
    });
  });

  it('renders trailing text-selection highlight when newline is selected', async () => {
    const tab = createTab({
      id: 'tab-selection-highlights-selected-newline',
      lineCount: 5000,
      largeFileMode: true,
    });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    act(() => {
      textarea.focus();
      textarea.setSelectionRange(0, 6);
    });
    document.dispatchEvent(new Event('selectionchange'));

    await waitFor(() => {
      const firstLine = container.querySelector('.editor-line');
      expect(firstLine).toBeTruthy();

      const lineBreakMarker = firstLine?.querySelector('.editor-selection-linebreak-marker');
      expect(lineBreakMarker).toBeTruthy();
    });
  });

  it('localizes hyperlink hover hint based on app language', async () => {
    useStore.getState().updateSettings({
      language: 'zh-CN',
    });

    const tab = createTab({ id: 'tab-link-hover-hint-zh' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.value = 'https://example.com/docs\nbeta\n';
    fireEvent.pointerMove(textarea, {
      clientX: 0,
      clientY: 0,
    });
    expect(textarea.style.cursor).toBe('pointer');
    expect(textarea.title).toBe('Ctrl+左键打开');
  });

  it('does not open hyperlink on regular left click', async () => {
    const tab = createTab({ id: 'tab-link-open-regular-click' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    textarea.value = 'https://example.com/docs\nbeta\n';
    fireEvent.pointerDown(textarea, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });

    await waitFor(() => {
      expect(openUrlMock).not.toHaveBeenCalled();
    });
  });

  it('pastes text from clipboard plugin without falling back to execCommand', async () => {
    const tab = createTab({ id: 'tab-context-paste-plugin-success' });
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    readClipboardTextMock.mockResolvedValueOnce('ZZ');
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const execCommand = vi.fn(() => true);

    try {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      textarea.focus();
      textarea.setSelectionRange(0, 5);
      fireEvent.contextMenu(textarea, { clientX: 420, clientY: 340 });
      fireEvent.click(await screen.findByRole('button', { name: 'Paste' }));

      await waitFor(() => {
        expect(textarea.value).toBe('ZZ\nbeta\n');
        expect(execCommand).not.toHaveBeenCalled();
      });
    } finally {
      restoreProperty(document, 'execCommand', originalExecCommand);
    }
  });
});
