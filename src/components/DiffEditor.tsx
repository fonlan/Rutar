import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { saveTab } from '@/lib/tabClose';
import { cn } from '@/lib/utils';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { type DiffPanelSide, type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';
import type { ActivePanel, DiffLineKind, LineDiffComparisonResult } from './diffEditor.types';
import { DiffPanelView } from './DiffPanelView';
import { editorTestUtils } from './editorUtils';
import { useDiffEditorLineNumberSelection } from './useDiffEditorLineNumberSelection';
import { useDiffEditorMenusAndClipboard } from './useDiffEditorMenusAndClipboard';
import { useDiffEditorPairHighlight } from './useDiffEditorPairHighlight';
import { useDiffEditorSearchNavigation } from './useDiffEditorSearchNavigation';
import { useDiffEditorSync } from './useDiffEditorSync';
import { useExternalPasteEvent } from './useExternalPasteEvent';

interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
}

interface ApplyAlignedDiffPanelCopyResult {
  lineDiff: LineDiffComparisonResult;
  changed: boolean;
}

interface ViewportMetrics {
  topPercent: number;
  heightPercent: number;
}

interface PanelScrollSnapshot {
  sourceTop: number;
  sourceLeft: number;
  targetTop: number;
  targetLeft: number;
}

interface CaretSnapshot {
  side: ActivePanel;
  rowIndex: number;
  lineNumber: number;
  selectionStart: number;
  selectionEnd: number;
}

interface EditHistoryState {
  isDirty: boolean;
}

interface PairHighlightPosition {
  line: number;
  column: number;
}

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;
const MIN_PANEL_WIDTH_PX = 220;
const SPLITTER_WIDTH_PX = 16;
const OFFLOAD_METADATA_MIN_LINES = 0;
const DEFAULT_VIEWPORT: ViewportMetrics = { topPercent: 0, heightPercent: 100 };
const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';
const {
  normalizeLineText,
  dispatchDocumentUpdated,
} = editorTestUtils;

function getParentDirectoryPath(filePath: string): string | null {
  const normalizedPath = filePath.trim();

  if (!normalizedPath) {
    return null;
  }

  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));

  if (separatorIndex < 0) {
    return null;
  }

  if (separatorIndex === 0) {
    return normalizedPath[0];
  }

  if (separatorIndex === 2 && /^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
    return normalizedPath.slice(0, 3);
  }

  return normalizedPath.slice(0, separatorIndex);
}

function pathBaseName(path: string) {
  const normalizedPath = path.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

function resolveAlignedDiffKind(
  index: number,
  alignedSourceLines: string[],
  alignedTargetLines: string[],
  alignedSourcePresent: boolean[],
  alignedTargetPresent: boolean[]
): DiffLineKind | null {
  const sourcePresent = alignedSourcePresent[index] === true;
  const targetPresent = alignedTargetPresent[index] === true;

  if (!sourcePresent && targetPresent) {
    return 'insert';
  }

  if (sourcePresent && !targetPresent) {
    return 'delete';
  }

  const sourceLine = alignedSourceLines[index] ?? '';
  const targetLine = alignedTargetLines[index] ?? '';
  if (sourceLine !== targetLine) {
    return 'modify';
  }

  return null;
}

function getDiffKindStyle(kind: DiffLineKind) {
  switch (kind) {
    case 'insert':
      return {
        lineNumberClass: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-300',
        rowBackgroundClass: 'bg-emerald-500/10 dark:bg-emerald-500/12',
        markerClass: 'bg-emerald-500 dark:bg-emerald-400',
      };
    case 'delete':
      return {
        lineNumberClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/12 dark:text-red-300',
        rowBackgroundClass: 'bg-red-500/10 dark:bg-red-500/12',
        markerClass: 'bg-red-500 dark:bg-red-400',
      };
    case 'modify':
    default:
      return {
        lineNumberClass: 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/16 dark:text-amber-300',
        rowBackgroundClass: 'bg-amber-500/10 dark:bg-amber-500/12',
        markerClass: 'bg-amber-500 dark:bg-amber-400',
      };
  }
}

function clampRatio(value: number) {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, value));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function shouldOffloadDiffMetadataComputation(alignedLineCount: number) {
  return alignedLineCount > OFFLOAD_METADATA_MIN_LINES;
}

function normalizeTextToLines(text: string) {
  const normalized = normalizeLineText(text || '');
  const lines = normalized.split('\n');
  return lines.length > 0 ? lines : [''];
}

function buildFallbackDiffLineNumbers(sourceLines: string[], targetLines: string[]) {
  const lineCount = Math.max(1, sourceLines.length, targetLines.length);
  const result: number[] = [];

  for (let line = 1; line <= lineCount; line += 1) {
    const index = line - 1;
    if ((sourceLines[index] ?? '') !== (targetLines[index] ?? '')) {
      result.push(line);
    }
  }

  return result;
}

function ensureBooleanArray(values: unknown, length: number, fallbackValue: boolean) {
  if (!Array.isArray(values)) {
    return Array.from({ length }, () => fallbackValue);
  }

  const result = Array.from({ length }, (_, index) => values[index] === true);
  if (result.length < length) {
    for (let index = result.length; index < length; index += 1) {
      result.push(fallbackValue);
    }
  }
  return result;
}

function ensureLineNumberArray(values: unknown, length: number) {
  if (!Array.isArray(values)) {
    return Array.from({ length }, () => 0);
  }

  const result = Array.from({ length }, (_, index) => {
    const value = values[index];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 0;
  });
  if (result.length < length) {
    for (let index = result.length; index < length; index += 1) {
      result.push(0);
    }
  }
  return result;
}

function ensureDiffKindArray(values: unknown, length: number) {
  if (!Array.isArray(values)) {
    return Array.from({ length }, () => null as DiffLineKind | null);
  }

  const result = Array.from({ length }, (_, index) => {
    const value = values[index];
    if (value === 'insert' || value === 'delete' || value === 'modify') {
      return value;
    }
    return null;
  });
  if (result.length < length) {
    for (let index = result.length; index < length; index += 1) {
      result.push(null);
    }
  }
  return result;
}

function normalizeLineDiffResult(input: LineDiffComparisonResult): LineDiffComparisonResult {
  const alignedSourceLines = Array.isArray(input.alignedSourceLines) && input.alignedSourceLines.length > 0
    ? input.alignedSourceLines
    : [''];
  const alignedTargetLines = Array.isArray(input.alignedTargetLines) && input.alignedTargetLines.length > 0
    ? input.alignedTargetLines
    : [''];
  const alignedLineCount = Math.max(
    1,
    input.alignedLineCount || 0,
    alignedSourceLines.length,
    alignedTargetLines.length
  );

  const sourceLines = alignedSourceLines.length === alignedLineCount
    ? alignedSourceLines
    : [...alignedSourceLines, ...Array.from({ length: alignedLineCount - alignedSourceLines.length }, () => '')];
  const targetLines = alignedTargetLines.length === alignedLineCount
    ? alignedTargetLines
    : [...alignedTargetLines, ...Array.from({ length: alignedLineCount - alignedTargetLines.length }, () => '')];

  const normalizedDiffLineNumbers = Array.isArray(input.diffLineNumbers)
    ? input.diffLineNumbers
    : [];
  const sourcePresent = ensureBooleanArray(input.alignedSourcePresent, alignedLineCount, true);
  const targetPresent = ensureBooleanArray(input.alignedTargetPresent, alignedLineCount, true);
  const sourceLineNumbersByAlignedRow = Array.isArray(input.sourceLineNumbersByAlignedRow)
    ? ensureLineNumberArray(input.sourceLineNumbersByAlignedRow, alignedLineCount)
    : buildLineNumberByAlignedRow(sourcePresent);
  const targetLineNumbersByAlignedRow = Array.isArray(input.targetLineNumbersByAlignedRow)
    ? ensureLineNumberArray(input.targetLineNumbersByAlignedRow, alignedLineCount)
    : buildLineNumberByAlignedRow(targetPresent);
  const alignedDiffKinds = Array.isArray(input.alignedDiffKinds)
    ? ensureDiffKindArray(input.alignedDiffKinds, alignedLineCount)
    : Array.from({ length: alignedLineCount }, (_, index) => resolveAlignedDiffKind(
      index,
      sourceLines,
      targetLines,
      sourcePresent,
      targetPresent
    ));
  const diffRowIndexes = Array.isArray(input.diffRowIndexes)
    ? input.diffRowIndexes
      .map((value) => (Number.isFinite(value) ? Math.floor(value) : -1))
      .filter((value) => value >= 0 && value < alignedLineCount)
    : normalizedDiffLineNumbers
      .map((lineNumber) => Math.floor(lineNumber) - 1)
      .filter((value) => Number.isFinite(value) && value >= 0 && value < alignedLineCount);

  return {
    alignedSourceLines: sourceLines,
    alignedTargetLines: targetLines,
    alignedSourcePresent: sourcePresent,
    alignedTargetPresent: targetPresent,
    diffLineNumbers: normalizedDiffLineNumbers,
    sourceDiffLineNumbers: Array.isArray(input.sourceDiffLineNumbers) ? input.sourceDiffLineNumbers : [],
    targetDiffLineNumbers: Array.isArray(input.targetDiffLineNumbers) ? input.targetDiffLineNumbers : [],
    alignedDiffKinds,
    sourceLineNumbersByAlignedRow,
    targetLineNumbersByAlignedRow,
    diffRowIndexes,
    sourceLineCount: Math.max(1, input.sourceLineCount || 1),
    targetLineCount: Math.max(1, input.targetLineCount || 1),
    alignedLineCount,
  };
}

function buildInitialDiff(payload: DiffTabPayload): LineDiffComparisonResult {
  if (
    Array.isArray(payload.alignedSourceLines)
    && Array.isArray(payload.alignedTargetLines)
    && Array.isArray(payload.diffLineNumbers)
    && payload.alignedSourceLines.length > 0
    && payload.alignedTargetLines.length > 0
  ) {
    return normalizeLineDiffResult({
      alignedSourceLines: payload.alignedSourceLines,
      alignedTargetLines: payload.alignedTargetLines,
      alignedSourcePresent: payload.alignedSourcePresent,
      alignedTargetPresent: payload.alignedTargetPresent,
      diffLineNumbers: payload.diffLineNumbers,
      sourceDiffLineNumbers: Array.isArray(payload.sourceDiffLineNumbers)
        ? payload.sourceDiffLineNumbers
        : [],
      targetDiffLineNumbers: Array.isArray(payload.targetDiffLineNumbers)
        ? payload.targetDiffLineNumbers
        : [],
      alignedDiffKinds: Array.isArray(payload.alignedDiffKinds)
        ? payload.alignedDiffKinds
        : undefined,
      sourceLineCount: Math.max(1, payload.sourceLineCount || payload.alignedSourceLines.length),
      targetLineCount: Math.max(1, payload.targetLineCount || payload.alignedTargetLines.length),
      alignedLineCount: Math.max(
        1,
        payload.alignedLineCount || 0,
        payload.alignedSourceLines.length,
        payload.alignedTargetLines.length
      ),
    });
  }

  const sourceLines = normalizeTextToLines(payload.sourceContent ?? '');
  const targetLines = normalizeTextToLines(payload.targetContent ?? '');
  const alignedLineCount = Math.max(1, sourceLines.length, targetLines.length);

  return normalizeLineDiffResult({
    alignedSourceLines: sourceLines,
    alignedTargetLines: targetLines,
    alignedSourcePresent: Array.from({ length: sourceLines.length }, () => true),
    alignedTargetPresent: Array.from({ length: targetLines.length }, () => true),
    diffLineNumbers: buildFallbackDiffLineNumbers(sourceLines, targetLines),
    sourceDiffLineNumbers: buildFallbackDiffLineNumbers(sourceLines, targetLines)
      .filter((line) => line <= sourceLines.length),
    targetDiffLineNumbers: buildFallbackDiffLineNumbers(sourceLines, targetLines)
      .filter((line) => line <= targetLines.length),
    sourceLineCount: Math.max(1, payload.sourceLineCount || sourceLines.length),
    targetLineCount: Math.max(1, payload.targetLineCount || targetLines.length),
    alignedLineCount,
  });
}

function buildLineNumberByAlignedRow(present: boolean[]) {
  let lineNumber = 0;
  return present.map((isPresent) => {
    if (!isPresent) {
      return 0;
    }

    lineNumber += 1;
    return lineNumber;
  });
}

function extractActualLines(alignedLines: string[], present: boolean[]) {
  const actualLines: string[] = [];

  for (let index = 0; index < alignedLines.length; index += 1) {
    const lineText = alignedLines[index] ?? '';
    if (present[index]) {
      actualLines.push(lineText);
      continue;
    }

    if (lineText.length > 0) {
      actualLines.push(lineText);
    }
  }

  return actualLines.length > 0 ? actualLines : [''];
}

function buildAlignedDiffMetadata(
  alignedSourceLines: string[],
  alignedTargetLines: string[],
  alignedSourcePresent: boolean[],
  alignedTargetPresent: boolean[]
) {
  const alignedLineCount = Math.max(
    alignedSourceLines.length,
    alignedTargetLines.length,
    alignedSourcePresent.length,
    alignedTargetPresent.length
  );
  const diffLineNumbers: number[] = [];
  const sourceDiffLineNumbers: number[] = [];
  const targetDiffLineNumbers: number[] = [];
  const alignedDiffKinds: Array<DiffLineKind | null> = [];

  for (let index = 0; index < alignedLineCount; index += 1) {
    const kind = resolveAlignedDiffKind(
      index,
      alignedSourceLines,
      alignedTargetLines,
      alignedSourcePresent,
      alignedTargetPresent
    );
    alignedDiffKinds.push(kind);
    if (!kind) {
      continue;
    }

    const alignedLine = index + 1;
    diffLineNumbers.push(alignedLine);

    if (alignedSourcePresent[index] === true) {
      sourceDiffLineNumbers.push(alignedLine);
    }

    if (alignedTargetPresent[index] === true) {
      targetDiffLineNumbers.push(alignedLine);
    }
  }

  const sourceLineCount = alignedSourcePresent.reduce(
    (count, isPresent) => (isPresent ? count + 1 : count),
    0
  );
  const targetLineCount = alignedTargetPresent.reduce(
    (count, isPresent) => (isPresent ? count + 1 : count),
    0
  );
  const sourceLineNumbersByAlignedRow = buildLineNumberByAlignedRow(alignedSourcePresent);
  const targetLineNumbersByAlignedRow = buildLineNumberByAlignedRow(alignedTargetPresent);

  return {
    diffLineNumbers,
    sourceDiffLineNumbers,
    targetDiffLineNumbers,
    alignedDiffKinds,
    sourceLineNumbersByAlignedRow,
    targetLineNumbersByAlignedRow,
    diffRowIndexes: diffLineNumbers.map((lineNumber) => lineNumber - 1),
    sourceLineCount: Math.max(1, sourceLineCount),
    targetLineCount: Math.max(1, targetLineCount),
    alignedLineCount: Math.max(1, alignedLineCount),
  };
}

function findAlignedRowIndexByLineNumber(present: boolean[], lineNumber: number) {
  if (lineNumber <= 0) {
    return -1;
  }

  let currentLine = 0;
  for (let index = 0; index < present.length; index += 1) {
    if (!present[index]) {
      continue;
    }

    currentLine += 1;
    if (currentLine === lineNumber) {
      return index;
    }
  }

  return -1;
}

function getLineIndexFromTextOffset(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let lineIndex = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (text[index] === '\n') {
      lineIndex += 1;
    }
  }
  return lineIndex;
}

function buildPairHighlightRows(pairHighlights: PairHighlightPosition[], lines: string[]) {
  const rows = new Map<number, number[]>();

  for (const position of pairHighlights) {
    const rowIndex = position.line - 1;
    if (rowIndex < 0 || rowIndex >= lines.length) {
      continue;
    }

    const lineText = lines[rowIndex] ?? '';
    const columnIndex = position.column - 1;
    if (columnIndex < 0 || columnIndex >= lineText.length) {
      continue;
    }

    const existing = rows.get(rowIndex);
    if (existing) {
      if (!existing.includes(columnIndex)) {
        existing.push(columnIndex);
      }
      continue;
    }

    rows.set(rowIndex, [columnIndex]);
  }

  for (const columns of rows.values()) {
    columns.sort((left, right) => left - right);
  }

  return rows;
}

function buildPairHighlightSegments(lineTextLength: number, pairColumns: number[]) {
  const boundaries = new Set<number>([0, lineTextLength]);
  pairColumns.forEach((column) => {
    boundaries.add(column);
    boundaries.add(Math.min(lineTextLength, column + 1));
  });

  const sorted = Array.from(boundaries).sort((left, right) => left - right);
  const segments: Array<{ start: number; end: number; isPair: boolean }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) {
      continue;
    }

    const isPair = pairColumns.some((column) => start >= column && end <= column + 1);
    segments.push({
      start,
      end,
      isPair,
    });
  }

  return segments;
}

function getSelectedLineRangeByOffset(text: string, selectionStart: number, selectionEnd: number) {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(0, Math.min(selectionEnd, text.length));

  if (safeStart === safeEnd) {
    const lineIndex = getLineIndexFromTextOffset(text, safeStart);
    return {
      startLine: lineIndex,
      endLine: lineIndex,
    };
  }

  const rangeStart = Math.min(safeStart, safeEnd);
  const rangeEnd = Math.max(safeStart, safeEnd);
  const inclusiveEndOffset = Math.max(rangeStart, rangeEnd - 1);
  const startLine = getLineIndexFromTextOffset(text, rangeStart);
  const endLine = getLineIndexFromTextOffset(text, inclusiveEndOffset);

  return {
    startLine,
    endLine,
  };
}

function buildCopyTextWithoutVirtualRows(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  present: boolean[]
) {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(0, Math.min(selectionEnd, text.length));
  if (safeStart === safeEnd) {
    return null;
  }

  const rangeStart = Math.min(safeStart, safeEnd);
  const rangeEnd = Math.max(safeStart, safeEnd);
  const lines = text.split('\n');
  if (lines.length === 0) {
    return '';
  }

  const startLineIndex = Math.min(
    lines.length - 1,
    getLineIndexFromTextOffset(text, rangeStart)
  );
  const endLineIndex = Math.min(
    lines.length - 1,
    getLineIndexFromTextOffset(text, rangeEnd)
  );

  const lineStartOffsets = new Array(lines.length).fill(0);
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    lineStartOffsets[index] = offset;
    offset += lines[index].length + 1;
  }

  const copiedParts: string[] = [];
  for (let lineIndex = startLineIndex; lineIndex <= endLineIndex; lineIndex += 1) {
    if (present[lineIndex] === false) {
      continue;
    }

    const line = lines[lineIndex] ?? '';
    const lineStart = lineStartOffsets[lineIndex] ?? 0;
    const partStart = lineIndex === startLineIndex
      ? Math.max(0, rangeStart - lineStart)
      : 0;
    const rawPartEnd = lineIndex === endLineIndex
      ? Math.max(0, rangeEnd - lineStart)
      : line.length;
    const partEnd = Math.max(partStart, Math.min(rawPartEnd, line.length));

    copiedParts.push(line.slice(partStart, partEnd));
  }

  return copiedParts.join('\n');
}

function getLineSelectionRange(lines: string[], rowIndex: number) {
  const safeRowIndex = Math.max(0, Math.min(rowIndex, Math.max(0, lines.length - 1)));
  let start = 0;
  for (let index = 0; index < safeRowIndex; index += 1) {
    start += (lines[index] ?? '').length + 1;
  }

  const lineLength = (lines[safeRowIndex] ?? '').length;
  return {
    start,
    end: start + lineLength,
  };
}

function getNextMatchedRow(
  matchedRows: number[],
  currentRow: number | null,
  direction: 'next' | 'prev'
) {
  if (matchedRows.length === 0) {
    return null;
  }

  if (currentRow === null) {
    return direction === 'next'
      ? matchedRows[0]
      : matchedRows[matchedRows.length - 1];
  }

  const currentIndex = matchedRows.indexOf(currentRow);
  if (currentIndex < 0) {
    return direction === 'next'
      ? matchedRows[0]
      : matchedRows[matchedRows.length - 1];
  }

  if (direction === 'next') {
    return matchedRows[(currentIndex + 1) % matchedRows.length];
  }

  return matchedRows[(currentIndex - 1 + matchedRows.length) % matchedRows.length];
}

function getNextMatchedRowFromAnchor(
  matchedRows: number[],
  anchorRow: number | null,
  direction: 'next' | 'prev'
) {
  if (matchedRows.length === 0) {
    return null;
  }

  if (anchorRow === null) {
    return direction === 'next'
      ? matchedRows[0]
      : matchedRows[matchedRows.length - 1];
  }

  if (direction === 'next') {
    for (let index = 0; index < matchedRows.length; index += 1) {
      const row = matchedRows[index];
      if (row > anchorRow) {
        return row;
      }
    }
    return matchedRows[0];
  }

  for (let index = matchedRows.length - 1; index >= 0; index -= 1) {
    const row = matchedRows[index];
    if (row < anchorRow) {
      return row;
    }
  }

  return matchedRows[matchedRows.length - 1];
}

function reconcilePresenceAfterTextEdit(
  oldLines: string[],
  oldPresent: boolean[],
  newLines: string[]
) {
  const newPresent = new Array(newLines.length).fill(true);

  let prefix = 0;
  while (
    prefix < oldLines.length
    && prefix < newLines.length
    && oldLines[prefix] === newLines[prefix]
  ) {
    newPresent[prefix] = oldPresent[prefix] === true;
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (
    oldSuffix >= prefix
    && newSuffix >= prefix
    && oldLines[oldSuffix] === newLines[newSuffix]
  ) {
    newPresent[newSuffix] = oldPresent[oldSuffix] === true;
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  for (let index = prefix; index <= newSuffix; index += 1) {
    if (index < 0 || index >= newPresent.length) {
      continue;
    }

    // Any line inside the edited span is considered concrete content for this side.
    newPresent[index] = true;
  }

  return newPresent;
}

function inferTrailingNewlineFromLines(lineCount: number, actualLines: string[]) {
  if (lineCount <= 1) {
    return false;
  }

  if (actualLines.length === 0) {
    return false;
  }

  return actualLines[actualLines.length - 1] === '';
}

function serializeLines(actualLines: string[], trailingNewline: boolean) {
  const safeLines = actualLines.length > 0 ? actualLines : [''];
  let text = safeLines.join('\n');
  if (trailingNewline) {
    text += '\n';
  }
  return text;
}

function bindScrollerViewport(
  scroller: HTMLElement | null,
  setViewport: (value: ViewportMetrics) => void
) {
  if (!scroller) {
    setViewport(DEFAULT_VIEWPORT);
    return () => undefined;
  }

  const update = () => {
    const scrollHeight = Math.max(1, scroller.scrollHeight);
    const clientHeight = Math.max(1, scroller.clientHeight);
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const visiblePercent = clampPercent((clientHeight / scrollHeight) * 100);
    const topPercent =
      maxScrollTop <= 0
        ? 0
        : clampPercent((scroller.scrollTop / maxScrollTop) * Math.max(0, 100 - visiblePercent));

    setViewport({
      topPercent,
      heightPercent: Math.max(1, visiblePercent),
    });
  };

  const handleScroll = () => {
    update();
  };

  const observer = new ResizeObserver(() => {
    update();
  });

  observer.observe(scroller);
  scroller.addEventListener('scroll', handleScroll, { passive: true });
  update();

  return () => {
    scroller.removeEventListener('scroll', handleScroll);
    observer.disconnect();
  };
}

export const diffEditorTestUtils = {
  getParentDirectoryPath,
  pathBaseName,
  resolveAlignedDiffKind,
  getDiffKindStyle,
  clampRatio,
  clampPercent,
  shouldOffloadDiffMetadataComputation,
  normalizeTextToLines,
  buildFallbackDiffLineNumbers,
  ensureBooleanArray,
  ensureLineNumberArray,
  ensureDiffKindArray,
  normalizeLineDiffResult,
  buildInitialDiff,
  buildLineNumberByAlignedRow,
  extractActualLines,
  buildAlignedDiffMetadata,
  findAlignedRowIndexByLineNumber,
  getLineIndexFromTextOffset,
  getSelectedLineRangeByOffset,
  buildCopyTextWithoutVirtualRows,
  getLineSelectionRange,
  getNextMatchedRow,
  getNextMatchedRowFromAnchor,
  reconcilePresenceAfterTextEdit,
  inferTrailingNewlineFromLines,
  serializeLines,
  bindScrollerViewport,
  dispatchDocumentUpdated,
};

export function DiffEditor({ tab }: DiffEditorProps) {
  const tabs = useStore((state) => state.tabs);
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const setActiveDiffPanel = useStore((state) => state.setActiveDiffPanel);
  const persistedActivePanel = useStore((state) => state.activeDiffPanelByTab[tab.id]);
  const { ref: viewportRef, width } = useResizeObserver<HTMLDivElement>();
  const [splitRatio, setSplitRatio] = useState(DEFAULT_RATIO);
  const [activePanel, setActivePanel] = useState<ActivePanel>(
    persistedActivePanel === 'target' ? 'target' : 'source'
  );
  const [lineDiff, setLineDiff] = useState<LineDiffComparisonResult>(() => buildInitialDiff(tab.diffPayload));
  const [sourceViewport, setSourceViewport] = useState<ViewportMetrics>(DEFAULT_VIEWPORT);
  const [targetViewport, setTargetViewport] = useState<ViewportMetrics>(DEFAULT_VIEWPORT);
  const [sourceScroller, setSourceScroller] = useState<HTMLElement | null>(null);
  const [targetScroller, setTargetScroller] = useState<HTMLElement | null>(null);

  const dragStateRef = useRef<{ pointerId: number; startX: number; startRatio: number } | null>(null);
  const scrollSyncLockRef = useRef(false);
  const lineDiffRef = useRef(lineDiff);
  const pendingScrollRestoreRef = useRef<PanelScrollSnapshot | null>(null);
  const pendingCaretRestoreRef = useRef<CaretSnapshot | null>(null);
  const lastEditAtRef = useRef(0);
  const copyLinesRequestSequenceRef = useRef(0);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const targetTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sourceTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.sourceTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.sourceTabId, tabs]
  );
  const targetTab = useMemo(
    () => tabs.find((item) => item.id === tab.diffPayload.targetTabId && item.tabType !== 'diff') ?? null,
    [tab.diffPayload.targetTabId, tabs]
  );
  const sourceTabId = sourceTab?.id ?? null;
  const targetTabId = targetTab?.id ?? null;
  const sourcePath = sourceTab?.path || tab.diffPayload.sourcePath || '';
  const targetPath = targetTab?.path || tab.diffPayload.targetPath || '';
  const sourceDisplayName = sourceTab?.name || tab.diffPayload.sourceName;
  const targetDisplayName = targetTab?.name || tab.diffPayload.targetName;

  useEffect(() => {
    setActiveDiffPanel(tab.id, activePanel);
  }, [activePanel, setActiveDiffPanel, tab.id]);

  const resolvePanelPath = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourcePath : targetPath),
    [sourcePath, targetPath]
  );

  const resolvePanelDisplayName = useCallback(
    (side: ActivePanel) => (side === 'source' ? sourceDisplayName : targetDisplayName),
    [sourceDisplayName, targetDisplayName]
  );

  const handleSourceScrollerRef = useCallback((element: HTMLElement | null) => {
    setSourceScroller((previous) => (previous === element ? previous : element));
  }, []);

  const handleTargetScrollerRef = useCallback((element: HTMLElement | null) => {
    setTargetScroller((previous) => (previous === element ? previous : element));
  }, []);

  const capturePanelScrollSnapshot = useCallback(() => {
    if (!sourceScroller || !targetScroller) {
      pendingScrollRestoreRef.current = null;
      return;
    }

    pendingScrollRestoreRef.current = {
      sourceTop: sourceScroller.scrollTop,
      sourceLeft: sourceScroller.scrollLeft,
      targetTop: targetScroller.scrollTop,
      targetLeft: targetScroller.scrollLeft,
    };
  }, [sourceScroller, targetScroller]);

  const captureFocusedCaretSnapshot = useCallback((): CaretSnapshot | null => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return null;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return null;
    }

    const snapshotState = lineDiffRef.current;
    const present = panel === 'source'
      ? snapshotState.alignedSourcePresent
      : snapshotState.alignedTargetPresent;
    const lineNumbers = panel === 'source'
      ? snapshotState.sourceLineNumbersByAlignedRow
      : snapshotState.targetLineNumbersByAlignedRow;
    const resolvedLineNumbers = Array.isArray(lineNumbers) && lineNumbers.length === present.length
      ? lineNumbers
      : buildLineNumberByAlignedRow(present);
    const elementText = activeElement.value ?? '';
    const selectionStart = activeElement.selectionStart ?? elementText.length;
    const selectionEnd = activeElement.selectionEnd ?? elementText.length;
    const effectiveRowIndex = getLineIndexFromTextOffset(elementText, selectionStart);
    const lineNumber = resolvedLineNumbers[effectiveRowIndex] ?? 0;

    return {
      side: panel,
      rowIndex: effectiveRowIndex,
      lineNumber,
      selectionStart,
      selectionEnd,
    };
  }, []);

  const {
    schedulePreviewMetadataComputation,
    invalidatePreviewMetadataComputation,
    scheduleDiffRefresh,
    flushSideCommit,
    scheduleSideCommit,
    clearSideCommitTimer,
    applyDeferredBackendResultIfIdle,
  } = useDiffEditorSync({
    tabId: tab.id,
    diffPayload: tab.diffPayload,
    sourceTab,
    targetTab,
    sourceScroller,
    targetScroller,
    lineDiff,
    setLineDiff,
    lineDiffRef,
    pendingScrollRestoreRef,
    pendingCaretRestoreRef,
    lastEditAtRef,
    updateTab,
    capturePanelScrollSnapshot,
    captureFocusedCaretSnapshot,
    normalizeLineDiffResult,
    extractActualLines,
    inferTrailingNewlineFromLines,
    serializeLines,
    findAlignedRowIndexByLineNumber,
    buildInitialDiff,
    dispatchDocumentUpdated,
  });

  useEffect(() => bindScrollerViewport(sourceScroller, setSourceViewport), [sourceScroller]);
  useEffect(() => bindScrollerViewport(targetScroller, setTargetViewport), [targetScroller]);

  useEffect(() => {
    if (!sourceScroller || !targetScroller) {
      return;
    }

    const syncScrollPosition = (from: HTMLElement, to: HTMLElement) => {
      const fromMaxTop = Math.max(0, from.scrollHeight - from.clientHeight);
      const toMaxTop = Math.max(0, to.scrollHeight - to.clientHeight);
      const fromMaxLeft = Math.max(0, from.scrollWidth - from.clientWidth);
      const toMaxLeft = Math.max(0, to.scrollWidth - to.clientWidth);
      const verticalRatio = fromMaxTop <= 0 ? 0 : from.scrollTop / fromMaxTop;
      const horizontalRatio = fromMaxLeft <= 0 ? 0 : from.scrollLeft / fromMaxLeft;

      to.scrollTop = toMaxTop * verticalRatio;
      to.scrollLeft = toMaxLeft * horizontalRatio;
    };

    const createScrollHandler = (from: HTMLElement, to: HTMLElement) => () => {
      if (scrollSyncLockRef.current) {
        return;
      }

      scrollSyncLockRef.current = true;
      syncScrollPosition(from, to);
      window.requestAnimationFrame(() => {
        scrollSyncLockRef.current = false;
      });
    };

    const syncTargetFromSource = createScrollHandler(sourceScroller, targetScroller);
    const syncSourceFromTarget = createScrollHandler(targetScroller, sourceScroller);

    sourceScroller.addEventListener('scroll', syncTargetFromSource, { passive: true });
    targetScroller.addEventListener('scroll', syncSourceFromTarget, { passive: true });
    syncScrollPosition(sourceScroller, targetScroller);

    return () => {
      sourceScroller.removeEventListener('scroll', syncTargetFromSource);
      targetScroller.removeEventListener('scroll', syncSourceFromTarget);
      scrollSyncLockRef.current = false;
    };
  }, [sourceScroller, targetScroller]);

  const handleSavePanel = useCallback(
    async (panel: ActivePanel) => {
      const panelTab = panel === 'source' ? sourceTab : targetTab;
      if (!panelTab) {
        return;
      }

      clearSideCommitTimer(panel);

      await flushSideCommit(panel);

      const latestTab = useStore
        .getState()
        .tabs.find((item) => item.id === panelTab.id && item.tabType !== 'diff');

      if (!latestTab || latestTab.tabType === 'diff') {
        return;
      }

      try {
        await saveTab(latestTab, updateTab);
        scheduleDiffRefresh();
      } catch (error) {
        console.error('Failed to save panel tab:', error);
      }
    },
    [clearSideCommitTimer, flushSideCommit, scheduleDiffRefresh, sourceTab, targetTab, updateTab]
  );

  const handleSaveActivePanel = useCallback(async () => {
    await handleSavePanel(activePanel);
  }, [activePanel, handleSavePanel]);

  const runPanelHistoryAction = useCallback(
    async (side: ActivePanel, action: 'undo' | 'redo') => {
      const panelTab = side === 'source' ? sourceTab : targetTab;
      if (!panelTab) {
        return;
      }

      setActivePanel(side);
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (textarea && document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      clearSideCommitTimer(side);

      await flushSideCommit(side);

      try {
        const nextLineCount = await invoke<number>(action, { id: panelTab.id });
        let nextDirtyState = useStore.getState().tabs.find((item) => item.id === panelTab.id)?.isDirty ?? true;
        try {
          const historyState = await invoke<EditHistoryState>('get_edit_history_state', { id: panelTab.id });
          nextDirtyState = historyState.isDirty;
        } catch (error) {
          console.warn('Failed to refresh panel history state:', error);
        }

        updateTab(panelTab.id, {
          lineCount: Math.max(1, nextLineCount),
          isDirty: nextDirtyState,
        });
        dispatchDocumentUpdated(panelTab.id);
        scheduleDiffRefresh();
      } catch (error) {
        console.warn(`Failed to ${action} panel tab:`, error);
      }
    },
    [clearSideCommitTimer, flushSideCommit, scheduleDiffRefresh, sourceTab, targetTab, updateTab]
  );

  useEffect(() => {
    const handleDiffToolbarHistory = (event: Event) => {
      const customEvent = event as CustomEvent<{
        diffTabId?: string;
        panel?: DiffPanelSide;
        action?: 'undo' | 'redo';
      }>;
      if (customEvent.detail?.diffTabId !== tab.id) {
        return;
      }

      if (customEvent.detail.action !== 'undo' && customEvent.detail.action !== 'redo') {
        return;
      }

      const targetPanel = customEvent.detail.panel === 'target'
        ? 'target'
        : customEvent.detail.panel === 'source'
          ? 'source'
          : activePanel;
      void runPanelHistoryAction(targetPanel, customEvent.detail.action);
    };

    window.addEventListener('rutar:diff-history-action', handleDiffToolbarHistory as EventListener);
    return () => {
      window.removeEventListener('rutar:diff-history-action', handleDiffToolbarHistory as EventListener);
    };
  }, [activePanel, runPanelHistoryAction, tab.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      void handleSaveActivePanel();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleSaveActivePanel]);

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || width <= 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startRatio: splitRatio,
      };
    },
    [splitRatio, width]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || width <= 0) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const nextRatio = clampRatio(dragState.startRatio + deltaX / width);
      setSplitRatio(nextRatio);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [width]);

  const handlePanelInputBlur = useCallback(() => {
    window.requestAnimationFrame(() => {
      applyDeferredBackendResultIfIdle();
    });
  }, [applyDeferredBackendResultIfIdle]);

  const handlePanelTextareaChange = useCallback(
    (
      side: ActivePanel,
      nextText: string,
      selectionStart: number,
      selectionEnd: number
    ) => {
      lastEditAtRef.current = Date.now();
      capturePanelScrollSnapshot();

      const normalizedLines = normalizeTextToLines(nextText);

      setLineDiff((previous) => {
        const isSourceSide = side === 'source';
        const previousActiveLines = isSourceSide
          ? previous.alignedSourceLines
          : previous.alignedTargetLines;
        const previousActivePresent = isSourceSide
          ? previous.alignedSourcePresent
          : previous.alignedTargetPresent;
        const previousOppositeLines = isSourceSide
          ? previous.alignedTargetLines
          : previous.alignedSourceLines;
        const previousOppositePresent = isSourceSide
          ? previous.alignedTargetPresent
          : previous.alignedSourcePresent;

        const reconciledPresent = reconcilePresenceAfterTextEdit(
          previousActiveLines,
          previousActivePresent,
          normalizedLines
        );

        const nextAlignedCount = Math.max(1, normalizedLines.length, previousOppositeLines.length);
        const nextActiveLines = [...normalizedLines];
        const nextActivePresent = [...reconciledPresent];
        const nextOppositeLines = [...previousOppositeLines];
        const nextOppositePresent = [...previousOppositePresent];

        while (nextActiveLines.length < nextAlignedCount) {
          nextActiveLines.push('');
          nextActivePresent.push(false);
        }

        while (nextOppositeLines.length < nextAlignedCount) {
          nextOppositeLines.push('');
          nextOppositePresent.push(false);
        }

        const nextSourceLines = isSourceSide ? nextActiveLines : nextOppositeLines;
        const nextSourcePresent = isSourceSide ? nextActivePresent : nextOppositePresent;
        const nextTargetLines = isSourceSide ? nextOppositeLines : nextActiveLines;
        const nextTargetPresent = isSourceSide ? nextOppositePresent : nextActivePresent;
        const caretRowIndex = getLineIndexFromTextOffset(nextText, selectionStart);
        const shouldOffloadMetadata = shouldOffloadDiffMetadataComputation(nextAlignedCount);

        if (shouldOffloadMetadata) {
          pendingCaretRestoreRef.current = {
            side,
            rowIndex: Math.max(0, Math.min(caretRowIndex, nextAlignedCount - 1)),
            lineNumber: 0,
            selectionStart,
            selectionEnd,
          };

          const nextState = {
            ...previous,
            alignedSourceLines: nextSourceLines,
            alignedTargetLines: nextTargetLines,
            alignedSourcePresent: nextSourcePresent,
            alignedTargetPresent: nextTargetPresent,
            alignedLineCount: nextAlignedCount,
          };
          lineDiffRef.current = nextState;
          schedulePreviewMetadataComputation(
            nextSourceLines,
            nextTargetLines,
            nextSourcePresent,
            nextTargetPresent
          );
          return nextState;
        }

        const metadata = buildAlignedDiffMetadata(
          nextSourceLines,
          nextTargetLines,
          nextSourcePresent,
          nextTargetPresent
        );
        const lineNumbers = isSourceSide
          ? metadata.sourceLineNumbersByAlignedRow
          : metadata.targetLineNumbersByAlignedRow;
        pendingCaretRestoreRef.current = {
          side,
          rowIndex: Math.max(0, Math.min(caretRowIndex, metadata.alignedLineCount - 1)),
          lineNumber: lineNumbers[caretRowIndex] ?? 0,
          selectionStart,
          selectionEnd,
        };

        const nextState = {
          ...previous,
          alignedSourceLines: nextSourceLines,
          alignedTargetLines: nextTargetLines,
          alignedSourcePresent: nextSourcePresent,
          alignedTargetPresent: nextTargetPresent,
          ...metadata,
        };
        lineDiffRef.current = nextState;
        return nextState;
      });

      scheduleSideCommit(side);
    },
    [capturePanelScrollSnapshot, schedulePreviewMetadataComputation, scheduleSideCommit]
  );

  const handlePanelPasteText = useCallback(
    (side: ActivePanel, pastedText: string) => {
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      const value = textarea.value ?? '';
      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const safeStart = Math.max(0, Math.min(selectionStart, value.length));
      const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length));
      const nextValue = `${value.slice(0, safeStart)}${pastedText}${value.slice(safeEnd)}`;
      const nextCaret = safeStart + pastedText.length;
      setActivePanel(side);
      textarea.focus({ preventScroll: true });
      handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
    },
    [handlePanelTextareaChange]
  );
  const {
    diffContextMenu,
    diffHeaderContextMenu,
    diffContextMenuRef,
    diffHeaderContextMenuRef,
    handlePanelContextMenu,
    handleLineNumberContextMenu,
    handleScrollerContextMenu,
    handleSplitterContextMenu,
    handleHeaderContextMenu,
    handleDiffHeaderContextMenuAction,
    handleDiffContextMenuClipboardAction,
    closeDiffContextMenu,
    diffHeaderMenuPath,
    diffHeaderMenuFileName,
    diffHeaderMenuDirectory,
  } = useDiffEditorMenusAndClipboard({
    sourceTextareaRef,
    targetTextareaRef,
    setActivePanel,
    handlePanelPasteText,
    resolvePanelPath,
    resolvePanelDisplayName,
    pathBaseName,
    getParentDirectoryPath,
  });

  const shouldHandleExternalDiffPaste = useCallback(
    (detail: { diffTabId?: string }) => detail.diffTabId === tab.id,
    [tab.id]
  );

  const handleExternalDiffPaste = useCallback(
    (text: string, detail: { panel?: DiffPanelSide }) => {
      const targetPanel = detail.panel === 'target'
        ? 'target'
        : detail.panel === 'source'
          ? 'source'
          : activePanel;
      handlePanelPasteText(targetPanel, text);
    },
    [activePanel, handlePanelPasteText]
  );

  useExternalPasteEvent<{ diffTabId?: string; panel?: DiffPanelSide; text?: string }>({
    eventName: 'rutar:diff-paste-text',
    shouldHandle: shouldHandleExternalDiffPaste,
    onPasteText: handleExternalDiffPaste,
  });

  const handlePanelTextareaKeyDown = useCallback(
    (side: ActivePanel, event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === 'Tab'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        event.preventDefault();
        const target = event.currentTarget;
        const value = target.value;
        const start = target.selectionStart ?? value.length;
        const end = target.selectionEnd ?? start;
        const safeStart = Math.max(0, Math.min(start, value.length));
        const safeEnd = Math.max(safeStart, Math.min(end, value.length));
        const nextValue = `${value.slice(0, safeStart)}\t${value.slice(safeEnd)}`;
        const nextCaret = safeStart + 1;
        handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
      }
    },
    [handlePanelTextareaChange]
  );

  const handlePanelTextareaCopy = useCallback(
    (side: ActivePanel, event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const value = target.value ?? '';
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      const snapshot = lineDiffRef.current;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      const copiedText = buildCopyTextWithoutVirtualRows(
        value,
        selectionStart,
        selectionEnd,
        present
      );

      if (copiedText === null) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData('text/plain', copiedText);
    },
    []
  );

  const handleCopyLinesToPanel = useCallback(
    async (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return;
      }

      const destinationTab = targetSide === 'source' ? sourceTab : targetTab;
      if (!destinationTab) {
        return;
      }

      const sourceTextarea = fromSide === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!sourceTextarea) {
        return;
      }

      const sourceText = sourceTextarea.value ?? '';
      const selectionStart = sourceTextarea.selectionStart ?? 0;
      const selectionEnd = sourceTextarea.selectionEnd ?? selectionStart;
      const { startLine, endLine } = getSelectedLineRangeByOffset(
        sourceText,
        selectionStart,
        selectionEnd
      );
      const snapshot = lineDiffRef.current;
      const requestSequence = copyLinesRequestSequenceRef.current + 1;
      copyLinesRequestSequenceRef.current = requestSequence;

      try {
        const result = await invoke<ApplyAlignedDiffPanelCopyResult>('apply_aligned_diff_panel_copy', {
          fromSide,
          toSide: targetSide,
          startRowIndex: Math.max(0, Math.floor(startLine)),
          endRowIndex: Math.max(0, Math.floor(endLine)),
          alignedSourceLines: snapshot.alignedSourceLines,
          alignedTargetLines: snapshot.alignedTargetLines,
          alignedSourcePresent: snapshot.alignedSourcePresent,
          alignedTargetPresent: snapshot.alignedTargetPresent,
        });

        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }

        if (!result?.changed) {
          return;
        }

        lastEditAtRef.current = Date.now();
        capturePanelScrollSnapshot();
        invalidatePreviewMetadataComputation();
        const normalized = normalizeLineDiffResult(result.lineDiff);
        lineDiffRef.current = normalized;
        setLineDiff(normalized);
        scheduleSideCommit(targetSide);
      } catch (error) {
        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }
        console.error('Failed to copy diff lines to panel:', error);
      }
    },
    [
      capturePanelScrollSnapshot,
      invalidatePreviewMetadataComputation,
      scheduleSideCommit,
      sourceTab,
      targetTab,
    ]
  );

  const isCopyLinesToPanelDisabled = useCallback(
    (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return true;
      }

      const destinationTab = targetSide === 'source' ? sourceTab : targetTab;
      if (!destinationTab) {
        return true;
      }

      const textarea = fromSide === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return true;
      }

      const snapshot = lineDiffRef.current;
      const sourceLines = fromSide === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const destinationLines = targetSide === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;

      const maxIndex = Math.min(sourceLines.length, destinationLines.length) - 1;
      if (maxIndex < 0) {
        return true;
      }

      return false;
    },
    [sourceTab, targetTab]
  );

  const { handleLineNumberPointerDown, handleLineNumberKeyDown } = useDiffEditorLineNumberSelection({
    sourceTextareaRef,
    targetTextareaRef,
    lineDiffRef,
    setActivePanel,
    getLineSelectionRange,
  });

  const availableWidth = Math.max(0, width);
  const contentWidth = Math.max(0, availableWidth - SPLITTER_WIDTH_PX);
  const minimumPairWidth = MIN_PANEL_WIDTH_PX * 2;
  const rawLeftWidth = Math.round(contentWidth * splitRatio);
  const leftWidthPx =
    contentWidth <= minimumPairWidth
      ? Math.max(0, Math.round(contentWidth / 2))
      : Math.max(MIN_PANEL_WIDTH_PX, Math.min(contentWidth - MIN_PANEL_WIDTH_PX, rawLeftWidth));
  const rightWidthPx = Math.max(0, contentWidth - leftWidthPx);
  const separatorLeftPx = leftWidthPx;

  const alignedLineCount = Math.max(
    1,
    lineDiff.alignedLineCount,
    lineDiff.alignedSourceLines.length,
    lineDiff.alignedTargetLines.length
  );
  const diffLineNumbers = useMemo(
    () =>
      Array.from(new Set(lineDiff.diffLineNumbers))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right),
    [lineDiff.diffLineNumbers]
  );
  const diffRowIndexes = useMemo(
    () => {
      const candidate = lineDiff.diffRowIndexes;
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate
          .map((rowIndex) => Math.floor(rowIndex))
          .filter((rowIndex) => Number.isFinite(rowIndex) && rowIndex >= 0 && rowIndex < alignedLineCount);
      }

      return diffLineNumbers
        .map((lineNumber) => lineNumber - 1)
        .filter((rowIndex) => rowIndex >= 0 && rowIndex < alignedLineCount);
    },
    [alignedLineCount, diffLineNumbers, lineDiff.diffRowIndexes]
  );
  const alignedDiffKindByLine = useMemo(() => {
    const result = new Map<number, DiffLineKind>();
    const normalizedKinds = Array.isArray(lineDiff.alignedDiffKinds)
      ? ensureDiffKindArray(lineDiff.alignedDiffKinds, alignedLineCount)
      : [];

    if (normalizedKinds.length > 0) {
      for (let index = 0; index < alignedLineCount; index += 1) {
        const kind = normalizedKinds[index];
        if (!kind) {
          continue;
        }
        result.set(index + 1, kind);
      }

      return result;
    }

    for (const lineNumber of diffLineNumbers) {
      const index = lineNumber - 1;
      if (index < 0 || index >= alignedLineCount) {
        continue;
      }

      const kind = resolveAlignedDiffKind(
        index,
        lineDiff.alignedSourceLines,
        lineDiff.alignedTargetLines,
        lineDiff.alignedSourcePresent,
        lineDiff.alignedTargetPresent
      );
      if (!kind) {
        continue;
      }

      result.set(lineNumber, kind);
    }

    return result;
  }, [
    alignedLineCount,
    diffLineNumbers,
    lineDiff.alignedDiffKinds,
    lineDiff.alignedSourceLines,
    lineDiff.alignedSourcePresent,
    lineDiff.alignedTargetLines,
    lineDiff.alignedTargetPresent,
  ]);
  const sourceLineNumbers = useMemo(
    () => {
      if (
        Array.isArray(lineDiff.sourceLineNumbersByAlignedRow)
        && lineDiff.sourceLineNumbersByAlignedRow.length === lineDiff.alignedSourcePresent.length
      ) {
        return lineDiff.sourceLineNumbersByAlignedRow;
      }

      return buildLineNumberByAlignedRow(lineDiff.alignedSourcePresent);
    },
    [lineDiff.alignedSourcePresent, lineDiff.sourceLineNumbersByAlignedRow]
  );
  const targetLineNumbers = useMemo(
    () => {
      if (
        Array.isArray(lineDiff.targetLineNumbersByAlignedRow)
        && lineDiff.targetLineNumbersByAlignedRow.length === lineDiff.alignedTargetPresent.length
      ) {
        return lineDiff.targetLineNumbersByAlignedRow;
      }

      return buildLineNumberByAlignedRow(lineDiff.alignedTargetPresent);
    },
    [lineDiff.alignedTargetPresent, lineDiff.targetLineNumbersByAlignedRow]
  );

  const rowHeightPx = Math.max(22, Math.round(settings.fontSize * 1.6));
  const {
    sourceSearchQuery,
    setSourceSearchQuery,
    targetSearchQuery,
    setTargetSearchQuery,
    sourceSearchMatchedRows,
    targetSearchMatchedRows,
    sourceSearchMatchedRow,
    setSourceSearchMatchedRow,
    targetSearchMatchedRow,
    setTargetSearchMatchedRow,
    sourceSearchCurrentRow,
    targetSearchCurrentRow,
    sourceSearchDisabled,
    targetSearchDisabled,
  } = useDiffEditorSearchNavigation({
    sourceTabId,
    targetTabId,
    alignedLineCount,
    sourceAlignedPresent: lineDiff.alignedSourcePresent,
    targetAlignedPresent: lineDiff.alignedTargetPresent,
    sourceLineNumbers,
    targetLineNumbers,
  });
  const {
    sourcePairHighlights,
    targetPairHighlights,
    clearPairHighlightsForSide,
    updatePairHighlightsForSide,
    schedulePairHighlightSyncForSide,
  } = useDiffEditorPairHighlight({
    lineDiff,
  });

  const jumpToPanelAlignedRow = useCallback(
    (side: ActivePanel, rowIndex: number) => {
      const snapshot = lineDiffRef.current;
      const lines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const textarea = side === 'source'
        ? sourceTextareaRef.current
        : targetTextareaRef.current;
      const scroller = side === 'source'
        ? sourceScroller
        : targetScroller;
      const safeRowIndex = Math.max(0, Math.min(rowIndex, Math.max(0, lines.length - 1)));
      const { start, end } = getLineSelectionRange(lines, safeRowIndex);

      if (textarea) {
        const valueLength = textarea.value.length;
        const safeStart = Math.max(0, Math.min(start, valueLength));
        const safeEnd = Math.max(safeStart, Math.min(end, valueLength));
        textarea.setSelectionRange(safeStart, safeEnd);
      }

      if (scroller) {
        const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const centeredScrollTop = safeRowIndex * rowHeightPx - Math.max(0, (scroller.clientHeight - rowHeightPx) / 2);
        scroller.scrollTop = Math.max(0, Math.min(maxScrollTop, centeredScrollTop));
      }

      setActivePanel(side);
    },
    [rowHeightPx, sourceScroller, targetScroller]
  );
  const resolvePanelCurrentRow = useCallback((side: ActivePanel) => {
    const textarea = side === 'source'
      ? sourceTextareaRef.current
      : targetTextareaRef.current;
    if (!textarea) {
      return null;
    }

    const value = textarea.value ?? '';
    const selectionStart = textarea.selectionStart ?? 0;
    return getLineIndexFromTextOffset(value, selectionStart);
  }, []);
  const jumpPanelDiffRow = useCallback(
    (side: ActivePanel, direction: 'next' | 'prev') => {
      const currentRow = resolvePanelCurrentRow(side);
      const nextRow = getNextMatchedRowFromAnchor(diffRowIndexes, currentRow, direction);
      if (nextRow === null) {
        return;
      }

      jumpToPanelAlignedRow(side, nextRow);
    },
    [diffRowIndexes, jumpToPanelAlignedRow, resolvePanelCurrentRow]
  );
  const jumpSourceDiffRow = useCallback(
    (direction: 'next' | 'prev') => {
      jumpPanelDiffRow('source', direction);
    },
    [jumpPanelDiffRow]
  );
  const jumpTargetDiffRow = useCallback(
    (direction: 'next' | 'prev') => {
      jumpPanelDiffRow('target', direction);
    },
    [jumpPanelDiffRow]
  );
  const jumpSourceSearchMatch = useCallback(
    (direction: 'next' | 'prev') => {
      const nextRow = getNextMatchedRow(sourceSearchMatchedRows, sourceSearchMatchedRow, direction);
      if (nextRow === null) {
        return;
      }

      setSourceSearchMatchedRow(nextRow);
      jumpToPanelAlignedRow('source', nextRow);
    },
    [jumpToPanelAlignedRow, sourceSearchMatchedRow, sourceSearchMatchedRows]
  );
  const jumpTargetSearchMatch = useCallback(
    (direction: 'next' | 'prev') => {
      const nextRow = getNextMatchedRow(targetSearchMatchedRows, targetSearchMatchedRow, direction);
      if (nextRow === null) {
        return;
      }

      setTargetSearchMatchedRow(nextRow);
      jumpToPanelAlignedRow('target', nextRow);
    },
    [jumpToPanelAlignedRow, targetSearchMatchedRow, targetSearchMatchedRows]
  );
  const sourceDiffJumpDisabled = diffRowIndexes.length === 0 || !sourceTab;
  const targetDiffJumpDisabled = diffRowIndexes.length === 0 || !targetTab;
  const lineNumberColumnWidth = Math.max(
    44,
    String(Math.max(lineDiff.sourceLineCount, lineDiff.targetLineCount, 1)).length * 10 + 16
  );
  const sourceContentWidthPx = useMemo(() => {
    const longest = lineDiff.alignedSourceLines.reduce((maxLength, lineText) => {
      return Math.max(maxLength, (lineText ?? '').length);
    }, 1);
    return Math.max(
      leftWidthPx,
      Math.ceil(longest * Math.max(settings.fontSize, 12) * 0.62) + lineNumberColumnWidth + 24
    );
  }, [leftWidthPx, lineDiff.alignedSourceLines, lineNumberColumnWidth, settings.fontSize]);
  const targetContentWidthPx = useMemo(() => {
    const longest = lineDiff.alignedTargetLines.reduce((maxLength, lineText) => {
      return Math.max(maxLength, (lineText ?? '').length);
    }, 1);
    return Math.max(
      rightWidthPx,
      Math.ceil(longest * Math.max(settings.fontSize, 12) * 0.62) + lineNumberColumnWidth + 24
    );
  }, [lineDiff.alignedTargetLines, lineNumberColumnWidth, rightWidthPx, settings.fontSize]);
  const activeViewport = activePanel === 'source' ? sourceViewport : targetViewport;
  const shadowTopPercent = clampPercent(activeViewport.topPercent);
  const shadowHeightPercent = Math.max(1, clampPercent(activeViewport.heightPercent));
  const shadowBottomPercent = Math.min(100, shadowTopPercent + shadowHeightPercent);

  const saveLabel = 'Save';
  const sourceTitlePrefix = 'Source';
  const targetTitlePrefix = 'Target';
  const sourceUnavailableLabel = 'Source tab closed';
  const targetUnavailableLabel = 'Target tab closed';
  const isZhCN = settings.language === 'zh-CN';
  const copyLabel = isZhCN ? '复制' : 'Copy';
  const cutLabel = isZhCN ? '剪切' : 'Cut';
  const pasteLabel = isZhCN ? '粘贴' : 'Paste';
  const copyToLeftLabel = isZhCN ? '复制到左侧' : 'Copy to Left';
  const copyToRightLabel = isZhCN ? '复制到右侧' : 'Copy to Right';
  const copyFileNameLabel = isZhCN ? '复制文件名' : 'Copy File Name';
  const copyDirectoryPathLabel = isZhCN ? '复制文件夹路径' : 'Copy Folder Path';
  const copyFullPathLabel = isZhCN ? '复制完整路径' : 'Copy Full Path';
  const openContainingFolderLabel = isZhCN ? '打开所在目录' : 'Open Containing Folder';
  const searchPlaceholderLabel = isZhCN ? '搜索关键字' : 'Search keyword';
  const previousMatchLabel = isZhCN ? '上一个匹配' : 'Previous Match';
  const nextMatchLabel = isZhCN ? '下一个匹配' : 'Next Match';
  const previousDiffLineLabel = isZhCN ? '上一个不同行' : 'Previous Diff Line';
  const nextDiffLineLabel = isZhCN ? '下一个不同行' : 'Next Diff Line';
  const noDiffLineLabel = isZhCN ? '未找到不同行' : 'No diff lines';
  const noMatchLabel = isZhCN ? '未找到匹配' : 'No matches';
  const sourcePanelText = useMemo(
    () => lineDiff.alignedSourceLines.join('\n'),
    [lineDiff.alignedSourceLines]
  );
  const targetPanelText = useMemo(
    () => lineDiff.alignedTargetLines.join('\n'),
    [lineDiff.alignedTargetLines]
  );
  const sourcePanelHeightPx = Math.max(1, alignedLineCount * rowHeightPx);
  const targetPanelHeightPx = Math.max(1, alignedLineCount * rowHeightPx);
  const sourcePairHighlightRows = useMemo(
    () => buildPairHighlightRows(sourcePairHighlights, lineDiff.alignedSourceLines),
    [lineDiff.alignedSourceLines, sourcePairHighlights]
  );
  const targetPairHighlightRows = useMemo(
    () => buildPairHighlightRows(targetPairHighlights, lineDiff.alignedTargetLines),
    [lineDiff.alignedTargetLines, targetPairHighlights]
  );

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="flex h-10 items-center border-b border-border/60 bg-muted/35 text-xs">
        <div className="flex min-w-0 items-center justify-between gap-2 px-2" style={{ width: leftWidthPx }}>
          <span
            className="min-w-0 truncate font-medium text-foreground"
            title={sourcePath}
            onContextMenu={(event) => {
              handleHeaderContextMenu('source', event);
            }}
          >
            {sourceTitlePrefix}: {sourceDisplayName}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative w-44">
              <input
                type="text"
                value={sourceSearchQuery}
                onChange={(event) => {
                  setSourceSearchQuery(event.currentTarget.value);
                  setSourceSearchMatchedRow(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    jumpSourceSearchMatch('next');
                  }
                }}
                placeholder={searchPlaceholderLabel}
                aria-label={`${sourceTitlePrefix} ${searchPlaceholderLabel}`}
                name="diff-source-search"
                autoComplete="off"
                className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    jumpSourceSearchMatch('prev');
                  }}
                  disabled={sourceSearchDisabled}
                  title={sourceSearchDisabled ? noMatchLabel : previousMatchLabel}
                  aria-label={previousMatchLabel}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    jumpSourceSearchMatch('next');
                  }}
                  disabled={sourceSearchDisabled}
                  title={sourceSearchDisabled ? noMatchLabel : nextMatchLabel}
                  aria-label={nextMatchLabel}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpSourceDiffRow('prev');
                }}
                disabled={sourceDiffJumpDisabled}
                title={sourceDiffJumpDisabled ? noDiffLineLabel : previousDiffLineLabel}
                aria-label={`${sourceTitlePrefix} ${previousDiffLineLabel}`}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpSourceDiffRow('next');
                }}
                disabled={sourceDiffJumpDisabled}
                title={sourceDiffJumpDisabled ? noDiffLineLabel : nextDiffLineLabel}
                aria-label={`${sourceTitlePrefix} ${nextDiffLineLabel}`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                sourceTab?.isDirty
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              )}
              onClick={() => {
                void handleSavePanel('source');
              }}
              disabled={!sourceTab}
              title={`${saveLabel} (Ctrl+S)`}
              aria-label={`${saveLabel} source panel`}
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div
          className="border-x border-border/70 bg-muted/30"
          style={{ width: SPLITTER_WIDTH_PX }}
          aria-hidden="true"
        />

        <div className="flex min-w-0 items-center justify-between gap-2 px-2" style={{ width: rightWidthPx }}>
          <span
            className="min-w-0 truncate font-medium text-foreground"
            title={targetPath}
            onContextMenu={(event) => {
              handleHeaderContextMenu('target', event);
            }}
          >
            {targetTitlePrefix}: {targetDisplayName}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative w-44">
              <input
                type="text"
                value={targetSearchQuery}
                onChange={(event) => {
                  setTargetSearchQuery(event.currentTarget.value);
                  setTargetSearchMatchedRow(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    jumpTargetSearchMatch('next');
                  }
                }}
                placeholder={searchPlaceholderLabel}
                aria-label={`${targetTitlePrefix} ${searchPlaceholderLabel}`}
                name="diff-target-search"
                autoComplete="off"
                className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    jumpTargetSearchMatch('prev');
                  }}
                  disabled={targetSearchDisabled}
                  title={targetSearchDisabled ? noMatchLabel : previousMatchLabel}
                  aria-label={previousMatchLabel}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    jumpTargetSearchMatch('next');
                  }}
                  disabled={targetSearchDisabled}
                  title={targetSearchDisabled ? noMatchLabel : nextMatchLabel}
                  aria-label={nextMatchLabel}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpTargetDiffRow('prev');
                }}
                disabled={targetDiffJumpDisabled}
                title={targetDiffJumpDisabled ? noDiffLineLabel : previousDiffLineLabel}
                aria-label={`${targetTitlePrefix} ${previousDiffLineLabel}`}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpTargetDiffRow('next');
                }}
                disabled={targetDiffJumpDisabled}
                title={targetDiffJumpDisabled ? noDiffLineLabel : nextDiffLineLabel}
                aria-label={`${targetTitlePrefix} ${nextDiffLineLabel}`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                targetTab?.isDirty
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              )}
              onClick={() => {
                void handleSavePanel('target');
              }}
              disabled={!targetTab}
              title={`${saveLabel} (Ctrl+S)`}
              aria-label={`${saveLabel} target panel`}
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={viewportRef} className="relative h-[calc(100%-2.5rem)] w-full overflow-hidden">
        <div className="absolute inset-0 flex">
          <DiffPanelView
            side="source"
            panelWidthPx={leftWidthPx}
            isActive={activePanel === 'source'}
            hasTab={Boolean(sourceTab)}
            unavailableText={sourceUnavailableLabel}
            scrollerRef={handleSourceScrollerRef}
            onScrollerContextMenu={handleScrollerContextMenu}
            contentWidthPx={sourceContentWidthPx}
            panelHeightPx={sourcePanelHeightPx}
            lineNumberColumnWidth={lineNumberColumnWidth}
            alignedLineCount={alignedLineCount}
            alignedDiffKindByLine={alignedDiffKindByLine}
            getDiffKindStyle={getDiffKindStyle}
            lines={lineDiff.alignedSourceLines}
            present={lineDiff.alignedSourcePresent}
            lineNumbers={sourceLineNumbers}
            searchCurrentRow={sourceSearchCurrentRow}
            titlePrefix={sourceTitlePrefix}
            rowHeightPx={rowHeightPx}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            onLineNumberPointerDown={handleLineNumberPointerDown}
            onLineNumberKeyDown={handleLineNumberKeyDown}
            textareaRef={sourceTextareaRef}
            panelText={sourcePanelText}
            onTextareaChange={handlePanelTextareaChange}
            onTextareaKeyDown={handlePanelTextareaKeyDown}
            onTextareaCopy={handlePanelTextareaCopy}
            onPanelContextMenu={handlePanelContextMenu}
            setActivePanel={setActivePanel}
            schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
            onPanelInputBlur={handlePanelInputBlur}
            clearPairHighlightsForSide={clearPairHighlightsForSide}
            updatePairHighlightsForSide={updatePairHighlightsForSide}
            pairHighlightRows={sourcePairHighlightRows}
            buildPairHighlightSegments={buildPairHighlightSegments}
            pairHighlightClass={PAIR_HIGHLIGHT_CLASS}
            onLineNumberContextMenu={handleLineNumberContextMenu}
          />

          <div
            className="border-x border-border/70 bg-muted/30"
            style={{ width: SPLITTER_WIDTH_PX }}
            aria-hidden="true"
          />

          <DiffPanelView
            side="target"
            panelWidthPx={rightWidthPx}
            isActive={activePanel === 'target'}
            hasTab={Boolean(targetTab)}
            unavailableText={targetUnavailableLabel}
            scrollerRef={handleTargetScrollerRef}
            onScrollerContextMenu={handleScrollerContextMenu}
            contentWidthPx={targetContentWidthPx}
            panelHeightPx={targetPanelHeightPx}
            lineNumberColumnWidth={lineNumberColumnWidth}
            alignedLineCount={alignedLineCount}
            alignedDiffKindByLine={alignedDiffKindByLine}
            getDiffKindStyle={getDiffKindStyle}
            lines={lineDiff.alignedTargetLines}
            present={lineDiff.alignedTargetPresent}
            lineNumbers={targetLineNumbers}
            searchCurrentRow={targetSearchCurrentRow}
            titlePrefix={targetTitlePrefix}
            rowHeightPx={rowHeightPx}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            onLineNumberPointerDown={handleLineNumberPointerDown}
            onLineNumberKeyDown={handleLineNumberKeyDown}
            textareaRef={targetTextareaRef}
            panelText={targetPanelText}
            onTextareaChange={handlePanelTextareaChange}
            onTextareaKeyDown={handlePanelTextareaKeyDown}
            onTextareaCopy={handlePanelTextareaCopy}
            onPanelContextMenu={handlePanelContextMenu}
            setActivePanel={setActivePanel}
            schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
            onPanelInputBlur={handlePanelInputBlur}
            clearPairHighlightsForSide={clearPairHighlightsForSide}
            updatePairHighlightsForSide={updatePairHighlightsForSide}
            pairHighlightRows={targetPairHighlightRows}
            buildPairHighlightSegments={buildPairHighlightSegments}
            pairHighlightClass={PAIR_HIGHLIGHT_CLASS}
            onLineNumberContextMenu={handleLineNumberContextMenu}
          />
        </div>

        <div
          className="pointer-events-none absolute top-0 bottom-0"
          style={{ left: separatorLeftPx, width: SPLITTER_WIDTH_PX }}
          aria-hidden="true"
        >
          <div
            className="absolute left-0 right-0 bg-sky-400/20 dark:bg-sky-300/20"
            style={{
              top: `${shadowTopPercent}%`,
              height: `${Math.max(1, shadowBottomPercent - shadowTopPercent)}%`,
              zIndex: 10,
            }}
          />

          {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
            const diffStyle = getDiffKindStyle(kind);
            return (
              <div
                key={`diff-marker-${lineNumber}`}
                className={cn('absolute left-0 right-0 h-[2px]', diffStyle.markerClass)}
                style={{
                  top: `${(lineNumber / alignedLineCount) * 100}%`,
                  zIndex: 20,
                }}
              />
            );
          })}
        </div>

        <div
          className="absolute top-0 bottom-0 z-30 cursor-col-resize"
          style={{ left: separatorLeftPx, width: SPLITTER_WIDTH_PX }}
          onPointerDown={handleSplitterPointerDown}
          onContextMenu={handleSplitterContextMenu}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize diff panels"
        >
          <div className="mx-auto h-full w-px bg-border/90 shadow-[0_0_8px_rgba(0,0,0,0.18)]" />
        </div>
      </div>

      {diffHeaderContextMenu && (
        <div
          ref={diffHeaderContextMenuRef}
          className="fixed z-[96] w-52 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: diffHeaderContextMenu.x, top: diffHeaderContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-file-name');
            }}
          >
            {copyFileNameLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-directory');
            }}
            disabled={!diffHeaderMenuDirectory}
          >
            {copyDirectoryPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-path');
            }}
            disabled={!diffHeaderMenuPath}
          >
            {copyFullPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'open-containing-folder');
            }}
            disabled={!diffHeaderMenuPath}
            title={diffHeaderMenuFileName}
          >
            {openContainingFolderLabel}
          </button>
        </div>
      )}

      {diffContextMenu && (
        <div
          ref={diffContextMenuRef}
          className="fixed z-[95] w-44 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: diffContextMenu.x, top: diffContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'copy');
            }}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'cut');
            }}
          >
            {cutLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'paste');
            }}
          >
            {pasteLabel}
          </button>
          <div className="my-1 h-px bg-border" />
          {diffContextMenu.side === 'target' && (
            <button
              type="button"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'source')}
              onClick={() => {
                void handleCopyLinesToPanel(diffContextMenu.side, 'source');
                closeDiffContextMenu();
              }}
            >
              {copyToLeftLabel}
            </button>
          )}
          {diffContextMenu.side === 'source' && (
            <button
              type="button"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'target')}
              onClick={() => {
                void handleCopyLinesToPanel(diffContextMenu.side, 'target');
                closeDiffContextMenu();
              }}
            >
              {copyToRightLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
