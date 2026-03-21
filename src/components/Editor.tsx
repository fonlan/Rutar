import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { QUICK_FIND_OPEN_EVENT, type QuickFindOpenEventDetail } from '@/lib/quickFind';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { type FileTab, useStore } from '@/store/useStore';
import type { MonacoEngineState, MonacoTextEdit } from './monacoTypes';

export { editorTestUtils } from './editorUtils';

const modelByTabId = new Map<string, monaco.editor.ITextModel>();
const viewStateByTabId = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const HTTP_URL_TRAILING_PUNCTUATION_PATTERN = /[),.;:!?]+$/;

function trimHttpUrlCandidate(rawUrl: string) {
  if (!rawUrl) {
    return '';
  }

  return rawUrl.replace(HTTP_URL_TRAILING_PUNCTUATION_PATTERN, '');
}

function getHttpUrlAtLineColumn(lineText: string, column: number) {
  if (!lineText) {
    return null;
  }

  const safeColumn = Math.max(0, Math.min(Math.floor(column), lineText.length));
  const regex = new RegExp(HTTP_URL_PATTERN.source, 'gi');

  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(lineText)) !== null) {
    const rawUrl = match[0] ?? '';
    const trimmedUrl = trimHttpUrlCandidate(rawUrl);
    if (!trimmedUrl) {
      continue;
    }

    const start = match.index;
    const end = start + trimmedUrl.length;
    if (safeColumn >= start && safeColumn <= end) {
      return trimmedUrl;
    }
  }

  return null;
}

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
}

function resolveMonacoLanguage(fileTab: FileTab) {
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
      return 'shell';
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

export function Editor({
  tab,
}: {
  tab: FileTab;
  diffHighlightLines?: number[];
}) {
  const settings = useStore((state) => state.settings);
  const tabs = useStore((state) => state.tabs);
  const updateTab = useStore((state) => state.updateTab);
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const applyingRemoteTextRef = useRef(false);
  const ignoreDocumentUpdatedCountRef = useRef(0);
  const syncChainRef = useRef(Promise.resolve());
  const cursorSnapshotRef = useRef<{ line: number; column: number }>({ line: 1, column: 1 });
  const engineStateRef = useRef<MonacoEngineState>({
    modelId: tab.id,
    syncVersion: 0,
    lastAppliedBackendVersion: 0,
  });
  const pendingFetchRequestIdRef = useRef(0);
  const monacoLanguage = useMemo(() => resolveMonacoLanguage(tab), [tab]);

  const ensureEditorModelLoaded = useCallback(
    async (targetTab: FileTab, reason: 'bootstrap' | 'refresh') => {
      const model = modelByTabId.get(targetTab.id);
      if (!model) {
        return;
      }

      const requestId = ++pendingFetchRequestIdRef.current;
      try {
        const text = await getDocumentText(targetTab.id, Math.max(1, targetTab.lineCount));
        if (requestId !== pendingFetchRequestIdRef.current || model.isDisposed()) {
          return;
        }

        if (model.getValue() === text) {
          return;
        }

        applyingRemoteTextRef.current = true;
        model.setValue(text);
      } catch (error) {
        console.error(`Failed to load Monaco document text (${reason}):`, error);
      } finally {
        applyingRemoteTextRef.current = false;
      }
    },
    []
  );

  const queueSyncEdits = useCallback(
    (
      targetTab: FileTab,
      edits: MonacoTextEdit[],
      beforeCursor?: { line: number; column: number },
      afterCursor?: { line: number; column: number }
    ) => {
      if (edits.length === 0) {
        return;
      }

      syncChainRef.current = syncChainRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const newLineCount = await invoke<number>('apply_text_edits_by_line_column', {
              id: targetTab.id,
              edits,
              beforeCursorLine: beforeCursor?.line,
              beforeCursorColumn: beforeCursor?.column,
              afterCursorLine: afterCursor?.line,
              afterCursorColumn: afterCursor?.column,
            });

            updateTab(targetTab.id, {
              lineCount: Math.max(1, newLineCount),
              isDirty: true,
            });
            ignoreDocumentUpdatedCountRef.current += 1;
            dispatchDocumentUpdated(targetTab.id);
          } catch (error) {
            console.error('Failed to sync Monaco edits:', error);
          }
        });
    },
    [updateTab]
  );

  useEffect(() => {
    if (!containerRef.current || editorRef.current) {
      return;
    }

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineNumbers: settings.showLineNumbers ? 'on' : 'off',
      wordWrap: settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: settings.minimap && !tab.largeFileMode },
      smoothScrolling: !tab.largeFileMode,
      bracketPairColorization: {
        enabled: !tab.largeFileMode,
      },
      occurrencesHighlight: tab.largeFileMode ? 'off' : 'singleFile',
      selectionHighlight: !tab.largeFileMode,
      renderValidationDecorations: tab.largeFileMode ? 'off' : 'on',
      tabSize: settings.tabWidth,
      insertSpaces: settings.tabIndentMode === 'spaces',
      glyphMargin: false,
      folding: !tab.largeFileMode,
      scrollBeyondLastLine: false,
      find: {
        addExtraSpaceOnTop: false,
      },
    });

    editorRef.current = editor;

    const contentDisposable = editor.onDidChangeModelContent((event: monaco.editor.IModelContentChangedEvent) => {
      if (applyingRemoteTextRef.current) {
        return;
      }

      const currentTabId = activeTabIdRef.current;
      if (!currentTabId) {
        return;
      }

      const currentTab = useStore
        .getState()
        .tabs
        .find((candidate) => candidate.id === currentTabId && candidate.tabType !== 'diff');
      if (!currentTab) {
        return;
      }

      const beforeCursor = cursorSnapshotRef.current;
      const currentPosition = editor.getPosition();
      const afterCursor = currentPosition
        ? { line: currentPosition.lineNumber, column: currentPosition.column }
        : beforeCursor;

      const edits = event.changes.map((change: monaco.editor.IModelContentChange): MonacoTextEdit => ({
        startLineNumber: change.range.startLineNumber,
        startColumn: change.range.startColumn,
        endLineNumber: change.range.endLineNumber,
        endColumn: change.range.endColumn,
        text: change.text,
      }));

      queueSyncEdits(currentTab, edits, beforeCursor, afterCursor);
    });

    const cursorDisposable = editor.onDidChangeCursorPosition((event: monaco.editor.ICursorPositionChangedEvent) => {
      const currentTabId = activeTabIdRef.current;
      if (!currentTabId) {
        return;
      }

      cursorSnapshotRef.current = {
        line: event.position.lineNumber,
        column: event.position.column,
      };
      setCursorPosition(currentTabId, event.position.lineNumber, event.position.column);
    });
    const mouseDownDisposable = editor.onMouseDown((event: monaco.editor.IEditorMouseEvent) => {
      if (!event.event.leftButton) {
        return;
      }

      if (!event.event.ctrlKey && !event.event.metaKey) {
        return;
      }

      const position = event.target.position;
      if (!position) {
        return;
      }

      const model = editor.getModel();
      if (!model) {
        return;
      }

      const lineText = model.getLineContent(position.lineNumber);
      const url = getHttpUrlAtLineColumn(lineText, position.column - 1);
      if (!url) {
        return;
      }

      event.event.preventDefault();
      event.event.stopPropagation();
      void openUrl(url).catch((error) => {
        console.error('Failed to open hyperlink in Monaco editor:', error);
      });
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
      mouseDownDisposable.dispose();

      const activeTabId = activeTabIdRef.current;
      if (activeTabId) {
        viewStateByTabId.set(activeTabId, editor.saveViewState() ?? null);
      }

      editor.dispose();
      editorRef.current = null;
      activeTabIdRef.current = null;
    };
  }, [
    queueSyncEdits,
    setCursorPosition,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    monaco.editor.setTheme(settings.theme === 'dark' ? 'vs-dark' : 'vs');
    editor.updateOptions({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineNumbers: settings.showLineNumbers ? 'on' : 'off',
      wordWrap: settings.wordWrap ? 'on' : 'off',
      tabSize: settings.tabWidth,
      insertSpaces: settings.tabIndentMode === 'spaces',
      minimap: { enabled: settings.minimap && !tab.largeFileMode },
      smoothScrolling: !tab.largeFileMode,
      bracketPairColorization: {
        enabled: !tab.largeFileMode,
      },
      occurrencesHighlight: tab.largeFileMode ? 'off' : 'singleFile',
      selectionHighlight: !tab.largeFileMode,
      renderValidationDecorations: tab.largeFileMode ? 'off' : 'on',
      folding: !tab.largeFileMode,
      find: {
        addExtraSpaceOnTop: false,
      },
    });
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.showLineNumbers,
    settings.tabIndentMode,
    settings.tabWidth,
    settings.theme,
    settings.wordWrap,
    settings.minimap,
    tab.largeFileMode,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const previousTabId = activeTabIdRef.current;
    if (previousTabId) {
      viewStateByTabId.set(previousTabId, editor.saveViewState() ?? null);
    }

    let model = modelByTabId.get(tab.id);
    if (!model) {
      model = monaco.editor.createModel('', monacoLanguage);
      modelByTabId.set(tab.id, model);
      const currentTab =
        useStore
          .getState()
          .tabs
          .find((candidate) => candidate.id === tab.id && candidate.tabType !== 'diff') ?? tab;
      void ensureEditorModelLoaded(currentTab, 'bootstrap');
    }

    if (model.getLanguageId() !== monacoLanguage) {
      monaco.editor.setModelLanguage(model, monacoLanguage);
    }

    editor.setModel(model);
    activeTabIdRef.current = tab.id;
    engineStateRef.current = {
      modelId: tab.id,
      syncVersion: engineStateRef.current.syncVersion + 1,
      lastAppliedBackendVersion: engineStateRef.current.lastAppliedBackendVersion,
    };

    const viewState = viewStateByTabId.get(tab.id);
    if (viewState) {
      editor.restoreViewState(viewState);
    }

    const savedCursor = useStore.getState().cursorPositionByTab[tab.id];
    if (savedCursor) {
      const lineNumber = Math.max(1, savedCursor.line);
      const column = Math.max(1, savedCursor.column);
      editor.setPosition({ lineNumber, column });
      editor.revealPositionInCenterIfOutsideViewport({ lineNumber, column });
      cursorSnapshotRef.current = { line: lineNumber, column };
    }

    editor.focus();
  }, [ensureEditorModelLoaded, monacoLanguage, tab.id]);

  useEffect(() => {
    const trackedTabIds = new Set(
      tabs
        .filter((candidate) => candidate.tabType !== 'diff')
        .map((candidate) => candidate.id)
    );

    for (const [tabId, model] of modelByTabId.entries()) {
      if (trackedTabIds.has(tabId)) {
        continue;
      }

      if (activeTabIdRef.current === tabId) {
        continue;
      }

      model.dispose();
      modelByTabId.delete(tabId);
      viewStateByTabId.delete(tabId);
    }
  }, [tabs]);

  useEffect(() => {
    const resolveCurrentTab = () =>
      useStore
        .getState()
        .tabs
        .find((candidate) => candidate.id === tab.id && candidate.tabType !== 'diff') ?? tab;

    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
        source?: string;
      }>;

      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const lineNumber = Math.max(1, Math.floor(customEvent.detail?.line ?? 1));
      const column = Math.max(1, Math.floor(customEvent.detail?.column ?? 1));
      editor.setPosition({ lineNumber, column });
      editor.revealPositionInCenter({ lineNumber, column });

      if (customEvent.detail?.source !== 'quick-find') {
        editor.focus();
      }
    };

    const handleForceRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        restoreCursorLine?: number;
        restoreCursorColumn?: number;
      }>;

      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const restoreLine = customEvent.detail?.restoreCursorLine;
      const restoreColumn = customEvent.detail?.restoreCursorColumn;

      void ensureEditorModelLoaded(resolveCurrentTab(), 'refresh').then(() => {
        if (!restoreLine || !restoreColumn) {
          return;
        }

        editor.setPosition({
          lineNumber: Math.max(1, restoreLine),
          column: Math.max(1, restoreColumn),
        });
        editor.revealPositionInCenter({
          lineNumber: Math.max(1, restoreLine),
          column: Math.max(1, restoreColumn),
        });
      });
    };

    const handlePaste = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string; text?: string }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const text = customEvent.detail?.text ?? '';
      const selection = editor.getSelection();
      if (!selection) {
        return;
      }

      editor.executeEdits('rutar-paste', [
        {
          range: selection,
          text,
          forceMoveMarkers: true,
        },
      ]);
      editor.focus();
    };

    const handleClipboardAction = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        action?: 'copy' | 'cut' | 'paste';
      }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      const action = customEvent.detail?.action;
      if (!action || action === 'paste') {
        return;
      }

      const editor = editorRef.current;
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
        editor.executeEdits('rutar-cut', [
          {
            range: selection,
            text: '',
            forceMoveMarkers: true,
          },
        ]);
      }
    };

    const handleSearchClose = () => {
      editorRef.current?.focus();
    };
    const handleQuickFindOpen = (event: Event) => {
      const customEvent = event as CustomEvent<QuickFindOpenEventDetail>;
      const targetTabId = customEvent.detail?.tabId;
      if (targetTabId && targetTabId !== tab.id) {
        return;
      }
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      const findAction = editor.getAction('actions.find');
      if (!findAction) {
        return;
      }
      void findAction.run().catch((error) => {
        console.error('Failed to open Monaco find widget:', error);
      });
    };

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      if (ignoreDocumentUpdatedCountRef.current > 0) {
        ignoreDocumentUpdatedCountRef.current -= 1;
        return;
      }

      void ensureEditorModelLoaded(resolveCurrentTab(), 'refresh');
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigate as EventListener);
    window.addEventListener('rutar:navigate-to-outline', handleNavigate as EventListener);
    window.addEventListener('rutar:force-refresh', handleForceRefresh as EventListener);
    window.addEventListener('rutar:paste-text', handlePaste as EventListener);
    window.addEventListener('rutar:editor-clipboard-action', handleClipboardAction as EventListener);
    window.addEventListener('rutar:search-close', handleSearchClose as EventListener);
    window.addEventListener(QUICK_FIND_OPEN_EVENT, handleQuickFindOpen as EventListener);
    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigate as EventListener);
      window.removeEventListener('rutar:navigate-to-outline', handleNavigate as EventListener);
      window.removeEventListener('rutar:force-refresh', handleForceRefresh as EventListener);
      window.removeEventListener('rutar:paste-text', handlePaste as EventListener);
      window.removeEventListener('rutar:editor-clipboard-action', handleClipboardAction as EventListener);
      window.removeEventListener('rutar:search-close', handleSearchClose as EventListener);
      window.removeEventListener(QUICK_FIND_OPEN_EVENT, handleQuickFindOpen as EventListener);
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [ensureEditorModelLoaded, tab.id]);

  return (
    <div
      className="h-full w-full overflow-hidden bg-background"
      data-monaco-engine-state={engineStateRef.current.modelId}
      data-monaco-sync-version={engineStateRef.current.syncVersion}
      data-monaco-backend-version={engineStateRef.current.lastAppliedBackendVersion}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
