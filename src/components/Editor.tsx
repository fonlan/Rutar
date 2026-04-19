import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import {
  readImage as readClipboardImage,
  readText as readClipboardText,
} from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { EDITOR_FIND_OPEN_EVENT, type EditorFindOpenEventDetail } from '@/lib/editorFind';
import { isMarkdownTab } from '@/lib/markdown';
import {
  applyMarkdownToolbarAction,
  buildIndentationUnit,
  MARKDOWN_TOOLBAR_ACTION_EVENT,
  type MarkdownToolbarAction,
} from '@/lib/markdownToolbar';
import { resolveRutarMonacoTheme } from '@/lib/monaco/theme';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { type FileTab, useStore } from '@/store/useStore';
import { EditorBase64DecodeToast } from './EditorBase64DecodeToast';
import {
  EditorContextMenu,
  type EditorCleanupAction,
  type EditorContextMenuAction,
  type EditorContextMenuState,
  type EditorConvertAction,
  type EditorSubmenuKey,
} from './EditorContextMenu';
import {
  DEFAULT_SUBMENU_MAX_HEIGHTS,
  DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS,
  type EditorSubmenuVerticalAlign,
} from './Editor.types';
import type { MonacoEngineState, MonacoTextEdit } from './monacoTypes';
import { useEditorContextMenuConfig } from './useEditorContextMenuConfig';

const modelByTabId = new Map<string, monaco.editor.ITextModel>();
const viewStateByTabId = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const EMPTY_BOOKMARKS: number[] = [];
const BOOKMARK_LINE_NUMBER_CLASS_NAME = 'rutar-bookmark-line-number-highlight';
const MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME = 'rutar-matching-quote-highlight';
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const HTTP_URL_TRAILING_PUNCTUATION_PATTERN = /[),.;:!?]+$/;

interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
  leftLine: number;
  leftColumn: number;
  rightLine: number;
  rightColumn: number;
}
function isQuoteCharacter(value: string) {
  return value === "'" || value === '"';
}

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

function resolveMainEditorModelUri(fileTab: FileTab) {
  const filePath = fileTab.path.trim();
  if (filePath.length > 0) {
    return monaco.Uri.file(filePath);
  }
  return monaco.Uri.parse(`inmemory://rutar-main/${encodeURIComponent(fileTab.id)}`);
}
function areMonacoUrisEqual(left: monaco.Uri, right: monaco.Uri) {
  return left.toString() === right.toString();
}

function clampMonacoPosition(
  model: monaco.editor.ITextModel,
  position: { lineNumber: number; column: number }
) {
  const lineCount = Math.max(1, model.getLineCount());
  const lineNumber = Math.max(1, Math.min(Math.floor(position.lineNumber), lineCount));
  const column = Math.max(1, Math.min(Math.floor(position.column), model.getLineMaxColumn(lineNumber)));

  return {
    lineNumber,
    column,
  };
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

function clipboardEventHasTextPayload(clipboardData: DataTransfer) {
  return (
    clipboardData.getData('text/plain').trim().length > 0
    || clipboardData.getData('text/html').trim().length > 0
  );
}
function clipboardHasImageFlavor(clipboardData: Pick<DataTransfer, 'items' | 'files'>) {
  const items = Array.from(clipboardData.items ?? []);
  const files = Array.from(clipboardData.files ?? []);
  return (
    items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))
    || files.some((file) => file.type.startsWith('image/'))
  );
}
function resolveClipboardImageFile(clipboardEvent: ClipboardEvent) {
  const clipboardData = clipboardEvent.clipboardData;
  if (!clipboardData) {
    return null;
  }

  if (clipboardEventHasTextPayload(clipboardData) && !clipboardHasImageFlavor(clipboardData)) {
    return null;
  }

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  for (const file of Array.from(clipboardData.files ?? [])) {
    if (file.type.startsWith('image/')) {
      return file;
    }
  }

  return null;
}

function isMonacoEditorTextFocused(
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement | null
) {
  if (editor.hasTextFocus()) {
    return true;
  }
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLTextAreaElement
    && activeElement.classList.contains('inputarea')
    && !!container?.contains(activeElement)
  );
}
function resolveClipboardImageAltText(file: File) {
  const fileName = file.name.trim();
  if (!fileName) {
    return 'image';
  }

  const suffixIndex = fileName.lastIndexOf('.');
  if (suffixIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, suffixIndex) || fileName;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read clipboard image.'));
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string' || reader.result.length === 0) {
        reject(new Error('Clipboard image data URL is empty.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function encodeRgbaImageAsPngDataUrl(rgba: Uint8Array, width: number, height: number) {
  const imageWidth = Math.floor(width);
  const imageHeight = Math.floor(height);
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Clipboard image dimensions are invalid.');
  }
  const expectedLength = imageWidth * imageHeight * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(`Clipboard image RGBA payload length mismatch: expected ${expectedLength}, got ${rgba.length}.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  const imageData = context.createImageData(imageWidth, imageHeight);
  imageData.data.set(rgba);
  context.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Failed to encode clipboard image as PNG data URL.');
  }
  return dataUrl;
}
async function readNativeClipboardImageAsDataUrl() {
  const clipboardImage = await readClipboardImage();
  try {
    const [size, rgba] = await Promise.all([
      clipboardImage.size(),
      clipboardImage.rgba(),
    ]);
    return encodeRgbaImageAsPngDataUrl(rgba, size.width, size.height);
  } finally {
    await clipboardImage.close().catch(() => undefined);
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
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const bookmarks = useStore((state) => state.bookmarksByTab[tab.id] ?? EMPTY_BOOKMARKS);
  const addBookmark = useStore((state) => state.addBookmark);
  const removeBookmark = useStore((state) => state.removeBookmark);
  const toggleBookmark = useStore((state) => state.toggleBookmark);
  const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
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
  const bookmarkDecorationIdsRef = useRef<string[]>([]);
  const quotePairDecorationIdsRef = useRef<string[]>([]);
  const quotePairRequestSeqRef = useRef(0);
  const editorContextMenuRef = useRef<HTMLDivElement | null>(null);
  const submenuPanelRefs = useRef<Record<EditorSubmenuKey, HTMLDivElement | null>>({
    edit: null,
    sort: null,
    convert: null,
    bookmark: null,
  });
  const base64DecodeErrorToastTimerRef = useRef<number | null>(null);
  const pasteFromClipboardRef = useRef<((source: string) => Promise<void>) | null>(null);
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState | null>(null);
  const [submenuVerticalAlignments, setSubmenuVerticalAlignments] = useState<
    Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>
  >(() => ({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS }));
  const [submenuMaxHeights, setSubmenuMaxHeights] = useState<Record<EditorSubmenuKey, number | null>>(
    () => ({ ...DEFAULT_SUBMENU_MAX_HEIGHTS })
  );
  const [showBase64DecodeErrorToast, setShowBase64DecodeErrorToast] = useState(false);
  const monacoLanguage = useMemo(() => resolveMonacoLanguage(tab), [tab]);
  const tr = useCallback((key: string) => t(settings.language, key as Parameters<typeof t>[1]), [settings.language]);
  const resolveCurrentTab = useCallback(
    () =>
      useStore
        .getState()
        .tabs
        .find((candidate) => candidate.id === tab.id && candidate.tabType !== 'diff') ?? tab,
    [tab]
  );
  const {
    deleteLabel,
    selectAllLabel,
    copyLabel,
    cutLabel,
    pasteLabel,
    selectCurrentLineLabel,
    addCurrentLineToBookmarkLabel,
    editMenuLabel,
    sortMenuLabel,
    convertMenuLabel,
    convertBase64EncodeLabel,
    convertBase64DecodeLabel,
    copyBase64EncodeResultLabel,
    copyBase64DecodeResultLabel,
    base64DecodeFailedToastLabel,
    bookmarkMenuLabel,
    addBookmarkLabel,
    removeBookmarkLabel,
    editSubmenuPositionClassName,
    sortSubmenuPositionClassName,
    convertSubmenuPositionClassName,
    bookmarkSubmenuPositionClassName,
    editSubmenuStyle,
    sortSubmenuStyle,
    convertSubmenuStyle,
    bookmarkSubmenuStyle,
    cleanupMenuItems,
    sortMenuItems,
  } = useEditorContextMenuConfig({
    tr,
    submenuDirection: editorContextMenu?.submenuDirection,
    submenuVerticalAlignments,
    submenuMaxHeights,
  });

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
  const flushPendingSync = useCallback(async () => {
    await syncChainRef.current.catch(() => undefined);
  }, []);
  const hasEditorSelection = useCallback(() => {
    const selection = editorRef.current?.getSelection();
    return !!selection && !selection.isEmpty();
  }, []);
  const getSelectedEditorText = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection || selection.isEmpty()) {
      return '';
    }
    return model.getValueInRange(selection);
  }, []);
  const writePlainTextToClipboard = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('Clipboard write is not supported.');
  }, []);
  const readPlainTextFromClipboard = useCallback(async () => {
    try {
      return await readClipboardText();
    } catch {
      if (navigator.clipboard?.readText) {
        return navigator.clipboard.readText();
      }
      throw new Error('Clipboard read is not supported.');
    }
  }, []);
  const applySelectionEdit = useCallback((source: string, text: string) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    if (!editor || !selection) {
      return false;
    }
    editor.executeEdits(source, [
      {
        range: selection,
        text,
        forceMoveMarkers: true,
      },
    ]);
    setEditorContextMenu(null);
    editor.focus();
    return true;
  }, []);
  const applyMarkdownToolbarEdit = useCallback((action: MarkdownToolbarAction) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) {
      return;
    }

    const startOffset = model.getOffsetAt({
      lineNumber: selection.startLineNumber,
      column: selection.startColumn,
    });
    const endOffset = model.getOffsetAt({
      lineNumber: selection.endLineNumber,
      column: selection.endColumn,
    });
    const result = applyMarkdownToolbarAction({
      text: model.getValue(),
      selectionStart: startOffset,
      selectionEnd: endOffset,
      action,
      indentationUnit: buildIndentationUnit(settings.tabIndentMode, settings.tabWidth),
    });
    if (!result) {
      return;
    }

    const rangeStart = model.getPositionAt(result.replaceStart);
    const rangeEnd = model.getPositionAt(result.replaceEnd);
    editor.executeEdits('rutar-markdown-toolbar', [
      {
        range: {
          startLineNumber: rangeStart.lineNumber,
          startColumn: rangeStart.column,
          endLineNumber: rangeEnd.lineNumber,
          endColumn: rangeEnd.column,
        },
        text: result.insertText,
        forceMoveMarkers: true,
      },
    ]);

    const nextModel = editor.getModel();
    if (!nextModel) {
      editor.focus();
      return;
    }

    const nextSelectionStart = nextModel.getPositionAt(result.selectionStart);
    const nextSelectionEnd = nextModel.getPositionAt(result.selectionEnd);
    editor.setSelection({
      startLineNumber: nextSelectionStart.lineNumber,
      startColumn: nextSelectionStart.column,
      endLineNumber: nextSelectionEnd.lineNumber,
      endColumn: nextSelectionEnd.column,
    });
    editor.revealPositionInCenterIfOutsideViewport(nextSelectionEnd);
    editor.focus();
  }, [settings.tabIndentMode, settings.tabWidth]);
  const insertNativeClipboardImageAsMarkdown = useCallback(async () => {
    const currentTab = resolveCurrentTab();
    if (!isMarkdownTab(currentTab)) {
      return false;
    }
    const dataUrl = await readNativeClipboardImageAsDataUrl();
    applyMarkdownToolbarEdit({
      type: 'insert_image_base64',
      src: dataUrl,
      alt: 'image',
    });
    return true;
  }, [applyMarkdownToolbarEdit, resolveCurrentTab]);
  const pasteFromClipboard = useCallback(async (source: string) => {
    const language = useStore.getState().settings.language;
    const currentTab = resolveCurrentTab();
    const isMarkdownTarget = isMarkdownTab(currentTab);
    if (isMarkdownTarget) {
      try {
        if (await insertNativeClipboardImageAsMarkdown()) {
          return;
        }
      } catch (imageError) {
        console.warn('Failed to read clipboard image for markdown paste:', imageError);
      }
    }
    let clipboardText: string | null = null;
    try {
      clipboardText = await readPlainTextFromClipboard();
    } catch (textError) {
      if (!isMarkdownTarget) {
        console.warn('Failed to read clipboard text for paste:', textError);
        await message(`${t(language, 'toolbar.paste')} ${textError instanceof Error ? textError.message : String(textError)}`, {
          title: t(language, 'toolbar.paste'),
          kind: 'warning',
        });
        return;
      }
      await message(`${t(language, 'toolbar.paste')} ${textError instanceof Error ? textError.message : String(textError)}`, {
        title: t(language, 'toolbar.paste'),
        kind: 'warning',
      });
      return;
    }
    if (clipboardText !== null && clipboardText.trim().length > 0) {
      applySelectionEdit(source, clipboardText);
      return;
    }
    if (clipboardText !== null) {
      applySelectionEdit(source, clipboardText);
    }
  }, [applySelectionEdit, insertNativeClipboardImageAsMarkdown, readPlainTextFromClipboard, resolveCurrentTab]);
  pasteFromClipboardRef.current = pasteFromClipboard;
  const handleSelectAllFromContext = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }
    const endLine = Math.max(1, model.getLineCount());
    const endColumn = model.getLineMaxColumn(endLine);
    editor.setSelection({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn,
    });
    editor.focus();
  }, []);
  const selectLineByNumber = useCallback((lineNumber: number) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }
    const lineCount = Math.max(1, model.getLineCount());
    const safeLine = Math.max(1, Math.min(Math.floor(lineNumber), lineCount));
    const endLineNumber = safeLine < lineCount ? safeLine + 1 : safeLine;
    const endColumn = safeLine < lineCount ? 1 : model.getLineMaxColumn(safeLine);
    editor.setSelection({
      startLineNumber: safeLine,
      startColumn: 1,
      endLineNumber,
      endColumn,
    });
    editor.setPosition({ lineNumber: safeLine, column: 1 });
    editor.revealLineInCenterIfOutsideViewport(safeLine);
    editor.focus();
  }, []);
  const resolveContextLineNumber = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const fallbackLine = editor?.getPosition()?.lineNumber ?? cursorSnapshotRef.current.line ?? 1;
    const menuLine = editorContextMenu?.lineNumber ?? fallbackLine;
    const lineCount = Math.max(1, model?.getLineCount() ?? tab.lineCount);
    return Math.max(1, Math.min(Math.floor(menuLine), lineCount));
  }, [editorContextMenu, tab.lineCount]);
  const hasContextBookmark = useMemo(
    () => editorContextMenu !== null && bookmarks.includes(editorContextMenu.lineNumber),
    [bookmarks, editorContextMenu]
  );
  const applyBookmarkDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      bookmarkDecorationIdsRef.current = editor.deltaDecorations(bookmarkDecorationIdsRef.current, []);
      return;
    }
    const lineCount = Math.max(1, model.getLineCount());
    const nextDecorations: monaco.editor.IModelDeltaDecoration[] = Array.from(new Set(bookmarks))
      .map((lineNumber) => Math.floor(lineNumber))
      .filter((lineNumber) => lineNumber >= 1 && lineNumber <= lineCount)
      .sort((left, right) => left - right)
      .map((lineNumber) => ({
        range: {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: 1,
        },
        options: {
          lineNumberClassName: BOOKMARK_LINE_NUMBER_CLASS_NAME,
        },
      }));
    bookmarkDecorationIdsRef.current = editor.deltaDecorations(
      bookmarkDecorationIdsRef.current,
      nextDecorations
    );
  }, [bookmarks]);
  const clearQuotePairDecorations = useCallback((targetEditor: monaco.editor.IStandaloneCodeEditor | null) => {
    quotePairRequestSeqRef.current += 1;
    if (!targetEditor) {
      quotePairDecorationIdsRef.current = [];
      return;
    }
    if (quotePairDecorationIdsRef.current.length === 0) {
      return;
    }
    quotePairDecorationIdsRef.current = targetEditor.deltaDecorations(quotePairDecorationIdsRef.current, []);
  }, []);
  const updateQuotePairDecorations = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || tab.largeFileMode) {
      clearQuotePairDecorations(editor ?? null);
      return;
    }

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      clearQuotePairDecorations(editor);
      return;
    }

    const position = editor.getPosition();
    if (!position) {
      clearQuotePairDecorations(editor);
      return;
    }

    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const leftChar = offset > 0 ? text.charAt(offset - 1) : '';
    const rightChar = offset < text.length ? text.charAt(offset) : '';
    if (!isQuoteCharacter(leftChar) && !isQuoteCharacter(rightChar)) {
      clearQuotePairDecorations(editor);
      return;
    }

    const requestSeq = quotePairRequestSeqRef.current + 1;
    quotePairRequestSeqRef.current = requestSeq;
    try {
      const payload = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
        text,
        offset,
      });
      if (quotePairRequestSeqRef.current !== requestSeq || editorRef.current !== editor) {
        return;
      }
      if (!payload) {
        clearQuotePairDecorations(editor);
        return;
      }

      const leftQuote = text.charAt(payload.leftOffset);
      const rightQuote = text.charAt(payload.rightOffset);
      if (!isQuoteCharacter(leftQuote) || leftQuote !== rightQuote) {
        clearQuotePairDecorations(editor);
        return;
      }

      const lineCount = Math.max(1, model.getLineCount());
      const leftLine = Math.max(1, Math.min(payload.leftLine, lineCount));
      const rightLine = Math.max(1, Math.min(payload.rightLine, lineCount));
      const leftColumn = Math.max(1, payload.leftColumn);
      const rightColumn = Math.max(1, payload.rightColumn);
      const nextDecorations: monaco.editor.IModelDeltaDecoration[] = [
        {
          range: {
            startLineNumber: leftLine,
            startColumn: leftColumn,
            endLineNumber: leftLine,
            endColumn: leftColumn + 1,
          },
          options: {
            inlineClassName: MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME,
          },
        },
        {
          range: {
            startLineNumber: rightLine,
            startColumn: rightColumn,
            endLineNumber: rightLine,
            endColumn: rightColumn + 1,
          },
          options: {
            inlineClassName: MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME,
          },
        },
      ];
      quotePairDecorationIdsRef.current = editor.deltaDecorations(
        quotePairDecorationIdsRef.current,
        nextDecorations
      );
    } catch (error) {
      if (quotePairRequestSeqRef.current === requestSeq && editorRef.current === editor) {
        clearQuotePairDecorations(editor);
      }
      console.error('Failed to resolve matching quote pair in Monaco editor:', error);
    }
  }, [clearQuotePairDecorations, tab.largeFileMode]);
  const triggerBase64DecodeErrorToast = useCallback(() => {
    if (base64DecodeErrorToastTimerRef.current !== null) {
      window.clearTimeout(base64DecodeErrorToastTimerRef.current);
    }
    setShowBase64DecodeErrorToast(true);
    base64DecodeErrorToastTimerRef.current = window.setTimeout(() => {
      setShowBase64DecodeErrorToast(false);
      base64DecodeErrorToastTimerRef.current = null;
    }, 2200);
  }, []);
  const updateSubmenuVerticalAlignment = useCallback(
    (submenuKey: EditorSubmenuKey, anchorElement: HTMLDivElement) => {
      const submenuElement = submenuPanelRefs.current[submenuKey];
      if (!submenuElement) {
        return;
      }
      const viewportPadding = 8;
      const submenuHeight = submenuElement.scrollHeight;
      if (submenuHeight <= 0) {
        return;
      }
      const anchorRect = anchorElement.getBoundingClientRect();
      const availableBelow = Math.max(0, Math.floor(window.innerHeight - viewportPadding - anchorRect.top));
      const availableAbove = Math.max(0, Math.floor(anchorRect.bottom - viewportPadding));
      const topAlignedBottom = anchorRect.top + submenuHeight;
      const bottomAlignedTop = anchorRect.bottom - submenuHeight;
      let nextAlign: EditorSubmenuVerticalAlign = 'top';
      if (topAlignedBottom > window.innerHeight - viewportPadding) {
        if (bottomAlignedTop >= viewportPadding) {
          nextAlign = 'bottom';
        } else {
          nextAlign = availableAbove > availableBelow ? 'bottom' : 'top';
        }
      }
      const availableForCurrentAlign = nextAlign === 'bottom' ? availableAbove : availableBelow;
      const nextMaxHeight =
        submenuHeight > availableForCurrentAlign && availableForCurrentAlign > 0
          ? availableForCurrentAlign
          : null;
      setSubmenuVerticalAlignments((current) =>
        current[submenuKey] === nextAlign
          ? current
          : {
              ...current,
              [submenuKey]: nextAlign,
            }
      );
      setSubmenuMaxHeights((current) =>
        current[submenuKey] === nextMaxHeight
          ? current
          : {
              ...current,
              [submenuKey]: nextMaxHeight,
            }
      );
    },
    []
  );
  const isEditorContextMenuActionDisabled = useCallback(
    (action: EditorContextMenuAction) => {
      const hasSelection = !!editorContextMenu?.hasSelection;
      if (action === 'paste' || action === 'selectAll') {
        return false;
      }
      return !hasSelection;
    },
    [editorContextMenu]
  );
  const handleEditorContextMenuAction = useCallback(
    async (action: EditorContextMenuAction) => {
      if (isEditorContextMenuActionDisabled(action)) {
        setEditorContextMenu(null);
        return;
      }
      if (action === 'selectAll') {
        handleSelectAllFromContext();
        setEditorContextMenu(null);
        return;
      }
      if (action === 'paste') {
        await pasteFromClipboard('rutar-context-paste');
        setEditorContextMenu(null);
        return;
      }
      if (action === 'delete') {
        applySelectionEdit('rutar-context-delete', '');
        setEditorContextMenu(null);
        return;
      }
      const selectedText = getSelectedEditorText();
      if (!selectedText) {
        setEditorContextMenu(null);
        return;
      }
      try {
        await writePlainTextToClipboard(selectedText);
      } catch (error) {
        console.warn('Failed to write selected text to clipboard from context menu:', error);
      }
      if (action === 'cut') {
        applySelectionEdit('rutar-context-cut', '');
      }
      setEditorContextMenu(null);
    },
    [
      applySelectionEdit,
      getSelectedEditorText,
      handleSelectAllFromContext,
      isEditorContextMenuActionDisabled,
      pasteFromClipboard,
      writePlainTextToClipboard,
    ]
  );
  const handleCleanupDocumentFromContext = useCallback(
    async (action: EditorCleanupAction) => {
      setEditorContextMenu(null);
      try {
        await flushPendingSync();
        const newLineCount = await invoke<number>('cleanup_document', {
          id: tab.id,
          action,
        });
        const safeLineCount = Math.max(1, newLineCount);
        updateTab(tab.id, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        ignoreDocumentUpdatedCountRef.current += 1;
        dispatchDocumentUpdated(tab.id);
        await ensureEditorModelLoaded(resolveCurrentTab(), 'refresh');
      } catch (error) {
        console.error('Failed to cleanup document via context menu:', error);
      }
    },
    [ensureEditorModelLoaded, flushPendingSync, resolveCurrentTab, tab.id, updateTab]
  );
  const handleConvertSelectionFromContext = useCallback(
    async (action: EditorConvertAction) => {
      const shouldCopyResult = action === 'copy_base64_encode' || action === 'copy_base64_decode';
      const shouldDecode = action === 'base64_decode' || action === 'copy_base64_decode';
      const selectedText = getSelectedEditorText();
      if (!selectedText) {
        setEditorContextMenu(null);
        return;
      }
      let nextText = '';
      try {
        nextText = await invoke<string>('convert_text_base64', {
          text: selectedText,
          action: shouldDecode ? 'base64_decode' : 'base64_encode',
        });
      } catch (error) {
        if (shouldDecode) {
          triggerBase64DecodeErrorToast();
        } else {
          console.error('Failed to convert Base64 text from context menu:', error);
        }
        setEditorContextMenu(null);
        return;
      }
      if (shouldCopyResult) {
        try {
          await writePlainTextToClipboard(nextText);
        } catch (error) {
          console.warn('Failed to copy Base64 conversion result to clipboard:', error);
        }
      } else {
        applySelectionEdit('rutar-context-convert', nextText);
      }
      setEditorContextMenu(null);
    },
    [applySelectionEdit, getSelectedEditorText, triggerBase64DecodeErrorToast, writePlainTextToClipboard]
  );
  const handleAddBookmarkFromContext = useCallback(() => {
    const line = resolveContextLineNumber();
    addBookmark(tab.id, line);
    setEditorContextMenu(null);
  }, [addBookmark, resolveContextLineNumber, tab.id]);
  const handleRemoveBookmarkFromContext = useCallback(() => {
    const line = resolveContextLineNumber();
    removeBookmark(tab.id, line);
    setEditorContextMenu(null);
  }, [removeBookmark, resolveContextLineNumber, tab.id]);
  const handleSelectCurrentLineFromContext = useCallback(() => {
    selectLineByNumber(resolveContextLineNumber());
    setEditorContextMenu(null);
  }, [resolveContextLineNumber, selectLineByNumber]);
  const handleAddCurrentLineBookmarkFromContext = useCallback(() => {
    const line = resolveContextLineNumber();
    const hasBookmark = bookmarks.includes(line);
    toggleBookmark(tab.id, line);
    if (!hasBookmark && !bookmarkSidebarOpen) {
      toggleBookmarkSidebar(true);
    }
    setEditorContextMenu(null);
  }, [bookmarkSidebarOpen, bookmarks, resolveContextLineNumber, tab.id, toggleBookmark, toggleBookmarkSidebar]);
  const handleMonacoContextMenu = useCallback(
    (event: monaco.editor.IEditorMouseEvent) => {
      event.event.preventDefault();
      event.event.stopPropagation();
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) {
        return;
      }
      const targetType = event.target.type;
      const isLineNumberTarget = targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      if (
        !isLineNumberTarget &&
        (targetType === monaco.editor.MouseTargetType.SCROLLBAR ||
          targetType === monaco.editor.MouseTargetType.OVERVIEW_RULER ||
          targetType === monaco.editor.MouseTargetType.OUTSIDE_EDITOR)
      ) {
        setEditorContextMenu(null);
        return;
      }
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;
      const rawClientX = browserEvent?.clientX ?? 0;
      const rawClientY = browserEvent?.clientY ?? 0;
      const menuWidth = isLineNumberTarget ? 176 : 160;
      const menuHeight = isLineNumberTarget ? 96 : 360;
      const viewportPadding = 8;
      const boundedX = Math.min(rawClientX, window.innerWidth - menuWidth - viewportPadding);
      const boundedY = Math.min(rawClientY, window.innerHeight - menuHeight - viewportPadding);
      const safeX = Math.max(viewportPadding, boundedX);
      const safeY = Math.max(viewportPadding, boundedY);
      const submenuWidth = 192;
      const submenuGap = 4;
      const canOpenSubmenuRight =
        safeX + menuWidth + submenuGap + submenuWidth + viewportPadding <= window.innerWidth;
      const fallbackLine = editor.getPosition()?.lineNumber ?? cursorSnapshotRef.current.line ?? 1;
      const rawLine = event.target.position?.lineNumber ?? fallbackLine;
      const safeLine = Math.max(1, Math.min(Math.floor(rawLine), model.getLineCount()));
      setSubmenuVerticalAlignments({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS });
      setSubmenuMaxHeights({ ...DEFAULT_SUBMENU_MAX_HEIGHTS });
      setEditorContextMenu({
        target: isLineNumberTarget ? 'lineNumber' : 'editor',
        x: safeX,
        y: safeY,
        hasSelection: hasEditorSelection(),
        lineNumber: safeLine,
        submenuDirection: canOpenSubmenuRight ? 'right' : 'left',
      });
    },
    [hasEditorSelection]
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
      renderLineHighlight: settings.highlightCurrentLine ? 'line' : 'none',
      tabSize: settings.tabWidth,
      insertSpaces: settings.tabIndentMode === 'spaces',
      glyphMargin: false,
      lineDecorationsWidth: 10,
      folding: !tab.largeFileMode,
      wrappingStrategy: tab.largeFileMode ? 'simple' : 'advanced',
      scrollBeyondLastColumn: 0,
      scrollBeyondLastLine: false,
      contextmenu: false,
      find: {
        addExtraSpaceOnTop: false,
      },
    });

    editorRef.current = editor;
    const editorDomNode = containerRef.current;
    const suppressFindWidgetHoverTooltip = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.closest('.find-widget')) {
        return;
      }
      // Monaco find-widget tooltip comes from delayed mouseover hover service.
      // Stop propagation in capture phase to fully disable those tooltip popups.
      event.stopPropagation();
    };
    editorDomNode?.addEventListener('mouseover', suppressFindWidgetHoverTooltip, true);
    const insertClipboardImageDataUrl = (dataUrlPromise: Promise<string>, alt: string) => {
      const language = useStore.getState().settings.language;
      void dataUrlPromise
        .then((dataUrl) => {
          applyMarkdownToolbarEdit({
            type: 'insert_image_base64',
            src: dataUrl,
            alt,
          });
        })
        .catch(async (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Failed to convert pasted clipboard image into markdown Base64 image:', error);
          await message(`${t(language, 'markdownToolbar.image.base64Failed')} ${errorMessage}`, {
            title: t(language, 'markdownToolbar.image'),
            kind: 'warning',
          });
        });
    };
    const handleEditorPaste = (event: ClipboardEvent) => {
      const activeTabId = activeTabIdRef.current;
      if (!activeTabId) {
        return;
      }
      if (!isMonacoEditorTextFocused(editor, editorDomNode)) {
        return;
      }

      const currentTab =
        useStore
          .getState()
          .tabs
          .find((candidate) => candidate.id === activeTabId && candidate.tabType !== 'diff') ?? null;
      if (!isMarkdownTab(currentTab)) {
        return;
      }

      const imageFile = resolveClipboardImageFile(event);
      if (imageFile) {
        event.preventDefault();
        event.stopPropagation();
        insertClipboardImageDataUrl(
          readBlobAsDataUrl(imageFile),
          resolveClipboardImageAltText(imageFile)
        );
        return;
      }
      const pasteFromClipboard = pasteFromClipboardRef.current;
      if (!pasteFromClipboard) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void pasteFromClipboard('rutar-paste');
    };
    window.addEventListener('paste', handleEditorPaste, true);

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
      void updateQuotePairDecorations();
    });
    const mouseDownDisposable = editor.onMouseDown((event: monaco.editor.IEditorMouseEvent) => {
      const targetType = event.target.type;
      const clickDetail =
        Number(event.event.detail ?? 0) ||
        Number((event.event.browserEvent as MouseEvent | undefined)?.detail ?? 0);
      const isLineNumberDoubleClick =
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS &&
        event.event.leftButton &&
        clickDetail >= 2;
      if (isLineNumberDoubleClick) {
        const model = editor.getModel();
        const activeTabId = activeTabIdRef.current;
        if (!model || !activeTabId) {
          return;
        }
        const fallbackLine = editor.getPosition()?.lineNumber ?? cursorSnapshotRef.current.line ?? 1;
        const rawLine = event.target.position?.lineNumber ?? fallbackLine;
        const safeLine = Math.max(1, Math.min(Math.floor(rawLine), model.getLineCount()));
        const store = useStore.getState();
        const currentBookmarks = store.bookmarksByTab[activeTabId] ?? EMPTY_BOOKMARKS;
        const hasBookmark = currentBookmarks.includes(safeLine);
        store.toggleBookmark(activeTabId, safeLine);
        if (!hasBookmark && !store.bookmarkSidebarOpen) {
          store.toggleBookmarkSidebar(true);
        }
        event.event.preventDefault();
        event.event.stopPropagation();
        return;
      }
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

    const contextMenuDisposable = editor.onContextMenu(handleMonacoContextMenu);
    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
      mouseDownDisposable.dispose();
      contextMenuDisposable.dispose();
      editorDomNode?.removeEventListener('mouseover', suppressFindWidgetHoverTooltip, true);
      window.removeEventListener('paste', handleEditorPaste, true);

      const activeTabId = activeTabIdRef.current;
      if (activeTabId) {
        viewStateByTabId.set(activeTabId, editor.saveViewState() ?? null);
      }

      clearQuotePairDecorations(editor);
      editor.dispose();
      editorRef.current = null;
      activeTabIdRef.current = null;
    };
  }, [
    applyMarkdownToolbarEdit,
    clearQuotePairDecorations,
    handleMonacoContextMenu,
    queueSyncEdits,
    setCursorPosition,
    updateQuotePairDecorations,
  ]);

  useEffect(() => {
    applyBookmarkDecorations();
  }, [applyBookmarkDecorations, tab.id]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    monaco.editor.setTheme(resolveRutarMonacoTheme(settings.theme));
    editor.updateOptions({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineNumbers: settings.showLineNumbers ? 'on' : 'off',
      wordWrap: settings.wordWrap ? 'on' : 'off',
      tabSize: settings.tabWidth,
      insertSpaces: settings.tabIndentMode === 'spaces',
      minimap: { enabled: settings.minimap && !tab.largeFileMode },
      smoothScrolling: !tab.largeFileMode,
      lineDecorationsWidth: 10,
      bracketPairColorization: {
        enabled: !tab.largeFileMode,
      },
      occurrencesHighlight: tab.largeFileMode ? 'off' : 'singleFile',
      selectionHighlight: !tab.largeFileMode,
      renderValidationDecorations: tab.largeFileMode ? 'off' : 'on',
      renderLineHighlight: settings.highlightCurrentLine ? 'line' : 'none',
      folding: !tab.largeFileMode,
      wrappingStrategy: tab.largeFileMode ? 'simple' : 'advanced',
      scrollBeyondLastColumn: 0,
      contextmenu: false,
      find: {
        addExtraSpaceOnTop: false,
      },
    });
    editor.layout();
    void updateQuotePairDecorations();
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.showLineNumbers,
    settings.tabIndentMode,
    settings.tabWidth,
    settings.theme,
    settings.wordWrap,
    settings.minimap,
    settings.highlightCurrentLine,
    tab.largeFileMode,
    updateQuotePairDecorations,
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

    const targetModelUri = resolveMainEditorModelUri(tab);
    let model = modelByTabId.get(tab.id);
    const previousModel = model ?? null;
    let staleModelToDispose: monaco.editor.ITextModel | null = null;
    if (!model || !areMonacoUrisEqual(model.uri, targetModelUri)) {
      const existingModel = monaco.editor.getModel(targetModelUri);
      const previousText =
        previousModel && !previousModel.isDisposed() ? previousModel.getValue() : '';
      model = existingModel ?? monaco.editor.createModel(previousText, monacoLanguage, targetModelUri);
      modelByTabId.set(tab.id, model);
      const currentTab =
        useStore
          .getState()
          .tabs
          .find((candidate) => candidate.id === tab.id && candidate.tabType !== 'diff') ?? tab;
      if (!existingModel) {
        void ensureEditorModelLoaded(currentTab, 'bootstrap');
      }
      if (previousModel && previousModel !== model && !previousModel.isDisposed()) {
        staleModelToDispose = previousModel;
      }
    }

    if (model.getLanguageId() !== monacoLanguage) {
      monaco.editor.setModelLanguage(model, monacoLanguage);
    }

    editor.setModel(model);
    staleModelToDispose?.dispose();
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
  }, [ensureEditorModelLoaded, monacoLanguage, resolveCurrentTab, tab.id, tab.path, updateQuotePairDecorations]);

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
    if (!editorContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && editorContextMenuRef.current?.contains(target)) {
        return;
      }

      setEditorContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditorContextMenu(null);
      }
    };

    const closeMenu = () => {
      setEditorContextMenu(null);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [editorContextMenu]);

  useEffect(
    () => () => {
      if (base64DecodeErrorToastTimerRef.current !== null) {
        window.clearTimeout(base64DecodeErrorToastTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {

    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
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

      editor.focus();
    };

    const handleForceRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        preserveCaret?: boolean;
        preserveScroll?: boolean;
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

      const preserveCaret = customEvent.detail?.preserveCaret === true;
      const preserveScroll = customEvent.detail?.preserveScroll === true;
      const restoreLine = customEvent.detail?.restoreCursorLine;
      const restoreColumn = customEvent.detail?.restoreCursorColumn;
      const preservedViewState = preserveScroll ? editor.saveViewState() ?? null : null;
      const currentPosition = editor.getPosition();
      const savedCursor = useStore.getState().cursorPositionByTab[tab.id];
      const preservedCursor = preserveCaret
        ? {
            lineNumber: currentPosition?.lineNumber ?? savedCursor?.line ?? cursorSnapshotRef.current.line,
            column: currentPosition?.column ?? savedCursor?.column ?? cursorSnapshotRef.current.column,
          }
        : null;

      void ensureEditorModelLoaded(resolveCurrentTab(), 'refresh').then(() => {
        const model = editor.getModel();
        if (!model) {
          void updateQuotePairDecorations();
          return;
        }

        const hasExplicitRestoreCursor =
          typeof restoreLine === 'number'
          && Number.isFinite(restoreLine)
          && typeof restoreColumn === 'number'
          && Number.isFinite(restoreColumn);

        const targetPosition = hasExplicitRestoreCursor
          ? clampMonacoPosition(model, {
              lineNumber: restoreLine,
              column: restoreColumn,
            })
          : preservedCursor
            ? clampMonacoPosition(model, preservedCursor)
            : null;

        if (preservedViewState) {
          editor.restoreViewState(preservedViewState);
        }

        if (targetPosition) {
          editor.setPosition(targetPosition);
          cursorSnapshotRef.current = {
            line: targetPosition.lineNumber,
            column: targetPosition.column,
          };
          setCursorPosition(tab.id, targetPosition.lineNumber, targetPosition.column);

          if (preserveScroll) {
            editor.revealPositionInCenterIfOutsideViewport(targetPosition);
          } else {
            editor.revealPositionInCenter(targetPosition);
          }
        }

        void updateQuotePairDecorations();
      });
    };

    const handlePaste = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string; text?: string }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }
      const text = customEvent.detail?.text ?? '';
      applySelectionEdit('rutar-paste', text);
    };

    const handleMarkdownToolbarAction = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        action?: MarkdownToolbarAction;
      }>;
      if (customEvent.detail?.tabId !== tab.id || !customEvent.detail?.action) {
        return;
      }

      applyMarkdownToolbarEdit(customEvent.detail.action);
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
      if (!action) {
        return;
      }
      if (action === 'paste') {
        await pasteFromClipboard('rutar-toolbar-paste');
        return;
      }

      const selectedText = getSelectedEditorText();
      if (!selectedText) {
        return;
      }

      try {
        await writePlainTextToClipboard(selectedText);
      } catch (error) {
        console.warn('Failed to write selection to clipboard from toolbar action:', error);
      }

      if (action === 'cut') {
        applySelectionEdit('rutar-cut', '');
      }
    };

    const handleSearchClose = () => {
      editorRef.current?.focus();
    };
    const handleEditorFindOpen = (event: Event) => {
      const customEvent = event as CustomEvent<EditorFindOpenEventDetail>;
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
      const customEvent = event as CustomEvent<{ tabId?: string; skipEditorRefresh?: boolean }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      if (customEvent.detail?.skipEditorRefresh) {
        return;
      }
      if (ignoreDocumentUpdatedCountRef.current > 0) {
        ignoreDocumentUpdatedCountRef.current -= 1;
        return;
      }

      void ensureEditorModelLoaded(resolveCurrentTab(), 'refresh').then(() => {
        void updateQuotePairDecorations();
      });
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigate as EventListener);
    window.addEventListener('rutar:navigate-to-outline', handleNavigate as EventListener);
    window.addEventListener('rutar:force-refresh', handleForceRefresh as EventListener);
    window.addEventListener('rutar:paste-text', handlePaste as EventListener);
    window.addEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, handleMarkdownToolbarAction as EventListener);
    window.addEventListener('rutar:editor-clipboard-action', handleClipboardAction as EventListener);
    window.addEventListener('rutar:search-close', handleSearchClose as EventListener);
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, handleEditorFindOpen as EventListener);
    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigate as EventListener);
      window.removeEventListener('rutar:navigate-to-outline', handleNavigate as EventListener);
      window.removeEventListener('rutar:force-refresh', handleForceRefresh as EventListener);
      window.removeEventListener('rutar:paste-text', handlePaste as EventListener);
      window.removeEventListener(MARKDOWN_TOOLBAR_ACTION_EVENT, handleMarkdownToolbarAction as EventListener);
      window.removeEventListener('rutar:editor-clipboard-action', handleClipboardAction as EventListener);
      window.removeEventListener('rutar:search-close', handleSearchClose as EventListener);
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, handleEditorFindOpen as EventListener);
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [
    applyMarkdownToolbarEdit,
    applySelectionEdit,
    ensureEditorModelLoaded,
    getSelectedEditorText,
    pasteFromClipboard,
    resolveCurrentTab,
    tab.id,
    updateQuotePairDecorations,
    writePlainTextToClipboard,
  ]);

  return (
    <div
      className="h-full w-full overflow-hidden bg-background"
      data-monaco-engine-state={engineStateRef.current.modelId}
      data-monaco-sync-version={engineStateRef.current.syncVersion}
      data-monaco-backend-version={engineStateRef.current.lastAppliedBackendVersion}
    >
      <div ref={containerRef} className="h-full w-full" />
      <EditorContextMenu
        editorContextMenu={editorContextMenu}
        editorContextMenuRef={editorContextMenuRef}
        submenuPanelRefs={submenuPanelRefs}
        editSubmenuStyle={editSubmenuStyle}
        sortSubmenuStyle={sortSubmenuStyle}
        convertSubmenuStyle={convertSubmenuStyle}
        bookmarkSubmenuStyle={bookmarkSubmenuStyle}
        editSubmenuPositionClassName={editSubmenuPositionClassName}
        sortSubmenuPositionClassName={sortSubmenuPositionClassName}
        convertSubmenuPositionClassName={convertSubmenuPositionClassName}
        bookmarkSubmenuPositionClassName={bookmarkSubmenuPositionClassName}
        cleanupMenuItems={cleanupMenuItems}
        sortMenuItems={sortMenuItems}
        copyLabel={copyLabel}
        cutLabel={cutLabel}
        pasteLabel={pasteLabel}
        deleteLabel={deleteLabel}
        selectAllLabel={selectAllLabel}
        selectCurrentLineLabel={selectCurrentLineLabel}
        addCurrentLineToBookmarkLabel={addCurrentLineToBookmarkLabel}
        editMenuLabel={editMenuLabel}
        sortMenuLabel={sortMenuLabel}
        convertMenuLabel={convertMenuLabel}
        convertBase64EncodeLabel={convertBase64EncodeLabel}
        convertBase64DecodeLabel={convertBase64DecodeLabel}
        copyBase64EncodeResultLabel={copyBase64EncodeResultLabel}
        copyBase64DecodeResultLabel={copyBase64DecodeResultLabel}
        bookmarkMenuLabel={bookmarkMenuLabel}
        addBookmarkLabel={addBookmarkLabel}
        removeBookmarkLabel={removeBookmarkLabel}
        hasContextBookmark={hasContextBookmark}
        onSelectCurrentLine={handleSelectCurrentLineFromContext}
        onAddCurrentLineBookmark={handleAddCurrentLineBookmarkFromContext}
        onEditorAction={(action) => {
          void handleEditorContextMenuAction(action);
        }}
        isEditorActionDisabled={isEditorContextMenuActionDisabled}
        onUpdateSubmenuVerticalAlignment={updateSubmenuVerticalAlignment}
        onCleanup={handleCleanupDocumentFromContext}
        onConvert={handleConvertSelectionFromContext}
        onAddBookmark={handleAddBookmarkFromContext}
        onRemoveBookmark={handleRemoveBookmarkFromContext}
      />
      <EditorBase64DecodeToast
        visible={showBase64DecodeErrorToast}
        message={base64DecodeFailedToastLabel}
      />
    </div>
  );
}
