import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import { DiffEditor } from './DiffEditor';
import type { LineDiffComparisonResult } from './diffEditor.types';

const monacoDiffMockState = {
  sourceChangeListener: null as null | ((event: unknown) => void),
  targetChangeListener: null as null | ((event: unknown) => void),
  sourceContextMenuListener: null as null | ((event: unknown) => void),
  targetContextMenuListener: null as null | ((event: unknown) => void),
  sourceScrollListener: null as null | (() => void),
  targetScrollListener: null as null | (() => void),
  sourceContentSizeListener: null as null | (() => void),
  targetContentSizeListener: null as null | (() => void),
  sourceViewZoneHistory: [] as Array<Array<{ afterLineNumber: number; heightInLines: number }>>,
  targetViewZoneHistory: [] as Array<Array<{ afterLineNumber: number; heightInLines: number }>>,
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
      getLineCount() {
        return Math.max(1, this.value.split('\n').length);
      },
      getValueInRange() {
        return this.value;
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
    let model = createModel();
    let scrollTop = 0;
    let nextZoneId = 1;
    const existingZoneIds = new Set<string>();
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
      onDidScrollChange: vi.fn((listener: () => void) => {
        if (side === 'source') {
          monacoDiffMockState.sourceScrollListener = listener;
        } else {
          monacoDiffMockState.targetScrollListener = listener;
        }
        return { dispose: vi.fn() };
      }),
      onDidContentSizeChange: vi.fn((listener: () => void) => {
        if (side === 'source') {
          monacoDiffMockState.sourceContentSizeListener = listener;
        } else {
          monacoDiffMockState.targetContentSizeListener = listener;
        }
        return { dispose: vi.fn() };
      }),
      onContextMenu: vi.fn((listener: (event: unknown) => void) => {
        if (side === 'source') {
          monacoDiffMockState.sourceContextMenuListener = listener;
        } else {
          monacoDiffMockState.targetContextMenuListener = listener;
        }
        return { dispose: vi.fn() };
      }),
      setModel: vi.fn((nextModel: any) => {
        model = nextModel;
      }),
      getModel: vi.fn(() => model),
      deltaDecorations: vi.fn((_old: string[], decorations: unknown[]) =>
        decorations.map((__, index) => `${side}-decoration-${index}`)
      ),
      changeViewZones: vi.fn((callback: (accessor: {
        addZone: (zone: { afterLineNumber: number; heightInLines: number }) => string;
        removeZone: (id: string) => void;
      }) => void) => {
        const added: Array<{ afterLineNumber: number; heightInLines: number }> = [];
        callback({
          addZone: (zone: { afterLineNumber: number; heightInLines: number }) => {
            const zoneId = `${side}-zone-${nextZoneId}`;
            nextZoneId += 1;
            existingZoneIds.add(zoneId);
            added.push({
              afterLineNumber: zone.afterLineNumber,
              heightInLines: zone.heightInLines,
            });
            return zoneId;
          },
          removeZone: (id: string) => {
            existingZoneIds.delete(id);
          },
        });
        if (added.length > 0) {
          if (side === 'source') {
            monacoDiffMockState.sourceViewZoneHistory.push(added);
          } else {
            monacoDiffMockState.targetViewZoneHistory.push(added);
          }
        }
      }),
      getLayoutInfo: vi.fn(() => ({ height: 320 })),
      getScrollHeight: vi.fn(() => 1200),
      getScrollTop: vi.fn(() => scrollTop),
      setScrollTop: vi.fn((nextTop: number) => {
        scrollTop = nextTop;
      }),
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
    Range: class MockRange {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
      constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
        this.startLineNumber = startLineNumber;
        this.startColumn = startColumn;
        this.endLineNumber = endLineNumber;
        this.endColumn = endColumn;
      }
    },
    Uri: {
      parse: (value: string) => ({ toString: () => value }),
    },
    editor: {
      MouseTargetType: {
        CONTENT_TEXT: 6,
        GUTTER_LINE_NUMBERS: 2,
        GUTTER_GLYPH_MARGIN: 3,
        SCROLLBAR: 11,
        OVERVIEW_RULER: 10,
        OUTSIDE_EDITOR: 13,
      },
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

function openPaneContextMenu(side: 'source' | 'target') {
  const listener = side === 'source'
    ? monacoDiffMockState.sourceContextMenuListener
    : monacoDiffMockState.targetContextMenuListener;
  expect(listener).toBeTruthy();
  act(() => {
    listener?.({
      target: {
        type: 6,
      },
      event: {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        browserEvent: {
          clientX: 120,
          clientY: 96,
        },
      },
    });
  });
}
describe('DiffEditor (Monaco)', () => {
  const initialStoreState = useStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialStoreState, true);
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        language: 'en-US',
      },
    });
    monacoDiffMockState.sourceChangeListener = null;
    monacoDiffMockState.targetChangeListener = null;
    monacoDiffMockState.sourceContextMenuListener = null;
    monacoDiffMockState.targetContextMenuListener = null;
    monacoDiffMockState.sourceScrollListener = null;
    monacoDiffMockState.targetScrollListener = null;
    monacoDiffMockState.sourceContentSizeListener = null;
    monacoDiffMockState.targetContentSizeListener = null;
    monacoDiffMockState.sourceViewZoneHistory = [];
    monacoDiffMockState.targetViewZoneHistory = [];
    monacoDiffMockState.sourceEditor = null;
    monacoDiffMockState.targetEditor = null;
    monacoDiffMockState.createCallCount = 0;

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'line-1';
      }
      if (command === 'compare_documents_by_line') {
        return {
          alignedSourceLines: ['line-1'],
          alignedTargetLines: ['line-1'],
          alignedSourcePresent: [true],
          alignedTargetPresent: [true],
          diffLineNumbers: [],
          sourceDiffLineNumbers: [],
          targetDiffLineNumbers: [],
          alignedDiffKinds: [null],
          sourceLineCount: 1,
          targetLineCount: 1,
          alignedLineCount: 1,
        };
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

  it('refreshes diff metadata after source pane edits', async () => {
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
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('compare_documents_by_line', {
        sourceId: sourceTab.id,
        targetId: targetTab.id,
      });
    });

    const initialCompareCalls = vi.mocked(invoke).mock.calls.filter(
      ([command]) => command === 'compare_documents_by_line'
    ).length;

    act(() => {
      monacoDiffMockState.sourceChangeListener?.({
        changes: [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            },
            text: 'x',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'apply_text_edits_by_line_column',
        expect.objectContaining({
          id: sourceTab.id,
        })
      );
    });

    await waitFor(() => {
      const latestCompareCalls = vi.mocked(invoke).mock.calls.filter(
        ([command]) => command === 'compare_documents_by_line'
      ).length;
      expect(latestCompareCalls).toBeGreaterThan(initialCompareCalls);
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
          lineDecorationsWidth: 10,
          renderLineHighlight: 'none',
          scrollbar: expect.objectContaining({
            vertical: 'hidden',
            verticalScrollbarSize: 0,
          }),
          find: {
            addExtraSpaceOnTop: false,
          },
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          lineDecorationsWidth: 10,
          renderLineHighlight: 'none',
          scrollbar: expect.objectContaining({
            vertical: 'hidden',
            verticalScrollbarSize: 0,
          }),
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

  it('enables each header save button only when the corresponding pane is dirty', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts', isDirty: false });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts', isDirty: true });
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
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons).toHaveLength(2);
      expect(saveButtons[0]).toBeDisabled();
      expect(saveButtons[1]).toBeEnabled();
    });
    act(() => {
      useStore.getState().updateTab(sourceTab.id, { isDirty: true });
    });
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons[0]).toBeEnabled();
      expect(saveButtons[1]).toBeEnabled();
    });
    act(() => {
      useStore.getState().updateTab(targetTab.id, { isDirty: false });
    });
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons[0]).toBeEnabled();
      expect(saveButtons[1]).toBeDisabled();
    });
  });
  it('only saves the dirty pane when clicking diff header save buttons', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts', isDirty: false });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts', isDirty: true });
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
    const saveButtons = await screen.findAllByRole('button', { name: 'Save' });
    expect(saveButtons[0]).toBeDisabled();
    expect(saveButtons[1]).toBeEnabled();
    fireEvent.click(saveButtons[0]);
    fireEvent.click(saveButtons[1]);
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('save_file', { id: targetTab.id });
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('save_file', { id: sourceTab.id });
  });
  it('does not recreate pane editors when toggling minimap', async () => {
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
        minimap: true,
      },
    });

    render(<DiffEditor tab={diffTab} />);

    await waitFor(() => {
      expect(monacoDiffMockState.createCallCount).toBe(2);
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
    });

    act(() => {
      useStore.getState().updateSettings({ minimap: false });
    });

    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          minimap: {
            enabled: false,
          },
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          minimap: {
            enabled: false,
          },
        })
      );
    });

    expect(monacoDiffMockState.createCallCount).toBe(2);
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
  it('keeps diff pane current line highlight disabled when toggling setting', async () => {
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
        highlightCurrentLine: true,
      },
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      expect(monacoDiffMockState.createCallCount).toBe(2);
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
      expect(monacoDiffMockState.sourceEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          renderLineHighlight: 'none',
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          renderLineHighlight: 'none',
        })
      );
    });
    act(() => {
      useStore.getState().updateSettings({ highlightCurrentLine: false });
    });
    act(() => {
      useStore.getState().updateSettings({ highlightCurrentLine: true });
    });
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.updateOptions).not.toHaveBeenCalledWith(
        expect.objectContaining({
          renderLineHighlight: 'line',
        })
      );
      expect(monacoDiffMockState.targetEditor.updateOptions).not.toHaveBeenCalledWith(
        expect.objectContaining({
          renderLineHighlight: 'line',
        })
      );
    });
    expect(monacoDiffMockState.createCallCount).toBe(2);
  });

  it('shows diff context menu items as copy cut paste and copy-to-other-side', async () => {
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
    });
    openPaneContextMenu('source');
    let menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'Copy',
      'Cut',
      'Paste',
      'Copy to Right',
    ]);
    openPaneContextMenu('target');
    menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'Copy',
      'Cut',
      'Paste',
      'Copy to Left',
    ]);
  });
  it('copies rows to the other pane from diff context menu action', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts', lineCount: 1 });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts', lineCount: 1 });
    const initialDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1'],
      alignedTargetLines: ['right-1'],
      alignedSourcePresent: [true],
      alignedTargetPresent: [true],
      diffLineNumbers: [1],
      sourceDiffLineNumbers: [1],
      targetDiffLineNumbers: [1],
      alignedDiffKinds: ['modify'],
      sourceLineCount: 1,
      targetLineCount: 1,
      alignedLineCount: 1,
    };
    const copiedDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1'],
      alignedTargetLines: ['left-1'],
      alignedSourcePresent: [true],
      alignedTargetPresent: [true],
      diffLineNumbers: [],
      sourceDiffLineNumbers: [],
      targetDiffLineNumbers: [],
      alignedDiffKinds: [null],
      sourceLineCount: 1,
      targetLineCount: 1,
      alignedLineCount: 1,
    };
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'get_document_text') {
        const payload = (args ?? {}) as { id?: string };
        return payload.id === sourceTab.id ? 'left-1' : 'right-1';
      }
      if (command === 'compare_documents_by_line') {
        return initialDiff;
      }
      if (command === 'apply_aligned_diff_panel_copy') {
        return {
          changed: true,
          lineDiff: copiedDiff,
        };
      }
      if (command === 'apply_aligned_diff_edit') {
        return {
          lineDiff: copiedDiff,
          sourceIsDirty: false,
          targetIsDirty: true,
        };
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 1;
      }
      if (command === 'undo') {
        return { lineCount: 1, cursorLine: 1, cursorColumn: 1 };
      }
      return undefined;
    });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(initialDiff),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
    });
    monacoDiffMockState.sourceEditor.getSelection.mockReturnValue({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      isEmpty: () => false,
    });
    monacoDiffMockState.sourceEditor.getPosition.mockReturnValue({
      lineNumber: 1,
      column: 1,
    });
    openPaneContextMenu('source');
    const menu = await screen.findByRole('menu');
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Copy to Right' }));
    });
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'apply_aligned_diff_panel_copy',
        expect.objectContaining({
          fromSide: 'source',
          toSide: 'target',
          startRowIndex: 0,
          endRowIndex: 0,
        })
      );
    });
  });
  it('copies selected source rows to the right pane at the same aligned rows', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts', lineCount: 3 });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts', lineCount: 2 });
    const initialDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1', 'left-2', 'left-3'],
      alignedTargetLines: ['right-1', '', 'right-3'],
      alignedSourcePresent: [true, true, true],
      alignedTargetPresent: [true, false, true],
      diffLineNumbers: [1, 2, 3],
      sourceDiffLineNumbers: [1, 2, 3],
      targetDiffLineNumbers: [1, 2],
      alignedDiffKinds: ['modify', 'delete', 'modify'],
      sourceLineCount: 3,
      targetLineCount: 2,
      alignedLineCount: 3,
    };
    const copiedDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1', 'left-2', 'left-3'],
      alignedTargetLines: ['right-1', 'left-2', 'left-3'],
      alignedSourcePresent: [true, true, true],
      alignedTargetPresent: [true, true, true],
      diffLineNumbers: [1],
      sourceDiffLineNumbers: [1],
      targetDiffLineNumbers: [1],
      alignedDiffKinds: ['modify', null, null],
      sourceLineCount: 3,
      targetLineCount: 3,
      alignedLineCount: 3,
    };
    let sourceText = 'left-1\nleft-2\nleft-3';
    let targetText = 'right-1\nright-3';
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'get_document_text') {
        const payload = (args ?? {}) as { id?: string };
        return payload.id === sourceTab.id ? sourceText : targetText;
      }
      if (command === 'compare_documents_by_line') {
        return initialDiff;
      }
      if (command === 'apply_aligned_diff_panel_copy') {
        return {
          changed: true,
          lineDiff: copiedDiff,
        };
      }
      if (command === 'apply_aligned_diff_edit') {
        sourceText = 'left-1\nleft-2\nleft-3';
        targetText = 'right-1\nleft-2\nleft-3';
        return {
          lineDiff: copiedDiff,
          sourceIsDirty: false,
          targetIsDirty: true,
        };
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 3;
      }
      if (command === 'undo') {
        return { lineCount: 1, cursorLine: 1, cursorColumn: 1 };
      }
      return undefined;
    });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(initialDiff),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
    });
    monacoDiffMockState.sourceEditor.getSelection.mockReturnValue({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 7,
      isEmpty: () => false,
    });
    monacoDiffMockState.sourceEditor.getPosition.mockReturnValue({
      lineNumber: 2,
      column: 1,
    });
    openPaneContextMenu('source');
    const sourceMenu = await screen.findByRole('menu');
    await act(async () => {
      fireEvent.click(within(sourceMenu).getByRole('menuitem', { name: 'Copy to Right' }));
    });
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'apply_aligned_diff_panel_copy',
        expect.objectContaining({
          fromSide: 'source',
          toSide: 'target',
          startRowIndex: 1,
          endRowIndex: 2,
        })
      );
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'apply_aligned_diff_edit',
      expect.objectContaining({
        editedSide: 'target',
        alignedTargetLines: ['right-1', 'left-2', 'left-3'],
        alignedTargetPresent: [true, true, true],
      })
    );
    await waitFor(() => {
      expect(monacoDiffMockState.targetEditor.getModel().getValue()).toBe('right-1\nleft-2\nleft-3');
    });
  });
  it('copies the target caret line to the left pane when no selection exists', async () => {
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts', lineCount: 2 });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts', lineCount: 3 });
    const initialDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1', '', 'left-3'],
      alignedTargetLines: ['right-1', 'right-2', 'right-3'],
      alignedSourcePresent: [true, false, true],
      alignedTargetPresent: [true, true, true],
      diffLineNumbers: [1, 2, 3],
      sourceDiffLineNumbers: [1, 2],
      targetDiffLineNumbers: [1, 2, 3],
      alignedDiffKinds: ['modify', 'insert', 'modify'],
      sourceLineCount: 2,
      targetLineCount: 3,
      alignedLineCount: 3,
    };
    const copiedDiff: LineDiffComparisonResult = {
      alignedSourceLines: ['left-1', 'right-2', 'left-3'],
      alignedTargetLines: ['right-1', 'right-2', 'right-3'],
      alignedSourcePresent: [true, true, true],
      alignedTargetPresent: [true, true, true],
      diffLineNumbers: [1, 3],
      sourceDiffLineNumbers: [1, 2, 3],
      targetDiffLineNumbers: [1, 2, 3],
      alignedDiffKinds: ['modify', null, 'modify'],
      sourceLineCount: 3,
      targetLineCount: 3,
      alignedLineCount: 3,
    };
    let sourceText = 'left-1\nleft-3';
    let targetText = 'right-1\nright-2\nright-3';
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'get_document_text') {
        const payload = (args ?? {}) as { id?: string };
        return payload.id === sourceTab.id ? sourceText : targetText;
      }
      if (command === 'compare_documents_by_line') {
        return initialDiff;
      }
      if (command === 'apply_aligned_diff_panel_copy') {
        return {
          changed: true,
          lineDiff: copiedDiff,
        };
      }
      if (command === 'apply_aligned_diff_edit') {
        sourceText = 'left-1\nright-2\nleft-3';
        targetText = 'right-1\nright-2\nright-3';
        return {
          lineDiff: copiedDiff,
          sourceIsDirty: true,
          targetIsDirty: false,
        };
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 3;
      }
      if (command === 'undo') {
        return { lineCount: 1, cursorLine: 1, cursorColumn: 1 };
      }
      return undefined;
    });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload(initialDiff),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor).toBeTruthy();
      expect(monacoDiffMockState.targetEditor).toBeTruthy();
    });
    monacoDiffMockState.targetEditor.getSelection.mockReturnValue({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 1,
      isEmpty: () => true,
    });
    monacoDiffMockState.targetEditor.getPosition.mockReturnValue({
      lineNumber: 2,
      column: 1,
    });
    openPaneContextMenu('target');
    const targetMenu = await screen.findByRole('menu');
    await act(async () => {
      fireEvent.click(within(targetMenu).getByRole('menuitem', { name: 'Copy to Left' }));
    });
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'apply_aligned_diff_panel_copy',
        expect.objectContaining({
          fromSide: 'target',
          toSide: 'source',
          startRowIndex: 1,
          endRowIndex: 1,
        })
      );
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'apply_aligned_diff_edit',
      expect.objectContaining({
        editedSide: 'source',
        alignedSourceLines: ['left-1', 'right-2', 'left-3'],
        alignedSourcePresent: [true, true, true],
      })
    );
    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.getModel().getValue()).toBe('left-1\nright-2\nleft-3');
    });
  });
  it('highlights diff lines and paints overview markers on splitter', async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'keep\nline-2\nline-3';
      }
      if (command === 'compare_documents_by_line') {
        return {
          alignedSourceLines: ['keep', 'left-change', 'left-only'],
          alignedTargetLines: ['keep', 'right-change', ''],
          alignedSourcePresent: [true, true, true],
          alignedTargetPresent: [true, true, false],
          diffLineNumbers: [2, 3],
          sourceDiffLineNumbers: [2, 3],
          targetDiffLineNumbers: [2],
          alignedDiffKinds: [null, 'modify', 'delete'],
          sourceLineCount: 3,
          targetLineCount: 2,
          alignedLineCount: 3,
        };
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 3;
      }
      return undefined;
    });

    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts' });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload({
        alignedSourceLines: ['keep', 'left-change', 'left-only'],
        alignedTargetLines: ['keep', 'right-change', ''],
        alignedSourcePresent: [true, true, true],
        alignedTargetPresent: [true, true, false],
        alignedDiffKinds: [null, 'modify', 'delete'],
        alignedLineCount: 3,
      }),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };

    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });

    const { container } = render(<DiffEditor tab={diffTab} />);

    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.deltaDecorations).toHaveBeenCalled();
      expect(monacoDiffMockState.targetEditor.deltaDecorations).toHaveBeenCalled();
    });

    const sourceDecorationHasKinds = monacoDiffMockState.sourceEditor.deltaDecorations.mock.calls.some(
      (call: [unknown, unknown]) => {
        const decorations = call[1] as Array<{ options?: { className?: string } }>;
        return decorations.some((item) => item.options?.className === 'rutar-diff-line-modify')
          && decorations.some((item) => item.options?.className === 'rutar-diff-line-delete');
      }
    );
    const targetDecorationHasKind = monacoDiffMockState.targetEditor.deltaDecorations.mock.calls.some(
      (call: [unknown, unknown]) => {
        const decorations = call[1] as Array<{ options?: { className?: string } }>;
        return decorations.some((item) => item.options?.className === 'rutar-diff-line-modify');
      }
    );

    expect(sourceDecorationHasKinds).toBe(true);
    expect(targetDecorationHasKind).toBe(true);
    const markerColors = Array.from(
      container.querySelectorAll('[data-testid="diff-overview-marker"]')
    ).map((marker) => (marker as HTMLDivElement).style.backgroundColor);
    expect(markerColors).toEqual(
      expect.arrayContaining(['rgba(239, 68, 68, 0.88)', 'rgba(245, 158, 11, 0.88)'])
    );
  });

  it('adds virtual placeholder rows for missing-side alignment', async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'get_document_text') {
        return 'same\nline-two\nline-three';
      }
      if (command === 'compare_documents_by_line') {
        return {
          alignedSourceLines: ['same', '', 'line-two', 'line-three'],
          alignedTargetLines: ['same', 'inserted-line', '', 'line-three'],
          alignedSourcePresent: [true, false, true, true],
          alignedTargetPresent: [true, true, false, true],
          diffLineNumbers: [2, 3],
          sourceDiffLineNumbers: [2],
          targetDiffLineNumbers: [2],
          alignedDiffKinds: [null, 'insert', 'delete', null],
          sourceLineCount: 3,
          targetLineCount: 3,
          alignedLineCount: 4,
        };
      }
      if (command === 'apply_text_edits_by_line_column') {
        return 3;
      }
      return undefined;
    });
    const sourceTab = createFileTab({ id: 'tab-source', name: 'source.ts' });
    const targetTab = createFileTab({ id: 'tab-target', name: 'target.ts' });
    const diffTab = createFileTab({
      id: 'tab-diff',
      tabType: 'diff',
      diffPayload: createDiffPayload({
        alignedSourceLines: ['same', '', 'line-two', 'line-three'],
        alignedTargetLines: ['same', 'inserted-line', '', 'line-three'],
        alignedSourcePresent: [true, false, true, true],
        alignedTargetPresent: [true, true, false, true],
        diffLineNumbers: [2, 3],
        sourceDiffLineNumbers: [2],
        targetDiffLineNumbers: [2],
        alignedDiffKinds: [null, 'insert', 'delete', null],
        sourceLineCount: 3,
        targetLineCount: 3,
        alignedLineCount: 4,
      }),
    }) as FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: diffTab.id,
    });
    render(<DiffEditor tab={diffTab} />);
    await waitFor(() => {
      const sourceHasPlaceholder = monacoDiffMockState.sourceViewZoneHistory.some((batch) =>
        batch.some((zone) => zone.afterLineNumber === 1 && zone.heightInLines === 1)
      );
      const targetHasPlaceholder = monacoDiffMockState.targetViewZoneHistory.some((batch) =>
        batch.some((zone) => zone.afterLineNumber === 2 && zone.heightInLines === 1)
      );
      expect(sourceHasPlaceholder).toBe(true);
      expect(targetHasPlaceholder).toBe(true);
    });
  });
  it('uses one shared scrollbar in splitter and syncs both pane scroll positions', async () => {
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

    const { container } = render(<DiffEditor tab={diffTab} />);
    const sharedScrollbar = container.querySelector('[data-testid="diff-shared-scrollbar"]') as HTMLDivElement | null;
    const separator = container.querySelector('[role="separator"]') as HTMLElement | null;

    await waitFor(() => {
      expect(sharedScrollbar).toBeTruthy();
      expect(separator).toBeTruthy();
    });

    expect(separator?.parentElement?.style.width).toBe('20px');
    const sharedScrollbarElement = sharedScrollbar as HTMLDivElement;
    Object.defineProperty(sharedScrollbarElement, 'clientHeight', {
      configurable: true,
      value: 320,
    });
    sharedScrollbarElement.scrollTop = 180;

    act(() => {
      sharedScrollbarElement.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(monacoDiffMockState.sourceEditor.setScrollTop).toHaveBeenCalled();
      expect(monacoDiffMockState.targetEditor.setScrollTop).toHaveBeenCalled();
    });
  });
});
