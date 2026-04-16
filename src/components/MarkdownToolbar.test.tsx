import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { message, open } from '@tauri-apps/plugin-dialog';
import { MarkdownToolbar } from './MarkdownToolbar';
import { MARKDOWN_TOOLBAR_ACTION_EVENT } from '@/lib/markdownToolbar';
import { type FileTab, useStore } from '@/store/useStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => undefined),
  open: vi.fn(async () => null),
}));

const invokeMock = vi.mocked(invoke);
const messageMock = vi.mocked(message);
const openMock = vi.mocked(open);

function createTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: 'tab-markdown-toolbar',
    name: 'note.md',
    path: 'C:\\repo\\note.md',
    encoding: 'UTF-8',
    lineEnding: 'LF',
    lineCount: 20,
    largeFileMode: false,
    tabType: 'file',
    ...overrides,
  };
}

describe('MarkdownToolbar', () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: 'en-US' });
    invokeMock.mockResolvedValue('data:image/png;base64,Zm9v');
  });

  it('shows only for markdown tabs and responds to syntax changes', async () => {
    const tab = createTab({ syntaxOverride: 'plain_text', name: 'note.txt', path: 'C:\\repo\\note.txt' });
    useStore.getState().addTab(tab);

    render(<MarkdownToolbar />);
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();

    act(() => {
      useStore.getState().updateTab(tab.id, { syntaxOverride: 'markdown' });
    });

    expect(await screen.findByRole('button', { name: 'Bold' })).toBeInTheDocument();

    act(() => {
      useStore.getState().updateTab(tab.id, { syntaxOverride: 'plain_text' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    });
  });

  it('dispatches markdown toolbar actions for inline buttons', () => {
    const tab = createTab({ syntaxOverride: 'markdown' });
    useStore.getState().addTab(tab);

    const events: Array<{ tabId?: string; action?: { type?: string } }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail as { tabId?: string; action?: { type?: string } });
    };
    window.addEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, listener as EventListener);

    render(<MarkdownToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    expect(events[0]).toEqual({
      tabId: tab.id,
      action: { type: 'toggle_bold' },
    });

    window.removeEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, listener as EventListener);
  });

  it('opens the image menu and dispatches a base64 image action after file selection', async () => {
    const tab = createTab({ syntaxOverride: 'markdown' });
    useStore.getState().addTab(tab);
    openMock.mockResolvedValueOnce('C:\\repo\\image.png');

    const events: Array<{ tabId?: string; action?: { type?: string; src?: string; alt?: string } }> = [];
    const listener = (event: Event) => {
      events.push(
        (event as CustomEvent).detail as {
          tabId?: string;
          action?: { type?: string; src?: string; alt?: string };
        },
      );
    };
    window.addEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, listener as EventListener);

    render(<MarkdownToolbar />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert Image' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Embed Image as Base64' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('encode_image_file_as_data_url', {
        path: 'C:\\repo\\image.png',
      });
    });
    expect(events[0]).toEqual({
      tabId: tab.id,
      action: {
        type: 'insert_image_base64',
        src: 'data:image/png;base64,Zm9v',
        alt: 'image',
      },
    });

    window.removeEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, listener as EventListener);
  });

  it('shows a warning dialog when base64 encoding fails', async () => {
    const tab = createTab({ syntaxOverride: 'markdown' });
    useStore.getState().addTab(tab);
    openMock.mockResolvedValueOnce('C:\\repo\\image.unsupported');
    invokeMock.mockRejectedValueOnce(new Error('Unsupported image file extension'));

    render(<MarkdownToolbar />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert Image' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Embed Image as Base64' }));

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        'Failed to encode image as Base64: Unsupported image file extension',
        expect.objectContaining({ title: 'Insert Image', kind: 'warning' }),
      );
    });
  });
});
