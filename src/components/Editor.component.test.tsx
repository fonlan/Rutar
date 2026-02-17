import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { Editor } from './Editor';
import { type FileTab, useStore } from '@/store/useStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: vi.fn(async () => ''),
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

      return undefined;
    });
  });

  it('renders input layer and loads initial text from backend', async () => {
    const tab = createTab();

    const { container } = render(<Editor tab={tab} />);
    const textarea = container.querySelector('textarea.editor-input-layer');
    expect(textarea).toBeTruthy();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('get_visible_lines', {
        id: tab.id,
        startLine: 0,
        endLine: 2147483647,
      });
    });

    expect(textarea?.value).toBe('alpha\nbeta\n');
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
        ([command, payload]) => command === 'get_syntax_token_lines' && payload?.id === tab.id
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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
    const textarea = await waitForEditorTextarea(container);

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
    const textarea = await waitForEditorTextarea(container);

    await waitFor(() => {
      const highlighted = Array.from(container.querySelectorAll('.editor-line')).some((line) =>
        line.className.includes('bg-accent/45')
      );
      expect(highlighted).toBe(false);
    });
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

  it('renders wrapped line layout when wordWrap is enabled', async () => {
    useStore.getState().updateSettings({
      wordWrap: true,
    });
    const tab = createTab({
      id: 'tab-word-wrap-layout',
      lineCount: 12,
    });

    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);

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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

  it('handles non-array huge editable chunk result without crashing', async () => {
    const tab = createTab({ id: 'tab-huge-chunk-non-array', lineCount: 22000 });

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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

    invokeMock.mockImplementation(async (command: string, payload?: any) => {
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
      ([command, payload]) => command === 'get_visible_lines_chunk' && payload?.id === tab.id
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
        ([command, payload]) => command === 'get_visible_lines_chunk' && payload?.id === tab.id
      ).length;
      expect(cursor?.line).toBe(200);
      expect(cursor?.column).toBe(2);
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
      expect(chunkCalls).toBeGreaterThan(initialChunkCalls);
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

  it('handles force-refresh event with preserveCaret and updates line count', async () => {
    const tab = createTab({ id: 'tab-force-refresh', lineCount: 6 });
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
            lineCount: 9,
            preserveCaret: true,
          },
        })
      );
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      expect(currentTab?.lineCount).toBe(9);
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(2);
    });
  });

  it('ignores force-refresh event when tab id does not match', async () => {
    const tab = createTab({ id: 'tab-force-refresh-ignore', lineCount: 6 });
    useStore.getState().addTab(tab);
    const { container } = render(<Editor tab={tab} />);
    const textarea = await waitForEditorTextarea(container);
    await waitForEditorText(textarea);

    const initialGetVisibleLinesCalls = invokeMock.mock.calls.filter(
      ([command, payload]) => command === 'get_visible_lines' && payload?.id === tab.id
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
        ([command, payload]) => command === 'get_visible_lines' && payload?.id === tab.id
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
        ([command, payload]) => command === 'get_visible_lines' && payload?.id === tab.id
      ).length;
      expect(currentTab?.lineCount).toBe(10);
      expect(getVisibleLinesCalls).toBeGreaterThanOrEqual(2);
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
