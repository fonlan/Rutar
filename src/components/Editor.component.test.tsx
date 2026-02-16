import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
