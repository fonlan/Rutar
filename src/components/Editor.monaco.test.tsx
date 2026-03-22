import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { EDITOR_FIND_OPEN_EVENT } from '@/lib/editorFind';
import { type FileTab, useStore } from '@/store/useStore';
import { Editor } from './Editor';

const monacoMockState = vi.hoisted(() => ({
  editorCreate: vi.fn(),
  editorInstance: null as any,
  model: null as any,
  findActionRun: vi.fn(async () => undefined),
  changeListener: null as null | ((event: unknown) => void),
  cursorListener: null as null | ((event: unknown) => void),
  mouseDownListener: null as null | ((event: unknown) => void),
  contextMenuListener: null as null | ((event: unknown) => void),
  selection: null as any,
  mouseTargetType: {
    GUTTER_LINE_NUMBERS: 2,
    CONTENT_TEXT: 6,
    SCROLLBAR: 11,
    OVERVIEW_RULER: 10,
    OUTSIDE_EDITOR: 13,
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('monaco-editor', () => {
  const createSelection = (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number
  ) => ({
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
    isEmpty: () => startLineNumber === endLineNumber && startColumn === endColumn,
  });

  const model = {
    value: '',
    languageId: 'plaintext',
    getValue() {
      return this.value;
    },
    setValue(next: string) {
      this.value = next;
    },
    isDisposed() {
      return false;
    },
    dispose: vi.fn(),
    getLanguageId() {
      return this.languageId;
    },
    getLineContent(lineNumber: number) {
      const lines = this.value.split('\n');
      return lines[Math.max(1, lineNumber) - 1] ?? '';
    },
    getLineCount() {
      return this.value.split('\n').length;
    },
    getLineMaxColumn(lineNumber: number) {
      return this.getLineContent(lineNumber).length + 1;
    },
  };

  monacoMockState.selection = createSelection(1, 1, 1, 1);

  const editorInstance = {
    updateOptions: vi.fn(),
    onDidChangeModelContent: vi.fn((listener: (event: unknown) => void) => {
      monacoMockState.changeListener = listener;
      return {
        dispose: vi.fn(),
      };
    }),
    onDidChangeCursorPosition: vi.fn((listener: (event: unknown) => void) => {
      monacoMockState.cursorListener = listener;
      return {
        dispose: vi.fn(),
      };
    }),
    onMouseDown: vi.fn((listener: (event: unknown) => void) => {
      monacoMockState.mouseDownListener = listener;
      return {
        dispose: vi.fn(),
      };
    }),
    onContextMenu: vi.fn((listener: (event: unknown) => void) => {
      monacoMockState.contextMenuListener = listener;
      return {
        dispose: vi.fn(),
      };
    }),
    setModel: vi.fn(),
    getModel: vi.fn(() => model),
    saveViewState: vi.fn(() => null),
    restoreViewState: vi.fn(),
    setPosition: vi.fn(),
    setSelection: vi.fn((selection: any) => {
      monacoMockState.selection = createSelection(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn
      );
    }),
    revealPositionInCenter: vi.fn(),
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    revealLineInCenterIfOutsideViewport: vi.fn(),
    focus: vi.fn(),
    getAction: vi.fn((actionId: string) => {
      if (actionId === 'actions.find') {
        return {
          run: monacoMockState.findActionRun,
        };
      }
      return null;
    }),
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getSelection: vi.fn(() => monacoMockState.selection),
    executeEdits: vi.fn(),
    deltaDecorations: vi.fn((_oldDecorations: string[], nextDecorations: unknown[]) =>
      nextDecorations.map((_item, index) => `decoration-${index}`)
    ),
    dispose: vi.fn(),
  };

  monacoMockState.editorInstance = editorInstance;
  monacoMockState.model = model;
  monacoMockState.editorCreate = vi.fn(() => editorInstance);

  return {
    editor: {
      create: monacoMockState.editorCreate,
      createModel: vi.fn(() => model),
      setModelLanguage: vi.fn((targetModel: { languageId: string }, languageId: string) => {
        targetModel.languageId = languageId;
      }),
      setTheme: vi.fn(),
      getModel: vi.fn(() => null),
      MouseTargetType: monacoMockState.mouseTargetType,
    },
  };
});

function createTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: 'tab-monaco-editor',
    name: 'file.ts',
    path: 'C:\\repo\\file.ts',
    encoding: 'UTF-8',
    lineEnding: 'LF',
    lineCount: 1,
    largeFileMode: false,
    tabType: 'file',
    ...overrides,
  };
}

describe('Editor (Monaco)', () => {
  const initialStoreState = useStore.getState();
  const openUrlMock = vi.mocked(openUrl);

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialStoreState, true);
    monacoMockState.changeListener = null;
    monacoMockState.cursorListener = null;
    monacoMockState.mouseDownListener = null;
    monacoMockState.contextMenuListener = null;
    monacoMockState.selection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      isEmpty: () => true,
    };
    monacoMockState.model.value = '';
    monacoMockState.findActionRun.mockReset();
    monacoMockState.findActionRun.mockResolvedValue(undefined);

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'alpha';
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      return undefined;
    });
  });

  it('loads document text on bootstrap', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_document_text', { id: tab.id });
    });
    expect(monacoMockState.editorCreate).toHaveBeenCalled();
    expect(monacoMockState.editorCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineDecorationsWidth: 10,
        renderLineHighlight: 'line',
        find: {
          addExtraSpaceOnTop: false,
        },
      })
    );
  });

  it('handles navigate event and moves cursor', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.editorCreate).toHaveBeenCalled();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:navigate-to-line', {
          detail: { tabId: tab.id, line: 5, column: 3 },
        })
      );
    });

    expect(monacoMockState.editorInstance.setPosition).toHaveBeenCalledWith({
      lineNumber: 5,
      column: 3,
    });
  });

  it('keeps undo/redo force-refresh cursor restore when document-updated skips editor refresh', async () => {
    const tab = createTab({ id: 'tab-force-refresh-skip' });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    render(<Editor tab={tab} />);
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_document_text', { id: tab.id });
    });
    monacoMockState.editorInstance.setPosition.mockClear();
    vi.mocked(invoke).mockClear();
    const refreshResolvers: Array<(value: string) => void> = [];
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return await new Promise<string>((resolve) => {
          refreshResolvers.push(resolve);
        });
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      return undefined;
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:force-refresh', {
          detail: {
            tabId: tab.id,
            restoreCursorLine: 4,
            restoreCursorColumn: 7,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('rutar:document-updated', {
          detail: {
            tabId: tab.id,
            skipEditorRefresh: true,
          },
        })
      );
    });
    expect(refreshResolvers).toHaveLength(1);
    act(() => {
      refreshResolvers[0]?.('beta');
    });
    await waitFor(() => {
      expect(monacoMockState.editorInstance.setPosition).toHaveBeenCalledWith({
        lineNumber: 4,
        column: 7,
      });
    });
  });
  it('opens Monaco find widget on editor-find-open event', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    render(<Editor tab={tab} />);
    await waitFor(() => {
      expect(monacoMockState.editorCreate).toHaveBeenCalled();
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(EDITOR_FIND_OPEN_EVENT, {
          detail: { tabId: tab.id },
        })
      );
    });
    await waitFor(() => {
      expect(monacoMockState.editorInstance.getAction).toHaveBeenCalledWith('actions.find');
      expect(monacoMockState.findActionRun).toHaveBeenCalledTimes(1);
    });
  });
  it('syncs model edits to backend command', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.changeListener).toBeTruthy();
    });

    act(() => {
      monacoMockState.changeListener?.({
        changes: [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            },
            text: 'b',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'apply_text_edits_by_line_column',
        expect.objectContaining({
          id: tab.id,
        })
      );
    });
  });

  it('does not recreate Monaco editor when toggling wordWrap', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        wordWrap: false,
      },
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
      expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useStore.getState().updateSettings({ wordWrap: true });
    });

    await waitFor(() => {
      expect(monacoMockState.editorInstance.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          wordWrap: 'on',
        })
      );
    });

    expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
    expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
  });

  it('does not recreate Monaco editor when toggling minimap', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        minimap: true,
      },
    });
    render(<Editor tab={tab} />);
    await waitFor(() => {
      expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
      expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useStore.getState().updateSettings({ minimap: false });
    });
    await waitFor(() => {
      expect(monacoMockState.editorInstance.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          minimap: {
            enabled: false,
          },
        })
      );
    });
    expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
    expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
  });
  it('does not recreate Monaco editor when toggling current line highlight', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        highlightCurrentLine: true,
      },
    });
    render(<Editor tab={tab} />);
    await waitFor(() => {
      expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
      expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useStore.getState().updateSettings({ highlightCurrentLine: false });
    });
    await waitFor(() => {
      expect(monacoMockState.editorInstance.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          renderLineHighlight: 'none',
        })
      );
    });
    expect(monacoMockState.editorCreate).toHaveBeenCalledTimes(1);
    expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
  });
  it('does not rebind model when cursor position updates', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.cursorListener).toBeTruthy();
      expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
    });

    act(() => {
      monacoMockState.cursorListener?.({
        position: {
          lineNumber: 2,
          column: 4,
        },
      });
    });

    await waitFor(() => {
      expect(useStore.getState().cursorPositionByTab[tab.id]).toEqual({ line: 2, column: 4 });
    });

    expect(monacoMockState.editorInstance.setModel).toHaveBeenCalledTimes(1);
  });

  it('shows disabled copy/cut/delete in context menu when selection is empty', async () => {
    const tab = createTab({ id: 'tab-monaco-context-disabled' });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.contextMenuListener).toBeTruthy();
    });

    act(() => {
      monacoMockState.contextMenuListener?.({
        event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          browserEvent: {
            clientX: 160,
            clientY: 180,
          },
        },
        target: {
          type: monacoMockState.mouseTargetType.CONTENT_TEXT,
          position: {
            lineNumber: 1,
            column: 1,
          },
        },
      });
    });

    expect(await screen.findByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cut' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Paste' })).toBeEnabled();
  });

  it('runs cleanup action from context menu', async () => {
    const tab = createTab({ id: 'tab-monaco-context-cleanup', lineCount: 4 });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'alpha\n\nbeta\n';
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      if (command === 'cleanup_document') {
        return 2;
      }
      return undefined;
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.contextMenuListener).toBeTruthy();
    });

    act(() => {
      monacoMockState.contextMenuListener?.({
        event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          browserEvent: {
            clientX: 220,
            clientY: 200,
          },
        },
        target: {
          type: monacoMockState.mouseTargetType.CONTENT_TEXT,
          position: {
            lineNumber: 1,
            column: 1,
          },
        },
      });
    });

    const editLabel = await screen.findByText('Edit');
    fireEvent.mouseEnter(editLabel.closest('div') as Element);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Empty Lines' }));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('cleanup_document', {
        id: tab.id,
        action: 'remove_empty_lines',
      });
    });
  });

  it('adds bookmark from line-number context menu action', async () => {
    const tab = createTab({ id: 'tab-monaco-line-bookmark', lineCount: 4 });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.contextMenuListener).toBeTruthy();
    });
    monacoMockState.model.setValue('one\ntwo\nthree\n');

    act(() => {
      monacoMockState.contextMenuListener?.({
        event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          browserEvent: {
            clientX: 150,
            clientY: 180,
          },
        },
        target: {
          type: monacoMockState.mouseTargetType.GUTTER_LINE_NUMBERS,
          position: {
            lineNumber: 3,
            column: 1,
          },
        },
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Add Current Line to Bookmark' }));
    expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([3]);
    expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
  });

  it('toggles bookmark with line-number double click and applies gutter highlight decoration', async () => {
    const tab = createTab({ id: 'tab-monaco-line-double-click-bookmark', lineCount: 5 });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: false,
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.mouseDownListener).toBeTruthy();
    });
    monacoMockState.model.setValue('one\ntwo\nthree\nfour\nfive\n');

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    act(() => {
      monacoMockState.mouseDownListener?.({
        event: {
          leftButton: true,
          ctrlKey: false,
          metaKey: false,
          detail: 2,
          browserEvent: {
            detail: 2,
          },
          preventDefault,
          stopPropagation,
        },
        target: {
          type: monacoMockState.mouseTargetType.GUTTER_LINE_NUMBERS,
          position: {
            lineNumber: 4,
            column: 1,
          },
        },
      });
    });

    await waitFor(() => {
      expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([4]);
      expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();

    await waitFor(() => {
      expect(monacoMockState.editorInstance.deltaDecorations).toHaveBeenCalled();
      const lastCall = monacoMockState.editorInstance.deltaDecorations.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual([
        expect.objectContaining({
          options: expect.objectContaining({
            lineNumberClassName: 'rutar-bookmark-line-number-highlight',
          }),
        }),
      ]);
      const firstDecoration = (lastCall?.[1] as Array<{ options?: Record<string, unknown> }> | undefined)?.[0];
      expect(firstDecoration?.options?.linesDecorationsClassName).toBeUndefined();
    });
  });

  it('removes bookmark when double-clicking a bookmarked line number again', async () => {
    const tab = createTab({ id: 'tab-monaco-line-double-click-remove', lineCount: 4 });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.mouseDownListener).toBeTruthy();
    });
    monacoMockState.model.setValue('one\ntwo\nthree\nfour\n');

    const triggerDoubleClick = () => {
      monacoMockState.mouseDownListener?.({
        event: {
          leftButton: true,
          ctrlKey: false,
          metaKey: false,
          detail: 2,
          browserEvent: {
            detail: 2,
          },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
        target: {
          type: monacoMockState.mouseTargetType.GUTTER_LINE_NUMBERS,
          position: {
            lineNumber: 2,
            column: 1,
          },
        },
      });
    };

    act(() => {
      triggerDoubleClick();
    });
    await waitFor(() => {
      expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([2]);
    });

    act(() => {
      triggerDoubleClick();
    });
    await waitFor(() => {
      expect(useStore.getState().bookmarksByTab[tab.id]).toBeUndefined();
    });

    await waitFor(() => {
      const lastCall = monacoMockState.editorInstance.deltaDecorations.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual([]);
    });
  });

  it('opens http hyperlink on Ctrl/Cmd+click', async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'Visit https://example.com/docs.';
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      return undefined;
    });

    render(<Editor tab={tab} />);

    await waitFor(() => {
      expect(monacoMockState.mouseDownListener).toBeTruthy();
    });
    monacoMockState.model.setValue('Visit https://example.com/docs.');

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    act(() => {
      monacoMockState.mouseDownListener?.({
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault,
          stopPropagation,
        },
        target: {
          position: {
            lineNumber: 1,
            column: 12,
          },
        },
      });
    });

    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith('https://example.com/docs');
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });
});
