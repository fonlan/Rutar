import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { openFilePaths } from '@/lib/openFile';
import { detectOutlineType, loadOutline } from '@/lib/outline';
import { confirmTabClose, saveTab } from '@/lib/tabClose';
import { type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(async () => false),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(async () => undefined),
    onDragDropEvent: vi.fn(async () => vi.fn()),
    onCloseRequested: vi.fn(async () => vi.fn()),
  })),
}));

vi.mock('@/lib/openFile', () => ({
  openFilePaths: vi.fn(async () => undefined),
}));

vi.mock('@/lib/tabClose', () => ({
  confirmTabClose: vi.fn(async () => 'discard'),
  saveTab: vi.fn(async () => true),
}));

vi.mock('@/lib/outline', () => ({
  detectOutlineType: vi.fn(),
  loadOutline: vi.fn(async () => []),
}));

vi.mock('@/components/TitleBar', () => ({
  TitleBar: () => React.createElement('div', { 'data-testid': 'mock-titlebar' }),
}));

vi.mock('@/components/Toolbar', () => ({
  Toolbar: () => React.createElement('div', { 'data-testid': 'mock-toolbar' }),
}));

vi.mock('@/components/Editor', () => ({
  Editor: ({ tab }: { tab: FileTab }) =>
    React.createElement('div', { 'data-testid': 'mock-editor', 'data-tab-id': tab.id }),
}));

vi.mock('@/components/DiffEditor', () => ({
  DiffEditor: ({ tab }: { tab: FileTab }) =>
    React.createElement('div', { 'data-testid': 'mock-diff-editor', 'data-tab-id': tab.id }),
}));

vi.mock('@/components/SettingsModal', () => ({
  SettingsModal: () => React.createElement('div', { 'data-testid': 'mock-settings-modal' }),
}));

vi.mock('@/components/Sidebar', () => ({
  Sidebar: () => React.createElement('div', { 'data-testid': 'mock-sidebar' }),
}));

vi.mock('@/components/BookmarkSidebar', () => ({
  BookmarkSidebar: () => React.createElement('div', { 'data-testid': 'mock-bookmark-sidebar' }),
}));

vi.mock('@/components/StatusBar', () => ({
  StatusBar: () => React.createElement('div', { 'data-testid': 'mock-statusbar' }),
}));

vi.mock('@/components/SearchReplacePanel', () => ({
  SearchReplacePanel: () => React.createElement('div', { 'data-testid': 'mock-search-replace-panel' }),
}));

vi.mock('@/components/TabCloseConfirmModal', () => ({
  TabCloseConfirmModal: () => React.createElement('div', { 'data-testid': 'mock-tab-close-confirm-modal' }),
}));

vi.mock('@/components/OutlineSidebar', () => ({
  OutlineSidebar: ({
    nodes,
    activeType,
    parseError,
  }: {
    nodes: Array<{ label: string }>;
    activeType: string | null;
    parseError: string | null;
  }) =>
    React.createElement('div', {
      'data-testid': 'mock-outline-sidebar',
      'data-node-count': String(Array.isArray(nodes) ? nodes.length : 0),
      'data-first-label': Array.isArray(nodes) && nodes.length > 0 ? nodes[0]?.label ?? '' : '',
      'data-outline-type': activeType ?? '',
      'data-outline-error': parseError ?? '',
    }),
}));

vi.mock('@/components/MarkdownPreviewPanel', () => ({
  MarkdownPreviewPanel: ({ open, tab }: { open: boolean; tab: FileTab | null }) =>
    React.createElement('div', {
      'data-testid': 'mock-preview',
      'data-open': String(open === true),
      'data-tab-id': tab?.id ?? 'none',
    }),
}));

import App, { appTestUtils } from './App';

function createFileTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: 'tab-file',
    name: 'main.ts',
    path: 'C:\\repo\\main.ts',
    encoding: 'UTF-8',
    lineEnding: 'LF',
    lineCount: 5,
    largeFileMode: false,
    tabType: 'file',
    ...overrides,
  };
}

function createDiffPayload(overrides: Partial<DiffTabPayload> = {}): DiffTabPayload {
  return {
    sourceTabId: 'source-tab',
    targetTabId: 'target-tab',
    sourceName: 'source.ts',
    targetName: 'target.ts',
    sourcePath: 'C:\\repo\\source.ts',
    targetPath: 'C:\\repo\\target.ts',
    alignedSourceLines: ['source-line'],
    alignedTargetLines: ['target-line'],
    alignedSourcePresent: [true],
    alignedTargetPresent: [true],
    diffLineNumbers: [1],
    sourceDiffLineNumbers: [1],
    targetDiffLineNumbers: [1],
    sourceLineCount: 1,
    targetLineCount: 1,
    alignedLineCount: 1,
    ...overrides,
  };
}

type InvokeOverride = (payload?: any) => unknown | Promise<unknown>;

function createInvokeHandler(overrides: Record<string, InvokeOverride> = {}) {
  return async (command: string, payload?: any) => {
    const override = overrides[command];
    if (override) {
      return override(payload);
    }

    if (command === 'load_config') {
      return {
        language: 'en-US',
        theme: 'light',
        fontFamily: 'Consolas, \"Courier New\", monospace',
        fontSize: 14,
        tabWidth: 4,
        newFileLineEnding: 'LF',
        wordWrap: false,
        doubleClickCloseTab: true,
        showLineNumbers: true,
        highlightCurrentLine: true,
        singleInstanceMode: true,
        rememberWindowState: true,
        recentFiles: [],
        recentFolders: [],
        windowsFileAssociationExtensions: [],
        mouseGesturesEnabled: false,
        mouseGestures: [],
      };
    }
    if (command === 'get_startup_paths') {
      return [];
    }
    if (command === 'show_main_window_when_ready') {
      return undefined;
    }
    if (command === 'has_external_file_change') {
      return false;
    }
    if (command === 'save_config') {
      return undefined;
    }
    if (command === 'read_dir_if_directory') {
      return null;
    }
    if (command === 'new_file') {
      return createFileTab({ id: 'startup-file-id', name: 'untitled.txt', path: 'untitled.txt' });
    }
    if (command === 'close_file') {
      return undefined;
    }

    return undefined;
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('App component', () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    document.documentElement.classList.remove('dark');

    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: vi.fn(async () => () => undefined),
    } as never);
    vi.mocked(listen).mockImplementation(async () => () => undefined);
    vi.mocked(ask).mockResolvedValue(false);
    vi.mocked(detectOutlineType).mockReturnValue(null);
    vi.mocked(loadOutline).mockResolvedValue([]);
    vi.mocked(invoke).mockImplementation(createInvokeHandler());
  });

  it('closes late startup file when another tab is already present and logs close failure', async () => {
    const deferred = createDeferred<FileTab>();
    const existingTab = createFileTab({ id: 'tab-existing-before-startup' });
    const startupTab = createFileTab({
      id: 'tab-startup-late-created',
      name: 'startup-late.txt',
      path: 'startup-late.txt',
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        new_file: async () => deferred.promise,
        close_file: async () => {
          throw new Error('close-startup-file-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('new_file', expect.any(Object));
      });

      act(() => {
        useStore.setState({
          tabs: [existingTab],
          activeTabId: existingTab.id,
        });
      });

      await act(async () => {
        deferred.resolve(startupTab);
        await deferred.promise;
      });

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_file', {
          id: startupTab.id,
        });
      });
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to create startup file:',
        expect.objectContaining({ message: 'close-startup-file-failed' })
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('renders file editor for active file tab', async () => {
    const fileTab = createFileTab({ id: 'tab-file-active' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-tab-id', fileTab.id);
    });

    expect(screen.queryByTestId('mock-diff-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-preview')).toHaveAttribute('data-tab-id', fileTab.id);
  });

  it('renders fallback editor region when there is no active tab', async () => {
    useStore.setState({
      tabs: [],
      activeTabId: null,
    });

    const { container } = render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-preview')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-diff-editor')).not.toBeInTheDocument();
    expect(container.querySelector('div[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByTestId('mock-preview')).toHaveAttribute('data-tab-id', 'none');
  });

  it('applies dark theme class when config theme is dark', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'dark',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: false,
          mouseGestures: [],
        }),
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(useStore.getState().settings.theme).toBe('dark');
    });
  });

  it('logs error when loading config fails', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => {
          throw new Error('load-config-failed');
        },
      })
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to load config:',
          expect.objectContaining({ message: 'load-config-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('unsubscribes close guard when registration resolves after cleanup', async () => {
    const deferred = createDeferred<() => void>();
    const unlistenSpy = vi.fn();

    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: vi.fn(async () => deferred.promise),
    } as never);

    const view = render(React.createElement(App));
    view.unmount();

    await act(async () => {
      deferred.resolve(unlistenSpy);
      await deferred.promise;
    });

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
  });

  it('logs error when registering close guard fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: vi.fn(async () => {
        throw new Error('close-guard-register-failed');
      }),
    } as never);

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to register close guard:',
          expect.objectContaining({ message: 'close-guard-register-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('prevents window close when dirty-tab confirmation is cancelled', async () => {
    const dirtyTab = createFileTab({ id: 'tab-close-cancel', isDirty: true });
    useStore.setState({
      tabs: [dirtyTab],
      activeTabId: dirtyTab.id,
    });

    let closeRequestedHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null;
    const onCloseRequestedSpy = vi.fn(async (handler: unknown) => {
      closeRequestedHandler = handler as (event: { preventDefault: () => void }) => Promise<void>;
      return () => undefined;
    });

    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: onCloseRequestedSpy,
    } as never);
    vi.mocked(confirmTabClose).mockResolvedValue('cancel');

    render(React.createElement(App));

    await waitFor(() => {
      expect(onCloseRequestedSpy).toHaveBeenCalledTimes(1);
      expect(closeRequestedHandler).toBeTruthy();
    });

    const preventDefaultSpy = vi.fn();
    await act(async () => {
      await closeRequestedHandler?.({ preventDefault: preventDefaultSpy });
    });

    expect(vi.mocked(confirmTabClose)).toHaveBeenCalledWith(
      expect.objectContaining({ id: dirtyTab.id }),
      'en-US',
      true
    );
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveTab)).not.toHaveBeenCalled();
  });

  it('reuses save_all decision for remaining dirty tabs and prevents close when save fails', async () => {
    const dirtyTabA = createFileTab({ id: 'tab-close-save-all-a', isDirty: true });
    const dirtyTabB = createFileTab({ id: 'tab-close-save-all-b', isDirty: true });
    useStore.setState({
      tabs: [dirtyTabA, dirtyTabB],
      activeTabId: dirtyTabA.id,
    });

    let closeRequestedHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null;
    const onCloseRequestedSpy = vi.fn(async (handler: unknown) => {
      closeRequestedHandler = handler as (event: { preventDefault: () => void }) => Promise<void>;
      return () => undefined;
    });

    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: onCloseRequestedSpy,
    } as never);
    vi.mocked(confirmTabClose).mockResolvedValue('save_all');
    vi.mocked(saveTab).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    render(React.createElement(App));

    await waitFor(() => {
      expect(onCloseRequestedSpy).toHaveBeenCalledTimes(1);
      expect(closeRequestedHandler).toBeTruthy();
    });

    const preventDefaultSpy = vi.fn();
    await act(async () => {
      await closeRequestedHandler?.({ preventDefault: preventDefaultSpy });
    });

    expect(vi.mocked(confirmTabClose)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveTab)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveTab)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: dirtyTabA.id }),
      expect.any(Function)
    );
    expect(vi.mocked(saveTab)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: dirtyTabB.id }),
      expect.any(Function)
    );
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
  });

  it('skips config update when load_config resolves after unmount', async () => {
    const deferred = createDeferred<{
      language: string;
      theme: 'light' | 'dark';
      fontFamily: string;
      fontSize: number;
      tabWidth: number;
      newFileLineEnding: 'LF' | 'CRLF' | 'CR';
      wordWrap: boolean;
      doubleClickCloseTab: boolean;
      showLineNumbers: boolean;
      highlightCurrentLine: boolean;
      singleInstanceMode: boolean;
      rememberWindowState: boolean;
      recentFiles: string[];
      recentFolders: string[];
      windowsFileAssociationExtensions: string[];
      mouseGesturesEnabled: boolean;
      mouseGestures: Array<{ pattern: string; action: string }>;
    }>();
    const initialTheme = useStore.getState().settings.theme;
    const resolvedTheme = initialTheme === 'dark' ? 'light' : 'dark';

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => deferred.promise,
      })
    );

    const view = render(React.createElement(App));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('load_config');
    });

    view.unmount();

    await act(async () => {
      deferred.resolve({
        language: 'en-US',
        theme: resolvedTheme,
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 15,
        tabWidth: 2,
        newFileLineEnding: 'LF',
        wordWrap: true,
        doubleClickCloseTab: true,
        showLineNumbers: true,
        highlightCurrentLine: true,
        singleInstanceMode: true,
        rememberWindowState: true,
        recentFiles: ['C:\\repo\\late-config.ts'],
        recentFolders: ['C:\\repo'],
        windowsFileAssociationExtensions: ['.ts'],
        mouseGesturesEnabled: true,
        mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
      });
      await deferred.promise;
    });

    expect(useStore.getState().settings.theme).toBe(initialTheme);
  });

  it('logs error when save_config fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        save_config: async () => {
          throw new Error('save-config-failed');
        },
      })
    );

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('load_config');
      });

      await act(async () => {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 260);
        });
      });

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to save config:',
          expect.objectContaining({ message: 'save-config-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('renders diff editor for active diff tab and clears markdown preview file tab', async () => {
    const sourceTab = createFileTab({ id: 'source-tab', name: 'source.ts', path: 'C:\\repo\\source.ts' });
    const targetTab = createFileTab({ id: 'target-tab', name: 'target.ts', path: 'C:\\repo\\target.ts' });
    const diffTab = createFileTab({
      id: 'diff-tab',
      name: 'source.ts ↔ target.ts',
      path: '',
      tabType: 'diff',
      diffPayload: createDiffPayload(),
    });

    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-diff-editor')).toHaveAttribute('data-tab-id', diffTab.id);
    });

    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-preview')).toHaveAttribute('data-tab-id', 'none');
  });

  it('auto closes outline when active file does not support outline type', async () => {
    const fileTab = createFileTab({ id: 'tab-outline-unsupported' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue(null);

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().setOutlineData({
        outlineType: 'json',
        nodes: [{ label: 'legacy', nodeType: 'root', line: 1, column: 1, children: [] }],
      });
      useStore.getState().toggleOutline(true);
    });

    await waitFor(() => {
      const state = useStore.getState();
      expect(state.outlineOpen).toBe(false);
      expect(state.outlineType).toBeNull();
      expect(state.outlineNodes).toEqual([]);
    });
  });

  it('loads outline and refreshes it on matching document-updated event', async () => {
    const fileTab = createFileTab({ id: 'tab-outline-refresh' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue('json');
    vi.mocked(loadOutline)
      .mockResolvedValueOnce([{ label: 'root-A', nodeType: 'root', line: 1, column: 1, children: [] }])
      .mockResolvedValueOnce([{ label: 'root-B', nodeType: 'root', line: 1, column: 1, children: [] }]);

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().toggleOutline(true);
    });

    await waitFor(() => {
      expect(vi.mocked(loadOutline)).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('mock-outline-sidebar')).toHaveAttribute('data-outline-type', 'json');
      expect(screen.getByTestId('mock-outline-sidebar')).toHaveAttribute('data-first-label', 'root-A');
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:document-updated', {
          detail: { tabId: 'other-tab' },
        })
      );
    });

    await waitFor(() => {
      expect(vi.mocked(loadOutline)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:document-updated', {
          detail: { tabId: fileTab.id },
        })
      );
    });

    await waitFor(() => {
      expect(vi.mocked(loadOutline)).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('mock-outline-sidebar')).toHaveAttribute('data-first-label', 'root-B');
    });
  });

  it('sets outline error when loading outline fails', async () => {
    const fileTab = createFileTab({ id: 'tab-outline-error' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue('json');
    vi.mocked(loadOutline).mockRejectedValueOnce(new Error('outline-load-failed'));

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().toggleOutline(true);
    });

    await waitFor(() => {
      const state = useStore.getState();
      expect(state.outlineType).toBe('json');
      expect(state.outlineNodes).toEqual([]);
      expect(state.outlineError).toBe('outline-load-failed');
      expect(screen.getByTestId('mock-outline-sidebar')).toHaveAttribute(
        'data-outline-error',
        'outline-load-failed'
      );
    });
  });

  it('restores tab panel state when switching active tabs', async () => {
    const tabA = createFileTab({ id: 'tab-state-A', name: 'a.ts', path: 'C:\\repo\\a.ts' });
    const tabB = createFileTab({ id: 'tab-state-B', name: 'b.ts', path: 'C:\\repo\\b.ts' });
    useStore.setState({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue('json');

    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-tab-id', tabA.id);
    });

    act(() => {
      const state = useStore.getState();
      state.toggleSidebar(true);
      state.toggleBookmarkSidebar(true);
      state.toggleMarkdownPreview(true);
    });

    act(() => {
      useStore.getState().setActiveTab(tabB.id);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-tab-id', tabB.id);
    });

    act(() => {
      const state = useStore.getState();
      state.toggleSidebar(false);
      state.toggleBookmarkSidebar(false);
      state.toggleMarkdownPreview(false);
      state.setActiveTab(tabA.id);
    });

    await waitFor(() => {
      const state = useStore.getState();
      expect(state.activeTabId).toBe(tabA.id);
      expect(state.sidebarOpen).toBe(true);
      expect(state.bookmarkSidebarOpen).toBe(true);
      expect(state.markdownPreviewOpen).toBe(true);
    });
  });

  it('ignores late resolved outline result after effect cleanup', async () => {
    const fileTab = createFileTab({ id: 'tab-outline-cancel-success' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue('json');
    const deferred = createDeferred<Array<{ label: string; nodeType: string; line: number; column: number; children: [] }>>();
    vi.mocked(loadOutline).mockReturnValueOnce(deferred.promise);

    const view = render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().toggleOutline(true);
    });

    await waitFor(() => {
      expect(vi.mocked(loadOutline)).toHaveBeenCalledTimes(1);
    });

    view.unmount();

    await act(async () => {
      deferred.resolve([{ label: 'late-success', nodeType: 'root', line: 1, column: 1, children: [] }]);
      await deferred.promise;
    });

    const state = useStore.getState();
    expect(state.outlineNodes).toEqual([]);
    expect(state.outlineError).toBeNull();
  });

  it('ignores late rejected outline result after effect cleanup', async () => {
    const fileTab = createFileTab({ id: 'tab-outline-cancel-error' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(detectOutlineType).mockReturnValue('json');
    const deferred = createDeferred<Array<{ label: string; nodeType: string; line: number; column: number; children: [] }>>();
    vi.mocked(loadOutline).mockReturnValueOnce(deferred.promise);

    const view = render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().toggleOutline(true);
    });

    await waitFor(() => {
      expect(vi.mocked(loadOutline)).toHaveBeenCalledTimes(1);
    });

    view.unmount();

    await act(async () => {
      deferred.reject(new Error('late-outline-error'));
      try {
        await deferred.promise;
      } catch {
        return;
      }
    });

    const state = useStore.getState();
    expect(state.outlineError).toBeNull();
  });

  it('ignores external-file-changed events when payload id is invalid or not active tab', async () => {
    const fileTab = createFileTab({ id: 'tab-external-listener-ignore' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    let externalChangedHandler: ((event: { payload?: { id?: unknown } }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'rutar://external-file-changed') {
        externalChangedHandler = callback as (event: { payload?: { id?: unknown } }) => void;
      }
      return () => undefined;
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => false,
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(externalChangedHandler).toBeTruthy();
    });

    const hasExternalCheckCountBefore = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'has_external_file_change').length;

    act(() => {
      externalChangedHandler?.({ payload: { id: 123 } });
      externalChangedHandler?.({ payload: { id: 'tab-external-listener-other' } });
    });

    const hasExternalCheckCountAfter = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'has_external_file_change').length;
    expect(hasExternalCheckCountAfter).toBe(hasExternalCheckCountBefore);
  });

  it('checks active tab when external-file-changed event matches active id', async () => {
    const fileTab = createFileTab({ id: 'tab-external-listener-match' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    let externalChangedHandler: ((event: { payload?: { id?: unknown } }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'rutar://external-file-changed') {
        externalChangedHandler = callback as (event: { payload?: { id?: unknown } }) => void;
      }
      return () => undefined;
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => false,
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(externalChangedHandler).toBeTruthy();
    });

    const hasExternalCheckCountBefore = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'has_external_file_change').length;

    act(() => {
      externalChangedHandler?.({ payload: { id: fileTab.id } });
    });

    await waitFor(() => {
      const hasExternalCheckCountAfter = vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'has_external_file_change').length;
      expect(hasExternalCheckCountAfter).toBe(hasExternalCheckCountBefore + 1);
    });
  });

  it('skips duplicate external-change checks while current check is pending', async () => {
    const fileTab = createFileTab({ id: 'tab-external-listener-pending' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    const hasExternalChangeDeferred = createDeferred<boolean>();
    let externalChangedHandler: ((event: { payload?: { id?: unknown } }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'rutar://external-file-changed') {
        externalChangedHandler = callback as (event: { payload?: { id?: unknown } }) => void;
      }
      return () => undefined;
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => hasExternalChangeDeferred.promise,
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      const checkCount = vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'has_external_file_change').length;
      expect(checkCount).toBe(1);
      expect(externalChangedHandler).toBeTruthy();
    });

    act(() => {
      externalChangedHandler?.({ payload: { id: fileTab.id } });
    });

    await act(async () => {
      await Promise.resolve();
    });

    const checkCountAfter = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'has_external_file_change').length;
    expect(checkCountAfter).toBe(1);

    await act(async () => {
      hasExternalChangeDeferred.resolve(false);
      await hasExternalChangeDeferred.promise;
    });
  });

  it('logs error when checking external file change fails', async () => {
    const fileTab = createFileTab({ id: 'tab-external-check-failed' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => {
          throw new Error('external-change-check-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to check external file change: ${fileTab.path}`,
          expect.objectContaining({ message: 'external-change-check-failed' })
        );
      });
      expect(vi.mocked(ask)).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns when external-change tab is removed before prompt stage', async () => {
    const fileTab = createFileTab({ id: 'tab-external-gone-before-prompt' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => {
          useStore.getState().closeTab(fileTab.id);
          return true;
        },
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(useStore.getState().tabs.some((tab) => tab.id === fileTab.id)).toBe(false);
    });
    expect(vi.mocked(ask)).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'reload_file_from_disk' || command === 'acknowledge_external_file_change')
        .length
    ).toBe(0);
  });

  it('logs error when listening external-file-changed event fails', async () => {
    vi.mocked(listen).mockImplementation(async (eventName) => {
      if (eventName === 'rutar://external-file-changed') {
        throw new Error('external-file-listener-failed');
      }
      return () => undefined;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to listen external file change event:',
          expect.objectContaining({ message: 'external-file-listener-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('opens incoming paths from single-instance event and ignores empty payload', async () => {
    let openPathsHandler: ((event: { payload?: unknown }) => Promise<void> | void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'rutar://open-paths') {
        openPathsHandler = callback as (event: { payload?: unknown }) => Promise<void> | void;
      }
      return () => undefined;
    });
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        read_dir_if_directory: async () => null,
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(openPathsHandler).toBeTruthy();
    });

    await act(async () => {
      await openPathsHandler?.({ payload: [] });
      await openPathsHandler?.({ payload: 'invalid' });
    });
    expect(vi.mocked(openFilePaths)).not.toHaveBeenCalled();

    await act(async () => {
      await openPathsHandler?.({ payload: ['C:\\repo\\incoming-from-instance.ts'] });
    });
    await waitFor(() => {
      expect(vi.mocked(openFilePaths)).toHaveBeenCalledWith(['C:\\repo\\incoming-from-instance.ts']);
    });
  });

  it('logs error when registering single-instance open listener fails', async () => {
    vi.mocked(listen).mockImplementation(async (eventName) => {
      if (eventName === 'rutar://open-paths') {
        throw new Error('single-instance-listener-failed');
      }
      return () => undefined;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to listen single-instance open event:',
          expect.objectContaining({ message: 'single-instance-listener-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('handles drag-drop listener callback and opens dropped paths only', async () => {
    let dragDropHandler: ((event: { payload: { type: string; paths: string[] } }) => void) | null = null;
    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async (callback: unknown) => {
        dragDropHandler = callback as (event: { payload: { type: string; paths: string[] } }) => void;
        return () => undefined;
      }),
      onCloseRequested: vi.fn(async () => () => undefined),
    } as never);

    render(React.createElement(App));

    await waitFor(() => {
      expect(dragDropHandler).toBeTruthy();
    });

    act(() => {
      dragDropHandler?.({ payload: { type: 'hover', paths: ['C:\\repo\\ignored.ts'] } });
    });
    expect(vi.mocked(openFilePaths)).not.toHaveBeenCalled();

    act(() => {
      dragDropHandler?.({ payload: { type: 'drop', paths: ['C:\\repo\\dropped.ts'] } });
    });
    await waitFor(() => {
      expect(vi.mocked(openFilePaths)).toHaveBeenCalledWith(['C:\\repo\\dropped.ts']);
    });
  });

  it('logs error when registering drag-drop listener fails', async () => {
    vi.mocked(getCurrentWindow).mockReturnValue({
      close: vi.fn(async () => undefined),
      onDragDropEvent: vi.fn(async () => {
        throw new Error('drag-drop-listener-failed');
      }),
      onCloseRequested: vi.fn(async () => () => undefined),
    } as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to register drag drop listener:',
          expect.objectContaining({ message: 'drag-drop-listener-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs error when revealing main window fails after app shell ready', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        show_main_window_when_ready: async () => {
          throw new Error('show-main-window-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to reveal main window after app shell ready:',
          expect.objectContaining({ message: 'show-main-window-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('acknowledges external file change when user declines reload', async () => {
    const fileTab = createFileTab({ id: 'tab-external-change-ack' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => true,
        acknowledge_external_file_change: async () => undefined,
      })
    );
    vi.mocked(ask).mockResolvedValue(false);

    render(React.createElement(App));

    await waitFor(() => {
      expect(vi.mocked(ask)).toHaveBeenCalled();
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('acknowledge_external_file_change', {
        id: fileTab.id,
      });
    });
  });

  it('logs error when acknowledging declined external change fails', async () => {
    const fileTab = createFileTab({ id: 'tab-external-change-ack-failed' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => true,
        acknowledge_external_file_change: async () => {
          throw new Error('acknowledge-external-change-failed');
        },
      })
    );
    vi.mocked(ask).mockResolvedValue(false);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to acknowledge external change: ${fileTab.path}`,
          expect.objectContaining({ message: 'acknowledge-external-change-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('reloads file when external change is confirmed and dispatches refresh events', async () => {
    const fileTab = createFileTab({
      id: 'tab-external-change-reload',
      lineCount: 3,
      isDirty: true,
    });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => true,
        reload_file_from_disk: async () =>
          createFileTab({
            id: fileTab.id,
            name: 'reloaded.ts',
            path: fileTab.path,
            lineCount: 9,
            isDirty: false,
          }),
      })
    );
    vi.mocked(ask).mockResolvedValue(true);

    const forceRefreshEvents: Array<{ tabId: string; lineCount: number; preserveCaret: boolean }> = [];
    const documentUpdatedEvents: Array<{ tabId: string }> = [];
    const forceRefreshListener = (event: Event) => {
      forceRefreshEvents.push(
        (event as CustomEvent<{ tabId: string; lineCount: number; preserveCaret: boolean }>).detail
      );
    };
    const documentUpdatedListener = (event: Event) => {
      documentUpdatedEvents.push((event as CustomEvent<{ tabId: string }>).detail);
    };
    window.addEventListener('rutar:force-refresh', forceRefreshListener as EventListener);
    window.addEventListener('rutar:document-updated', documentUpdatedListener as EventListener);

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('reload_file_from_disk', {
          id: fileTab.id,
        });

        const currentTab = useStore.getState().tabs.find((tab) => tab.id === fileTab.id);
        expect(currentTab?.name).toBe('reloaded.ts');
        expect(currentTab?.lineCount).toBe(9);
        expect(currentTab?.isDirty).toBe(false);
      });

      expect(forceRefreshEvents).toContainEqual({
        tabId: fileTab.id,
        lineCount: 9,
        preserveCaret: false,
      });
      expect(documentUpdatedEvents).toContainEqual({ tabId: fileTab.id });
    } finally {
      window.removeEventListener('rutar:force-refresh', forceRefreshListener as EventListener);
      window.removeEventListener('rutar:document-updated', documentUpdatedListener as EventListener);
    }
  });

  it('logs error when external file reload fails after confirmation', async () => {
    const fileTab = createFileTab({
      id: 'tab-external-change-reload-failed',
      isDirty: true,
    });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        has_external_file_change: async () => true,
        reload_file_from_disk: async () => {
          throw new Error('reload-external-file-failed');
        },
      })
    );
    vi.mocked(ask).mockResolvedValue(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to reload changed file: ${fileTab.path}`,
          expect.objectContaining({ message: 'reload-external-file-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps context menu default behavior when gesture config has only empty patterns', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-empty-patterns' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    act(() => {
      useStore.getState().updateSettings({
        mouseGestures: [{ pattern: '', action: 'toggleSidebar' }],
      });
    });

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGestures).toEqual([{ pattern: '', action: 'toggleSidebar' }]);
    });

    expect(document.body.querySelector('canvas')).toBeNull();

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 18,
      clientY: 18,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it('suppresses context menu while mouse gesture is active and executes matched action', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-active-contextmenu' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    let contextMenuEvent: MouseEvent;
    let dispatched = true;
    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 41,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });

      fireEvent.pointerMove(appRoot, {
        pointerId: 41,
        pointerType: 'mouse',
        clientX: 64,
        clientY: 20,
      });

      contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 64,
        clientY: 20,
      });
      dispatched = appRoot.dispatchEvent(contextMenuEvent);
    });

    expect(dispatched).toBe(false);
    expect(contextMenuEvent!.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(useStore.getState().sidebarOpen).toBe(true);
    });
  });

  it('supports tab navigation and line-jump mouse gesture actions', async () => {
    const firstTab = createFileTab({ id: 'tab-gesture-first', name: 'first.ts', lineCount: 6 });
    const secondTab = createFileTab({ id: 'tab-gesture-second', name: 'second.ts', lineCount: 12 });
    useStore.setState({
      tabs: [firstTab, secondTab],
      activeTabId: secondTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [
            { pattern: 'L', action: 'previousTab' },
            { pattern: 'R', action: 'nextTab' },
            { pattern: 'U', action: 'toTop' },
            { pattern: 'D', action: 'toBottom' },
          ],
        }),
      })
    );

    const navigateEvents: Array<{ tabId: string; line: number; column: number }> = [];
    const navigateListener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ tabId: string; line: number; column: number }>).detail);
    };
    window.addEventListener('rutar:navigate-to-line', navigateListener as EventListener);

    try {
      const { container } = render(React.createElement(App));
      await waitFor(() => {
        expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      });

      const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
      expect(appRoot).toBeTruthy();
      if (!appRoot) {
        return;
      }

      const runGesture = (pointerId: number, startX: number, startY: number, endX: number, endY: number) => {
        act(() => {
          fireEvent.pointerDown(appRoot, {
            pointerId,
            button: 2,
            buttons: 2,
            pointerType: 'mouse',
            clientX: startX,
            clientY: startY,
          });
          fireEvent.pointerMove(appRoot, {
            pointerId,
            pointerType: 'mouse',
            clientX: endX,
            clientY: endY,
          });
          fireEvent.pointerUp(appRoot, {
            pointerId,
            pointerType: 'mouse',
            clientX: endX,
            clientY: endY,
          });
        });
      };

      runGesture(501, 80, 40, 20, 40);
      await waitFor(() => {
        expect(useStore.getState().activeTabId).toBe(firstTab.id);
      });

      runGesture(502, 20, 40, 80, 40);
      await waitFor(() => {
        expect(useStore.getState().activeTabId).toBe(secondTab.id);
      });

      runGesture(503, 40, 80, 40, 20);
      await waitFor(() => {
        expect(navigateEvents).toContainEqual({ tabId: secondTab.id, line: 1, column: 1 });
      });

      runGesture(504, 40, 20, 40, 80);
      await waitFor(() => {
        expect(navigateEvents).toContainEqual({ tabId: secondTab.id, line: 12, column: 1 });
      });
    } finally {
      window.removeEventListener('rutar:navigate-to-line', navigateListener as EventListener);
    }
  });

  it('returns early for previous/next-tab gestures when only one tab exists', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-single-navigation' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [
            { pattern: 'L', action: 'previousTab' },
            { pattern: 'R', action: 'nextTab' },
          ],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    const runGesture = (pointerId: number, startX: number, startY: number, endX: number, endY: number) => {
      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: startX,
          clientY: startY,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId,
          pointerType: 'mouse',
          clientX: endX,
          clientY: endY,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId,
          pointerType: 'mouse',
          clientX: endX,
          clientY: endY,
        });
      });
    };

    runGesture(505, 80, 40, 20, 40);
    runGesture(506, 20, 40, 80, 40);

    await waitFor(() => {
      expect(useStore.getState().activeTabId).toBe(fileTab.id);
    });
  });

  it('ignores unknown runtime gesture action values', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-unknown-action' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });
    useStore.getState().updateSettings({
      isOpen: false,
      wordWrap: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    act(() => {
      useStore.getState().updateSettings({
        mouseGestures: [{ pattern: 'R', action: '__unknown_action__' as any }] as any,
      });
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 507,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 507,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 507,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      const state = useStore.getState();
      expect(state.activeTabId).toBe(fileTab.id);
      expect(state.sidebarOpen).toBe(false);
      expect(state.settings.isOpen).toBe(false);
      expect(state.settings.wordWrap).toBe(false);
    });
  });

  it('supports outline/bookmark/wordwrap/settings mouse gesture actions', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-ui-actions' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      outlineOpen: false,
      bookmarkSidebarOpen: false,
    });
    vi.mocked(detectOutlineType).mockReturnValue('typescript');
    useStore.getState().updateSettings({
      wordWrap: false,
      isOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [
            { pattern: 'R', action: 'toggleOutline' },
            { pattern: 'L', action: 'toggleBookmarkSidebar' },
            { pattern: 'U', action: 'toggleWordWrap' },
            { pattern: 'D', action: 'openSettings' },
          ],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    const runGesture = (pointerId: number, startX: number, startY: number, endX: number, endY: number) => {
      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: startX,
          clientY: startY,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId,
          pointerType: 'mouse',
          clientX: endX,
          clientY: endY,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId,
          pointerType: 'mouse',
          clientX: endX,
          clientY: endY,
        });
      });
    };

    runGesture(511, 20, 20, 80, 20);
    await waitFor(() => {
      expect(useStore.getState().outlineOpen).toBe(true);
    });

    runGesture(512, 80, 20, 20, 20);
    await waitFor(() => {
      expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
    });

    runGesture(513, 40, 80, 40, 20);
    await waitFor(() => {
      expect(useStore.getState().settings.wordWrap).toBe(true);
    });

    runGesture(514, 40, 20, 40, 80);
    await waitFor(() => {
      expect(useStore.getState().settings.isOpen).toBe(true);
    });
  });

  it('supports close-current-tab gesture and creates replacement tab when needed', async () => {
    const targetTab = createFileTab({ id: 'tab-gesture-close-current' });
    const replacementTab = createFileTab({
      id: 'tab-gesture-close-current-replacement',
      name: 'replacement.txt',
      path: 'replacement.txt',
    });
    useStore.setState({
      tabs: [targetTab],
      activeTabId: targetTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
        new_file: async () => replacementTab,
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 521,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 521,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 521,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_files', { ids: [targetTab.id] });
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('new_file', {
        newFileLineEnding: 'LF',
      });
      expect(useStore.getState().tabs.some((tab) => tab.id === replacementTab.id)).toBe(true);
    });
  });

  it('does not create startup tab when close-current leaves other tabs', async () => {
    const firstTab = createFileTab({ id: 'tab-gesture-close-current-first' });
    const activeTab = createFileTab({ id: 'tab-gesture-close-current-active' });
    useStore.setState({
      tabs: [firstTab, activeTab],
      activeTabId: activeTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 528,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 528,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 528,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual([firstTab.id]);
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('new_file', expect.anything());
  });

  it('logs error when close-current gesture fails to create fallback startup tab', async () => {
    const targetTab = createFileTab({ id: 'tab-gesture-close-current-new-file-failed' });
    useStore.setState({
      tabs: [targetTab],
      activeTabId: targetTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
        new_file: async () => {
          throw new Error('gesture-new-file-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { container } = render(React.createElement(App));
      await waitFor(() => {
        expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      });

      const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
      expect(appRoot).toBeTruthy();
      if (!appRoot) {
        return;
      }

      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId: 529,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: 20,
          clientY: 20,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId: 529,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId: 529,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
      });

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to create startup file:',
          expect.objectContaining({ message: 'gesture-new-file-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps tab when close-current gesture save flow fails', async () => {
    const dirtyTab = createFileTab({ id: 'tab-gesture-close-current-save-failed', isDirty: true });
    useStore.setState({
      tabs: [dirtyTab],
      activeTabId: dirtyTab.id,
    });

    vi.mocked(confirmTabClose).mockResolvedValueOnce('save');
    vi.mocked(saveTab).mockResolvedValueOnce(false);
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 531,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 531,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 531,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(confirmTabClose)).toHaveBeenCalledWith(dirtyTab, 'en-US', true);
      expect(vi.mocked(saveTab)).toHaveBeenCalledWith(dirtyTab, expect.any(Function));
      expect(useStore.getState().tabs.some((tab) => tab.id === dirtyTab.id)).toBe(true);
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('close_files', expect.anything());
  });

  it('returns early for close-current gesture when active tab id does not resolve to a tab', async () => {
    const onlyTab = createFileTab({ id: 'tab-gesture-close-current-only' });
    useStore.setState({
      tabs: [onlyTab],
      activeTabId: 'tab-gesture-close-current-missing',
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 525,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 525,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 525,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual([onlyTab.id]);
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('close_files', expect.anything());
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('new_file', expect.anything());
  });

  it('returns early for close-current gesture when there is no active tab id', async () => {
    const onlyTab = createFileTab({ id: 'tab-gesture-close-current-no-active' });
    useStore.setState({
      tabs: [onlyTab],
      activeTabId: null,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeCurrentTab' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 526,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 526,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 526,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual([onlyTab.id]);
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('close_files', expect.anything());
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('new_file', expect.anything());
  });

  it('supports close-other-tabs gesture action', async () => {
    const firstTab = createFileTab({ id: 'tab-gesture-close-others-1' });
    const activeTab = createFileTab({ id: 'tab-gesture-close-others-active' });
    const thirdTab = createFileTab({ id: 'tab-gesture-close-others-3' });
    useStore.setState({
      tabs: [firstTab, activeTab, thirdTab],
      activeTabId: activeTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeOtherTabs' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 522,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 522,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 522,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_files', {
        ids: [firstTab.id, thirdTab.id],
      });
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual([activeTab.id]);
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('new_file', expect.anything());
    });
  });

  it('returns early for close-other-tabs gesture when there are no other tabs', async () => {
    const onlyTab = createFileTab({ id: 'tab-gesture-close-others-none' });
    useStore.setState({
      tabs: [onlyTab],
      activeTabId: onlyTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeOtherTabs' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 527,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 527,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 527,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual([onlyTab.id]);
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('close_files', expect.anything());
  });

  it('supports close-all-tabs gesture action', async () => {
    const firstTab = createFileTab({ id: 'tab-gesture-close-all-1' });
    const secondTab = createFileTab({ id: 'tab-gesture-close-all-2' });
    useStore.setState({
      tabs: [firstTab, secondTab],
      activeTabId: secondTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeAllTabs' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 523,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 523,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 523,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_files', {
        ids: [firstTab.id, secondTab.id],
      });
      expect(useStore.getState().tabs.length).toBe(0);
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('new_file', expect.anything());
    });
  });

  it('logs error when close-all-tabs gesture fails to close files in backend', async () => {
    const firstTab = createFileTab({ id: 'tab-gesture-close-all-backend-failed-1' });
    const secondTab = createFileTab({ id: 'tab-gesture-close-all-backend-failed-2' });
    useStore.setState({
      tabs: [firstTab, secondTab],
      activeTabId: secondTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'closeAllTabs' }],
        }),
        close_files: async () => {
          throw new Error('gesture-close-files-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { container } = render(React.createElement(App));
      await waitFor(() => {
        expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      });

      const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
      expect(appRoot).toBeTruthy();
      if (!appRoot) {
        return;
      }

      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId: 530,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: 20,
          clientY: 20,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId: 530,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId: 530,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
      });

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to close tabs:',
          expect.objectContaining({ message: 'gesture-close-files-failed' })
        );
      });
      expect(useStore.getState().tabs.length).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs error when quit-app gesture cannot close window', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-quit-app-error' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    const closeSpy = vi.fn(async () => {
      throw new Error('close-window-failed');
    });
    vi.mocked(getCurrentWindow).mockReturnValue({
      close: closeSpy,
      onDragDropEvent: vi.fn(async () => vi.fn()),
      onCloseRequested: vi.fn(async () => () => undefined),
    } as never);
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'quitApp' }],
        }),
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { container } = render(React.createElement(App));
      await waitFor(() => {
        expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      });

      const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
      expect(appRoot).toBeTruthy();
      if (!appRoot) {
        return;
      }

      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId: 524,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: 20,
          clientY: 20,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId: 524,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId: 524,
          pointerType: 'mouse',
          clientX: 80,
          clientY: 20,
        });
      });

      await waitFor(() => {
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to close app window:',
          expect.objectContaining({ message: 'close-window-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('suppresses next context menu after gesture finalize and clears gesture timers on unmount', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-suppress-next' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { container, unmount } = render(React.createElement(App));

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      clearTimeoutSpy.mockRestore();
      return;
    }

    let postGestureContextMenu: MouseEvent;
    let dispatched = true;
    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 42,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 12,
        clientY: 12,
      });

      fireEvent.pointerMove(appRoot, {
        pointerId: 42,
        pointerType: 'mouse',
        clientX: 72,
        clientY: 12,
      });

      fireEvent.pointerUp(appRoot, {
        pointerId: 42,
        pointerType: 'mouse',
        clientX: 72,
        clientY: 12,
      });

      postGestureContextMenu = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 72,
        clientY: 12,
      });
      dispatched = appRoot.dispatchEvent(postGestureContextMenu);
    });

    expect(dispatched).toBe(false);
    expect(postGestureContextMenu!.defaultPrevented).toBe(true);

    const clearCallCountBeforeUnmount = clearTimeoutSpy.mock.calls.length;
    unmount();

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCallCountBeforeUnmount);
    clearTimeoutSpy.mockRestore();
  });

  it('allows context menu when no gesture suppression flag is set', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-contextmenu-allowed' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it('resets active gesture state on pointercancel and does not execute action', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-pointercancel' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 77,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 14,
        clientY: 14,
      });

      fireEvent.pointerMove(appRoot, {
        pointerId: 77,
        pointerType: 'mouse',
        clientX: 60,
        clientY: 14,
      });

      fireEvent.pointerCancel(appRoot, {
        pointerId: 77,
        pointerType: 'mouse',
      });
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      clientY: 14,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(useStore.getState().sidebarOpen).toBe(false);
  });

  it('does not suppress active context menu when gesture has no movement', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-no-move-contextmenu' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 91,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 25,
        clientY: 25,
      });
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 25,
      clientY: 25,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(useStore.getState().sidebarOpen).toBe(false);
  });

  it('ignores pointerup and pointercancel when no active gesture exists', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-ignore-up-cancel' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerUp(appRoot, {
        pointerId: 501,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 40,
      });
      fireEvent.pointerCancel(appRoot, {
        pointerId: 501,
        pointerType: 'mouse',
      });
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it('ignores pointermove events from non-active pointer id during gesture tracking', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-ignore-nonactive-pointermove' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 150,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });

      fireEvent.pointerMove(appRoot, {
        pointerId: 999,
        pointerType: 'mouse',
        clientX: 80,
        clientY: 20,
      });
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(useStore.getState().sidebarOpen).toBe(false);
  });

  it('suppresses next context menu for unmatched gesture attempt with movement', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-unmatched-attempt' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 151,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 30,
        clientY: 30,
      });

      fireEvent.pointerMove(appRoot, {
        pointerId: 151,
        pointerType: 'mouse',
        clientX: 30,
        clientY: 70,
      });

      fireEvent.pointerUp(appRoot, {
        pointerId: 151,
        pointerType: 'mouse',
        clientX: 30,
        clientY: 70,
      });
    });

    const postGestureContextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 70,
    });
    const dispatched = appRoot.dispatchEvent(postGestureContextMenu);

    expect(dispatched).toBe(false);
    expect(postGestureContextMenu.defaultPrevented).toBe(true);
    expect(useStore.getState().sidebarOpen).toBe(false);
  });

  it('clears pending gesture clear timers when a new gesture starts', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-clear-pending-timers' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      clearTimeoutSpy.mockRestore();
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 180,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 24,
        clientY: 24,
      });
      fireEvent.pointerMove(appRoot, {
        pointerId: 180,
        pointerType: 'mouse',
        clientX: 84,
        clientY: 24,
      });
      fireEvent.pointerUp(appRoot, {
        pointerId: 180,
        pointerType: 'mouse',
        clientX: 84,
        clientY: 24,
      });
    });

    const clearCallCountBeforeSecondPointerDown = clearTimeoutSpy.mock.calls.length;

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 181,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 28,
        clientY: 28,
      });
    });

    expect(clearTimeoutSpy.mock.calls.length - clearCallCountBeforeSecondPointerDown).toBeGreaterThanOrEqual(2);
    clearTimeoutSpy.mockRestore();
  });

  it('draws gesture trail and clears preview after timer callbacks', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-trail-and-preview-clear' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const previewSequences: string[] = [];
    const previewListener = (event: Event) => {
      previewSequences.push(((event as CustomEvent<{ sequence: string }>).detail?.sequence ?? '').toString());
    };
    window.addEventListener('rutar:gesture-preview', previewListener as EventListener);

    const canvasContext = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      lineCap: 'round',
      lineJoin: 'round',
      lineWidth: 1,
      strokeStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);

    let fakeTimersEnabled = false;
    try {
      const { container } = render(React.createElement(App));
      await waitFor(() => {
        expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      });

      vi.useFakeTimers();
      fakeTimersEnabled = true;

      const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
      expect(appRoot).toBeTruthy();
      if (!appRoot) {
        return;
      }

      act(() => {
        fireEvent.pointerDown(appRoot, {
          pointerId: 210,
          button: 2,
          buttons: 2,
          pointerType: 'mouse',
          clientX: 16,
          clientY: 16,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId: 210,
          pointerType: 'mouse',
          clientX: 60,
          clientY: 16,
        });
        fireEvent.pointerMove(appRoot, {
          pointerId: 210,
          pointerType: 'mouse',
          clientX: 60,
          clientY: 16,
        });
        fireEvent.pointerUp(appRoot, {
          pointerId: 210,
          pointerType: 'mouse',
          clientX: 60,
          clientY: 16,
        });
      });

      act(() => {
        vi.advanceTimersByTime(220);
      });

      expect(canvasContext.beginPath).toHaveBeenCalled();
      expect(canvasContext.lineTo).toHaveBeenCalled();
      expect(canvasContext.clearRect).toHaveBeenCalled();
      expect(previewSequences.some((value) => value.length > 0)).toBe(true);
      expect(previewSequences.filter((value) => value === '').length).toBeGreaterThanOrEqual(2);
    } finally {
      if (fakeTimersEnabled) {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
      getContextSpy.mockRestore();
      window.removeEventListener('rutar:gesture-preview', previewListener as EventListener);
    }
  });

  it('returns early for startup-file creation when tabs already exist in fresh module instance', async () => {
    const existingTab = createFileTab({ id: 'tab-startup-existing' });
    vi.mocked(invoke).mockImplementation(createInvokeHandler());

    vi.resetModules();
    const isolatedModule = await import('./App');
    const IsolatedApp = isolatedModule.default;
    const isolatedStoreModule = await import('@/store/useStore');
    const isolatedUseStore = isolatedStoreModule.useStore;

    isolatedUseStore.setState({
      tabs: [existingTab],
      activeTabId: existingTab.id,
    });

    render(React.createElement(IsolatedApp));

    await waitFor(() => {
      const newFileCalls = vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === 'new_file').length;
      expect(newFileCalls).toBe(0);
    });
  });

  it('adds startup file when no tab exists in fresh module instance', async () => {
    const startupTab = createFileTab({
      id: 'tab-startup-added',
      name: 'startup-added.txt',
      path: 'startup-added.txt',
    });
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        new_file: async () => startupTab,
      })
    );

    vi.resetModules();
    const isolatedModule = await import('./App');
    const IsolatedApp = isolatedModule.default;
    const isolatedStoreModule = await import('@/store/useStore');
    const isolatedUseStore = isolatedStoreModule.useStore;

    isolatedUseStore.setState({
      tabs: [],
      activeTabId: null,
    });

    render(React.createElement(IsolatedApp));

    await waitFor(() => {
      expect(isolatedUseStore.getState().tabs.some((tab) => tab.id === startupTab.id)).toBe(true);
    });
  });

  it('opens startup paths returned by backend on app boot', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => ['C:\\repo\\boot-open.ts'],
        read_dir_if_directory: async () => null,
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(vi.mocked(openFilePaths)).toHaveBeenCalledWith(['C:\\repo\\boot-open.ts']);
    });
  });

  it('falls back to file-open and logs error when startup path directory-check fails', async () => {
    const startupPath = 'C:\\repo\\startup-check-failed.ts';
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => [startupPath],
        read_dir_if_directory: async () => {
          throw new Error('startup-dir-check-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to check incoming directory path: ${startupPath}`,
          expect.objectContaining({ message: 'startup-dir-check-failed' })
        );
      });
      expect(vi.mocked(openFilePaths)).toHaveBeenCalledWith([startupPath]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs error when opening startup incoming file path fails', async () => {
    const startupPath = 'C:\\repo\\startup-open-failed.ts';
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => [startupPath],
        read_dir_if_directory: async () => null,
      })
    );
    vi.mocked(openFilePaths).mockRejectedValueOnce(new Error('startup-open-failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to open incoming path: ${startupPath}`,
          expect.objectContaining({ message: 'startup-open-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs error when loading startup paths fails', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => {
          throw new Error('startup-paths-load-failed');
        },
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to load startup paths:',
          expect.objectContaining({ message: 'startup-paths-load-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('loads startup directory path into folder state without opening file', async () => {
    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => ['C:\\repo\\startup-folder'],
        read_dir_if_directory: async () => [{ name: 'a.ts', path: 'C:\\repo\\startup-folder\\a.ts' }],
      })
    );

    render(React.createElement(App));

    await waitFor(() => {
      expect(useStore.getState().folderPath).toBe('C:\\repo\\startup-folder');
      expect(useStore.getState().folderEntries.length).toBe(1);
    });
    expect(vi.mocked(openFilePaths)).not.toHaveBeenCalled();
  });

  it('does not update windows statuses after unmount when async calls resolve late', async () => {
    const userAgentSpy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows 11');
    const contextMenuDeferred = createDeferred<boolean>();
    const fileAssociationDeferred = createDeferred<{ enabled: boolean; extensions: string[] }>();

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        is_windows_context_menu_registered: async () => contextMenuDeferred.promise,
        get_windows_file_association_status: async () => fileAssociationDeferred.promise,
      })
    );

    try {
      const view = render(React.createElement(App));
      let snapshot: {
        windowsContextMenuEnabled: boolean;
        windowsFileAssociationEnabled: boolean;
        windowsFileAssociationExtensions: string[];
      } | null = null;
      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('is_windows_context_menu_registered');
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_windows_file_association_status', {
          extensions: expect.any(Array),
        });
      });
      snapshot = {
        windowsContextMenuEnabled: useStore.getState().settings.windowsContextMenuEnabled,
        windowsFileAssociationEnabled: useStore.getState().settings.windowsFileAssociationEnabled,
        windowsFileAssociationExtensions: [...useStore.getState().settings.windowsFileAssociationExtensions],
      };

      view.unmount();

      await act(async () => {
        contextMenuDeferred.resolve(true);
        fileAssociationDeferred.resolve({
          enabled: true,
          extensions: ['.md'],
        });
        await Promise.all([contextMenuDeferred.promise, fileAssociationDeferred.promise]);
      });

      const settings = useStore.getState().settings;
      expect(settings.windowsContextMenuEnabled).toBe(snapshot?.windowsContextMenuEnabled);
      expect(settings.windowsFileAssociationEnabled).toBe(snapshot?.windowsFileAssociationEnabled);
      expect(settings.windowsFileAssociationExtensions).toEqual(snapshot?.windowsFileAssociationExtensions);
    } finally {
      userAgentSpy.mockRestore();
    }
  });

  it('loads windows context-menu and file-association statuses', async () => {
    const userAgentSpy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows 11');
    useStore.getState().updateSettings({
      windowsContextMenuEnabled: false,
      windowsFileAssociationEnabled: false,
      windowsFileAssociationExtensions: ['.txt'],
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        is_windows_context_menu_registered: async () => true,
        get_windows_file_association_status: async () => ({
          enabled: true,
          extensions: ['.rs', '.toml'],
        }),
      })
    );

    try {
      render(React.createElement(App));

      await waitFor(() => {
        const settings = useStore.getState().settings;
        expect(settings.windowsContextMenuEnabled).toBe(true);
        expect(settings.windowsFileAssociationEnabled).toBe(true);
        expect(settings.windowsFileAssociationExtensions).toEqual(['.rs', '.toml']);
      });
    } finally {
      userAgentSpy.mockRestore();
    }
  });

  it('logs error when loading windows context-menu status fails', async () => {
    const userAgentSpy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows 11');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        is_windows_context_menu_registered: async () => {
          throw new Error('windows-context-status-failed');
        },
      })
    );

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to read Windows context menu status:',
          expect.objectContaining({ message: 'windows-context-status-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
      userAgentSpy.mockRestore();
    }
  });

  it('logs error when loading windows file-association status fails', async () => {
    const userAgentSpy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows 11');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_windows_file_association_status: async () => {
          throw new Error('windows-file-association-status-failed');
        },
      })
    );

    try {
      render(React.createElement(App));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to read Windows file association status:',
          expect.objectContaining({ message: 'windows-file-association-status-failed' })
        );
      });
    } finally {
      errorSpy.mockRestore();
      userAgentSpy.mockRestore();
    }
  });

  it('stops startup path flow after unmount when openIncomingPaths resolves late', async () => {
    const readDirDeferred = createDeferred<any[] | null>();

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        get_startup_paths: async () => ['C:\\repo\\startup-late.ts'],
        read_dir_if_directory: async () => readDirDeferred.promise,
      })
    );

    const view = render(React.createElement(App));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('read_dir_if_directory', {
        path: 'C:\\repo\\startup-late.ts',
      });
    });

    view.unmount();

    await act(async () => {
      readDirDeferred.resolve(null);
      await readDirDeferred.promise;
    });

    expect(vi.mocked(openFilePaths)).toHaveBeenCalledWith(['C:\\repo\\startup-late.ts']);
  });

  it('ignores invalid gesture-start pointerdown events before activation', async () => {
    const fileTab = createFileTab({ id: 'tab-gesture-invalid-pointerdown' });
    useStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
      sidebarOpen: false,
    });

    vi.mocked(invoke).mockImplementation(
      createInvokeHandler({
        load_config: async () => ({
          language: 'en-US',
          theme: 'light',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 14,
          tabWidth: 4,
          newFileLineEnding: 'LF',
          wordWrap: false,
          doubleClickCloseTab: true,
          showLineNumbers: true,
          highlightCurrentLine: true,
          singleInstanceMode: true,
          rememberWindowState: true,
          recentFiles: [],
          recentFolders: [],
          windowsFileAssociationExtensions: [],
          mouseGesturesEnabled: true,
          mouseGestures: [{ pattern: 'R', action: 'toggleSidebar' }],
        }),
      })
    );

    const { container } = render(React.createElement(App));
    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
    });

    const appRoot = container.querySelector('[data-rutar-app-root="true"]') as HTMLDivElement | null;
    expect(appRoot).toBeTruthy();
    if (!appRoot) {
      return;
    }

    act(() => {
      fireEvent.pointerDown(appRoot, {
        pointerId: 301,
        button: 2,
        buttons: 2,
        pointerType: 'touch',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerDown(appRoot, {
        pointerId: 302,
        button: 0,
        buttons: 1,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerDown(document, {
        pointerId: 303,
        button: 2,
        buttons: 2,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
      });
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
    });
    const dispatched = appRoot.dispatchEvent(contextMenuEvent);

    expect(dispatched).toBe(true);
    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(useStore.getState().sidebarOpen).toBe(false);
  });
});

describe('appTestUtils.detectWindowsPlatform', () => {
  it('returns true for windows user agent', () => {
    const userAgentSpy = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

    expect(appTestUtils.detectWindowsPlatform()).toBe(true);

    userAgentSpy.mockRestore();
  });

  it('returns false for non-windows user agent', () => {
    const userAgentSpy = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)');

    expect(appTestUtils.detectWindowsPlatform()).toBe(false);

    userAgentSpy.mockRestore();
  });
});

describe('appTestUtils.areStringArraysEqual', () => {
  it('returns true when arrays are identical by length and order', () => {
    expect(appTestUtils.areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false when arrays differ by length or order', () => {
    expect(appTestUtils.areStringArraysEqual(['a'], ['a', 'b'])).toBe(false);
    expect(appTestUtils.areStringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

describe('appTestUtils.normalizeLineEnding', () => {
  it('keeps explicit valid line endings unchanged', () => {
    expect(appTestUtils.normalizeLineEnding('CRLF')).toBe('CRLF');
    expect(appTestUtils.normalizeLineEnding('LF')).toBe('LF');
    expect(appTestUtils.normalizeLineEnding('CR')).toBe('CR');
  });

  it('falls back to platform default for unknown values', () => {
    const expected = appTestUtils.detectWindowsPlatform() ? 'CRLF' : 'LF';
    expect(appTestUtils.normalizeLineEnding()).toBe(expected);
    expect(appTestUtils.normalizeLineEnding('UNKNOWN' as never)).toBe(expected);
  });

  it('falls back to CRLF when current platform is windows', () => {
    const userAgentSpy = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Windows 11');

    expect(appTestUtils.normalizeLineEnding('UNKNOWN' as never)).toBe('CRLF');

    userAgentSpy.mockRestore();
  });

  it('falls back to LF when current platform is not windows', () => {
    const userAgentSpy = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Linux x86_64');

    expect(appTestUtils.normalizeLineEnding('UNKNOWN' as never)).toBe('LF');

    userAgentSpy.mockRestore();
  });
});

describe('appTestUtils event dispatchers', () => {
  it('dispatches rutar:force-refresh with expected detail', () => {
    let detail:
      | { tabId: string; lineCount: number; preserveCaret: boolean }
      | undefined;

    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as {
        tabId: string;
        lineCount: number;
        preserveCaret: boolean;
      };
    };

    window.addEventListener('rutar:force-refresh', listener as EventListener);
    appTestUtils.dispatchEditorForceRefresh('tab-1', 42);
    window.removeEventListener('rutar:force-refresh', listener as EventListener);

    expect(detail).toEqual({
      tabId: 'tab-1',
      lineCount: 42,
      preserveCaret: false,
    });
  });

  it('dispatches rutar:document-updated with tab id', () => {
    let detail: { tabId: string } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as { tabId: string };
    };

    window.addEventListener('rutar:document-updated', listener as EventListener);
    appTestUtils.dispatchDocumentUpdated('tab-doc');
    window.removeEventListener('rutar:document-updated', listener as EventListener);

    expect(detail).toEqual({ tabId: 'tab-doc' });
  });

  it('dispatches rutar:navigate-to-line with fixed column', () => {
    let detail: { tabId: string; line: number; column: number } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as {
        tabId: string;
        line: number;
        column: number;
      };
    };

    window.addEventListener('rutar:navigate-to-line', listener as EventListener);
    appTestUtils.dispatchNavigateToLine('tab-nav', 7);
    window.removeEventListener('rutar:navigate-to-line', listener as EventListener);

    expect(detail).toEqual({
      tabId: 'tab-nav',
      line: 7,
      column: 1,
    });
  });

  it('dispatches rutar:gesture-preview with sequence', () => {
    let detail: { sequence: string } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as { sequence: string };
    };

    window.addEventListener('rutar:gesture-preview', listener as EventListener);
    appTestUtils.dispatchGesturePreview('RDLU');
    window.removeEventListener('rutar:gesture-preview', listener as EventListener);

    expect(detail).toEqual({ sequence: 'RDLU' });
  });
});
