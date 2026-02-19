import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { saveTab } from '@/lib/tabClose';
import { cn } from '@/lib/utils';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { type DiffPanelSide, type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';

interface DiffEditorProps {
  tab: FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload };
}

interface LineDiffComparisonResult {
  alignedSourceLines: string[];
  alignedTargetLines: string[];
  alignedSourcePresent: boolean[];
  alignedTargetPresent: boolean[];
  diffLineNumbers: number[];
  sourceDiffLineNumbers: number[];
  targetDiffLineNumbers: number[];
  alignedDiffKinds?: Array<DiffLineKind | null>;
  sourceLineNumbersByAlignedRow?: number[];
  targetLineNumbersByAlignedRow?: number[];
  diffRowIndexes?: number[];
  sourceLineCount: number;
  targetLineCount: number;
  alignedLineCount: number;
}

interface ApplyAlignedDiffEditResult {
  lineDiff: LineDiffComparisonResult;
  sourceIsDirty: boolean;
  targetIsDirty: boolean;
}

interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
  leftLine?: number;
  leftColumn?: number;
  rightLine?: number;
  rightColumn?: number;
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

interface DiffContextMenuState {
  x: number;
  y: number;
  side: ActivePanel;
}

interface DiffHeaderContextMenuState {
  x: number;
  y: number;
  side: ActivePanel;
}

interface PairHighlightPosition {
  line: number;
  column: number;
}

type ActivePanel = 'source' | 'target';
type DiffLineKind = 'insert' | 'delete' | 'modify';

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;
const MIN_PANEL_WIDTH_PX = 220;
const SPLITTER_WIDTH_PX = 16;
const REFRESH_DEBOUNCE_MS = 120;
const EDIT_DEBOUNCE_MS = 90;
const PREVIEW_METADATA_DEBOUNCE_MS = 70;
const OFFLOAD_METADATA_MIN_LINES = 0;
const INPUT_ACTIVE_HOLD_MS = 450;
const DEFAULT_VIEWPORT: ViewportMetrics = { topPercent: 0, heightPercent: 100 };
const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';

function isPairCandidateCharacter(char: string) {
  return char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}' || char === '"' || char === "'";
}

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
  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

function codeUnitOffsetToLineColumn(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(text.length, Math.floor(offset)));
  const prefix = text.slice(0, safeOffset);
  const line = prefix.split('\n').length;
  const lastNewline = prefix.lastIndexOf('\n');
  const column = safeOffset - (lastNewline + 1);

  return {
    line,
    column,
  };
}

function arePairHighlightPositionsEqual(
  left: PairHighlightPosition[],
  right: PairHighlightPosition[]
) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].line !== right[index].line || left[index].column !== right[index].column) {
      return false;
    }
  }

  return true;
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

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
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
  const [diffContextMenu, setDiffContextMenu] = useState<DiffContextMenuState | null>(null);
  const [diffHeaderContextMenu, setDiffHeaderContextMenu] = useState<DiffHeaderContextMenuState | null>(null);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [sourceSearchMatchedRows, setSourceSearchMatchedRows] = useState<number[]>([]);
  const [targetSearchMatchedRows, setTargetSearchMatchedRows] = useState<number[]>([]);
  const [sourceSearchMatchedRow, setSourceSearchMatchedRow] = useState<number | null>(null);
  const [targetSearchMatchedRow, setTargetSearchMatchedRow] = useState<number | null>(null);
  const [sourcePairHighlights, setSourcePairHighlights] = useState<PairHighlightPosition[]>([]);
  const [targetPairHighlights, setTargetPairHighlights] = useState<PairHighlightPosition[]>([]);

  const dragStateRef = useRef<{ pointerId: number; startX: number; startRatio: number } | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshSequenceRef = useRef(0);
  const scrollSyncLockRef = useRef(false);
  const lineDiffRef = useRef(lineDiff);
  const sourceCommittedTextRef = useRef('');
  const targetCommittedTextRef = useRef('');
  const sourceTrailingNewlineRef = useRef(false);
  const targetTrailingNewlineRef = useRef(false);
  const sideCommitTimerRef = useRef<{ source: number | null; target: number | null }>({
    source: null,
    target: null,
  });
  const sideCommitInFlightRef = useRef<{ source: boolean; target: boolean }>({
    source: false,
    target: false,
  });
  const sideCommitPendingRef = useRef<{ source: boolean; target: boolean }>({
    source: false,
    target: false,
  });
  const pendingScrollRestoreRef = useRef<PanelScrollSnapshot | null>(null);
  const pendingCaretRestoreRef = useRef<CaretSnapshot | null>(null);
  const lastEditAtRef = useRef(0);
  const deferredBackendDiffRef = useRef<LineDiffComparisonResult | null>(null);
  const deferredBackendApplyTimerRef = useRef<number | null>(null);
  const previewMetadataTimerRef = useRef<number | null>(null);
  const previewMetadataSequenceRef = useRef(0);
  const sourceSearchRequestSequenceRef = useRef(0);
  const targetSearchRequestSequenceRef = useRef(0);
  const pairHighlightRequestIdRef = useRef<{ source: number; target: number }>({
    source: 0,
    target: 0,
  });
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const targetTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const diffContextMenuRef = useRef<HTMLDivElement | null>(null);
  const diffHeaderContextMenuRef = useRef<HTMLDivElement | null>(null);

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

  const isInputEditingActive = useCallback(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return false;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return false;
    }

    return Date.now() - lastEditAtRef.current < INPUT_ACTIVE_HOLD_MS;
  }, []);

  const clearPreviewMetadataTimer = useCallback(() => {
    if (previewMetadataTimerRef.current !== null) {
      window.clearTimeout(previewMetadataTimerRef.current);
      previewMetadataTimerRef.current = null;
    }
  }, []);

  const applyPreviewMetadataResult = useCallback((result: LineDiffComparisonResult) => {
    const normalized = normalizeLineDiffResult(result);
    setLineDiff((previous) => {
      const nextState = {
        ...previous,
        diffLineNumbers: normalized.diffLineNumbers,
        sourceDiffLineNumbers: normalized.sourceDiffLineNumbers,
        targetDiffLineNumbers: normalized.targetDiffLineNumbers,
        alignedDiffKinds: normalized.alignedDiffKinds,
        sourceLineNumbersByAlignedRow: normalized.sourceLineNumbersByAlignedRow,
        targetLineNumbersByAlignedRow: normalized.targetLineNumbersByAlignedRow,
        diffRowIndexes: normalized.diffRowIndexes,
        sourceLineCount: normalized.sourceLineCount,
        targetLineCount: normalized.targetLineCount,
        alignedLineCount: normalized.alignedLineCount,
      };
      lineDiffRef.current = nextState;
      return nextState;
    });
  }, []);

  const schedulePreviewMetadataComputation = useCallback(
    (
      alignedSourceLines: string[],
      alignedTargetLines: string[],
      alignedSourcePresent: boolean[],
      alignedTargetPresent: boolean[]
    ) => {
      const sequence = previewMetadataSequenceRef.current + 1;
      previewMetadataSequenceRef.current = sequence;
      clearPreviewMetadataTimer();
      previewMetadataTimerRef.current = window.setTimeout(() => {
        previewMetadataTimerRef.current = null;
        void invoke<LineDiffComparisonResult>('preview_aligned_diff_state', {
          alignedSourceLines,
          alignedTargetLines,
          alignedSourcePresent,
          alignedTargetPresent,
        })
          .then((result) => {
            if (previewMetadataSequenceRef.current !== sequence) {
              return;
            }
            applyPreviewMetadataResult(result);
          })
          .catch((error) => {
            if (previewMetadataSequenceRef.current !== sequence) {
              return;
            }
            console.error('Failed to preview aligned diff metadata:', error);
          });
      }, PREVIEW_METADATA_DEBOUNCE_MS);
    },
    [applyPreviewMetadataResult, clearPreviewMetadataTimer]
  );

  const invalidatePreviewMetadataComputation = useCallback(() => {
    previewMetadataSequenceRef.current = previewMetadataSequenceRef.current + 1;
    clearPreviewMetadataTimer();
  }, [clearPreviewMetadataTimer]);

  const applyBackendDiffResult = useCallback(
    (result: LineDiffComparisonResult) => {
      invalidatePreviewMetadataComputation();
      capturePanelScrollSnapshot();
      const focusedCaret = captureFocusedCaretSnapshot();
      const normalized = normalizeLineDiffResult(result);
      const sourceActualLines = extractActualLines(
        normalized.alignedSourceLines,
        normalized.alignedSourcePresent
      );
      const targetActualLines = extractActualLines(
        normalized.alignedTargetLines,
        normalized.alignedTargetPresent
      );
      const sourceTrailing = inferTrailingNewlineFromLines(normalized.sourceLineCount, sourceActualLines);
      const targetTrailing = inferTrailingNewlineFromLines(normalized.targetLineCount, targetActualLines);

      sourceTrailingNewlineRef.current = sourceTrailing;
      targetTrailingNewlineRef.current = targetTrailing;
      sourceCommittedTextRef.current = serializeLines(sourceActualLines, sourceTrailing);
      targetCommittedTextRef.current = serializeLines(targetActualLines, targetTrailing);

      lineDiffRef.current = normalized;
      if (focusedCaret) {
        const present = focusedCaret.side === 'source'
          ? normalized.alignedSourcePresent
          : normalized.alignedTargetPresent;
        const mappedRowIndex = findAlignedRowIndexByLineNumber(present, focusedCaret.lineNumber);
        const nextRowIndex = mappedRowIndex >= 0 ? mappedRowIndex : focusedCaret.rowIndex;
        pendingCaretRestoreRef.current = {
          ...focusedCaret,
          rowIndex: Math.max(0, Math.min(nextRowIndex, Math.max(0, present.length - 1))),
        };
      }
      setLineDiff(normalized);
      const nextLineCount = Math.max(1, normalized.alignedLineCount);
      const currentDiffTab = useStore.getState().tabs.find((item) => item.id === tab.id);
      if ((currentDiffTab?.lineCount ?? 0) !== nextLineCount) {
        updateTab(tab.id, {
          lineCount: nextLineCount,
        });
      }
    },
    [
      captureFocusedCaretSnapshot,
      capturePanelScrollSnapshot,
      invalidatePreviewMetadataComputation,
      tab.id,
      updateTab,
    ]
  );

  const scheduleDeferredBackendApply = useCallback(() => {
    if (deferredBackendApplyTimerRef.current !== null) {
      window.clearTimeout(deferredBackendApplyTimerRef.current);
    }

    deferredBackendApplyTimerRef.current = window.setTimeout(() => {
      deferredBackendApplyTimerRef.current = null;
      const pendingResult = deferredBackendDiffRef.current;
      if (!pendingResult) {
        return;
      }

      if (isInputEditingActive()) {
        scheduleDeferredBackendApply();
        return;
      }

      deferredBackendDiffRef.current = null;
      applyBackendDiffResult(pendingResult);
    }, INPUT_ACTIVE_HOLD_MS);
  }, [applyBackendDiffResult, isInputEditingActive]);

  useEffect(() => {
    applyBackendDiffResult(buildInitialDiff(tab.diffPayload));
  }, [applyBackendDiffResult, tab.diffPayload]);

  useEffect(() => {
    lineDiffRef.current = lineDiff;
  }, [lineDiff]);

  useEffect(() => {
    const snapshot = pendingCaretRestoreRef.current;
    if (!snapshot) {
      return;
    }

    pendingCaretRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      const textareaSelector = `textarea[data-diff-panel="${snapshot.side}"]`;
      const textarea = document.querySelector(textareaSelector) as HTMLTextAreaElement | null;
      if (!textarea) {
        return;
      }

      textarea.focus({ preventScroll: true });
      const valueLength = textarea.value.length;
      const start = Math.max(0, Math.min(snapshot.selectionStart, valueLength));
      const end = Math.max(0, Math.min(snapshot.selectionEnd, valueLength));
      textarea.setSelectionRange(start, end);
    });
  }, [lineDiff]);

  useEffect(() => {
    const snapshot = pendingScrollRestoreRef.current;
    if (!snapshot || !sourceScroller || !targetScroller) {
      return;
    }

    pendingScrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      if (sourceScroller) {
        sourceScroller.scrollTop = snapshot.sourceTop;
        sourceScroller.scrollLeft = snapshot.sourceLeft;
      }

      if (targetScroller) {
        targetScroller.scrollTop = snapshot.targetTop;
        targetScroller.scrollLeft = snapshot.targetLeft;
      }
    });
  }, [lineDiff, sourceScroller, targetScroller]);

  const runDiffRefresh = useCallback(async () => {
    if (!sourceTab || !targetTab) {
      return;
    }

    const currentSequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = currentSequence;

    try {
      const result = await invoke<LineDiffComparisonResult>('compare_documents_by_line', {
        sourceId: sourceTab.id,
        targetId: targetTab.id,
      });

      if (refreshSequenceRef.current !== currentSequence) {
        return;
      }

      if (isInputEditingActive()) {
        deferredBackendDiffRef.current = result;
        scheduleDeferredBackendApply();
        return;
      }

      applyBackendDiffResult(result);
    } catch (error) {
      if (refreshSequenceRef.current === currentSequence) {
        console.error('Failed to refresh diff result:', error);
      }
    }
  }, [applyBackendDiffResult, isInputEditingActive, scheduleDeferredBackendApply, sourceTab, targetTab]);

  const scheduleDiffRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void runDiffRefresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [runDiffRefresh]);

  const flushSideCommit = useCallback(
    async (side: ActivePanel) => {
      const panelTab = side === 'source' ? sourceTab : targetTab;
      if (!panelTab || !sourceTab || !targetTab) {
        return;
      }

      if (sideCommitInFlightRef.current[side]) {
        sideCommitPendingRef.current[side] = true;
        return;
      }

      const snapshot = lineDiffRef.current;
      const alignedLines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      const actualLines = extractActualLines(alignedLines, present);
      const trailingNewline = side === 'source'
        ? sourceTrailingNewlineRef.current
        : targetTrailingNewlineRef.current;
      const previousText = side === 'source'
        ? sourceCommittedTextRef.current
        : targetCommittedTextRef.current;
      const nextText = serializeLines(actualLines, trailingNewline);

      if (previousText === nextText) {
        return;
      }

      sideCommitInFlightRef.current[side] = true;

      try {
        const result = await invoke<ApplyAlignedDiffEditResult>('apply_aligned_diff_edit', {
          sourceId: sourceTab.id,
          targetId: targetTab.id,
          editedSide: side,
          alignedSourceLines: snapshot.alignedSourceLines,
          alignedTargetLines: snapshot.alignedTargetLines,
          alignedSourcePresent: snapshot.alignedSourcePresent,
          alignedTargetPresent: snapshot.alignedTargetPresent,
          editedTrailingNewline: trailingNewline,
        });

        if (side === 'source') {
          sourceCommittedTextRef.current = nextText;
          sourceTrailingNewlineRef.current = trailingNewline;
        } else {
          targetCommittedTextRef.current = nextText;
          targetTrailingNewlineRef.current = trailingNewline;
        }

        if (sourceTab) {
          updateTab(sourceTab.id, {
            lineCount: Math.max(1, result.lineDiff.sourceLineCount),
            isDirty: result.sourceIsDirty,
          });
        }

        if (targetTab) {
          updateTab(targetTab.id, {
            lineCount: Math.max(1, result.lineDiff.targetLineCount),
            isDirty: result.targetIsDirty,
          });
        }

        if (isInputEditingActive()) {
          deferredBackendDiffRef.current = result.lineDiff;
          scheduleDeferredBackendApply();
        } else {
          applyBackendDiffResult(result.lineDiff);
        }

        dispatchDocumentUpdated(panelTab.id);
      } catch (error) {
        console.error('Failed to write aligned diff edit:', error);
      } finally {
        sideCommitInFlightRef.current[side] = false;
        if (sideCommitPendingRef.current[side]) {
          sideCommitPendingRef.current[side] = false;
          void flushSideCommit(side);
        }
      }
    },
    [applyBackendDiffResult, isInputEditingActive, scheduleDeferredBackendApply, sourceTab, targetTab, updateTab]
  );

  const scheduleSideCommit = useCallback(
    (side: ActivePanel) => {
      const timer = sideCommitTimerRef.current[side];
      if (timer !== null) {
        window.clearTimeout(timer);
      }

      sideCommitTimerRef.current[side] = window.setTimeout(() => {
        sideCommitTimerRef.current[side] = null;
        void flushSideCommit(side);
      }, EDIT_DEBOUNCE_MS);
    },
    [flushSideCommit]
  );

  useEffect(() => {
    void runDiffRefresh();
  }, [runDiffRefresh]);

  useEffect(() => {
    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const changedId = customEvent.detail?.tabId;
      if (!changedId) {
        return;
      }

      if (changedId !== sourceTab?.id && changedId !== targetTab?.id) {
        return;
      }

      scheduleDiffRefresh();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    return () => {
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [scheduleDiffRefresh, sourceTab?.id, targetTab?.id]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      if (deferredBackendApplyTimerRef.current !== null) {
        window.clearTimeout(deferredBackendApplyTimerRef.current);
      }

      if (previewMetadataTimerRef.current !== null) {
        window.clearTimeout(previewMetadataTimerRef.current);
      }

      if (sideCommitTimerRef.current.source !== null) {
        window.clearTimeout(sideCommitTimerRef.current.source);
      }

      if (sideCommitTimerRef.current.target !== null) {
        window.clearTimeout(sideCommitTimerRef.current.target);
      }
    };
  }, []);

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

      if (sideCommitTimerRef.current[panel] !== null) {
        window.clearTimeout(sideCommitTimerRef.current[panel] as number);
        sideCommitTimerRef.current[panel] = null;
      }

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
    [flushSideCommit, scheduleDiffRefresh, sourceTab, targetTab, updateTab]
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

      if (sideCommitTimerRef.current[side] !== null) {
        window.clearTimeout(sideCommitTimerRef.current[side] as number);
        sideCommitTimerRef.current[side] = null;
      }

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
    [flushSideCommit, scheduleDiffRefresh, sourceTab, targetTab, updateTab]
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
      const pendingResult = deferredBackendDiffRef.current;
      if (!pendingResult || isInputEditingActive()) {
        return;
      }

      deferredBackendDiffRef.current = null;
      applyBackendDiffResult(pendingResult);
    });
  }, [applyBackendDiffResult, isInputEditingActive]);

  const setPairHighlightsForSide = useCallback(
    (side: ActivePanel, nextHighlights: PairHighlightPosition[]) => {
      if (side === 'source') {
        setSourcePairHighlights((previous) =>
          arePairHighlightPositionsEqual(previous, nextHighlights) ? previous : nextHighlights
        );
        return;
      }

      setTargetPairHighlights((previous) =>
        arePairHighlightPositionsEqual(previous, nextHighlights) ? previous : nextHighlights
      );
    },
    []
  );

  const clearPairHighlightsForSide = useCallback(
    (side: ActivePanel) => {
      pairHighlightRequestIdRef.current[side] = pairHighlightRequestIdRef.current[side] + 1;
      setPairHighlightsForSide(side, []);
    },
    [setPairHighlightsForSide]
  );

  const updatePairHighlightsForSide = useCallback(
    async (side: ActivePanel, text: string, selectionStart: number, selectionEnd: number) => {
      const requestId = pairHighlightRequestIdRef.current[side] + 1;
      pairHighlightRequestIdRef.current[side] = requestId;

      if (selectionStart !== selectionEnd) {
        setPairHighlightsForSide(side, []);
        return;
      }

      let matched: PairOffsetsResultPayload | null = null;
      try {
        matched = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
          text,
          offset: selectionEnd,
        });
      } catch (error) {
        if (pairHighlightRequestIdRef.current[side] === requestId) {
          setPairHighlightsForSide(side, []);
        }
        console.error('Failed to find matching pair offsets in diff panel:', error);
        return;
      }

      if (pairHighlightRequestIdRef.current[side] !== requestId) {
        return;
      }

      if (!matched) {
        setPairHighlightsForSide(side, []);
        return;
      }

      // Prefer matching the character currently at caret position when backend resolution
      // lands on previous offset but caret itself is on a pair candidate.
      if (selectionStart === selectionEnd && selectionEnd >= 0 && selectionEnd < text.length) {
        const currentChar = text.charAt(selectionEnd);
        if (isPairCandidateCharacter(currentChar)) {
          const includesCurrent =
            matched.leftOffset === selectionEnd || matched.rightOffset === selectionEnd;
          const includesPrevious =
            selectionEnd > 0
              && (matched.leftOffset === selectionEnd - 1 || matched.rightOffset === selectionEnd - 1);

          if (!includesCurrent && includesPrevious) {
            try {
              const corrected = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
                text,
                offset: selectionEnd + 1,
              });
              if (pairHighlightRequestIdRef.current[side] !== requestId) {
                return;
              }
              if (corrected) {
                matched = corrected;
              }
            } catch (error) {
              console.error('Failed to correct matching pair offset in diff panel:', error);
            }
          }
        }
      }

      const sortedOffsets = matched.leftOffset <= matched.rightOffset
        ? [matched.leftOffset, matched.rightOffset]
        : [matched.rightOffset, matched.leftOffset];
      const hasBackendPositions =
        Number.isFinite(matched.leftLine)
        && Number.isFinite(matched.leftColumn)
        && Number.isFinite(matched.rightLine)
        && Number.isFinite(matched.rightColumn);
      const nextHighlights = hasBackendPositions
        ? [
          {
            offset: matched.leftOffset,
            line: Math.max(1, Math.floor(matched.leftLine as number)),
            column: Math.max(1, Math.floor(matched.leftColumn as number)),
          },
          {
            offset: matched.rightOffset,
            line: Math.max(1, Math.floor(matched.rightLine as number)),
            column: Math.max(1, Math.floor(matched.rightColumn as number)),
          },
        ]
          .sort((left, right) => left.offset - right.offset)
          .map((item) => ({ line: item.line, column: item.column }))
        : sortedOffsets.map((offset) => {
          const position = codeUnitOffsetToLineColumn(text, offset);
          return {
            line: Math.max(1, position.line),
            column: position.column + 1,
          };
        });
      setPairHighlightsForSide(side, nextHighlights);
    },
    [setPairHighlightsForSide]
  );

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

  useEffect(() => {
    const handleDiffToolbarPaste = (event: Event) => {
      const customEvent = event as CustomEvent<{ diffTabId?: string; panel?: DiffPanelSide; text?: string }>;
      if (customEvent.detail?.diffTabId !== tab.id) {
        return;
      }

      const targetPanel = customEvent.detail.panel === 'target'
        ? 'target'
        : customEvent.detail.panel === 'source'
          ? 'source'
          : activePanel;
      handlePanelPasteText(targetPanel, customEvent.detail.text ?? '');
    };

    window.addEventListener('rutar:diff-paste-text', handleDiffToolbarPaste as EventListener);
    return () => {
      window.removeEventListener('rutar:diff-paste-text', handleDiffToolbarPaste as EventListener);
    };
  }, [activePanel, handlePanelPasteText, tab.id]);

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

  const handlePanelContextMenu = useCallback(
    (side: ActivePanel, event: ReactMouseEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      setActivePanel(side);
      setDiffHeaderContextMenu(null);

      const menuWidth = 176;
      const menuHeight = 168;
      const viewportPadding = 8;
      const x = Math.max(
        viewportPadding,
        Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
      );
      const y = Math.max(
        viewportPadding,
        Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
      );

      setDiffContextMenu({
        x,
        y,
        side,
      });
    },
    []
  );

  const handleHeaderContextMenu = useCallback(
    (side: ActivePanel, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setActivePanel(side);
      setDiffContextMenu(null);

      const menuWidth = 208;
      const menuHeight = 172;
      const viewportPadding = 8;
      const x = Math.max(
        viewportPadding,
        Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
      );
      const y = Math.max(
        viewportPadding,
        Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
      );

      setDiffHeaderContextMenu({
        x,
        y,
        side,
      });
    },
    []
  );

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (!text || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to write clipboard text:', error);
    }
  }, []);

  const handleDiffHeaderContextMenuAction = useCallback(
    async (
      side: ActivePanel,
      action: 'copy-file-name' | 'copy-directory' | 'copy-path' | 'open-containing-folder'
    ) => {
      const filePath = resolvePanelPath(side);
      const fileName = filePath ? pathBaseName(filePath) : resolvePanelDisplayName(side);
      const folderPath = filePath ? getParentDirectoryPath(filePath) : null;
      setDiffHeaderContextMenu(null);

      if (action === 'copy-file-name') {
        await copyTextToClipboard(fileName);
        return;
      }

      if (action === 'copy-directory') {
        if (folderPath) {
          await copyTextToClipboard(folderPath);
        }
        return;
      }

      if (action === 'copy-path') {
        if (filePath) {
          await copyTextToClipboard(filePath);
        }
        return;
      }

      if (!filePath) {
        return;
      }

      try {
        await invoke('open_in_file_manager', { path: filePath });
      } catch (error) {
        console.error('Failed to open file directory from diff header:', error);
      }
    },
    [copyTextToClipboard, resolvePanelDisplayName, resolvePanelPath]
  );

  const handleCopyLinesToPanel = useCallback(
    (fromSide: ActivePanel, targetSide: ActivePanel) => {
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

      let changed = false;
      lastEditAtRef.current = Date.now();
      capturePanelScrollSnapshot();
      setLineDiff((previous) => {
        const sourceLines = fromSide === 'source'
          ? previous.alignedSourceLines
          : previous.alignedTargetLines;
        const sourcePresent = fromSide === 'source'
          ? previous.alignedSourcePresent
          : previous.alignedTargetPresent;

        const nextSourceLines = [...previous.alignedSourceLines];
        const nextSourcePresent = [...previous.alignedSourcePresent];
        const nextTargetLines = [...previous.alignedTargetLines];
        const nextTargetPresent = [...previous.alignedTargetPresent];

        const destinationLines = targetSide === 'source' ? nextSourceLines : nextTargetLines;
        const destinationPresent = targetSide === 'source' ? nextSourcePresent : nextTargetPresent;

        const maxIndex = Math.min(sourceLines.length, destinationLines.length) - 1;
        if (maxIndex < 0) {
          return previous;
        }

        const safeStart = Math.max(0, Math.min(startLine, maxIndex));
        const safeEnd = Math.max(safeStart, Math.min(endLine, maxIndex));

        for (let rowIndex = safeStart; rowIndex <= safeEnd; rowIndex += 1) {
          const sourceLine = sourceLines[rowIndex] ?? '';
          const linePresent = sourcePresent[rowIndex] === true;
          if (!linePresent) {
            if (destinationLines[rowIndex] === '' && destinationPresent[rowIndex] === false) {
              continue;
            }

            destinationLines[rowIndex] = '';
            destinationPresent[rowIndex] = false;
            changed = true;
            continue;
          }

          if (destinationLines[rowIndex] === sourceLine && destinationPresent[rowIndex] === true) {
            continue;
          }

          destinationLines[rowIndex] = sourceLine;
          destinationPresent[rowIndex] = true;
          changed = true;
        }

        if (!changed) {
          return previous;
        }

        const nextAlignedCount = Math.max(1, nextSourceLines.length, nextTargetLines.length);
        if (shouldOffloadDiffMetadataComputation(nextAlignedCount)) {
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

      if (changed) {
        scheduleSideCommit(targetSide);
      }
    },
    [capturePanelScrollSnapshot, schedulePreviewMetadataComputation, scheduleSideCommit, sourceTab, targetTab]
  );

  const runClipboardExecCommand = useCallback((command: 'copy' | 'cut' | 'paste') => {
    try {
      return document.execCommand(command);
    } catch {
      return false;
    }
  }, []);

  const handleDiffContextMenuClipboardAction = useCallback(
    async (side: ActivePanel, action: 'copy' | 'cut' | 'paste') => {
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        setDiffContextMenu(null);
        return;
      }

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      setActivePanel(side);

      if (action === 'paste') {
        try {
          const clipboardText = await readClipboardText();
          handlePanelPasteText(side, clipboardText);
        } catch (error) {
          console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
          runClipboardExecCommand('paste');
        }
      } else {
        runClipboardExecCommand(action);
      }

      setDiffContextMenu(null);
    },
    [handlePanelPasteText, runClipboardExecCommand]
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

  useEffect(() => {
    if (!diffContextMenu && !diffHeaderContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const clickedPanelMenu = !!(diffContextMenuRef.current && target && diffContextMenuRef.current.contains(target));
      const clickedHeaderMenu = !!(
        diffHeaderContextMenuRef.current
        && target
        && diffHeaderContextMenuRef.current.contains(target)
      );

      if (!clickedPanelMenu && !clickedHeaderMenu) {
        setDiffContextMenu(null);
        setDiffHeaderContextMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDiffContextMenu(null);
        setDiffHeaderContextMenu(null);
      }
    };
    const handleWindowBlur = () => {
      setDiffContextMenu(null);
      setDiffHeaderContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [diffContextMenu, diffHeaderContextMenu]);

  const handleLineNumberPointerDown = useCallback(
    (side: ActivePanel, rowIndex: number, event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const snapshot = lineDiffRef.current;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      if (!present[rowIndex]) {
        return;
      }

      const textarea = side === 'source'
        ? sourceTextareaRef.current
        : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      const lines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const { start, end } = getLineSelectionRange(lines, rowIndex);

      setActivePanel(side);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
    },
    []
  );

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
  const trimmedSourceSearchQuery = sourceSearchQuery.trim();
  const trimmedTargetSearchQuery = targetSearchQuery.trim();

  const normalizeMatchedRows = useCallback((matchedRows: unknown, alignedLineCountValue: number) => {
    if (!Array.isArray(matchedRows)) {
      return [];
    }

    return matchedRows
      .map((value) => (Number.isFinite(value) ? Math.floor(value) : -1))
      .filter((value) => value >= 0 && value < alignedLineCountValue);
  }, []);

  const mapMatchedLineNumbersToRows = useCallback((matchedLineNumbers: unknown, lineNumbers: number[]) => {
    const matchedLineNumberSet = new Set<number>(
      Array.isArray(matchedLineNumbers) ? matchedLineNumbers : []
    );
    const matchedRows: number[] = [];
    for (let rowIndex = 0; rowIndex < lineNumbers.length; rowIndex += 1) {
      const lineNumber = lineNumbers[rowIndex] ?? 0;
      if (lineNumber > 0 && matchedLineNumberSet.has(lineNumber)) {
        matchedRows.push(rowIndex);
      }
    }
    return matchedRows;
  }, []);

  const queryPanelSearchMatchedRows = useCallback(
    async (
      id: string,
      keyword: string,
      alignedPresent: boolean[],
      lineNumbers: number[],
      alignedLineCountValue: number
    ) => {
      try {
        const matchedRows = await invoke<number[]>('search_diff_panel_aligned_row_matches', {
          id,
          keyword,
          alignedPresent,
        });
        return normalizeMatchedRows(matchedRows, alignedLineCountValue);
      } catch {
        // keep fallback path for older backend runtime
      }

      const matchedLineNumbers = await invoke<number[]>('search_diff_panel_line_matches', {
        id,
        keyword,
      });
      return mapMatchedLineNumbersToRows(matchedLineNumbers, lineNumbers);
    },
    [mapMatchedLineNumbersToRows, normalizeMatchedRows]
  );

  useEffect(() => {
    if (!sourceTabId || !trimmedSourceSearchQuery) {
      sourceSearchRequestSequenceRef.current = sourceSearchRequestSequenceRef.current + 1;
      setSourceSearchMatchedRows([]);
      return;
    }

    const currentSequence = sourceSearchRequestSequenceRef.current + 1;
    sourceSearchRequestSequenceRef.current = currentSequence;

    void queryPanelSearchMatchedRows(
      sourceTabId,
      trimmedSourceSearchQuery,
      lineDiff.alignedSourcePresent,
      sourceLineNumbers,
      alignedLineCount
    )
      .then((matchedRows) => {
        if (sourceSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        setSourceSearchMatchedRows(matchedRows);
      })
      .catch((error) => {
        if (sourceSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        console.error('Failed to search source diff panel matches:', error);
        setSourceSearchMatchedRows([]);
      });
  }, [
    alignedLineCount,
    lineDiff.alignedSourcePresent,
    queryPanelSearchMatchedRows,
    sourceLineNumbers,
    sourceTabId,
    trimmedSourceSearchQuery,
  ]);

  useEffect(() => {
    if (!targetTabId || !trimmedTargetSearchQuery) {
      targetSearchRequestSequenceRef.current = targetSearchRequestSequenceRef.current + 1;
      setTargetSearchMatchedRows([]);
      return;
    }

    const currentSequence = targetSearchRequestSequenceRef.current + 1;
    targetSearchRequestSequenceRef.current = currentSequence;

    void queryPanelSearchMatchedRows(
      targetTabId,
      trimmedTargetSearchQuery,
      lineDiff.alignedTargetPresent,
      targetLineNumbers,
      alignedLineCount
    )
      .then((matchedRows) => {
        if (targetSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        setTargetSearchMatchedRows(matchedRows);
      })
      .catch((error) => {
        if (targetSearchRequestSequenceRef.current !== currentSequence) {
          return;
        }

        console.error('Failed to search target diff panel matches:', error);
        setTargetSearchMatchedRows([]);
      });
  }, [
    alignedLineCount,
    lineDiff.alignedTargetPresent,
    queryPanelSearchMatchedRows,
    targetLineNumbers,
    targetTabId,
    trimmedTargetSearchQuery,
  ]);

  const sourceSearchCurrentRow = useMemo(() => {
    if (sourceSearchMatchedRow === null) {
      return null;
    }

    return sourceSearchMatchedRows.includes(sourceSearchMatchedRow)
      ? sourceSearchMatchedRow
      : null;
  }, [sourceSearchMatchedRow, sourceSearchMatchedRows]);
  const targetSearchCurrentRow = useMemo(() => {
    if (targetSearchMatchedRow === null) {
      return null;
    }

    return targetSearchMatchedRows.includes(targetSearchMatchedRow)
      ? targetSearchMatchedRow
      : null;
  }, [targetSearchMatchedRow, targetSearchMatchedRows]);

  useEffect(() => {
    if (sourceSearchMatchedRow === null) {
      return;
    }

    if (!sourceSearchMatchedRows.includes(sourceSearchMatchedRow)) {
      setSourceSearchMatchedRow(null);
    }
  }, [sourceSearchMatchedRow, sourceSearchMatchedRows]);

  useEffect(() => {
    if (targetSearchMatchedRow === null) {
      return;
    }

    if (!targetSearchMatchedRows.includes(targetSearchMatchedRow)) {
      setTargetSearchMatchedRow(null);
    }
  }, [targetSearchMatchedRow, targetSearchMatchedRows]);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return;
    }

    const value = activeElement.value ?? '';
    const selectionStart = activeElement.selectionStart ?? value.length;
    const selectionEnd = activeElement.selectionEnd ?? value.length;
    void updatePairHighlightsForSide(panel, value, selectionStart, selectionEnd);
  }, [lineDiff, updatePairHighlightsForSide]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLTextAreaElement)) {
        return;
      }

      const panel = activeElement.dataset.diffPanel;
      if (panel !== 'source' && panel !== 'target') {
        return;
      }

      const value = activeElement.value ?? '';
      const selectionStart = activeElement.selectionStart ?? value.length;
      const selectionEnd = activeElement.selectionEnd ?? value.length;
      void updatePairHighlightsForSide(panel, value, selectionStart, selectionEnd);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [updatePairHighlightsForSide]);

  const schedulePairHighlightSyncForSide = useCallback(
    (side: ActivePanel, textarea: HTMLTextAreaElement) => {
      window.requestAnimationFrame(() => {
        if (!textarea.isConnected) {
          return;
        }

        const panel = textarea.dataset.diffPanel;
        if (panel !== side) {
          return;
        }

        const value = textarea.value ?? '';
        const selectionStart = textarea.selectionStart ?? value.length;
        const selectionEnd = textarea.selectionEnd ?? value.length;
        void updatePairHighlightsForSide(side, value, selectionStart, selectionEnd);
      });
    },
    [updatePairHighlightsForSide]
  );

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
  const sourceSearchDisabled = sourceSearchMatchedRows.length === 0;
  const targetSearchDisabled = targetSearchMatchedRows.length === 0;
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
  const diffHeaderMenuPath = diffHeaderContextMenu
    ? resolvePanelPath(diffHeaderContextMenu.side)
    : '';
  const diffHeaderMenuFileName = diffHeaderContextMenu
    ? (diffHeaderMenuPath
      ? pathBaseName(diffHeaderMenuPath)
      : resolvePanelDisplayName(diffHeaderContextMenu.side))
    : '';
  const diffHeaderMenuDirectory = diffHeaderMenuPath
    ? getParentDirectoryPath(diffHeaderMenuPath)
    : null;

  const renderUnavailable = (text: string) => (
    <div className="flex h-full items-center justify-center bg-muted/10 text-xs text-muted-foreground">
      {text}
    </div>
  );

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
                className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
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
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
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
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
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
                className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
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
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
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
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
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
          <div
            className={cn(
              'relative h-full overflow-hidden',
              activePanel === 'source' && 'ring-1 ring-inset ring-blue-500/30'
            )}
            style={{ width: leftWidthPx }}
          >
            {sourceTab ? (
              <div
                ref={handleSourceScrollerRef}
                className="editor-scroll-stable h-full overflow-auto"
              >
                <div
                  className="relative flex"
                  style={{
                    minWidth: `${sourceContentWidthPx}px`,
                    height: `${sourcePanelHeightPx}px`,
                  }}
                >
                  <div
                    className="sticky left-0 z-20 shrink-0 border-r border-border/40 bg-background"
                    style={{ width: `${lineNumberColumnWidth}px` }}
                  >
                    {Array.from({ length: alignedLineCount }).map((_, index) => {
                      const diffKind = alignedDiffKindByLine.get(index + 1);
                      const isDiffLine = Boolean(diffKind);
                      const diffStyle = diffKind ? getDiffKindStyle(diffKind) : null;
                      const linePresent = lineDiff.alignedSourcePresent[index] === true;
                      const lineNumber = sourceLineNumbers[index] ?? 0;
                      const lineText = lineDiff.alignedSourceLines[index] ?? '';
                      return (
                        <div
                          key={`source-ln-${index}`}
                          className={cn(
                            'border-b border-border/35 px-2 text-right text-xs text-muted-foreground select-none',
                            linePresent && 'cursor-pointer hover:bg-muted/40',
                            isDiffLine && diffStyle?.lineNumberClass,
                            sourceSearchCurrentRow === index
                              && 'bg-sky-400/22 text-sky-700 dark:bg-sky-300/20 dark:text-sky-200'
                          )}
                          onPointerDown={(event) => {
                            handleLineNumberPointerDown('source', index, event);
                          }}
                          style={{
                            height: `${rowHeightPx}px`,
                            lineHeight: `${rowHeightPx}px`,
                            fontFamily: settings.fontFamily,
                            fontSize: `${Math.max(10, settings.fontSize - 2)}px`,
                          }}
                        >
                          {linePresent ? lineNumber : lineText.length > 0 ? '+' : ''}
                        </div>
                      );
                    })}
                  </div>

                  <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-0 z-0">
                      {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
                        const diffStyle = getDiffKindStyle(kind);
                        return (
                          <div
                            key={`source-diff-bg-${lineNumber}`}
                            className={cn('absolute left-0 right-0', diffStyle.rowBackgroundClass)}
                            style={{
                              top: `${(lineNumber - 1) * rowHeightPx}px`,
                              height: `${rowHeightPx}px`,
                            }}
                          />
                        );
                      })}
                      {sourceSearchCurrentRow !== null && (
                        <div
                          key={`source-search-current-bg-${sourceSearchCurrentRow}`}
                          className="absolute left-0 right-0 bg-sky-400/22 dark:bg-sky-300/20"
                          style={{
                            top: `${sourceSearchCurrentRow * rowHeightPx}px`,
                            height: `${rowHeightPx}px`,
                          }}
                        />
                      )}
                    </div>

                    <textarea
                      ref={sourceTextareaRef}
                      value={sourcePanelText}
                      onChange={(event) => {
                        const target = event.currentTarget;
                        const selectionStart = target.selectionStart ?? target.value.length;
                        const selectionEnd = target.selectionEnd ?? target.value.length;
                        handlePanelTextareaChange(
                          'source',
                          target.value,
                          selectionStart,
                          selectionEnd
                        );
                        void updatePairHighlightsForSide('source', target.value, selectionStart, selectionEnd);
                      }}
                      onKeyDown={(event) => {
                        handlePanelTextareaKeyDown('source', event);
                      }}
                      onSelect={(event) => {
                        const target = event.currentTarget;
                        schedulePairHighlightSyncForSide('source', target);
                      }}
                      onCopy={(event) => {
                        handlePanelTextareaCopy('source', event);
                      }}
                      onContextMenu={(event) => {
                        handlePanelContextMenu('source', event);
                      }}
                      onFocus={(event) => {
                        setActivePanel('source');
                        const target = event.currentTarget;
                        schedulePairHighlightSyncForSide('source', target);
                      }}
                      onBlur={() => {
                        handlePanelInputBlur();
                        clearPairHighlightsForSide('source');
                      }}
                      data-diff-panel="source"
                      className="relative z-10 block w-full resize-none border-0 bg-transparent px-2 outline-none"
                      style={{
                        height: `${sourcePanelHeightPx}px`,
                        fontFamily: settings.fontFamily,
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: `${rowHeightPx}px`,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        tabSize: 4,
                      }}
                      spellCheck={false}
                      wrap="off"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                    />

                    {sourcePairHighlightRows.size > 0 && (
                      <div className="pointer-events-none absolute inset-0 z-[5]">
                        {Array.from(sourcePairHighlightRows.entries()).map(([rowIndex, pairColumns]) => {
                          const lineText = lineDiff.alignedSourceLines[rowIndex] ?? '';
                          const segments = buildPairHighlightSegments(lineText.length, pairColumns);
                          if (segments.length === 0) {
                            return null;
                          }

                          return (
                            <div
                              key={`source-pair-highlight-row-${rowIndex}`}
                              className="absolute left-0 right-0 whitespace-pre px-2"
                              style={{
                                top: `${rowIndex * rowHeightPx}px`,
                                height: `${rowHeightPx}px`,
                                lineHeight: `${rowHeightPx}px`,
                                fontFamily: settings.fontFamily,
                                fontSize: `${settings.fontSize}px`,
                                color: 'transparent',
                              }}
                            >
                              {segments.map((segment, segmentIndex) => {
                                const part = lineText.slice(segment.start, segment.end);
                                if (!segment.isPair) {
                                  return (
                                    <span key={`source-pair-highlight-segment-${rowIndex}-${segmentIndex}`}>
                                      {part}
                                    </span>
                                  );
                                }

                                return (
                                  <mark
                                    key={`source-pair-highlight-segment-${rowIndex}-${segmentIndex}`}
                                    data-diff-pair-highlight="source"
                                    className={`${PAIR_HIGHLIGHT_CLASS} text-transparent`}
                                  >
                                    {part}
                                  </mark>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : renderUnavailable(sourceUnavailableLabel)}
          </div>

          <div
            className="border-x border-border/70 bg-muted/30"
            style={{ width: SPLITTER_WIDTH_PX }}
            aria-hidden="true"
          />

          <div
            className={cn(
              'relative h-full overflow-hidden',
              activePanel === 'target' && 'ring-1 ring-inset ring-blue-500/30'
            )}
            style={{ width: rightWidthPx }}
          >
            {targetTab ? (
              <div
                ref={handleTargetScrollerRef}
                className="editor-scroll-stable h-full overflow-auto"
              >
                <div
                  className="relative flex"
                  style={{
                    minWidth: `${targetContentWidthPx}px`,
                    height: `${targetPanelHeightPx}px`,
                  }}
                >
                  <div
                    className="sticky left-0 z-20 shrink-0 border-r border-border/40 bg-background"
                    style={{ width: `${lineNumberColumnWidth}px` }}
                  >
                    {Array.from({ length: alignedLineCount }).map((_, index) => {
                      const diffKind = alignedDiffKindByLine.get(index + 1);
                      const isDiffLine = Boolean(diffKind);
                      const diffStyle = diffKind ? getDiffKindStyle(diffKind) : null;
                      const linePresent = lineDiff.alignedTargetPresent[index] === true;
                      const lineNumber = targetLineNumbers[index] ?? 0;
                      const lineText = lineDiff.alignedTargetLines[index] ?? '';
                      return (
                        <div
                          key={`target-ln-${index}`}
                          className={cn(
                            'border-b border-border/35 px-2 text-right text-xs text-muted-foreground select-none',
                            linePresent && 'cursor-pointer hover:bg-muted/40',
                            isDiffLine && diffStyle?.lineNumberClass,
                            targetSearchCurrentRow === index
                              && 'bg-sky-400/22 text-sky-700 dark:bg-sky-300/20 dark:text-sky-200'
                          )}
                          onPointerDown={(event) => {
                            handleLineNumberPointerDown('target', index, event);
                          }}
                          style={{
                            height: `${rowHeightPx}px`,
                            lineHeight: `${rowHeightPx}px`,
                            fontFamily: settings.fontFamily,
                            fontSize: `${Math.max(10, settings.fontSize - 2)}px`,
                          }}
                        >
                          {linePresent ? lineNumber : lineText.length > 0 ? '+' : ''}
                        </div>
                      );
                    })}
                  </div>

                  <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-0 z-0">
                      {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
                        const diffStyle = getDiffKindStyle(kind);
                        return (
                          <div
                            key={`target-diff-bg-${lineNumber}`}
                            className={cn('absolute left-0 right-0', diffStyle.rowBackgroundClass)}
                            style={{
                              top: `${(lineNumber - 1) * rowHeightPx}px`,
                              height: `${rowHeightPx}px`,
                            }}
                          />
                        );
                      })}
                      {targetSearchCurrentRow !== null && (
                        <div
                          key={`target-search-current-bg-${targetSearchCurrentRow}`}
                          className="absolute left-0 right-0 bg-sky-400/22 dark:bg-sky-300/20"
                          style={{
                            top: `${targetSearchCurrentRow * rowHeightPx}px`,
                            height: `${rowHeightPx}px`,
                          }}
                        />
                      )}
                    </div>

                    <textarea
                      ref={targetTextareaRef}
                      value={targetPanelText}
                      onChange={(event) => {
                        const target = event.currentTarget;
                        const selectionStart = target.selectionStart ?? target.value.length;
                        const selectionEnd = target.selectionEnd ?? target.value.length;
                        handlePanelTextareaChange(
                          'target',
                          target.value,
                          selectionStart,
                          selectionEnd
                        );
                        void updatePairHighlightsForSide('target', target.value, selectionStart, selectionEnd);
                      }}
                      onKeyDown={(event) => {
                        handlePanelTextareaKeyDown('target', event);
                      }}
                      onSelect={(event) => {
                        const target = event.currentTarget;
                        schedulePairHighlightSyncForSide('target', target);
                      }}
                      onCopy={(event) => {
                        handlePanelTextareaCopy('target', event);
                      }}
                      onContextMenu={(event) => {
                        handlePanelContextMenu('target', event);
                      }}
                      onFocus={(event) => {
                        setActivePanel('target');
                        const target = event.currentTarget;
                        schedulePairHighlightSyncForSide('target', target);
                      }}
                      onBlur={() => {
                        handlePanelInputBlur();
                        clearPairHighlightsForSide('target');
                      }}
                      data-diff-panel="target"
                      className="relative z-10 block w-full resize-none border-0 bg-transparent px-2 outline-none"
                      style={{
                        height: `${targetPanelHeightPx}px`,
                        fontFamily: settings.fontFamily,
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: `${rowHeightPx}px`,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        tabSize: 4,
                      }}
                      spellCheck={false}
                      wrap="off"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                    />

                    {targetPairHighlightRows.size > 0 && (
                      <div className="pointer-events-none absolute inset-0 z-[5]">
                        {Array.from(targetPairHighlightRows.entries()).map(([rowIndex, pairColumns]) => {
                          const lineText = lineDiff.alignedTargetLines[rowIndex] ?? '';
                          const segments = buildPairHighlightSegments(lineText.length, pairColumns);
                          if (segments.length === 0) {
                            return null;
                          }

                          return (
                            <div
                              key={`target-pair-highlight-row-${rowIndex}`}
                              className="absolute left-0 right-0 whitespace-pre px-2"
                              style={{
                                top: `${rowIndex * rowHeightPx}px`,
                                height: `${rowHeightPx}px`,
                                lineHeight: `${rowHeightPx}px`,
                                fontFamily: settings.fontFamily,
                                fontSize: `${settings.fontSize}px`,
                                color: 'transparent',
                              }}
                            >
                              {segments.map((segment, segmentIndex) => {
                                const part = lineText.slice(segment.start, segment.end);
                                if (!segment.isPair) {
                                  return (
                                    <span key={`target-pair-highlight-segment-${rowIndex}-${segmentIndex}`}>
                                      {part}
                                    </span>
                                  );
                                }

                                return (
                                  <mark
                                    key={`target-pair-highlight-segment-${rowIndex}-${segmentIndex}`}
                                    data-diff-pair-highlight="target"
                                    className={`${PAIR_HIGHLIGHT_CLASS} text-transparent`}
                                  >
                                    {part}
                                  </mark>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : renderUnavailable(targetUnavailableLabel)}
          </div>
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
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-file-name');
            }}
          >
            {copyFileNameLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-directory');
            }}
            disabled={!diffHeaderMenuDirectory}
          >
            {copyDirectoryPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-path');
            }}
            disabled={!diffHeaderMenuPath}
          >
            {copyFullPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'copy');
            }}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'cut');
            }}
          >
            {cutLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
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
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'source')}
              onClick={() => {
                handleCopyLinesToPanel(diffContextMenu.side, 'source');
                setDiffContextMenu(null);
              }}
            >
              {copyToLeftLabel}
            </button>
          )}
          {diffContextMenu.side === 'source' && (
            <button
              type="button"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'target')}
              onClick={() => {
                handleCopyLinesToPanel(diffContextMenu.side, 'target');
                setDiffContextMenu(null);
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
