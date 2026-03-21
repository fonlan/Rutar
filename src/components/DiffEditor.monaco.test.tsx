import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import { DiffEditor } from './DiffEditor';

const monacoDiffMockState = {
  sourceChangeListener: null as null | ((event: unknown) => void),
  targetChangeListener: null as null | ((event: unknown) => void),
  sourceEditor: null as any,
  targetEditor: null as any,
  createCallCount: 0,
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('monaco-editor', () => {
  const createModel = () => {
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
    };
    return model;
  };

  const buildEditor = (side: 'source' | 'target') => {
    const model = createModel();
    const editor = {
      updateOptions: vi.fn(),
      onDidChangeModelContent: vi.fn((listener: (event: unknown) => void) => {
        if (side === 'source') {
          monacoDiffMockState.sourceChangeListener = listener;
        } else {
          monacoDiffMockState.targetChangeListener = listener;
        }
        return { dispose: vi.fn() };
      }),
      onDidFocusEditorWidget: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
      setModel: vi.fn(),
      getModel: vi.fn(() => model),
      getSelection: vi.fn(() => ({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        isEmpty: () => false,
      })),
      getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
      executeEdits: vi.fn(),
      focus: vi.fn(),
      dispose: vi.fn(),
    };
    return editor;
  };

  return {
    Uri: {
      parse: (value: string) => ({ toString: () => value }),
    },
    editor: {
      create: vi.fn(() => {
        monacoDiffMockState.createCallCount += 1;
        if (monacoDiffMockState.createCallCount % 2 === 1) {
          const sourceEditor = buildEditor('source');
          monacoDiffMockState.sourceEditor = sourceEditor;
          return sourceEditor;
        }
        const targetEditor = buildEditor('target');
        monacoDiffMockState.targetEditor = targetEditor;
        return targetEditor;
      }),
      createModel: vi.fn(() => createModel()),
      getModel: vi.fn(() => null),
      setModelLanguage: vi.fn((model: { languageId: string }, languageId: string) => {
        model.languageId = languageId;
      }),
      setTheme: vi.fn(),
    },
  };
});

function createFileTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: 'tab-diff-side',
    name: 'side.ts',
    path: 'C:\\repo\\side.ts',
    encoding: 'UTF-8',
    lineEnding: 'LF',
    lineCount: 1,
    largeFileMode: false,
    tabType: 'file',
    ...overrides,
  };
}

function createDiffPayload(overrides: Partial<DiffTabPayload> = {}): DiffTabPayload {
  return {
    sourceTabId: 'tab-source',
    targetTabId: 'tab-target',
    sourceName: 'source.ts',
    targetName: 'target.ts',
    sourcePath: 'C:\\repo\\source.ts',
    targetPath: 'C:\\repo\\target.ts',
    alignedSourceLines: ['a'],
    alignedTargetLines: ['b'],
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

describe('DiffEditor (Monaco)', () => {
  const initialStoreState = useStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialStoreState, true);
    monacoDiffMockState.sourceChangeListener = null;
    monacoDiffMockState.targetChangeListener = null;
    monacoDiffMockState.sourceEditor = null;
    monacoDiffMockState.targetEditor = null;
    monacoDiffMockState.createCallCount = 0;

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'line-1';
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      if (command === 'undo') {
        return { lineCount: 1, cursorLine: 1, cursorColumn: 1 };
      }
      return undefined;
    });
  });

  it('loads source and target pane text through backend command', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts' });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };

    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });

    render(<DiffEditor tab={diffTab} />);

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_document_text', { id: sourceTab.id });
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_document_text', { id: targetTab.id });
    });
  });

  it('keeps find widget overlay options without adding top spacer', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts' });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
      expect(monacoDiffMockState.sourceEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          find: {
            addExtraSpaceOnTop: false,
          },
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          find: {
            addExtraSpaceOnTop: false,
          },
        })
      );
    });
  });
  it('handles toolbar diff undo event', async () => {
    const sourceTab = createFileTab({ id: 'tab-source' });
    const targetTab = createFileTab({ id: 'tab-target' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };

    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });

    render(<DiffEditor tab={diffTab} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('rutar:diff-history-action', {
          detail: {
            diffTabId: diffTab.id,
            panel: 'source',
            action: 'undo',
          },
        })
      );
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('undo', { id: sourceTab.id });
    });
  });

  it('does not recreate pane editors when toggling wordWrap', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts' });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };

    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
      settings: {
        ...useStore.getState().settings,
        wordWrap: false,
      },
    });

    render(<DiffEditor tab={diffTab} />);

    await waitFor(() => {
      expect(monacoDiffMockState.createCallCount).toBe(2);
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
    });

    act(() => {
      useStore.getState().updateSettings({ wordWrap: true });
    });

    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          wordWrap: 'on',
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          wordWrap: 'on',
        })
      );
    });

    expect(monacoDiffMockState.createCallCount).toBe(2);
  });
});
