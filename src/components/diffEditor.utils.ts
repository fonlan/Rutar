import type { DiffTabPayload } from '@/store/useStore';
import type { ActivePanel, DiffLineKind, LineDiffComparisonResult } from './diffEditor.types';
import { editorTestUtils } from './editorUtils';
export interface ViewportMetrics {
  topPercent: number;
  heightPercent: number;
}

export interface PanelScrollSnapshot {
  sourceTop: number;
  sourceLeft: number;
  targetTop: number;
  targetLeft: number;
}

export interface CaretSnapshot {
  side: ActivePanel;
  rowIndex: number;
  lineNumber: number;
  selectionStart: number;
  selectionEnd: number;
}

export interface PairHighlightPosition {
  line: number;
  column: number;
}

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
export const DEFAULT_RATIO = 0.5;
export const MIN_PANEL_WIDTH_PX = 220;
export const SPLITTER_WIDTH_PX = 16;
export const DEFAULT_VIEWPORT: ViewportMetrics = { topPercent: 0, heightPercent: 100 };
export const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';
const {
  normalizeLineText,
  dispatchDocumentUpdated: dispatchDocumentUpdatedFromEditorUtils,
} = editorTestUtils;

export const dispatchDocumentUpdated = dispatchDocumentUpdatedFromEditorUtils;

export function getParentDirectoryPath(filePath: string): string | null {
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

export function pathBaseName(path: string) {
  const normalizedPath = path.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

export function resolveAlignedDiffKind(
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

export function getDiffKindStyle(kind: DiffLineKind) {
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

export function clampRatio(value: number) {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, value));
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function normalizeTextToLines(text: string) {
  const normalized = normalizeLineText(text || '');
  const lines = normalized.split('\n');
  return lines.length > 0 ? lines : [''];
}

export function buildFallbackDiffLineNumbers(sourceLines: string[], targetLines: string[]) {
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

export function ensureBooleanArray(values: unknown, length: number, fallbackValue: boolean) {
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

export function ensureLineNumberArray(values: unknown, length: number) {
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

export function ensureDiffKindArray(values: unknown, length: number) {
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

export function normalizeLineDiffResult(input: LineDiffComparisonResult): LineDiffComparisonResult {
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

export function buildInitialDiff(payload: DiffTabPayload): LineDiffComparisonResult {
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

export function buildLineNumberByAlignedRow(present: boolean[]) {
  let lineNumber = 0;
  return present.map((isPresent) => {
    if (!isPresent) {
      return 0;
    }

    lineNumber += 1;
    return lineNumber;
  });
}

export function extractActualLines(alignedLines: string[], present: boolean[]) {
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

export function findAlignedRowIndexByLineNumber(present: boolean[], lineNumber: number) {
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

export function getLineIndexFromTextOffset(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let lineIndex = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (text[index] === '\n') {
      lineIndex += 1;
    }
  }
  return lineIndex;
}

export function buildPairHighlightRows(pairHighlights: PairHighlightPosition[], lines: string[]) {
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

export function buildPairHighlightSegments(lineTextLength: number, pairColumns: number[]) {
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

export function getSelectedLineRangeByOffset(text: string, selectionStart: number, selectionEnd: number) {
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

export function buildCopyTextWithoutVirtualRows(
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

export function getLineSelectionRange(lines: string[], rowIndex: number) {
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

export function getNextMatchedRow(
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

export function getNextMatchedRowFromAnchor(
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

export function reconcilePresenceAfterTextEdit(
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

export function inferTrailingNewlineFromLines(lineCount: number, actualLines: string[]) {
  if (lineCount <= 1) {
    return false;
  }

  if (actualLines.length === 0) {
    return false;
  }

  return actualLines[actualLines.length - 1] === '';
}

export function serializeLines(actualLines: string[], trailingNewline: boolean) {
  const safeLines = actualLines.length > 0 ? actualLines : [''];
  let text = safeLines.join('\n');
  if (trailingNewline) {
    text += '\n';
  }
  return text;
}

export function bindScrollerViewport(
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
  normalizeTextToLines,
  buildFallbackDiffLineNumbers,
  ensureBooleanArray,
  ensureLineNumberArray,
  ensureDiffKindArray,
  normalizeLineDiffResult,
  buildInitialDiff,
  buildLineNumberByAlignedRow,
  extractActualLines,
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


