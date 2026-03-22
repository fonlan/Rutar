import { invoke } from '@tauri-apps/api/core';
import { ArrowDown, ArrowUp, Save } from 'lucide-react';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { type DiffPanelSide, type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import {
  extractActualLines,
  findAlignedRowIndexByLineNumber,
  normalizeLineDiffResult,
} from './diffEditor.utils';
import type { DiffLineKind, LineDiffComparisonResult } from './diffEditor.types';
import type { MonacoTextEdit } from './monacoTypes';

export { diffEditorTestUtils } from './diffEditor.utils';

interface HistoryActionResult {
  lineCount: number;
  cursorLine?: number;
  cursorColumn?: number;
}

interface ApplyAlignedDiffPanelCopyResult {
  lineDiff: LineDiffComparisonResult;
  changed: boolean;
}
interface ApplyAlignedDiffEditResult {
  lineDiff: LineDiffComparisonResult;
  sourceIsDirty: boolean;
  targetIsDirty: boolean;
}
interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
}

type ActivePanel = 'source' | 'target';

interface PaneDiffDecoration {
  lineNumber: number;
  kind: DiffLineKind;
}

interface DiffOverviewSegment {
  key: string;
  kind: DiffLineKind;
  topPercent: number;
  heightPercent: number;
}

interface DiffContextMenuState {
  panel: ActivePanel;
  x: number;
  y: number;
  hasSelection: boolean;
}
interface DerivedDiffPresentation {
  alignedLineCount: number;
  rowKinds: Array<DiffLineKind | null>;
  sourceDecorations: PaneDiffDecoration[];
  targetDecorations: PaneDiffDecoration[];
}
interface DiffPlaceholderZoneSpec {
  afterLineNumber: number;
  heightInLines: number;
}

const DIFF_SPLITTER_WIDTH_PX = 20;
const DIFF_SHARED_SCROLLBAR_WIDTH_PX = 10;
const DIFF_CONTEXT_MENU_WIDTH_PX = 176;
const DIFF_CONTEXT_MENU_HEIGHT_PX = 148;
const DIFF_CONTEXT_MENU_VIEWPORT_PADDING_PX = 8;
const SCROLL_SYNC_EPSILON = 0.5;
const DIFF_REFRESH_DEBOUNCE_MS = 180;
const DIFF_CONTEXT_MENU_BUTTON_CLASS_NAME =
  'w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const DIFF_CONTEXT_MENU_DISABLED_BUTTON_CLASS_NAME =
  `${DIFF_CONTEXT_MENU_BUTTON_CLASS_NAME} disabled:cursor-not-allowed disabled:opacity-50`;
const DIFF_HEADER_ICON_BUTTON_CLASS_NAME =
  'rounded border border-border/60 p-1.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent';

const DIFF_KIND_META: Record<
  DiffLineKind,
  {
    lineClassName: string;
    gutterClassName: string;
    markerColor: string;
  }
> = {
  insert: {
    lineClassName: 'rutar-diff-line-insert',
    gutterClassName: 'rutar-diff-gutter-insert',
    markerColor: 'rgba(16, 185, 129, 0.88)',
  },
  delete: {
    lineClassName: 'rutar-diff-line-delete',
    gutterClassName: 'rutar-diff-gutter-delete',
    markerColor: 'rgba(245, 158, 11, 0.88)',
  },
  modify: {
    lineClassName: 'rutar-diff-line-modify',
    gutterClassName: 'rutar-diff-gutter-modify',
    markerColor: 'rgba(239, 68, 68, 0.88)',
  },
};

function toDiffLineKind(value: unknown): DiffLineKind | null {
  if (value === 'insert' || value === 'delete' || value === 'modify') {
    return value;
  }
  return null;
}

function resolveDiffKindAtAlignedRow(payload: DiffTabPayload, index: number): DiffLineKind | null {
  const explicitKind = toDiffLineKind(payload.alignedDiffKinds?.[index]);
  if (explicitKind) {
    return explicitKind;
  }

  const sourcePresent = payload.alignedSourcePresent[index] !== false;
  const targetPresent = payload.alignedTargetPresent[index] !== false;

  if (sourcePresent && !targetPresent) {
    return 'delete';
  }
  if (!sourcePresent && targetPresent) {
    return 'insert';
  }

  const sourceLine = payload.alignedSourceLines[index] ?? '';
  const targetLine = payload.alignedTargetLines[index] ?? '';
  if (sourceLine !== targetLine) {
    return 'modify';
  }
  return null;
}

function deriveDiffPresentation(payload: DiffTabPayload): DerivedDiffPresentation {
  const alignedLineCount = Math.max(
    1,
    payload.alignedLineCount || 0,
    payload.alignedSourceLines.length,
    payload.alignedTargetLines.length,
    payload.alignedSourcePresent.length,
    payload.alignedTargetPresent.length,
    Array.isArray(payload.alignedDiffKinds) ? payload.alignedDiffKinds.length : 0
  );

  const rowKinds: Array<DiffLineKind | null> = [];
  const sourceDecorations: PaneDiffDecoration[] = [];
  const targetDecorations: PaneDiffDecoration[] = [];
  let sourceLineNumber = 0;
  let targetLineNumber = 0;

  for (let index = 0; index < alignedLineCount; index += 1) {
    const sourcePresent = payload.alignedSourcePresent[index] !== false;
    const targetPresent = payload.alignedTargetPresent[index] !== false;

    if (sourcePresent) {
      sourceLineNumber += 1;
    }
    if (targetPresent) {
      targetLineNumber += 1;
    }

    const kind = resolveDiffKindAtAlignedRow(payload, index);
    rowKinds.push(kind);
    if (!kind) {
      continue;
    }

    if (sourcePresent && sourceLineNumber > 0) {
      sourceDecorations.push({ lineNumber: sourceLineNumber, kind });
    }
    if (targetPresent && targetLineNumber > 0) {
      targetDecorations.push({ lineNumber: targetLineNumber, kind });
    }
  }

  return {
    alignedLineCount,
    rowKinds,
    sourceDecorations,
    targetDecorations,
  };
}

function buildDiffOverviewSegments(
  rowKinds: Array<DiffLineKind | null>,
  alignedLineCount: number
): DiffOverviewSegment[] {
  const safeLineCount = Math.max(1, alignedLineCount);
  const segments: DiffOverviewSegment[] = [];

  let index = 0;
  while (index < rowKinds.length) {
    const kind = rowKinds[index];
    if (!kind) {
      index += 1;
      continue;
    }

    let endIndex = index;
    while (endIndex + 1 < rowKinds.length && rowKinds[endIndex + 1] === kind) {
      endIndex += 1;
    }

    segments.push({
      key: `${kind}-${index}-${endIndex}`,
      kind,
      topPercent: (index / safeLineCount) * 100,
      heightPercent: ((endIndex - index + 1) / safeLineCount) * 100,
    });

    index = endIndex + 1;
  }

  return segments;
}
function resolveAlignedRowIndexFromPaneLine(present: boolean[], lineNumber: number) {
  const directIndex = findAlignedRowIndexByLineNumber(present, lineNumber);
  if (directIndex >= 0) {
    return directIndex;
  }

  let currentLine = 0;
  let lastPresentIndex = -1;
  for (let index = 0; index < present.length; index += 1) {
    if (!present[index]) {
      continue;
    }
    currentLine += 1;
    lastPresentIndex = index;
    if (currentLine >= lineNumber) {
      return index;
    }
  }

  if (lastPresentIndex >= 0) {
    return lastPresentIndex;
  }
  return Math.max(0, present.length - 1);
}
function resolvePaneLineNumberFromAlignedRow(present: boolean[], rowIndex: number, lineCount: number) {
  const safeLineCount = Math.max(1, lineCount);
  const safeRowIndex = Math.max(0, Math.min(rowIndex, Math.max(0, present.length - 1)));
  let lineNumber = 0;
  for (let index = 0; index <= safeRowIndex; index += 1) {
    if (!present[index]) {
      if (index === safeRowIndex) {
        return Math.min(safeLineCount, Math.max(1, lineNumber + 1));
      }
      continue;
    }
    lineNumber += 1;
    if (index === safeRowIndex) {
      return Math.min(safeLineCount, Math.max(1, lineNumber));
    }
  }
  return Math.min(safeLineCount, Math.max(1, lineNumber || 1));
}
function buildDiffPlaceholderZoneSpecs(
  payload: DiffTabPayload,
  side: ActivePanel
): DiffPlaceholderZoneSpec[] {
  const alignedLineCount = Math.max(
    1,
    payload.alignedLineCount || 0,
    payload.alignedSourcePresent.length,
    payload.alignedTargetPresent.length
  );
  const countsByAnchor = new Map<number, number>();
  let sourceLineNumber = 0;
  let targetLineNumber = 0;
  for (let index = 0; index < alignedLineCount; index += 1) {
    const sourcePresent = payload.alignedSourcePresent[index] !== false;
    const targetPresent = payload.alignedTargetPresent[index] !== false;
    if (!sourcePresent && targetPresent && side === 'source') {
      const anchor = sourceLineNumber;
      countsByAnchor.set(anchor, (countsByAnchor.get(anchor) ?? 0) + 1);
    }
    if (sourcePresent && !targetPresent && side === 'target') {
      const anchor = targetLineNumber;
      countsByAnchor.set(anchor, (countsByAnchor.get(anchor) ?? 0) + 1);
    }
    if (sourcePresent) {
      sourceLineNumber += 1;
    }
    if (targetPresent) {
      targetLineNumber += 1;
    }
  }
  return Array.from(countsByAnchor.entries())
    .sort(([leftAnchor], [rightAnchor]) => leftAnchor - rightAnchor)
    .map(([afterLineNumber, heightInLines]) => ({
      afterLineNumber,
      heightInLines: Math.max(1, heightInLines),
    }));
}

function buildDiffPayloadFromComparison(
  result: LineDiffComparisonResult,
  sourceMeta: { id: string; name: string; path: string },
  targetMeta: { id: string; name: string; path: string }
): DiffTabPayload {
  const normalized = normalizeLineDiffResult(result);
  return {
    sourceTabId: sourceMeta.id,
    targetTabId: targetMeta.id,
    sourceName: sourceMeta.name,
    targetName: targetMeta.name,
    sourcePath: sourceMeta.path,
    targetPath: targetMeta.path,
    alignedSourceLines: normalized.alignedSourceLines,
    alignedTargetLines: normalized.alignedTargetLines,
    alignedSourcePresent: normalized.alignedSourcePresent,
    alignedTargetPresent: normalized.alignedTargetPresent,
    diffLineNumbers: normalized.diffLineNumbers,
    sourceDiffLineNumbers: normalized.sourceDiffLineNumbers,
    targetDiffLineNumbers: normalized.targetDiffLineNumbers,
    alignedDiffKinds: normalized.alignedDiffKinds,
    sourceLineCount: Math.max(1, normalized.sourceLineCount),
    targetLineCount: Math.max(1, normalized.targetLineCount),
    alignedLineCount: Math.max(1, normalized.alignedLineCount),
  };
}
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

function getSelectedMonacoLineRange(
  selection: monaco.Selection | null,
  position: monaco.Position | null
) {
  const fallbackLineNumber = Math.max(1, position?.lineNumber ?? selection?.startLineNumber ?? 1);
  if (!selection || selection.isEmpty()) {
    return {
      startLineNumber: fallbackLineNumber,
      endLineNumber: fallbackLineNumber,
    };
  }
  const startLineNumber = Math.max(1, selection.startLineNumber);
  const rawEndLineNumber = Math.max(startLineNumber, selection.endLineNumber);
  const inclusiveEndLineNumber =
    selection.endColumn <= 1 && rawEndLineNumber > startLineNumber
      ? rawEndLineNumber - 1
      : rawEndLineNumber;
  return {
    startLineNumber,
    endLineNumber: Math.max(startLineNumber, inclusiveEndLineNumber),
  };
}
function resolveAlignedRowRangeForSelection(
  side: ActivePanel,
  selection: monaco.Selection | null,
  position: monaco.Position | null,
  payload: DiffTabPayload
) {
  const present = side === 'source' ? payload.alignedSourcePresent : payload.alignedTargetPresent;
  const { startLineNumber, endLineNumber } = getSelectedMonacoLineRange(selection, position);
  const startRowIndex = findAlignedRowIndexByLineNumber(present, startLineNumber);
  const endRowIndex = findAlignedRowIndexByLineNumber(present, endLineNumber);
  if (startRowIndex < 0 || endRowIndex < 0) {
    return null;
  }
  return {
    startRowIndex: Math.min(startRowIndex, endRowIndex),
    endRowIndex: Math.max(startRowIndex, endRowIndex),
  };
}
function serializeActualDiffLines(
  alignedLines: string[],
  present: boolean[],
  trailingNewline: boolean
) {
  const text = extractActualLines(alignedLines, present).join('\n');
  return trailingNewline ? `${text}\n` : text;
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
  const [diffContextMenu, setDiffContextMenu] = useState<DiffContextMenuState | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const diffContextMenuRef = useRef<HTMLDivElement | null>(null);
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
  const sourceDecorationIdsRef = useRef<string[]>([]);
  const targetDecorationIdsRef = useRef<string[]>([]);
  const sourceViewZoneIdsRef = useRef<string[]>([]);
  const targetViewZoneIdsRef = useRef<string[]>([]);
  const sharedScrollRef = useRef<HTMLDivElement | null>(null);
  const sharedScrollContentRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncLockRef = useRef(false);
  const sharedScrollMetricsRef = useRef({
    sourceMaxTop: 0,
    targetMaxTop: 0,
    sharedMaxTop: 0,
  });
  const diffRefreshTimerRef = useRef<number | null>(null);
  const diffRefreshSequenceRef = useRef(0);

  const sourceLanguage = resolveMonacoLanguage(sourceTab);
  const targetLanguage = resolveMonacoLanguage(targetTab);
  const sourceTabId = sourceTab?.id ?? null;
  const targetTabId = targetTab?.id ?? null;
  const sourceTitle = sourceTab?.name || tab.diffPayload.sourceName;
  const targetTitle = targetTab?.name || tab.diffPayload.targetName;
  const sourceSaveEnabled = Boolean(sourceTab?.isDirty);
  const targetSaveEnabled = Boolean(targetTab?.isDirty);
  const diffPresentation = useMemo(
    () => deriveDiffPresentation(tab.diffPayload),
    [tab.diffPayload]
  );
  const diffOverviewSegments = useMemo(
    () => buildDiffOverviewSegments(diffPresentation.rowKinds, diffPresentation.alignedLineCount),
    [diffPresentation.alignedLineCount, diffPresentation.rowKinds]
  );

  const diffRowIndexes = useMemo(
    () =>
      diffPresentation.rowKinds.reduce<number[]>((indexes, kind, index) => {
        if (kind) {
          indexes.push(index);
        }
        return indexes;
      }, []),
    [diffPresentation.rowKinds]
  );
  const hasDiffRows = diffRowIndexes.length > 0;
  const clearScheduledDiffRefresh = useCallback(() => {
    if (diffRefreshTimerRef.current !== null) {
      window.clearTimeout(diffRefreshTimerRef.current);
      diffRefreshTimerRef.current = null;
    }
  }, []);
  const applyLiveDiffResult = useCallback(
    (result: LineDiffComparisonResult) => {
      const sourceMeta = {
        id: sourceTab?.id ?? tab.diffPayload.sourceTabId,
        name: sourceTab?.name ?? tab.diffPayload.sourceName,
        path: sourceTab?.path ?? tab.diffPayload.sourcePath,
      };
      const targetMeta = {
        id: targetTab?.id ?? tab.diffPayload.targetTabId,
        name: targetTab?.name ?? tab.diffPayload.targetName,
        path: targetTab?.path ?? tab.diffPayload.targetPath,
      };
      const nextPayload = buildDiffPayloadFromComparison(result, sourceMeta, targetMeta);
      updateTab(tab.id, {
        lineCount: Math.max(1, nextPayload.alignedLineCount),
        diffPayload: nextPayload,
      });
    },
    [
      sourceTab?.id,
      sourceTab?.name,
      sourceTab?.path,
      tab.diffPayload.sourceName,
      tab.diffPayload.sourcePath,
      tab.diffPayload.sourceTabId,
      tab.id,
      targetTab?.id,
      targetTab?.name,
      targetTab?.path,
      tab.diffPayload.targetName,
      tab.diffPayload.targetPath,
      tab.diffPayload.targetTabId,
      updateTab,
    ]
  );
  const runDiffRefresh = useCallback(async () => {
    if (!sourceTabId || !targetTabId) {
      return;
    }
    const sequence = diffRefreshSequenceRef.current + 1;
    diffRefreshSequenceRef.current = sequence;
    try {
      const result = await invoke<LineDiffComparisonResult>('compare_documents_by_line', {
        sourceId: sourceTabId,
        targetId: targetTabId,
      });
      if (diffRefreshSequenceRef.current !== sequence) {
        return;
      }
      applyLiveDiffResult(result);
    } catch (error) {
      if (diffRefreshSequenceRef.current === sequence) {
        console.error('Failed to refresh live diff metadata:', error);
      }
    }
  }, [applyLiveDiffResult, sourceTabId, targetTabId]);
  const scheduleDiffRefresh = useCallback(
    (immediate = false) => {
      clearScheduledDiffRefresh();
      if (immediate) {
        void runDiffRefresh();
        return;
      }
      diffRefreshTimerRef.current = window.setTimeout(() => {
        diffRefreshTimerRef.current = null;
        void runDiffRefresh();
      }, DIFF_REFRESH_DEBOUNCE_MS);
    },
    [clearScheduledDiffRefresh, runDiffRefresh]
  );
  const getEditorMaxScrollTop = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    const layoutHeight = Math.max(0, editor.getLayoutInfo().height);
    return Math.max(0, editor.getScrollHeight() - layoutHeight);
  }, []);

  const refreshSharedScrollMetrics = useCallback(() => {
    const sourceEditor = sourceEditorRef.current;
    const targetEditor = targetEditorRef.current;
    const sharedScrollElement = sharedScrollRef.current;
    const sharedScrollContentElement = sharedScrollContentRef.current;
    if (!sourceEditor || !targetEditor || !sharedScrollElement || !sharedScrollContentElement) {
      return null;
    }

    const sourceMaxTop = getEditorMaxScrollTop(sourceEditor);
    const targetMaxTop = getEditorMaxScrollTop(targetEditor);
    const sharedMaxTop = Math.max(sourceMaxTop, targetMaxTop, 1);
    const viewportHeight = Math.max(1, sharedScrollElement.clientHeight);
    const nextContentHeight = Math.max(viewportHeight + sharedMaxTop, viewportHeight + 1);
    const currentContentHeight = Number.parseFloat(sharedScrollContentElement.style.height || '0');
    if (
      !Number.isFinite(currentContentHeight)
      || Math.abs(currentContentHeight - nextContentHeight) > SCROLL_SYNC_EPSILON
    ) {
      sharedScrollContentElement.style.height = `${nextContentHeight}px`;
    }

    sharedScrollMetricsRef.current = {
      sourceMaxTop,
      targetMaxTop,
      sharedMaxTop,
    };

    return sharedScrollMetricsRef.current;
  }, [getEditorMaxScrollTop]);

  const setEditorScrollTopFromRatio = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, ratio: number) => {
      const maxTop = getEditorMaxScrollTop(editor);
      const nextTop = maxTop <= 0 ? 0 : maxTop * ratio;
      if (Math.abs(editor.getScrollTop() - nextTop) <= SCROLL_SYNC_EPSILON) {
        return;
      }
      editor.setScrollTop(nextTop);
    },
    [getEditorMaxScrollTop]
  );

  const setSharedScrollbarFromRatio = useCallback(
    (ratio: number) => {
      const sharedScrollElement = sharedScrollRef.current;
      if (!sharedScrollElement) {
        return;
      }

      const metrics = refreshSharedScrollMetrics();
      if (!metrics) {
        return;
      }

      const nextTop = metrics.sharedMaxTop <= 0 ? 0 : metrics.sharedMaxTop * ratio;
      if (Math.abs(sharedScrollElement.scrollTop - nextTop) <= SCROLL_SYNC_EPSILON) {
        return;
      }
      sharedScrollElement.scrollTop = nextTop;
    },
    [refreshSharedScrollMetrics]
  );

  const syncPanelsFromEditorScroll = useCallback(
    (side: ActivePanel) => {
      if (scrollSyncLockRef.current) {
        return;
      }

      const sourceEditor = sourceEditorRef.current;
      const targetEditor = targetEditorRef.current;
      if (!sourceEditor || !targetEditor) {
        return;
      }

      const metrics = refreshSharedScrollMetrics();
      if (!metrics) {
        return;
      }

      const ratio =
        side === 'source'
          ? metrics.sourceMaxTop <= 0
            ? 0
            : sourceEditor.getScrollTop() / metrics.sourceMaxTop
          : metrics.targetMaxTop <= 0
            ? 0
            : targetEditor.getScrollTop() / metrics.targetMaxTop;

      scrollSyncLockRef.current = true;
      try {
        if (side === 'source') {
          setEditorScrollTopFromRatio(targetEditor, ratio);
        } else {
          setEditorScrollTopFromRatio(sourceEditor, ratio);
        }
        setSharedScrollbarFromRatio(ratio);
      } finally {
        scrollSyncLockRef.current = false;
      }
    },
    [refreshSharedScrollMetrics, setEditorScrollTopFromRatio, setSharedScrollbarFromRatio]
  );

  const syncPanelsFromSharedScrollbar = useCallback(() => {
    if (scrollSyncLockRef.current) {
      return;
    }

    const sharedScrollElement = sharedScrollRef.current;
    const sourceEditor = sourceEditorRef.current;
    const targetEditor = targetEditorRef.current;
    if (!sharedScrollElement || !sourceEditor || !targetEditor) {
      return;
    }

    const metrics = refreshSharedScrollMetrics();
    if (!metrics) {
      return;
    }

    const ratio = metrics.sharedMaxTop <= 0 ? 0 : sharedScrollElement.scrollTop / metrics.sharedMaxTop;
    scrollSyncLockRef.current = true;
    try {
      setEditorScrollTopFromRatio(sourceEditor, ratio);
      setEditorScrollTopFromRatio(targetEditor, ratio);
    } finally {
      scrollSyncLockRef.current = false;
    }
  }, [refreshSharedScrollMetrics, setEditorScrollTopFromRatio]);

  const getPaneEditor = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourceEditorRef.current : targetEditorRef.current),
    []
  );
  const hasPaneSelection = useCallback(
    (side: ActivePanel) => {
      const selection = getPaneEditor(side)?.getSelection();
      return !!selection && !selection.isEmpty();
    },
    [getPaneEditor]
  );
  const getPaneSelectedText = useCallback(
    (side: ActivePanel) => {
      const editor = getPaneEditor(side);
      const model = editor?.getModel();
      const selection = editor?.getSelection();
      if (!editor || !model || !selection || selection.isEmpty()) {
        return '';
      }
      return model.getValueInRange(selection);
    },
    [getPaneEditor]
  );
  const applyPaneSelectionEdit = useCallback(
    (side: ActivePanel, source: string, text: string) => {
      const editor = getPaneEditor(side);
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
      editor.focus();
      return true;
    },
    [getPaneEditor]
  );
  const writePlainTextToClipboard = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('Clipboard write is not supported.');
  }, []);
  const readPlainTextFromClipboard = useCallback(async () => {
    if (navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    throw new Error('Clipboard read is not supported.');
  }, []);
  const handlePaneMonacoContextMenu = useCallback(
    (side: ActivePanel, event: monaco.editor.IEditorMouseEvent) => {
      event.event.preventDefault();
      event.event.stopPropagation();
      const targetType = event.target.type;
      if (
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
        || targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
        || targetType === monaco.editor.MouseTargetType.SCROLLBAR
        || targetType === monaco.editor.MouseTargetType.OVERVIEW_RULER
        || targetType === monaco.editor.MouseTargetType.OUTSIDE_EDITOR
      ) {
        setDiffContextMenu(null);
        return;
      }
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;
      const rawClientX = browserEvent?.clientX ?? 0;
      const rawClientY = browserEvent?.clientY ?? 0;
      const boundedX = Math.min(
        rawClientX,
        window.innerWidth - DIFF_CONTEXT_MENU_WIDTH_PX - DIFF_CONTEXT_MENU_VIEWPORT_PADDING_PX
      );
      const boundedY = Math.min(
        rawClientY,
        window.innerHeight - DIFF_CONTEXT_MENU_HEIGHT_PX - DIFF_CONTEXT_MENU_VIEWPORT_PADDING_PX
      );
      setActivePanel(side);
      setDiffContextMenu({
        panel: side,
        x: Math.max(DIFF_CONTEXT_MENU_VIEWPORT_PADDING_PX, boundedX),
        y: Math.max(DIFF_CONTEXT_MENU_VIEWPORT_PADDING_PX, boundedY),
        hasSelection: hasPaneSelection(side),
      });
    },
    [hasPaneSelection]
  );
  const applyPaneDiffDecorations = useCallback(
    (side: ActivePanel) => {
      const editor = side === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const decorationIdsRef = side === 'source' ? sourceDecorationIdsRef : targetDecorationIdsRef;
      if (!editor) {
        return;
      }

      const model = editor.getModel();
      if (!model) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
        return;
      }

      const paneDecorations = side === 'source'
        ? diffPresentation.sourceDecorations
        : diffPresentation.targetDecorations;
      const nextDecorations = paneDecorations
        .filter((item) => item.lineNumber >= 1 && item.lineNumber <= model.getLineCount())
        .map((item) => ({
          range: new monaco.Range(item.lineNumber, 1, item.lineNumber, 1),
          options: {
            isWholeLine: true,
            className: DIFF_KIND_META[item.kind].lineClassName,
            linesDecorationsClassName: DIFF_KIND_META[item.kind].gutterClassName,
          },
        }));

      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, nextDecorations);
    },
    [diffPresentation.sourceDecorations, diffPresentation.targetDecorations]
  );
  const applyPaneDiffPlaceholderZones = useCallback(
    (side: ActivePanel) => {
      const editor = side === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const viewZoneIdsRef = side === 'source' ? sourceViewZoneIdsRef : targetViewZoneIdsRef;
      if (!editor) {
        viewZoneIdsRef.current = [];
        return;
      }
      const model = editor.getModel();
      editor.changeViewZones((accessor) => {
        viewZoneIdsRef.current.forEach((zoneId) => accessor.removeZone(zoneId));
        viewZoneIdsRef.current = [];
        if (!model) {
          return;
        }
        const maxLineNumber = Math.max(1, model.getLineCount());
        const zoneSpecs = buildDiffPlaceholderZoneSpecs(tab.diffPayload, side);
        zoneSpecs.forEach((zoneSpec) => {
          const zoneNode = document.createElement('div');
          zoneNode.className = 'rutar-diff-placeholder-zone';
          const safeAfterLineNumber = Math.max(
            0,
            Math.min(zoneSpec.afterLineNumber, maxLineNumber)
          );
          const zoneId = accessor.addZone({
            afterLineNumber: safeAfterLineNumber,
            heightInLines: zoneSpec.heightInLines,
            domNode: zoneNode,
            suppressMouseDown: true,
          });
          viewZoneIdsRef.current.push(zoneId);
        });
      });
    },
    [tab.diffPayload]
  );

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
        minimap: { enabled: settings.minimap && !largeFileMode },
        lineDecorationsWidth: 10,
        smoothScrolling: !largeFileMode,
        bracketPairColorization: {
          enabled: !largeFileMode,
        },
        occurrencesHighlight: largeFileMode ? 'off' : 'singleFile',
        selectionHighlight: !largeFileMode,
        renderValidationDecorations: largeFileMode ? 'off' : 'on',
        renderLineHighlight: 'none',
        folding: !largeFileMode,
        scrollBeyondLastLine: false,
        contextmenu: false,
        scrollbar: {
          vertical: 'hidden',
          verticalScrollbarSize: 0,
          alwaysConsumeMouseWheel: false,
        },
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
      settings.minimap,
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
          scheduleDiffRefresh();

          if (afterCursor) {
            setCursorPosition(paneTab.id, afterCursor.line, afterCursor.column);
          }
        })
        .catch((error) => {
          console.error(`Failed to sync ${side} Monaco diff edits:`, error);
        });
    },
    [scheduleDiffRefresh, setCursorPosition, updateTab]
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
    [applyLiveDiffResult, setActivePanel, sourceTab, tab.diffPayload, targetTab, updateTab]
  );

  const handleSavePanel = useCallback(
    async (side: ActivePanel) => {
      const paneTab = side === 'source' ? sourceTab : targetTab;
      if (!paneTab || !paneTab.isDirty) {
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

  const navigateToDiffRow = useCallback(
    (side: ActivePanel, direction: 'previous' | 'next') => {
      if (diffRowIndexes.length === 0) {
        return;
      }

      const oppositeSide: ActivePanel = side === 'source' ? 'target' : 'source';
      const sideEditor = side === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const oppositeEditor = oppositeSide === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const effectiveSide: ActivePanel = sideEditor ? side : (oppositeEditor ? oppositeSide : side);
      const effectiveEditor = effectiveSide === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      if (!effectiveEditor) {
        return;
      }

      const effectivePresent =
        effectiveSide === 'source'
          ? tab.diffPayload.alignedSourcePresent
          : tab.diffPayload.alignedTargetPresent;
      const currentLineNumber = Math.max(1, effectiveEditor.getPosition()?.lineNumber ?? 1);
      const currentRowIndex = resolveAlignedRowIndexFromPaneLine(effectivePresent, currentLineNumber);

      let targetRowIndex = diffRowIndexes[0] ?? 0;
      if (direction === 'previous') {
        for (let index = diffRowIndexes.length - 1; index >= 0; index -= 1) {
          const rowIndex = diffRowIndexes[index];
          if (rowIndex < currentRowIndex) {
            targetRowIndex = rowIndex;
            break;
          }
        }
        if (targetRowIndex >= currentRowIndex) {
          targetRowIndex = diffRowIndexes[diffRowIndexes.length - 1] ?? targetRowIndex;
        }
      } else {
        for (const rowIndex of diffRowIndexes) {
          if (rowIndex > currentRowIndex) {
            targetRowIndex = rowIndex;
            break;
          }
        }
        if (targetRowIndex <= currentRowIndex) {
          targetRowIndex = diffRowIndexes[0] ?? targetRowIndex;
        }
      }

      const sourceEditor = sourceEditorRef.current;
      const targetEditor = targetEditorRef.current;
      const sourceLineCount = Math.max(
        1,
        sourceEditor?.getModel()?.getLineCount() ?? 0,
        tab.diffPayload.sourceLineCount
      );
      const targetLineCount = Math.max(
        1,
        targetEditor?.getModel()?.getLineCount() ?? 0,
        tab.diffPayload.targetLineCount
      );
      const sourceLineNumber = resolvePaneLineNumberFromAlignedRow(
        tab.diffPayload.alignedSourcePresent,
        targetRowIndex,
        sourceLineCount
      );
      const targetLineNumber = resolvePaneLineNumberFromAlignedRow(
        tab.diffPayload.alignedTargetPresent,
        targetRowIndex,
        targetLineCount
      );

      sourceEditor?.revealLineInCenter(sourceLineNumber);
      targetEditor?.revealLineInCenter(targetLineNumber);

      const focusEditor = side === 'source' ? sourceEditor : targetEditor;
      const focusLineNumber = side === 'source' ? sourceLineNumber : targetLineNumber;
      const focusTab = side === 'source' ? sourceTab : targetTab;
      if (focusEditor) {
        focusEditor.setPosition({ lineNumber: focusLineNumber, column: 1 });
        focusEditor.focus();
        setActivePanel(side);
        if (focusTab) {
          setCursorPosition(focusTab.id, focusLineNumber, 1);
        }
        return;
      }

      if (effectiveSide === 'source' && sourceEditor) {
        sourceEditor.setPosition({ lineNumber: sourceLineNumber, column: 1 });
        sourceEditor.focus();
        setActivePanel('source');
        if (sourceTab) {
          setCursorPosition(sourceTab.id, sourceLineNumber, 1);
        }
        return;
      }
      if (effectiveSide === 'target' && targetEditor) {
        targetEditor.setPosition({ lineNumber: targetLineNumber, column: 1 });
        targetEditor.focus();
        setActivePanel('target');
        if (targetTab) {
          setCursorPosition(targetTab.id, targetLineNumber, 1);
        }
      }
    },
    [diffRowIndexes, setCursorPosition, sourceTab, tab.diffPayload, targetTab]
  );
  const copySelectionToOtherPane = useCallback(
    async (fromSide: ActivePanel) => {
      const toSide: ActivePanel = fromSide === 'source' ? 'target' : 'source';
      const fromEditor = fromSide === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const toEditor = toSide === 'target' ? targetEditorRef.current : sourceEditorRef.current;
      const destinationTab = toSide === 'source' ? sourceTab : targetTab;
      if (!fromEditor || !toEditor || !destinationTab) {
        return;
      }

      const toModel = toEditor.getModel();
      if (!toModel) {
        return;
      }

      const selection = fromEditor.getSelection();
      const position = fromEditor.getPosition();
      const rowRange = resolveAlignedRowRangeForSelection(fromSide, selection, position, tab.diffPayload);

      if (!rowRange) {
        return;
      }
      const trailingNewline = toModel.getValue().endsWith('\n');
      try {
        const copiedResult = await invoke<ApplyAlignedDiffPanelCopyResult>('apply_aligned_diff_panel_copy', {
          fromSide,
          toSide,
          startRowIndex: rowRange.startRowIndex,
          endRowIndex: rowRange.endRowIndex,
          alignedSourceLines: tab.diffPayload.alignedSourceLines,
          alignedTargetLines: tab.diffPayload.alignedTargetLines,
          alignedSourcePresent: tab.diffPayload.alignedSourcePresent,
          alignedTargetPresent: tab.diffPayload.alignedTargetPresent,
        });
        if (!copiedResult?.changed) {
          return;
        }
        const copiedLineDiff = normalizeLineDiffResult(copiedResult.lineDiff);
        const appliedResult = await invoke<ApplyAlignedDiffEditResult>('apply_aligned_diff_edit', {
          sourceId: tab.diffPayload.sourceTabId,
          targetId: tab.diffPayload.targetTabId,
          editedSide: toSide,
          alignedSourceLines: copiedLineDiff.alignedSourceLines,
          alignedTargetLines: copiedLineDiff.alignedTargetLines,
          alignedSourcePresent: copiedLineDiff.alignedSourcePresent,
          alignedTargetPresent: copiedLineDiff.alignedTargetPresent,
          editedTrailingNewline: trailingNewline,
        });
        const appliedLineDiff = normalizeLineDiffResult(appliedResult.lineDiff);
        const nextText =
          toSide === 'source'
            ? serializeActualDiffLines(
                appliedLineDiff.alignedSourceLines,
                appliedLineDiff.alignedSourcePresent,
                trailingNewline
              )
            : serializeActualDiffLines(
                appliedLineDiff.alignedTargetLines,
                appliedLineDiff.alignedTargetPresent,
                trailingNewline
              );
        const applyingRef = toSide === 'source' ? sourceApplyingRef : targetApplyingRef;
        applyingRef.current = true;
        try {
          toModel.setValue(nextText);
        } finally {
          applyingRef.current = false;
        }
        updateTab(tab.diffPayload.sourceTabId, {
          lineCount: Math.max(1, appliedLineDiff.sourceLineCount),
          isDirty: appliedResult.sourceIsDirty,
        });
        updateTab(tab.diffPayload.targetTabId, {
          lineCount: Math.max(1, appliedLineDiff.targetLineCount),
          isDirty: appliedResult.targetIsDirty,
        });
        applyLiveDiffResult(appliedLineDiff);
        ignoreDocumentUpdatedRef.current[destinationTab.id] =
          (ignoreDocumentUpdatedRef.current[destinationTab.id] ?? 0) + 1;
        dispatchDocumentUpdated(destinationTab.id);
        setActivePanel(toSide);
        toEditor.focus();
      } catch (error) {
        console.error(`Failed to copy ${fromSide} diff rows to ${toSide}:`, error);
      }
    },
    [applyLiveDiffResult, setActivePanel, sourceTab, tab.diffPayload, targetTab, updateTab]
  );
  const handleDiffContextMenuAction = useCallback(
    async (action: 'copy' | 'cut' | 'paste' | 'copyToOther') => {
      if (!diffContextMenu) {
        return;
      }
      const panel = diffContextMenu.panel;
      if (action === 'copyToOther') {
        setDiffContextMenu(null);
        await copySelectionToOtherPane(panel);
        return;
      }
      if (action === 'paste') {
        try {
          const clipboardText = await readPlainTextFromClipboard();
          applyPaneSelectionEdit(panel, 'rutar-diff-context-paste', clipboardText);
        } catch (error) {
          console.warn('Failed to read clipboard text for diff context-menu paste:', error);
        }
        setDiffContextMenu(null);
        return;
      }
      const selectedText = getPaneSelectedText(panel);
      if (!selectedText) {
        setDiffContextMenu(null);
        return;
      }
      try {
        await writePlainTextToClipboard(selectedText);
      } catch (error) {
        console.warn('Failed to write selected text to clipboard from diff context menu:', error);
      }
      if (action === 'cut') {
        applyPaneSelectionEdit(panel, 'rutar-diff-context-cut', '');
      }
      setDiffContextMenu(null);
    },
    [
      applyPaneSelectionEdit,
      copySelectionToOtherPane,
      diffContextMenu,
      getPaneSelectedText,
      readPlainTextFromClipboard,
      writePlainTextToClipboard,
    ]
  );

  useEffect(() => {
    setActiveDiffPanel(tab.id, activePanel);
  }, [activePanel, setActiveDiffPanel, tab.id]);
  useEffect(() => {
    if (!diffContextMenu) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && diffContextMenuRef.current?.contains(targetNode)) {
        return;
      }
      setDiffContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDiffContextMenu(null);
      }
    };
    const handleWindowBlur = () => {
      setDiffContextMenu(null);
    };
    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [diffContextMenu]);

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
    diffRefreshSequenceRef.current = diffRefreshSequenceRef.current + 1;
    clearScheduledDiffRefresh();
    scheduleDiffRefresh(true);
    return () => {
      diffRefreshSequenceRef.current = diffRefreshSequenceRef.current + 1;
      clearScheduledDiffRefresh();
    };
  }, [clearScheduledDiffRefresh, scheduleDiffRefresh, sourceTabId, tab.id, targetTabId]);
  useEffect(() => {
    applyPaneDiffDecorations('source');
    applyPaneDiffDecorations('target');
    applyPaneDiffPlaceholderZones('source');
    applyPaneDiffPlaceholderZones('target');
  }, [applyPaneDiffDecorations, applyPaneDiffPlaceholderZones]);
  useEffect(() => {
    const sharedScrollElement = sharedScrollRef.current;
    if (!sharedScrollElement) {
      return;
    }
    const handleSharedScroll = () => {
      syncPanelsFromSharedScrollbar();
    };
    sharedScrollElement.addEventListener('scroll', handleSharedScroll, { passive: true });
    return () => {
      sharedScrollElement.removeEventListener('scroll', handleSharedScroll);
    };
  }, [syncPanelsFromSharedScrollbar]);
  useEffect(() => {
    const syncSharedMetrics = () => {
      refreshSharedScrollMetrics();
      syncPanelsFromEditorScroll(activePanel);
    };
    const rafId = window.requestAnimationFrame(syncSharedMetrics);
    const handleWindowResize = () => {
      syncSharedMetrics();
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    activePanel,
    diffPresentation.alignedLineCount,
    refreshSharedScrollMetrics,
    ratio,
    settings.fontSize,
    settings.wordWrap,
    sourceTab?.lineCount,
    syncPanelsFromEditorScroll,
    targetTab?.lineCount,
  ]);

  useEffect(() => {
    if (!sourceHostRef.current || sourceEditorRef.current) {
      return;
    }

    const editor = monaco.editor.create(sourceHostRef.current, {
      automaticLayout: true,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 10,
      contextmenu: false,
    });
    sourceEditorRef.current = editor;
    applyEditorOptions(editor, sourceTab);
    window.requestAnimationFrame(() => {
      refreshSharedScrollMetrics();
    });

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

    const scrollDisposable = editor.onDidScrollChange(() => {
      syncPanelsFromEditorScroll('source');
    });
    const contentSizeDisposable = editor.onDidContentSizeChange(() => {
      refreshSharedScrollMetrics();
    });
    const contextMenuDisposable = editor.onContextMenu((event: monaco.editor.IEditorMouseEvent) => {
      handlePaneMonacoContextMenu('source', event);
    });
    return () => {
      contentDisposable.dispose();
      focusDisposable.dispose();
      cursorDisposable.dispose();
      scrollDisposable.dispose();
      contentSizeDisposable.dispose();
      contextMenuDisposable.dispose();
      sourceDecorationIdsRef.current = editor.deltaDecorations(sourceDecorationIdsRef.current, []);
      editor.changeViewZones((accessor) => {
        sourceViewZoneIdsRef.current.forEach((zoneId) => accessor.removeZone(zoneId));
      });
      sourceViewZoneIdsRef.current = [];
      editor.dispose();
      sourceEditorRef.current = null;
      sourceModelRef.current = null;
    };
  }, [
    handlePaneMonacoContextMenu,
    queueSyncEdits,
    refreshSharedScrollMetrics,
    setCursorPosition,
    syncPanelsFromEditorScroll,
    tab.diffPayload.sourceTabId,
  ]);

  useEffect(() => {
    if (!targetHostRef.current || targetEditorRef.current) {
      return;
    }

    const editor = monaco.editor.create(targetHostRef.current, {
      automaticLayout: true,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 10,
      contextmenu: false,
    });
    targetEditorRef.current = editor;
    applyEditorOptions(editor, targetTab);
    window.requestAnimationFrame(() => {
      refreshSharedScrollMetrics();
    });

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

    const scrollDisposable = editor.onDidScrollChange(() => {
      syncPanelsFromEditorScroll('target');
    });
    const contentSizeDisposable = editor.onDidContentSizeChange(() => {
      refreshSharedScrollMetrics();
    });
    const contextMenuDisposable = editor.onContextMenu((event: monaco.editor.IEditorMouseEvent) => {
      handlePaneMonacoContextMenu('target', event);
    });
    return () => {
      contentDisposable.dispose();
      focusDisposable.dispose();
      cursorDisposable.dispose();
      scrollDisposable.dispose();
      contentSizeDisposable.dispose();
      contextMenuDisposable.dispose();
      targetDecorationIdsRef.current = editor.deltaDecorations(targetDecorationIdsRef.current, []);
      editor.changeViewZones((accessor) => {
        targetViewZoneIdsRef.current.forEach((zoneId) => accessor.removeZone(zoneId));
      });
      targetViewZoneIdsRef.current = [];
      editor.dispose();
      targetEditorRef.current = null;
      targetModelRef.current = null;
    };
  }, [
    handlePaneMonacoContextMenu,
    queueSyncEdits,
    refreshSharedScrollMetrics,
    setCursorPosition,
    syncPanelsFromEditorScroll,
    tab.diffPayload.targetTabId,
  ]);

  useEffect(() => {
    const sourceEditor = sourceEditorRef.current;
    if (!sourceEditor) {
      return;
    }

    if (!sourceTab) {
      sourceEditor.setModel(null);
      sourceModelRef.current = null;
      applyPaneDiffPlaceholderZones('source');
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
    applyPaneDiffDecorations('source');
    applyPaneDiffPlaceholderZones('source');
    void ensurePaneLoaded('source', sourceTab).finally(() => {
      applyPaneDiffDecorations('source');
      applyPaneDiffPlaceholderZones('source');
      refreshSharedScrollMetrics();
      syncPanelsFromEditorScroll(activePanel);
    });
  }, [activePanel, applyPaneDiffDecorations, applyPaneDiffPlaceholderZones, ensurePaneLoaded, refreshSharedScrollMetrics, sourceLanguage, sourceTab, syncPanelsFromEditorScroll]);

  useEffect(() => {
    const targetEditor = targetEditorRef.current;
    if (!targetEditor) {
      return;
    }

    if (!targetTab) {
      targetEditor.setModel(null);
      targetModelRef.current = null;
      applyPaneDiffPlaceholderZones('target');
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
    applyPaneDiffDecorations('target');
    applyPaneDiffPlaceholderZones('target');
    void ensurePaneLoaded('target', targetTab).finally(() => {
      applyPaneDiffDecorations('target');
      applyPaneDiffPlaceholderZones('target');
      refreshSharedScrollMetrics();
      syncPanelsFromEditorScroll(activePanel);
    });
  }, [activePanel, applyPaneDiffDecorations, applyPaneDiffPlaceholderZones, ensurePaneLoaded, refreshSharedScrollMetrics, syncPanelsFromEditorScroll, targetLanguage, targetTab]);

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
        scheduleDiffRefresh();
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
      let shouldRefreshDiff = false;

      if (updatedTabId === sourceTab?.id) {
        shouldRefreshDiff = true;
        void ensurePaneLoaded('source', sourceTab).finally(() => {
          applyPaneDiffDecorations('source');
          refreshSharedScrollMetrics();
          syncPanelsFromEditorScroll(activePanel);
        });
      }

      if (updatedTabId === targetTab?.id) {
        shouldRefreshDiff = true;
        void ensurePaneLoaded('target', targetTab).finally(() => {
          applyPaneDiffDecorations('target');
          refreshSharedScrollMetrics();
          syncPanelsFromEditorScroll(activePanel);
        });
      }
      if (shouldRefreshDiff) {
        scheduleDiffRefresh(true);
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
  }, [
    activePanel,
    applyPaneDiffDecorations,
    ensurePaneLoaded,
    refreshSharedScrollMetrics,
    setCursorPosition,
    scheduleDiffRefresh,
    sourceTab,
    syncPanelsFromEditorScroll,
    tab.id,
    targetTab,
    updateTab,
  ]);

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

  const leftWidth = `calc(${ratio * 100}% - ${DIFF_SPLITTER_WIDTH_PX / 2}px)`;
  const rightWidth = `calc(${(1 - ratio) * 100}% - ${DIFF_SPLITTER_WIDTH_PX / 2}px)`;

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
            className={DIFF_HEADER_ICON_BUTTON_CLASS_NAME}
            aria-label={tr('diffEditor.save')}
            title={tr('diffEditor.save')}
            onClick={() => void handleSavePanel('source')}
            disabled={!sourceSaveEnabled}
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={DIFF_HEADER_ICON_BUTTON_CLASS_NAME}
            aria-label={tr('diffEditor.previousDiffLine')}
            title={tr('diffEditor.previousDiffLine')}
            onClick={() => navigateToDiffRow('source', 'previous')}
            disabled={!hasDiffRows}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className={DIFF_HEADER_ICON_BUTTON_CLASS_NAME}
            aria-label={tr('diffEditor.nextDiffLine')}
            title={tr('diffEditor.nextDiffLine')}
            onClick={() => navigateToDiffRow('target', 'next')}
            disabled={!hasDiffRows}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={DIFF_HEADER_ICON_BUTTON_CLASS_NAME}
            aria-label={tr('diffEditor.save')}
            title={tr('diffEditor.save')}
            onClick={() => void handleSavePanel('target')}
            disabled={!targetSaveEnabled}
          >
            <Save className="h-3.5 w-3.5" />
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
          data-diff-panel="source"
          className={`h-full border-r border-border/40 ${activePanel === 'source' ? 'ring-1 ring-inset ring-blue-500/30' : ''}`}
          style={{ width: leftWidth }}
        >
          <div ref={sourceHostRef} className="h-full w-full" />
        </div>
        <div
          className="relative h-full flex-none overflow-hidden border-x border-border/70 bg-muted/35"
          style={{ width: DIFF_SPLITTER_WIDTH_PX }}
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {diffOverviewSegments.map((segment) => (
              <div
                key={segment.key}
                data-testid="diff-overview-marker"
                className="absolute left-0 right-0"
                style={{
                  top: `${segment.topPercent}%`,
                  height: `${segment.heightPercent}%`,
                  minHeight: 2,
                  backgroundColor: DIFF_KIND_META[segment.kind].markerColor,
                }}
              />
            ))}
          </div>
          <div
            ref={sharedScrollRef}
            data-testid="diff-shared-scrollbar"
            className="absolute inset-y-0 left-1/2 z-30 -translate-x-1/2 overflow-y-auto overflow-x-hidden rounded-full"
            style={{ width: DIFF_SHARED_SCROLLBAR_WIDTH_PX }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div ref={sharedScrollContentRef} style={{ width: 1, height: 1 }} />
          </div>
          <div
            className="absolute inset-0 z-20 cursor-col-resize"
            role="separator"
            aria-label={tr('diffEditor.resizePanelsAriaLabel')}
            onPointerDown={(event) => {
              if (sharedScrollRef.current?.contains(event.target as Node)) {
                return;
              }
              event.preventDefault();
              setResizing(true);
            }}
          />
        </div>
        <div
          data-diff-panel="target"
          className={`h-full border-l border-border/40 ${activePanel === 'target' ? 'ring-1 ring-inset ring-blue-500/30' : ''}`}
          style={{ width: rightWidth }}
        >
          <div ref={targetHostRef} className="h-full w-full" />
        </div>
      </div>
      {diffContextMenu && (
        <div
          ref={diffContextMenuRef}
          role="menu"
          data-testid="diff-editor-context-menu"
          className="fixed z-[90] w-44 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: diffContextMenu.x, top: diffContextMenu.y }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            role="menuitem"
            className={DIFF_CONTEXT_MENU_DISABLED_BUTTON_CLASS_NAME}
            onClick={() => {
              void handleDiffContextMenuAction('copy');
            }}
            disabled={!diffContextMenu.hasSelection}
          >
            {tr('diffEditor.copy')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={DIFF_CONTEXT_MENU_DISABLED_BUTTON_CLASS_NAME}
            onClick={() => {
              void handleDiffContextMenuAction('cut');
            }}
            disabled={!diffContextMenu.hasSelection}
          >
            {tr('diffEditor.cut')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={DIFF_CONTEXT_MENU_BUTTON_CLASS_NAME}
            onClick={() => {
              void handleDiffContextMenuAction('paste');
            }}
          >
            {tr('diffEditor.paste')}
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className={DIFF_CONTEXT_MENU_BUTTON_CLASS_NAME}
            onClick={() => {
              void handleDiffContextMenuAction('copyToOther');
            }}
          >
            {diffContextMenu.panel === 'source' ? tr('diffEditor.copyToRight') : tr('diffEditor.copyToLeft')}
          </button>
        </div>
      )}
    </div>
  );
}
