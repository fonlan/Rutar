import { invoke } from '@tauri-apps/api/core';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { type DiffPanelSide, type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import type { MonacoTextEdit } from './monacoTypes';

export { diffEditorTestUtils } from './diffEditor.utils';

interface HistoryActionResult {
  lineCount: number;
  cursorLine?: number;
  cursorColumn?: number;
}

interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
}

type ActivePanel = 'source' | 'target';

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
}

function resolveMonacoLanguage(fileTab: FileTab | null) {
  if (!fileTab) {
    return 'plaintext';
  }

  const syntaxKey = fileTab.syntaxOverride ?? detectSyntaxKeyFromTab(fileTab);
  switch (syntaxKey) {
    case 'plain_text':
      return 'plaintext';
    case 'markdown':
      return 'markdown';
    case 'dockerfile':
      return 'dockerfile';
    case 'makefile':
      return 'makefile';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'rust':
      return 'rust';
    case 'python':
      return 'python';
    case 'json':
      return 'json';
    case 'jsonc':
      return 'json';
    case 'ini':
      return 'ini';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'toml':
      return 'ini';
    case 'yaml':
      return 'yaml';
    case 'xml':
      return 'xml';
    case 'c':
      return 'c';
    case 'cpp':
      return 'cpp';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'csharp':
      return 'csharp';
    case 'hcl':
      return 'hcl';
    case 'lua':
      return 'lua';
    case 'php':
      return 'php';
    case 'kotlin':
      return 'kotlin';
    case 'powershell':
      return 'powershell';
    case 'ruby':
      return 'ruby';
    case 'sql':
      return 'sql';
    case 'swift':
      return 'swift';
    default:
      return 'plaintext';
  }
}

async function getDocumentText(tabId: string, lineCountHint: number) {
  try {
    return await invoke<string>('get_document_text', { id: tabId });
  } catch {
    return invoke<string>('get_visible_lines', {
      id: tabId,
      startLine: 0,
      endLine: Math.max(1, lineCountHint),
    });
  }
}

function clampRatio(ratio: number) {
  return Math.max(0.2, Math.min(0.8, ratio));
}

export function DiffEditor({ tab }: DiffEditorProps) {
  const tabs = useStore((state) => state.tabs);
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const setActiveDiffPanel = useStore((state) => state.setActiveDiffPanel);
  const persistedActivePanel = useStore((state) => state.activeDiffPanelByTab[tab.id]);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

  const sourceTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.sourceTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.sourceTabId, tabs]
  );
  const targetTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.targetTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.targetTabId, tabs]
  );

  const [activePanel, setActivePanel] = useState<ActivePanel>(
    persistedActivePanel === 'target' ? 'target' : 'source'
  );
  const [ratio, setRatio] = useState(0.5);
  const [resizing, setResizing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sourceHostRef = useRef<HTMLDivElement | null>(null);
  const targetHostRef = useRef<HTMLDivElement | null>(null);
  const sourceEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const targetEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const sourceModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const targetModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const sourceApplyingRef = useRef(false);
  const targetApplyingRef = useRef(false);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());
  const ignoreDocumentUpdatedRef = useRef<Record<string, number>>({});
  const pendingFetchRequestRef = useRef({ source: 0, target: 0 });

  const sourceLanguage = resolveMonacoLanguage(sourceTab);
  const targetLanguage = resolveMonacoLanguage(targetTab);
  const sourceTitle = sourceTab?.name || tab.diffPayload.sourceName;
  const targetTitle = targetTab?.name || tab.diffPayload.targetName;

  const applyEditorOptions = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, paneTab: FileTab | null) => {
      const largeFileMode = Boolean(paneTab?.largeFileMode);
      editor.updateOptions({
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineNumbers: settings.showLineNumbers ? 'on' : 'off',
        wordWrap: settings.wordWrap ? 'on' : 'off',
        tabSize: settings.tabWidth,
        insertSpaces: settings.tabIndentMode === 'spaces',
        minimap: { enabled: !largeFileMode },
        smoothScrolling: !largeFileMode,
        bracketPairColorization: {
          enabled: !largeFileMode,
        },
        occurrencesHighlight: largeFileMode ? 'off' : 'singleFile',
        selectionHighlight: !largeFileMode,
        renderValidationDecorations: largeFileMode ? 'off' : 'on',
        folding: !largeFileMode,
        scrollBeyondLastLine: false,
        find: {
          addExtraSpaceOnTop: false,
        },
      });
    },
    [
      settings.fontFamily,
      settings.fontSize,
      settings.showLineNumbers,
      settings.wordWrap,
      settings.tabWidth,
      settings.tabIndentMode,
    ]
  );

  const queueSyncEdits = useCallback(
    (
      side: ActivePanel,
      paneTab: FileTab | null,
      edits: MonacoTextEdit[],
      afterCursor?: { line: number; column: number }
    ) => {
      if (!paneTab || edits.length === 0) {
        return;
      }

      const beforeCursor = useStore.getState().cursorPositionByTab[paneTab.id];
      syncChainRef.current = syncChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const newLineCount = await invoke<number>('apply_text_edits_by_line_column', {
            id: paneTab.id,
            edits,
            beforeCursorLine: beforeCursor?.line,
            beforeCursorColumn: beforeCursor?.column,
            afterCursorLine: afterCursor?.line,
            afterCursorColumn: afterCursor?.column,
          });
          updateTab(paneTab.id, {
            lineCount: Math.max(1, newLineCount),
            isDirty: true,
          });
          ignoreDocumentUpdatedRef.current[paneTab.id] =
            (ignoreDocumentUpdatedRef.current[paneTab.id] ?? 0) + 1;
          dispatchDocumentUpdated(paneTab.id);

          if (afterCursor) {
            setCursorPosition(paneTab.id, afterCursor.line, afterCursor.column);
          }
        })
        .catch((error) => {
          console.error(`Failed to sync ${side} Monaco diff edits:`, error);
        });
    },
    [setCursorPosition, updateTab]
  );

  const ensurePaneLoaded = useCallback(
    async (side: ActivePanel, paneTab: FileTab | null) => {
      if (!paneTab) {
        return;
      }

      const modelRef = side === 'source' ? sourceModelRef : targetModelRef;
      const applyingRef = side === 'source' ? sourceApplyingRef : targetApplyingRef;
      const requestId = pendingFetchRequestRef.current[side] + 1;
      pendingFetchRequestRef.current[side] = requestId;

      const model = modelRef.current;
      if (!model) {
        return;
      }

      try {
        const text = await getDocumentText(paneTab.id, Math.max(1, paneTab.lineCount));
        if (pendingFetchRequestRef.current[side] !== requestId || model.isDisposed()) {
          return;
        }

        if (model.getValue() === text) {
          return;
        }

        applyingRef.current = true;
        model.setValue(text);
      } catch (error) {
        console.error(`Failed to refresh ${side} diff pane:`, error);
      } finally {
        applyingRef.current = false;
      }
    },
    []
  );

  const handleSavePanel = useCallback(
    async (side: ActivePanel) => {
      const paneTab = side === 'source' ? sourceTab : targetTab;
      if (!paneTab) {
        return;
      }

      try {
        await invoke('save_file', { id: paneTab.id });
        updateTab(paneTab.id, { isDirty: false });
        dispatchDocumentUpdated(paneTab.id);
      } catch (error) {
        console.error(`Failed to save ${side} diff pane:`, error);
      }
    },
    [sourceTab, targetTab, updateTab]
  );

  const copySelectionToOtherPane = useCallback(
    (fromSide: ActivePanel) => {
      const fromEditor = fromSide === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const toEditor = fromSide === 'source' ? targetEditorRef.current : sourceEditorRef.current;
      if (!fromEditor || !toEditor) {
        return;
      }

      const fromModel = fromEditor.getModel();
      const toSelection = toEditor.getSelection();
      if (!fromModel || !toSelection) {
        return;
      }

      const selection = fromEditor.getSelection();
      const selectedText = selection ? fromModel.getValueInRange(selection) : '';
      const textToCopy = selectedText || fromModel.getLineContent(fromEditor.getPosition()?.lineNumber ?? 1);

      toEditor.executeEdits('rutar-diff-copy-side', [
        {
          range: toSelection,
          text: textToCopy,
          forceMoveMarkers: true,
        },
      ]);
      toEditor.focus();
    },
    []
  );

  useEffect(() => {
    setActiveDiffPanel(tab.id, activePanel);
  }, [activePanel, setActiveDiffPanel, tab.id]);

  useEffect(() => {
    monaco.editor.setTheme(settings.theme === 'dark' ? 'vs-dark' : 'vs');
    if (sourceEditorRef.current) {
      applyEditorOptions(sourceEditorRef.current, sourceTab);
    }
    if (targetEditorRef.current) {
      applyEditorOptions(targetEditorRef.current, targetTab);
    }
  }, [applyEditorOptions, settings.theme, sourceTab, targetTab]);

  useEffect(() => {
    if (!sourceHostRef.current || sourceEditorRef.current) {
      return;
    }

    const editor = monaco.editor.create(sourceHostRef.current, {
      automaticLayout: true,
      lineNumbersMinChars: 3,
    });
    sourceEditorRef.current = editor;
    applyEditorOptions(editor, sourceTab);

    const contentDisposable = editor.onDidChangeModelContent((event: monaco.editor.IModelContentChangedEvent) => {
      if (sourceApplyingRef.current) {
        return;
      }

      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.diffPayload.sourceTabId) ?? null;
      const position = editor.getPosition();
      queueSyncEdits(
        'source',
        currentTab,
        event.changes.map((change: monaco.editor.IModelContentChange) => ({
          startLineNumber: change.range.startLineNumber,
          startColumn: change.range.startColumn,
          endLineNumber: change.range.endLineNumber,
          endColumn: change.range.endColumn,
          text: change.text,
        })),
        position ? { line: position.lineNumber, column: position.column } : undefined
      );
    });

    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      setActivePanel('source');
    });

    const cursorDisposable = editor.onDidChangeCursorPosition((event: monaco.editor.ICursorPositionChangedEvent) => {
      if (!sourceTab) {
        return;
      }

      setCursorPosition(sourceTab.id, event.position.lineNumber, event.position.column);
    });

    return () => {
      contentDisposable.dispose();
      focusDisposable.dispose();
      cursorDisposable.dispose();
      editor.dispose();
      sourceEditorRef.current = null;
      sourceModelRef.current = null;
    };
  }, [queueSyncEdits, setCursorPosition, tab.diffPayload.sourceTabId]);

  useEffect(() => {
    if (!targetHostRef.current || targetEditorRef.current) {
      return;
    }

    const editor = monaco.editor.create(targetHostRef.current, {
      automaticLayout: true,
      lineNumbersMinChars: 3,
    });
    targetEditorRef.current = editor;
    applyEditorOptions(editor, targetTab);

    const contentDisposable = editor.onDidChangeModelContent((event: monaco.editor.IModelContentChangedEvent) => {
      if (targetApplyingRef.current) {
        return;
      }

      const currentTab = useStore.getState().tabs.find((item) => item.id === tab.diffPayload.targetTabId) ?? null;
      const position = editor.getPosition();
      queueSyncEdits(
        'target',
        currentTab,
        event.changes.map((change: monaco.editor.IModelContentChange) => ({
          startLineNumber: change.range.startLineNumber,
          startColumn: change.range.startColumn,
          endLineNumber: change.range.endLineNumber,
          endColumn: change.range.endColumn,
          text: change.text,
        })),
        position ? { line: position.lineNumber, column: position.column } : undefined
      );
    });

    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      setActivePanel('target');
    });

    const cursorDisposable = editor.onDidChangeCursorPosition((event: monaco.editor.ICursorPositionChangedEvent) => {
      if (!targetTab) {
        return;
      }

      setCursorPosition(targetTab.id, event.position.lineNumber, event.position.column);
    });

    return () => {
      contentDisposable.dispose();
      focusDisposable.dispose();
      cursorDisposable.dispose();
      editor.dispose();
      targetEditorRef.current = null;
      targetModelRef.current = null;
    };
  }, [queueSyncEdits, setCursorPosition, tab.diffPayload.targetTabId]);

  useEffect(() => {
    const sourceEditor = sourceEditorRef.current;
    if (!sourceEditor) {
      return;
    }

    if (!sourceTab) {
      sourceEditor.setModel(null);
      sourceModelRef.current = null;
      return;
    }

    const uri = monaco.Uri.parse(`inmemory://rutar-diff/source/${sourceTab.id}`);
    const existing = monaco.editor.getModel(uri);
    const model = existing ?? monaco.editor.createModel('', sourceLanguage, uri);
    if (model.getLanguageId() !== sourceLanguage) {
      monaco.editor.setModelLanguage(model, sourceLanguage);
    }
    sourceModelRef.current = model;
    sourceEditor.setModel(model);
    void ensurePaneLoaded('source', sourceTab);
  }, [ensurePaneLoaded, sourceLanguage, sourceTab]);

  useEffect(() => {
    const targetEditor = targetEditorRef.current;
    if (!targetEditor) {
      return;
    }

    if (!targetTab) {
      targetEditor.setModel(null);
      targetModelRef.current = null;
      return;
    }

    const uri = monaco.Uri.parse(`inmemory://rutar-diff/target/${targetTab.id}`);
    const existing = monaco.editor.getModel(uri);
    const model = existing ?? monaco.editor.createModel('', targetLanguage, uri);
    if (model.getLanguageId() !== targetLanguage) {
      monaco.editor.setModelLanguage(model, targetLanguage);
    }
    targetModelRef.current = model;
    targetEditor.setModel(model);
    void ensurePaneLoaded('target', targetTab);
  }, [ensurePaneLoaded, targetLanguage, targetTab]);

  useEffect(() => {
    const handleDiffHistoryAction = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        diffTabId?: string;
        panel?: DiffPanelSide;
        action?: 'undo' | 'redo';
      }>;

      if (customEvent.detail?.diffTabId !== tab.id) {
        return;
      }

      const action = customEvent.detail?.action;
      const panel = customEvent.detail?.panel;
      if (!action || !panel) {
        return;
      }

      const paneTab = panel === 'source' ? sourceTab : targetTab;
      if (!paneTab) {
        return;
      }

      try {
        const result = await invoke<HistoryActionResult>(action, { id: paneTab.id });
        updateTab(paneTab.id, { lineCount: Math.max(1, result.lineCount) });
        if (result.cursorLine && result.cursorColumn) {
          setCursorPosition(paneTab.id, result.cursorLine, result.cursorColumn);
        }
        dispatchDocumentUpdated(paneTab.id);
      } catch (error) {
        console.error(`Diff ${action} failed:`, error);
      }
    };

    const handleDiffPaste = (event: Event) => {
      const customEvent = event as CustomEvent<{
        diffTabId?: string;
        panel?: DiffPanelSide;
        text?: string;
      }>;
      if (customEvent.detail?.diffTabId !== tab.id) {
        return;
      }

      const targetEditor = customEvent.detail?.panel === 'target'
        ? targetEditorRef.current
        : sourceEditorRef.current;

      const selection = targetEditor?.getSelection();
      if (!targetEditor || !selection) {
        return;
      }

      targetEditor.executeEdits('rutar-diff-paste', [
        {
          range: selection,
          text: customEvent.detail?.text ?? '',
          forceMoveMarkers: true,
        },
      ]);
      targetEditor.focus();
    };

    const handleDiffClipboardAction = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        diffTabId?: string;
        panel?: DiffPanelSide;
        action?: 'copy' | 'cut' | 'paste';
      }>;
      if (customEvent.detail?.diffTabId !== tab.id) {
        return;
      }

      const action = customEvent.detail?.action;
      const panel = customEvent.detail?.panel;
      if (!action || !panel || action === 'paste') {
        return;
      }

      const editor = panel === 'target' ? targetEditorRef.current : sourceEditorRef.current;
      const model = editor?.getModel();
      const selection = editor?.getSelection();
      if (!editor || !model || !selection || selection.isEmpty()) {
        return;
      }

      const selectedText = model.getValueInRange(selection);
      if (selectedText && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedText);
      }

      if (action === 'cut') {
        editor.executeEdits('rutar-diff-cut', [
          {
            range: selection,
            text: '',
            forceMoveMarkers: true,
          },
        ]);
      }
    };

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const updatedTabId = customEvent.detail?.tabId;
      if (!updatedTabId) {
        return;
      }

      if ((ignoreDocumentUpdatedRef.current[updatedTabId] ?? 0) > 0) {
        ignoreDocumentUpdatedRef.current[updatedTabId] -= 1;
        return;
      }

      if (updatedTabId === sourceTab?.id) {
        void ensurePaneLoaded('source', sourceTab);
      }

      if (updatedTabId === targetTab?.id) {
        void ensurePaneLoaded('target', targetTab);
      }
    };

    window.addEventListener('rutar:diff-history-action', handleDiffHistoryAction as EventListener);
    window.addEventListener('rutar:diff-paste-text', handleDiffPaste as EventListener);
    window.addEventListener('rutar:diff-clipboard-action', handleDiffClipboardAction as EventListener);
    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      window.removeEventListener('rutar:diff-history-action', handleDiffHistoryAction as EventListener);
      window.removeEventListener('rutar:diff-paste-text', handleDiffPaste as EventListener);
      window.removeEventListener('rutar:diff-clipboard-action', handleDiffClipboardAction as EventListener);
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [ensurePaneLoaded, setCursorPosition, sourceTab, tab.id, targetTab, updateTab]);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!resizing || !rootElement) {
      return;
    }

    const updateFromPointer = (clientX: number) => {
      const rect = rootElement.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      const nextRatio = clampRatio((clientX - rect.left) / rect.width);
      setRatio(nextRatio);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateFromPointer(event.clientX);
    };

    const handlePointerUp = () => {
      setResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [resizing]);

  const leftWidth = `${ratio * 100}%`;
  const rightWidth = `${(1 - ratio) * 100}%`;

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="flex h-11 items-center justify-between border-b border-border/50 px-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
            {tr('diffEditor.sourceTitle')}
          </span>
          <span className="truncate">{sourceTitle}</span>
          {sourceTab?.isDirty ? <span className="text-amber-500">*</span> : null}
          <button
            type="button"
            className="rounded border border-border/60 px-2 py-1 hover:bg-accent"
            onClick={() => void handleSavePanel('source')}
          >
            {tr('diffEditor.save')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-border/60 px-2 py-1 hover:bg-accent"
            onClick={() => copySelectionToOtherPane('source')}
          >
            {tr('diffEditor.copyToRight')}
          </button>
          <button
            type="button"
            className="rounded border border-border/60 px-2 py-1 hover:bg-accent"
            onClick={() => copySelectionToOtherPane('target')}
          >
            {tr('diffEditor.copyToLeft')}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="rounded border border-border/60 px-2 py-1 hover:bg-accent"
            onClick={() => void handleSavePanel('target')}
          >
            {tr('diffEditor.save')}
          </button>
          {targetTab?.isDirty ? <span className="text-amber-500">*</span> : null}
          <span className="truncate">{targetTitle}</span>
          <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
            {tr('diffEditor.targetTitle')}
          </span>
        </div>
      </div>

      <div ref={rootRef} className="flex h-[calc(100%-2.75rem)] w-full overflow-hidden">
        <div
          className={`h-full border-r border-border/40 ${activePanel === 'source' ? 'ring-1 ring-inset ring-blue-500/30' : ''}`}
          style={{ width: leftWidth }}
        >
          <div ref={sourceHostRef} className="h-full w-full" />
        </div>
        <div
          className="h-full w-1 cursor-col-resize bg-border/60 hover:bg-blue-400/50"
          role="separator"
          aria-label={tr('diffEditor.resizePanelsAriaLabel')}
          onPointerDown={(event) => {
            event.preventDefault();
            setResizing(true);
          }}
        />
        <div
          className={`h-full border-l border-border/40 ${activePanel === 'target' ? 'ring-1 ring-inset ring-blue-500/30' : ''}`}
          style={{ width: rightWidth }}
        >
          <div ref={targetHostRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
