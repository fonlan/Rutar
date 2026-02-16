import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
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

describe('Editor component', () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
});
