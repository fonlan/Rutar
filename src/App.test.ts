import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { detectOutlineType, loadOutline } from '@/lib/outline';
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

    vi.mocked(listen).mockImplementation(async () => vi.fn());
    vi.mocked(ask).mockResolvedValue(false);
    vi.mocked(detectOutlineType).mockReturnValue(null);
    vi.mocked(loadOutline).mockResolvedValue([]);
    vi.mocked(invoke).mockImplementation(createInvokeHandler());
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
