import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { type FileTab, useStore } from '@/store/useStore';
import { Editor } from './Editor';

const monacoMockState = vi.hoisted(() => ({
  editorCreate: vi.fn(),
  editorInstance: null as any,
  model: null as any,
  changeListener: null as null | ((event: unknown) => void),
  cursorListener: null as null | ((event: unknown) => void),
  mouseDownListener: null as null | ((event: unknown) => void),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('monaco-editor', () => {
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
    getLanguageId() {
      return this.languageId;
    },
    getLineContent(lineNumber: number) {
      const lines = this.value.split('\n');
      return lines[Math.max(1, lineNumber) - 1] ?? '';
    },
  };

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
    setModel: vi.fn(),
    getModel: vi.fn(() => model),
    saveViewState: vi.fn(() => null),
    restoreViewState: vi.fn(),
    setPosition: vi.fn(),
    revealPositionInCenter: vi.fn(),
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    focus: vi.fn(),
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getSelection: vi.fn(() => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      isEmpty: () => false,
    })),
    executeEdits: vi.fn(),
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
    monacoMockState.model.value = '';

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
