// @ts-nocheck
import { VariableSizeList as List } from 'react-window';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { detectSyntaxKeyFromTab, getLineCommentPrefixForSyntaxKey } from '@/lib/syntax';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { t } from '@/i18n';

interface SyntaxToken {
  type?: string;
  text?: string;
  start_byte?: number;
  end_byte?: number;
}

interface CodeUnitDiff {
  start: number;
  end: number;
  newText: string;
}

interface EditorSegmentState {
  startLine: number;
  endLine: number;
  text: string;
}

interface SearchHighlightState {
  line: number;
  column: number;
  length: number;
  id: number;
}

interface PairHighlightPosition {
  line: number;
  column: number;
}

interface EditorContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  lineNumber: number;
  submenuDirection: 'left' | 'right';
}

type EditorSubmenuKey = 'edit' | 'sort' | 'bookmark';
type EditorSubmenuVerticalAlign = 'top' | 'bottom';

const DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign> = {
  edit: 'top',
  sort: 'top',
  bookmark: 'top',
};

const DEFAULT_SUBMENU_MAX_HEIGHTS: Record<EditorSubmenuKey, number | null> = {
  edit: null,
  sort: null,
  bookmark: null,
};

interface VerticalSelectionState {
  baseLine: number;
  baseColumn: number;
  focusLine: number;
}

interface RectangularSelectionState {
  anchorLine: number;
  anchorColumn: number;
  focusLine: number;
  focusColumn: number;
}

interface NormalizedRectangularSelection {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  lineCount: number;
  width: number;
}

type EditorCleanupAction =
  | 'remove_empty_lines'
  | 'remove_duplicate_lines'
  | 'trim_leading_whitespace'
  | 'trim_trailing_whitespace'
  | 'trim_surrounding_whitespace'
  | 'sort_lines_ascending'
  | 'sort_lines_ascending_ignore_case'
  | 'sort_lines_descending'
  | 'sort_lines_descending_ignore_case'
  | 'sort_lines_pinyin_ascending'
  | 'sort_lines_pinyin_descending';

const MAX_LINE_RANGE = 2147483647;
const DEFAULT_FETCH_BUFFER_LINES = 50;
const LARGE_FILE_FETCH_BUFFER_LINES = 200;
const HUGE_EDITABLE_FETCH_BUFFER_LINES = 100;
const LARGE_FILE_FETCH_DEBOUNCE_MS = 12;
const HUGE_EDITABLE_FETCH_DEBOUNCE_MS = 24;
const NORMAL_FILE_FETCH_DEBOUNCE_MS = 50;
const LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD = 20000;
const LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS = 160;
const NORMAL_EDIT_SYNC_DEBOUNCE_MS = 40;
const HUGE_EDITABLE_WINDOW_UNLOCK_MS = 260;
const LARGE_FILE_EDIT_INTENT_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Tab']);
const EMPTY_LINE_PLACEHOLDER = '\u200B';
const OPENING_BRACKETS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
};
const CLOSING_BRACKETS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};
const QUOTE_CHARACTERS = new Set(["'", '"']);
const SEARCH_HIGHLIGHT_CLASS = 'rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70';
const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';
const SEARCH_AND_PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-emerald-300/55 text-black ring-1 ring-emerald-500/45 dark:bg-emerald-400/40 dark:ring-emerald-300/45';
const RECTANGULAR_SELECTION_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-violet-300/45 text-black ring-1 ring-violet-500/40 dark:bg-violet-400/30 dark:ring-violet-300/40';
const RECTANGULAR_AUTO_SCROLL_EDGE_PX = 36;
const RECTANGULAR_AUTO_SCROLL_MAX_STEP_PX = 18;
const EMPTY_BOOKMARKS: number[] = [];

function isToggleLineCommentShortcut(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}) {
  if (event.isComposing || event.altKey) {
    return false;
  }

  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }

  const key = (event.key || '').toLowerCase();
  const code = event.code || '';
  return key === '/' || code === 'Slash' || code === 'NumpadDivide';
}

function isVerticalSelectionShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  if (event.isComposing) {
    return false;
  }

  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return (
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight'
  );
}

function resolveSelectionLineRange(
  text: string,
  startOffset: number,
  endOffset: number,
  isCollapsed: boolean
) {
  const safeStart = Math.max(0, Math.min(text.length, Math.floor(startOffset)));
  const safeEnd = Math.max(0, Math.min(text.length, Math.floor(endOffset)));
  const selectionStart = Math.min(safeStart, safeEnd);
  const selectionEnd = Math.max(safeStart, safeEnd);

  const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;

  let effectiveSelectionEnd = selectionEnd;
  if (!isCollapsed && effectiveSelectionEnd > lineStart && text[effectiveSelectionEnd - 1] === '\n') {
    effectiveSelectionEnd -= 1;
  }

  const nextLineBreak = text.indexOf('\n', effectiveSelectionEnd);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;

  return {
    start: lineStart,
    end: Math.max(lineStart, lineEnd),
  };
}

function splitIndentAndBody(line: string) {
  const matched = line.match(/^(\s*)(.*)$/);
  return {
    indent: matched?.[1] ?? '',
    body: matched?.[2] ?? line,
  };
}

function isLineCommentedByPrefix(line: string, prefix: string) {
  const { body } = splitIndentAndBody(line);
  return body === prefix || body.startsWith(`${prefix} `) || body.startsWith(`${prefix}\t`);
}

function addLineCommentPrefix(line: string, prefix: string) {
  const { indent, body } = splitIndentAndBody(line);

  if (!body.trim()) {
    return line;
  }

  return `${indent}${prefix} ${body}`;
}

function removeLineCommentPrefix(line: string, prefix: string) {
  const { indent, body } = splitIndentAndBody(line);

  if (!body.trim()) {
    return line;
  }

  if (isLineCommentedByPrefix(line, prefix)) {
    if (body === prefix) {
      return indent;
    }

    if (body.startsWith(prefix)) {
      const afterPrefix = body.slice(prefix.length);
      if (afterPrefix.startsWith(' ') || afterPrefix.startsWith('\t')) {
        return `${indent}${afterPrefix.slice(1)}`;
      }
      return `${indent}${afterPrefix}`;
    }
  }

  return line;
}

function mapOffsetAcrossLineTransformation(oldLines: string[], newLines: string[], oldOffset: number) {
  const safeOffset = Math.max(0, Math.floor(oldOffset));

  let oldCursor = 0;
  let newCursor = 0;

  for (let index = 0; index < oldLines.length; index += 1) {
    const oldLine = oldLines[index] ?? '';
    const newLine = newLines[index] ?? '';
    const oldLineEnd = oldCursor + oldLine.length;

    if (safeOffset <= oldLineEnd) {
      return newCursor + Math.min(safeOffset - oldCursor, newLine.length);
    }

    oldCursor = oldLineEnd;
    newCursor += newLine.length;

    if (index < oldLines.length - 1) {
      oldCursor += 1;
      newCursor += 1;

      if (safeOffset <= oldCursor) {
        return newCursor;
      }
    }
  }

  return newCursor;
}

function normalizeEditorText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n");
  return normalized === "\n" ? "" : normalized;
}

function normalizeLineText(value: string) {
  return (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeEditableLineText(value: string) {
  return normalizeLineText((value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
}

function normalizeSegmentText(value: string) {
  return normalizeEditorText((value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
}

function toInputLayerText(value: string) {
  const normalized = (value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, '');
  if (!normalized.endsWith('\n')) {
    return normalized;
  }

  return `${normalized}${EMPTY_LINE_PLACEHOLDER}`;
}

function mapLogicalOffsetToInputLayerOffset(text: string, logicalOffset: number) {
  const normalized = (text || '').replaceAll(EMPTY_LINE_PLACEHOLDER, '');
  const safeOffset = Math.max(0, Math.min(Math.floor(logicalOffset), normalized.length));
  return safeOffset;
}

function isLargeModeEditIntent(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.isComposing) {
    return false;
  }

  const key = event.key;
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const hasModifier = hasPrimaryModifier || event.altKey;

  if (!hasModifier && key.length === 1) {
    return true;
  }

  if (!hasModifier && LARGE_FILE_EDIT_INTENT_KEYS.has(key)) {
    return true;
  }

  if (hasPrimaryModifier && !event.altKey) {
    const normalized = key.toLowerCase();
    if (normalized === 'v' || normalized === 'x') {
      return true;
    }
  }

  return false;
}

function getEditableText(element: HTMLDivElement) {
  return normalizeEditorText((element.textContent || "").replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
}

function getCodeUnitOffsetFromLineColumn(text: string, line: number, column: number) {
  const targetLine = Math.max(1, Math.floor(line));
  const targetColumn = Math.max(1, Math.floor(column));

  let lineStartOffset = 0;

  if (targetLine > 1) {
    let currentLine = 1;
    let foundTargetLine = false;

    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') {
        currentLine += 1;
        if (currentLine === targetLine) {
          lineStartOffset = index + 1;
          foundTargetLine = true;
          break;
        }
      }
    }

    if (!foundTargetLine) {
      return text.length;
    }
  }

  const lineEndOffset = text.indexOf('\n', lineStartOffset);
  const safeLineEndOffset = lineEndOffset === -1 ? text.length : lineEndOffset;

  return Math.min(safeLineEndOffset, lineStartOffset + targetColumn - 1);
}

function setCaretToLineColumn(element: HTMLDivElement, line: number, column: number) {
  const content = normalizeEditorText(getEditableText(element));
  const layerText = toInputLayerText(content);
  if (element.textContent !== layerText) {
    element.textContent = layerText;
  }
  const targetOffset = getCodeUnitOffsetFromLineColumn(content, line, column);

  let textNode = element.firstChild as Text | null;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = document.createTextNode(layerText);
    element.replaceChildren(textNode);
  }

  const layerOffset = mapLogicalOffsetToInputLayerOffset(content, targetOffset);
  const safeOffset = Math.min(layerOffset, textNode.textContent?.length ?? 0);

  if (!textNode) {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStart(textNode, safeOffset);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function getCaretLineInElement(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return null;
  }

  const caretRange = range.cloneRange();
  caretRange.selectNodeContents(element);
  caretRange.setEnd(range.startContainer, range.startOffset);

  const textBeforeCaret = caretRange.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return textBeforeCaret.split('\n').length;
}

function getSelectionOffsetsInElement(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: normalizeLineText(startRange.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length,
    end: normalizeLineText(endRange.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length,
    isCollapsed: range.collapsed,
  };
}

function getSelectionAnchorFocusOffsetsInElement(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) {
    return null;
  }

  if (!element.contains(anchorNode) || !element.contains(focusNode)) {
    return null;
  }

  const anchorRange = document.createRange();
  anchorRange.selectNodeContents(element);
  anchorRange.setEnd(anchorNode, selection.anchorOffset);

  const focusRange = document.createRange();
  focusRange.selectNodeContents(element);
  focusRange.setEnd(focusNode, selection.focusOffset);

  return {
    anchor: normalizeLineText(anchorRange.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length,
    focus: normalizeLineText(focusRange.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length,
  };
}

function getLogicalOffsetFromDomPoint(element: HTMLDivElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return normalizeLineText(range.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length;
}

function getLogicalOffsetFromPoint(element: HTMLDivElement, clientX: number, clientY: number) {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(clientX, clientY);
    if (position && element.contains(position.offsetNode)) {
      return getLogicalOffsetFromDomPoint(element, position.offsetNode, position.offset);
    }
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range && element.contains(range.startContainer)) {
      return getLogicalOffsetFromDomPoint(element, range.startContainer, range.startOffset);
    }
  }

  return null;
}

function normalizeRectangularSelection(
  state: RectangularSelectionState | null
): NormalizedRectangularSelection | null {
  if (!state) {
    return null;
  }

  const startLine = Math.min(state.anchorLine, state.focusLine);
  const endLine = Math.max(state.anchorLine, state.focusLine);
  const startColumn = Math.min(state.anchorColumn, state.focusColumn);
  const endColumn = Math.max(state.anchorColumn, state.focusColumn);
  const width = endColumn - startColumn;

  if (width < 0) {
    return null;
  }

  return {
    startLine,
    endLine,
    startColumn,
    endColumn,
    lineCount: endLine - startLine + 1,
    width,
  };
}

function buildLineStartOffsets(text: string) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineBoundsByLineNumber(text: string, starts: number[], lineNumber: number) {
  const index = Math.max(0, Math.floor(lineNumber) - 1);
  if (index >= starts.length) {
    return null;
  }

  const start = starts[index];
  const end = index + 1 < starts.length ? starts[index + 1] - 1 : text.length;
  return {
    start,
    end,
  };
}

function getOffsetForColumnInLine(lineStart: number, lineEnd: number, column: number) {
  const safeColumn = Math.max(1, Math.floor(column));
  const lineLength = Math.max(0, lineEnd - lineStart);
  return lineStart + Math.min(lineLength, safeColumn - 1);
}

function setCaretToCodeUnitOffset(element: HTMLDivElement, offset: number) {
  const targetOffset = Math.max(0, Math.floor(offset));

  if (document.activeElement !== element) {
    element.focus();
  }

  let textNode = element.firstChild as Text | null;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    const content = element.textContent || '';
    textNode = document.createTextNode(content);
    element.replaceChildren(textNode);
  }

  const safeOffset = Math.min(targetOffset, textNode.textContent?.length ?? 0);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStart(textNode, safeOffset);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function setSelectionToCodeUnitOffsets(element: HTMLDivElement, startOffset: number, endOffset: number) {
  const safeStartOffset = Math.max(0, Math.floor(startOffset));
  const safeEndOffset = Math.max(0, Math.floor(endOffset));

  if (document.activeElement !== element) {
    element.focus();
  }

  let textNode = element.firstChild as Text | null;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    const content = element.textContent || '';
    textNode = document.createTextNode(content);
    element.replaceChildren(textNode);
  }

  const maxOffset = textNode.textContent?.length ?? 0;
  const normalizedStart = Math.min(safeStartOffset, maxOffset);
  const normalizedEnd = Math.min(safeEndOffset, maxOffset);
  const rangeStart = Math.min(normalizedStart, normalizedEnd);
  const rangeEnd = Math.max(normalizedStart, normalizedEnd);

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStart(textNode, rangeStart);
  range.setEnd(textNode, rangeEnd);

  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchEditorInputEvent(element: HTMLDivElement) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceSelectionWithText(element: HTMLDivElement, text: string) {
  const normalizedText = normalizeLineText(text ?? '');
  const currentText = getEditableText(element);

  let selectionOffsets = getSelectionOffsetsInElement(element);
  if (!selectionOffsets) {
    const layerEndOffset = mapLogicalOffsetToInputLayerOffset(currentText, currentText.length);
    setCaretToCodeUnitOffset(element, layerEndOffset);
    selectionOffsets = getSelectionOffsetsInElement(element);
  }

  if (!selectionOffsets) {
    return false;
  }

  const nextText = `${currentText.slice(0, selectionOffsets.start)}${normalizedText}${currentText.slice(selectionOffsets.end)}`;
  element.textContent = toInputLayerText(nextText);
  const logicalNextOffset = selectionOffsets.start + normalizedText.length;
  const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
  setCaretToCodeUnitOffset(element, layerNextOffset);
  return true;
}

function isEscapedCharacter(text: string, index: number) {
  if (index <= 0 || index > text.length) {
    return false;
  }

  let backslashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && text[cursor] === '\\') {
    backslashCount += 1;
    cursor -= 1;
  }

  return backslashCount % 2 === 1;
}

function findMatchingBracketIndex(text: string, index: number) {
  const char = text[index];
  if (!char) {
    return null;
  }

  const closing = OPENING_BRACKETS[char];
  if (closing) {
    let depth = 0;
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      const current = text[cursor];
      if (current === char) {
        depth += 1;
      } else if (current === closing) {
        if (depth === 0) {
          return cursor;
        }
        depth -= 1;
      }
    }
    return null;
  }

  const opening = CLOSING_BRACKETS[char];
  if (!opening) {
    return null;
  }

  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const current = text[cursor];
    if (current === char) {
      depth += 1;
    } else if (current === opening) {
      if (depth === 0) {
        return cursor;
      }
      depth -= 1;
    }
  }

  return null;
}

function countUnescapedQuotesBefore(text: string, index: number, quote: string) {
  let count = 0;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === quote && !isEscapedCharacter(text, cursor)) {
      count += 1;
    }
  }

  return count;
}

function findMatchingQuoteIndex(text: string, index: number) {
  const quote = text[index];
  if (!QUOTE_CHARACTERS.has(quote) || isEscapedCharacter(text, index)) {
    return null;
  }

  const countBefore = countUnescapedQuotesBefore(text, index, quote);
  const isOpeningQuote = countBefore % 2 === 0;

  if (isOpeningQuote) {
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      if (text[cursor] === quote && !isEscapedCharacter(text, cursor)) {
        return cursor;
      }
    }
    return null;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (text[cursor] === quote && !isEscapedCharacter(text, cursor)) {
      return cursor;
    }
  }

  return null;
}

function findMatchingPairNearOffset(text: string, offset: number): [number, number] | null {
  const safeOffset = Math.max(0, Math.min(text.length, Math.floor(offset)));
  const candidateIndexes: number[] = [];

  if (safeOffset > 0) {
    candidateIndexes.push(safeOffset - 1);
  }

  if (safeOffset < text.length) {
    candidateIndexes.push(safeOffset);
  }

  for (const index of candidateIndexes) {
    const char = text[index];

    let matchedIndex: number | null = null;
    if (OPENING_BRACKETS[char] || CLOSING_BRACKETS[char]) {
      matchedIndex = findMatchingBracketIndex(text, index);
    } else if (QUOTE_CHARACTERS.has(char)) {
      matchedIndex = findMatchingQuoteIndex(text, index);
    }

    if (matchedIndex !== null) {
      return [index, matchedIndex];
    }
  }

  return null;
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

  for (let i = 0; i < left.length; i += 1) {
    if (left[i].line !== right[i].line || left[i].column !== right[i].column) {
      return false;
    }
  }

  return true;
}

function buildCodeUnitDiff(previousText: string, nextText: string): CodeUnitDiff | null {
  if (previousText === nextText) {
    return null;
  }

  let start = 0;
  const prevLen = previousText.length;
  const nextLen = nextText.length;

  while (
    start < prevLen &&
    start < nextLen &&
    previousText.charCodeAt(start) === nextText.charCodeAt(start)
  ) {
    start += 1;
  }

  let prevEnd = prevLen;
  let nextEnd = nextLen;

  while (
    prevEnd > start &&
    nextEnd > start &&
    previousText.charCodeAt(prevEnd - 1) === nextText.charCodeAt(nextEnd - 1)
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    end: prevEnd,
    newText: nextText.slice(start, nextEnd),
  };
}

function codeUnitOffsetToUnicodeScalarIndex(text: string, offset: number) {
  if (offset <= 0) return 0;

  let scalarIndex = 0;
  let consumedCodeUnits = 0;

  for (const ch of text) {
    const step = ch.length;
    if (consumedCodeUnits + step > offset) {
      break;
    }

    consumedCodeUnits += step;
    scalarIndex += 1;
  }

  return scalarIndex;
}

function alignToDevicePixel(value: number) {
  if (typeof window === 'undefined') {
    return Math.max(1, Math.round(value));
  }

  const dpr = window.devicePixelRatio || 1;
  const cssPixelStep = 1 / dpr;
  const aligned = Math.round(value / cssPixelStep) * cssPixelStep;

  return Math.max(cssPixelStep, Number(aligned.toFixed(4)));
}

function alignScrollOffset(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (typeof window === 'undefined') {
    return Math.round(value);
  }

  const dpr = window.devicePixelRatio || 1;
  const cssPixelStep = 1 / dpr;
  return Number((Math.round(value / cssPixelStep) * cssPixelStep).toFixed(4));
}

function isPointerOnScrollbar(element: HTMLElement, clientX: number, clientY: number) {
  const verticalScrollbarWidth = element.offsetWidth - element.clientWidth;
  const horizontalScrollbarHeight = element.offsetHeight - element.clientHeight;

  if (verticalScrollbarWidth <= 0 && horizontalScrollbarHeight <= 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const onVerticalScrollbar = verticalScrollbarWidth > 0 && clientX >= rect.right - verticalScrollbarWidth;
  const onHorizontalScrollbar =
    horizontalScrollbarHeight > 0 && clientY >= rect.bottom - horizontalScrollbarHeight;

  return onVerticalScrollbar || onHorizontalScrollbar;
}

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
}

export function Editor({ tab }: { tab: FileTab }) {
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const [tokens, setTokens] = useState<SyntaxToken[]>([]);
  const [startLine, setStartLine] = useState(0);
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [plainStartLine, setPlainStartLine] = useState(0);
  const [editableSegment, setEditableSegment] = useState<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });
  const [activeLineNumber, setActiveLineNumber] = useState(1);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlightState | null>(null);
  const [pairHighlights, setPairHighlights] = useState<PairHighlightPosition[]>([]);
  const [rectangularSelection, setRectangularSelection] = useState<RectangularSelectionState | null>(null);
  const [contentTreeFlashLine, setContentTreeFlashLine] = useState<number | null>(null);
  const [showLargeModeEditPrompt, setShowLargeModeEditPrompt] = useState(false);
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState | null>(null);
  const [submenuVerticalAlignments, setSubmenuVerticalAlignments] = useState<
    Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>
  >(() => ({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS }));
  const [submenuMaxHeights, setSubmenuMaxHeights] = useState<
    Record<EditorSubmenuKey, number | null>
  >(() => ({ ...DEFAULT_SUBMENU_MAX_HEIGHTS }));
  const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const requestTimeout = useRef<any>(null);
  const editTimeout = useRef<any>(null);
  const isScrollbarDragRef = useRef(false);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const editorContextMenuRef = useRef<HTMLDivElement>(null);
  const submenuPanelRefs = useRef<Record<EditorSubmenuKey, HTMLDivElement | null>>({
    edit: null,
    sort: null,
    bookmark: null,
  });

  const currentRequestVersion = useRef(0);
  const isComposingRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initializedRef = useRef(false);
  const suppressExternalReloadRef = useRef(false);
  const largeModePromptOpenRef = useRef(false);
  const pendingSyncRequestedRef = useRef(false);
  const hugeWindowLockedRef = useRef(false);
  const hugeWindowFollowScrollOnUnlockRef = useRef(false);
  const hugeWindowUnlockTimerRef = useRef<any>(null);
  const contentTreeFlashTimerRef = useRef<any>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const verticalSelectionRef = useRef<VerticalSelectionState | null>(null);
  const rectangularSelectionPointerActiveRef = useRef(false);
  const rectangularSelectionRef = useRef<RectangularSelectionState | null>(null);
  const rectangularSelectionLastClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const rectangularSelectionAutoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const rectangularSelectionAutoScrollRafRef = useRef<number | null>(null);
  const editableSegmentRef = useRef<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });

  const syncedTextRef = useRef('');

  const fontSize = settings.fontSize || 14;
  const wordWrap = !!settings.wordWrap;
  const highlightCurrentLine = settings.highlightCurrentLine !== false;
  const renderedFontSizePx = useMemo(() => alignToDevicePixel(fontSize), [fontSize]);
  const lineHeightPx = useMemo(() => alignToDevicePixel(renderedFontSizePx * 1.5), [renderedFontSizePx]);
  const itemSize = lineHeightPx;
  const contentPaddingLeft = '4.5rem';
  const horizontalOverflowMode = wordWrap ? 'hidden' : 'auto';
  const isLargeReadOnlyMode = false;
  const usePlainLineRendering = tab.largeFileMode || tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const isHugeEditableMode = tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const isPairHighlightEnabled = !usePlainLineRendering;
  const deleteLabel = tr('editor.context.delete');
  const selectAllLabel = tr('editor.context.selectAll');
  const editMenuLabel = tr('editor.context.edit');
  const sortMenuLabel = tr('editor.context.sort');
  const bookmarkMenuLabel = tr('bookmark.menu.title');
  const addBookmarkLabel = tr('bookmark.add');
  const removeBookmarkLabel = tr('bookmark.remove');
  const submenuHorizontalPositionClassName =
    editorContextMenu?.submenuDirection === 'left'
      ? 'right-full mr-1 before:-right-2'
      : 'left-full ml-1 before:-left-2';
  const editSubmenuPositionClassName =
    submenuVerticalAlignments.edit === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const sortSubmenuPositionClassName =
    submenuVerticalAlignments.sort === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const bookmarkSubmenuPositionClassName =
    submenuVerticalAlignments.bookmark === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const editSubmenuStyle =
    submenuMaxHeights.edit === null
      ? undefined
      : {
          maxHeight: `${submenuMaxHeights.edit}px`,
          overflowY: 'auto' as const,
        };
  const sortSubmenuStyle =
    submenuMaxHeights.sort === null
      ? undefined
      : {
          maxHeight: `${submenuMaxHeights.sort}px`,
          overflowY: 'auto' as const,
        };
  const bookmarkSubmenuStyle =
    submenuMaxHeights.bookmark === null
      ? undefined
      : {
          maxHeight: `${submenuMaxHeights.bookmark}px`,
          overflowY: 'auto' as const,
        };
  const cleanupMenuItems = useMemo(
    () => [
      {
        action: 'remove_empty_lines' as EditorCleanupAction,
        label: tr('editor.context.cleanup.removeEmptyLines'),
      },
      {
        action: 'remove_duplicate_lines' as EditorCleanupAction,
        label: tr('editor.context.cleanup.removeDuplicateLines'),
      },
      {
        action: 'trim_leading_whitespace' as EditorCleanupAction,
        label: tr('editor.context.cleanup.trimLeadingWhitespace'),
      },
      {
        action: 'trim_trailing_whitespace' as EditorCleanupAction,
        label: tr('editor.context.cleanup.trimTrailingWhitespace'),
      },
      {
        action: 'trim_surrounding_whitespace' as EditorCleanupAction,
        label: tr('editor.context.cleanup.trimSurroundingWhitespace'),
      },
    ],
    [tr]
  );
  const sortMenuItems = useMemo(
    () => [
      {
        action: 'sort_lines_ascending' as EditorCleanupAction,
        label: tr('editor.context.sort.ascending'),
      },
      {
        action: 'sort_lines_ascending_ignore_case' as EditorCleanupAction,
        label: tr('editor.context.sort.ascendingIgnoreCase'),
      },
      {
        action: 'sort_lines_descending' as EditorCleanupAction,
        label: tr('editor.context.sort.descending'),
      },
      {
        action: 'sort_lines_descending_ignore_case' as EditorCleanupAction,
        label: tr('editor.context.sort.descendingIgnoreCase'),
      },
      {
        action: 'sort_lines_pinyin_ascending' as EditorCleanupAction,
        label: tr('editor.context.sort.pinyinAscending'),
      },
      {
        action: 'sort_lines_pinyin_descending' as EditorCleanupAction,
        label: tr('editor.context.sort.pinyinDescending'),
      },
    ],
    [tr]
  );

  const addBookmark = useStore((state) => state.addBookmark);
  const removeBookmark = useStore((state) => state.removeBookmark);
  const toggleBookmark = useStore((state) => state.toggleBookmark);
  const bookmarks = useStore((state) => state.bookmarksByTab[tab.id] ?? EMPTY_BOOKMARKS);
  const largeFetchBuffer = isHugeEditableMode
    ? HUGE_EDITABLE_FETCH_BUFFER_LINES
    : tab.largeFileMode
    ? LARGE_FILE_FETCH_BUFFER_LINES
    : DEFAULT_FETCH_BUFFER_LINES;
  const hugeEditablePaddingTop = `${alignScrollOffset(Math.max(0, editableSegment.startLine) * itemSize)}px`;
  const hugeEditablePaddingBottom = `${alignScrollOffset(
    Math.max(0, tab.lineCount - editableSegment.endLine) * itemSize
  )}px`;

  const getListItemSize = useCallback(
    (index: number) => {
      if (!wordWrap) {
        return itemSize;
      }

      return rowHeightsRef.current.get(index) ?? itemSize;
    },
    [itemSize, wordWrap]
  );

  const measureRenderedLineHeight = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (!wordWrap || !element) {
        return;
      }

      const measuredHeight = Math.max(itemSize, alignToDevicePixel(element.scrollHeight));
      const previousHeight = rowHeightsRef.current.get(index);

      if (previousHeight !== undefined && Math.abs(previousHeight - measuredHeight) < 0.5) {
        return;
      }

      rowHeightsRef.current.set(index, measuredHeight);
      listRef.current?.resetAfterIndex?.(index);
    },
    [itemSize, wordWrap]
  );

  useEffect(() => {
    rowHeightsRef.current.clear();
    listRef.current?.resetAfterIndex?.(0, true);
  }, [lineHeightPx, renderedFontSizePx, settings.fontFamily, tab.id, width, wordWrap]);

  const fetchPlainLines = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(lines)) return;

        setPlainLines(lines.map(normalizeLineText));
        setPlainStartLine(start);
      } catch (e) {
        console.error('Fetch visible lines error:', e);
      }
    },
    [tab.id]
  );

  const fetchEditableSegment = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;

      try {
        const lines = await invoke<string[]>('get_visible_lines_chunk', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(lines)) return;

        const normalizedLines = lines.map(normalizeEditableLineText);
        const text = normalizedLines.join('\n');
        const segment = {
          startLine: start,
          endLine: end,
          text,
        };

        editableSegmentRef.current = segment;
        setEditableSegment(segment);
        if (!isScrollbarDragRef.current) {
          pendingRestoreScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? contentRef.current?.scrollTop ?? 0;
        }

        if (contentRef.current) {
          contentRef.current.textContent = toInputLayerText(text);
        }

        syncedTextRef.current = text;
        pendingSyncRequestedRef.current = false;
      } catch (e) {
        console.error('Fetch editable segment error:', e);
      }
    },
    [tab.id]
  );

  useEffect(() => {
    if (!isHugeEditableMode) {
      pendingRestoreScrollTopRef.current = null;
      return;
    }

    const targetScrollTop = pendingRestoreScrollTopRef.current;
    if (targetScrollTop === null) {
      return;
    }

    pendingRestoreScrollTopRef.current = null;

    const alignedTop = alignScrollOffset(targetScrollTop);
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
        scrollContainerRef.current.scrollTop = alignedTop;
      }

      const listEl = listRef.current?._outerRef;
      if (listEl && Math.abs(listEl.scrollTop - alignedTop) > 0.001) {
        listEl.scrollTop = alignedTop;
      }
    });
  }, [editableSegment.endLine, editableSegment.startLine, isHugeEditableMode]);

  const handleScroll = () => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;

    if (!isLargeReadOnlyMode && scrollElement && listRef.current) {
      const listEl = listRef.current._outerRef;
      if (listEl) {
        const scrollTop = scrollElement.scrollTop;
        const scrollLeft = scrollElement.scrollLeft;

        if (isScrollbarDragRef.current) {
          if (Math.abs(listEl.scrollTop - scrollTop) > 0.001) {
            listEl.scrollTop = scrollTop;
          }

          if (Math.abs(listEl.scrollLeft - scrollLeft) > 0.001) {
            listEl.scrollLeft = scrollLeft;
          }

          return;
        }

        const alignedTop = alignScrollOffset(scrollTop);
        const alignedLeft = alignScrollOffset(scrollLeft);

        if (Math.abs(scrollElement.scrollTop - alignedTop) > 0.001) {
          scrollElement.scrollTop = alignedTop;
        }

        if (Math.abs(scrollElement.scrollLeft - alignedLeft) > 0.001) {
          scrollElement.scrollLeft = alignedLeft;
        }

        if (Math.abs(listEl.scrollTop - alignedTop) > 0.001) {
          listEl.scrollTop = alignedTop;
        }

        if (Math.abs(listEl.scrollLeft - alignedLeft) > 0.001) {
          listEl.scrollLeft = alignedLeft;
        }
      }
    }
  };

  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      verticalSelectionRef.current = null;

      if (
        !isLargeReadOnlyMode &&
        event.altKey &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        contentRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        contentRef.current.focus();
        rectangularSelectionPointerActiveRef.current = true;
        rectangularSelectionLastClientPointRef.current = { x: event.clientX, y: event.clientY };

        const logicalOffset = getLogicalOffsetFromPoint(contentRef.current, event.clientX, event.clientY);
        if (logicalOffset !== null) {
          const text = normalizeSegmentText(getEditableText(contentRef.current));
          const position = codeUnitOffsetToLineColumn(text, logicalOffset);
          const line = Math.max(1, position.line);
          const column = Math.max(1, position.column + 1);
          const next: RectangularSelectionState = {
            anchorLine: line,
            anchorColumn: column,
            focusLine: line,
            focusColumn: column,
          };

          rectangularSelectionRef.current = next;
          setRectangularSelection(next);
        }
        return;
      }

      rectangularSelectionPointerActiveRef.current = false;
      rectangularSelectionLastClientPointRef.current = null;
      rectangularSelectionRef.current = null;
      setRectangularSelection(null);

      if (isLargeReadOnlyMode || !contentRef.current) {
        return;
      }

      const editorElement = contentRef.current;
      if (!isPointerOnScrollbar(editorElement, event.clientX, event.clientY)) {
        return;
      }

      isScrollbarDragRef.current = true;
      editorElement.style.userSelect = 'none';
      editorElement.style.webkitUserSelect = 'none';
    },
    [isLargeReadOnlyMode]
  );

  const handleHugeScrollablePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHugeEditableMode || !scrollContainerRef.current) {
      return;
    }

    if (!isPointerOnScrollbar(scrollContainerRef.current, event.clientX, event.clientY)) {
      return;
    }

    isScrollbarDragRef.current = true;
    if (contentRef.current) {
      contentRef.current.style.userSelect = 'none';
      contentRef.current.style.webkitUserSelect = 'none';
    }
  }, [isHugeEditableMode]);

  const handleLargeModePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLargeReadOnlyMode) {
        return;
      }

      if (document.activeElement !== event.currentTarget) {
        event.currentTarget.focus();
      }
    },
    [isLargeReadOnlyMode]
  );

  const handleReadOnlyListPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isLargeReadOnlyMode) {
      return;
    }

    const listElement = listRef.current?._outerRef as HTMLDivElement | undefined;
    if (!listElement) {
      return;
    }

    if (!isPointerOnScrollbar(listElement, event.clientX, event.clientY)) {
      return;
    }

    isScrollbarDragRef.current = true;
  }, [isLargeReadOnlyMode]);

  const handleLargeModeEditIntent = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isLargeReadOnlyMode || !isLargeModeEditIntent(event)) {
        return;
      }

      if (largeModePromptOpenRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      largeModePromptOpenRef.current = true;
      setShowLargeModeEditPrompt(true);
    },
    [isLargeReadOnlyMode]
  );

  const handleKeepReadOnlyMode = useCallback(() => {
    largeModePromptOpenRef.current = false;
    setShowLargeModeEditPrompt(false);
  }, []);

  const handleEnterEditableMode = useCallback(() => {
    largeModePromptOpenRef.current = false;
    setShowLargeModeEditPrompt(false);
  }, []);

  const lineTokens = useMemo(() => {
    if (usePlainLineRendering) {
      return [];
    }

    const lines: SyntaxToken[][] = [];
    let currentLine: SyntaxToken[] = [];

    for (const token of tokens) {
      if (token.text === undefined || token.text === null) continue;
      const text = token.text.replace(/\r\n/g, '\n');
      const firstNewlineIndex = text.indexOf('\n');

      if (firstNewlineIndex === -1) {
        currentLine.push(token);
      } else {
        const linesInToken = text.split('\n');
        currentLine.push({ ...token, text: linesInToken[0] });
        lines.push([...currentLine]);

        for (let i = 1; i < linesInToken.length - 1; i += 1) {
          lines.push([{ ...token, text: linesInToken[i] }]);
        }

        currentLine = [{ ...token, text: linesInToken[linesInToken.length - 1] }];
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }, [tokens, usePlainLineRendering]);

  const editableSegmentLines = useMemo(() => {
    if (!isHugeEditableMode) {
      return [];
    }

    if (editableSegment.endLine <= editableSegment.startLine) {
      return [];
    }

    return editableSegment.text.split('\n');
  }, [editableSegment.endLine, editableSegment.startLine, editableSegment.text, isHugeEditableMode]);

  const fetchTokens = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;
      try {
        const result = await invoke<SyntaxToken[]>('get_syntax_tokens', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(result)) return;

        setTokens(result);
        setStartLine(start);
      } catch (e) {
        console.error('Fetch error:', e);
      }
    },
    [tab.id]
  );

  const syncVisibleTokens = useCallback(
    async (lineCount: number, visibleRange?: { start: number; stop: number }) => {
      if (isHugeEditableMode && hugeWindowLockedRef.current) {
        hugeWindowFollowScrollOnUnlockRef.current = true;
        return;
      }

      const buffer = largeFetchBuffer;
      let start = 0;
      let end = 1;

      if (visibleRange) {
        start = Math.max(0, visibleRange.start - buffer);
        end = Math.max(start + 1, Math.min(lineCount, visibleRange.stop + buffer));
      } else {
        const scrollTop = isHugeEditableMode
          ? scrollContainerRef.current?.scrollTop ?? 0
          : usePlainLineRendering
          ? listRef.current?._outerRef?.scrollTop ?? 0
          : contentRef.current?.scrollTop ?? 0;
        const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
        const currentLine = Math.max(0, Math.floor(scrollTop / itemSize));
        start = Math.max(0, currentLine - buffer);
        end = Math.max(start + 1, Math.min(lineCount, currentLine + viewportLines + buffer));
      }

      if (isHugeEditableMode) {
        await fetchEditableSegment(start, end);
        return;
      }

      if (usePlainLineRendering) {
        await fetchPlainLines(start, end);
        return;
      }

      await fetchTokens(start, end);
    },
    [
      fetchEditableSegment,
      fetchTokens,
      fetchPlainLines,
      height,
      isHugeEditableMode,
      itemSize,
      largeFetchBuffer,
      hugeWindowLockedRef,
      hugeWindowFollowScrollOnUnlockRef,
      usePlainLineRendering,
    ]
  );

  const endScrollbarDragSelectionGuard = useCallback(() => {
    if (!isScrollbarDragRef.current) {
      return;
    }

    isScrollbarDragRef.current = false;

    if (contentRef.current) {
      contentRef.current.style.userSelect = 'text';
      contentRef.current.style.webkitUserSelect = 'text';
    }

    if (isLargeReadOnlyMode) {
      void syncVisibleTokens(Math.max(1, tab.lineCount));
    }
  }, [isLargeReadOnlyMode, syncVisibleTokens, tab.lineCount]);

  const releaseHugeEditableWindowLock = useCallback(() => {
    hugeWindowLockedRef.current = false;

    if (!isHugeEditableMode) {
      hugeWindowFollowScrollOnUnlockRef.current = false;
      return;
    }

    if (!hugeWindowFollowScrollOnUnlockRef.current) {
      return;
    }

    hugeWindowFollowScrollOnUnlockRef.current = false;
    void syncVisibleTokens(Math.max(1, tab.lineCount));
  }, [isHugeEditableMode, syncVisibleTokens, tab.lineCount]);

  const scheduleHugeEditableWindowUnlock = useCallback(() => {
    if (!isHugeEditableMode) {
      return;
    }

    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
    }

    hugeWindowUnlockTimerRef.current = setTimeout(() => {
      hugeWindowUnlockTimerRef.current = null;
      releaseHugeEditableWindowLock();
    }, HUGE_EDITABLE_WINDOW_UNLOCK_MS);
  }, [isHugeEditableMode, releaseHugeEditableWindowLock]);

  const loadTextFromBackend = useCallback(async () => {
    if (isHugeEditableMode) {
      const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
      const start = 0;
      const end = Math.max(start + 1, viewportLines + largeFetchBuffer);
      await fetchEditableSegment(start, end);
      return;
    }

    const raw = await invoke<string>('get_visible_lines', {
      id: tab.id,
      startLine: 0,
      endLine: MAX_LINE_RANGE,
    });

    const normalized = normalizeEditorText(raw || '');
    if (contentRef.current) {
      contentRef.current.textContent = toInputLayerText(normalized);
    }

    syncedTextRef.current = normalized;
    pendingSyncRequestedRef.current = false;
  }, [fetchEditableSegment, height, isHugeEditableMode, itemSize, largeFetchBuffer, tab.id]);

  const updateActiveLineFromSelection = useCallback(() => {
    if (!highlightCurrentLine || !contentRef.current) {
      return;
    }

    const localLine = getCaretLineInElement(contentRef.current);
    if (localLine === null) {
      return;
    }

    const absoluteLine = isHugeEditableMode
      ? editableSegmentRef.current.startLine + localLine
      : localLine;
    const safeLine = Math.max(1, Math.min(Math.max(1, tab.lineCount), Math.floor(absoluteLine)));

    setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
  }, [highlightCurrentLine, isHugeEditableMode, tab.lineCount]);

  const updatePairHighlightsFromSelection = useCallback(() => {
    if (!isPairHighlightEnabled || !contentRef.current) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const text = normalizeSegmentText(getEditableText(contentRef.current));
    const selectionOffsets = getSelectionOffsetsInElement(contentRef.current);

    if (!selectionOffsets || !selectionOffsets.isCollapsed) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const matched = findMatchingPairNearOffset(text, selectionOffsets.end);
    if (!matched) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const sortedIndexes = matched[0] <= matched[1] ? matched : [matched[1], matched[0]];
    const nextHighlights = sortedIndexes.map((offset) => {
      const local = codeUnitOffsetToLineColumn(text, offset);
      const absoluteLine = isHugeEditableMode
        ? editableSegmentRef.current.startLine + local.line
        : local.line;

      return {
        line: Math.max(1, absoluteLine),
        column: local.column + 1,
      };
    });

    setPairHighlights((prev) => (arePairHighlightPositionsEqual(prev, nextHighlights) ? prev : nextHighlights));
  }, [isHugeEditableMode, isPairHighlightEnabled]);

  const syncSelectionState = useCallback(() => {
    updateActiveLineFromSelection();
    updatePairHighlightsFromSelection();
  }, [updateActiveLineFromSelection, updatePairHighlightsFromSelection]);

  const clearVerticalSelectionState = useCallback(() => {
    verticalSelectionRef.current = null;
  }, []);

  const clearRectangularSelection = useCallback(() => {
    rectangularSelectionPointerActiveRef.current = false;
    rectangularSelectionRef.current = null;
    rectangularSelectionLastClientPointRef.current = null;
    rectangularSelectionAutoScrollDirectionRef.current = 0;
    if (rectangularSelectionAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
      rectangularSelectionAutoScrollRafRef.current = null;
    }
    setRectangularSelection(null);
  }, []);

  const normalizedRectangularSelection = useMemo(
    () => normalizeRectangularSelection(rectangularSelection),
    [rectangularSelection]
  );

  const getRectangularSelectionText = useCallback(
    (text: string) => {
      if (!normalizedRectangularSelection) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const lines: string[] = [];

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          lines.push('');
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        lines.push(text.slice(segmentStart, segmentEnd));
      }

      return lines.join('\n');
    },
    [normalizedRectangularSelection]
  );

  const replaceRectangularSelection = useCallback(
    (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const rawRows = normalizeLineText(insertText ?? '').split('\n');
      const rowCount = normalizedRectangularSelection.lineCount;
      const rows = Array.from({ length: rowCount }, (_, index) => {
        if (rawRows.length === 0) {
          return '';
        }
        return rawRows[Math.min(index, rawRows.length - 1)] ?? '';
      });

      const pieces: string[] = [];
      let cursor = 0;
      let caretLogicalOffset = 0;

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        pieces.push(text.slice(cursor, segmentStart));
        const replacementRow = rows[line - normalizedRectangularSelection.startLine] ?? '';
        pieces.push(replacementRow);
        cursor = segmentEnd;

        if (line === normalizedRectangularSelection.endLine) {
          caretLogicalOffset =
            pieces.join('').length + (options?.collapseToStart ? 0 : replacementRow.length);
        }
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');

      element.textContent = toInputLayerText(nextText);
      const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, layerCaretOffset);
      clearRectangularSelection();
      dispatchEditorInputEvent(element);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [clearRectangularSelection, normalizedRectangularSelection, syncSelectionState]
  );

  const updateRectangularSelectionFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
      if (logicalOffset === null) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const position = codeUnitOffsetToLineColumn(text, logicalOffset);
      const line = Math.max(1, position.line);
      const column = Math.max(1, position.column + 1);
      const current = rectangularSelectionRef.current;

      if (!current) {
        const next: RectangularSelectionState = {
          anchorLine: line,
          anchorColumn: column,
          focusLine: line,
          focusColumn: column,
        };

        rectangularSelectionRef.current = next;
        setRectangularSelection(next);
        return true;
      }

      const next: RectangularSelectionState = {
        ...current,
        focusLine: line,
        focusColumn: column,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    []
  );

  const getRectangularSelectionScrollElement = useCallback(() => {
    if (isHugeEditableMode) {
      return scrollContainerRef.current;
    }

    if (!isLargeReadOnlyMode) {
      return contentRef.current;
    }

    return (listRef.current?._outerRef as HTMLDivElement | null) ?? null;
  }, [isHugeEditableMode, isLargeReadOnlyMode]);

  const beginRectangularSelectionAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
    if (logicalOffset === null) {
      return false;
    }

    const text = normalizeSegmentText(getEditableText(element));
    const position = codeUnitOffsetToLineColumn(text, logicalOffset);
    const line = Math.max(1, position.line);
    const column = Math.max(1, position.column + 1);
    const next: RectangularSelectionState = {
      anchorLine: line,
      anchorColumn: column,
      focusLine: line,
      focusColumn: column,
    };

    rectangularSelectionRef.current = next;
    setRectangularSelection(next);
    return true;
  }, []);

  const beginRectangularSelectionFromCaret = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
    const resolvedFocusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(element)?.end ?? 0;
    const text = normalizeSegmentText(getEditableText(element));
    const position = codeUnitOffsetToLineColumn(text, resolvedFocusOffset);
    const line = Math.max(1, position.line);
    const column = Math.max(1, position.column + 1);
    const next: RectangularSelectionState = {
      anchorLine: line,
      anchorColumn: column,
      focusLine: line,
      focusColumn: column,
    };

    rectangularSelectionRef.current = next;
    setRectangularSelection(next);
    return true;
  }, []);

  const nudgeRectangularSelectionByKey = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const current = rectangularSelectionRef.current;
      if (!current) {
        return false;
      }

      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const logicalLineCount = Math.max(1, text.length === 0 ? 1 : text.split('\n').length);

      const nextFocusLine = direction === 'up'
        ? Math.max(1, current.focusLine - 1)
        : direction === 'down'
        ? Math.min(logicalLineCount, current.focusLine + 1)
        : current.focusLine;

      const nextFocusColumn = direction === 'left'
        ? Math.max(1, current.focusColumn - 1)
        : direction === 'right'
        ? current.focusColumn + 1
        : current.focusColumn;

      const next: RectangularSelectionState = {
        ...current,
        focusLine: nextFocusLine,
        focusColumn: nextFocusColumn,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    []
  );

  const expandVerticalSelection = useCallback(
    (direction: 'up' | 'down') => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const logicalLineCount = Math.max(1, text.length === 0 ? 1 : text.split('\n').length);

      const current = verticalSelectionRef.current;
      if (!current) {
        const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
        const resolvedFocusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(element)?.end ?? 0;
        const position = codeUnitOffsetToLineColumn(text, resolvedFocusOffset);
        const initialLine = Math.max(1, Math.min(logicalLineCount, position.line));
        const initialColumn = Math.max(1, position.column + 1);

        verticalSelectionRef.current = {
          baseLine: initialLine,
          baseColumn: initialColumn,
          focusLine: initialLine,
        };
      }

      const state = verticalSelectionRef.current;
      if (!state) {
        return false;
      }

      const nextFocusLine = direction === 'up'
        ? Math.max(1, state.focusLine - 1)
        : Math.min(logicalLineCount, state.focusLine + 1);

      if (nextFocusLine === state.focusLine) {
        return true;
      }

      state.focusLine = nextFocusLine;

      const startLine = Math.min(state.baseLine, state.focusLine);
      const endLine = Math.max(state.baseLine, state.focusLine);
      const startOffset = getCodeUnitOffsetFromLineColumn(text, startLine, state.baseColumn);
      const endOffset = getCodeUnitOffsetFromLineColumn(text, endLine, state.baseColumn);
      const layerStartOffset = mapLogicalOffsetToInputLayerOffset(text, startOffset);
      const layerEndOffset = mapLogicalOffsetToInputLayerOffset(text, endOffset);

      setSelectionToCodeUnitOffsets(element, layerStartOffset, layerEndOffset);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [syncSelectionState]
  );

  const syncSelectionAfterInteraction = useCallback(() => {
    window.requestAnimationFrame(() => {
      syncSelectionState();
    });
  }, [syncSelectionState]);

  const hasSelectionInsideEditor = useCallback(() => {
    if (!contentRef.current) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    const range = selection.getRangeAt(0);
    return contentRef.current.contains(range.commonAncestorContainer) && selection.toString().length > 0;
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

  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!contentRef.current) {
        return;
      }

      contentRef.current.focus();

      const menuWidth = 160;
      const menuHeight = 320;
      const submenuWidth = 192;
      const submenuGap = 4;
      const viewportPadding = 8;

      const boundedX = Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding);
      const boundedY = Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding);
      const safeX = Math.max(viewportPadding, boundedX);
      const canOpenSubmenuRight =
        safeX + menuWidth + submenuGap + submenuWidth + viewportPadding <= window.innerWidth;

      setSubmenuVerticalAlignments({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS });
      setSubmenuMaxHeights({ ...DEFAULT_SUBMENU_MAX_HEIGHTS });

      setEditorContextMenu({
        x: safeX,
        y: Math.max(viewportPadding, boundedY),
        hasSelection: hasSelectionInsideEditor(),
        lineNumber: activeLineNumber,
        submenuDirection: canOpenSubmenuRight ? 'right' : 'left',
      });
    },
    [activeLineNumber, hasSelectionInsideEditor]
  );

  const runEditorContextCommand = useCallback((action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
    if (!contentRef.current) {
      return false;
    }

    contentRef.current.focus();

    if (normalizedRectangularSelection) {
      if (action === 'copy') {
        const text = normalizeSegmentText(getEditableText(contentRef.current));
        const content = getRectangularSelectionText(text);
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(content).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }
        return true;
      }

      if (action === 'cut') {
        const text = normalizeSegmentText(getEditableText(contentRef.current));
        const content = getRectangularSelectionText(text);
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(content).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }
        return replaceRectangularSelection('');
      }

      if (action === 'delete') {
        return replaceRectangularSelection('');
      }

      if (action === 'paste') {
        return false;
      }

      if (action === 'selectAll') {
        clearRectangularSelection();
      }
    }

    if (action === 'selectAll') {
      const selection = window.getSelection();
      if (!selection) {
        return false;
      }

      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    if (action === 'paste') {
      return false;
    }

    const commandSucceeded = document.execCommand(action);
    if (action === 'delete' && !commandSucceeded) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        selection.deleteFromDocument();
        return true;
      }
    }

    return commandSucceeded;
  }, [clearRectangularSelection, getRectangularSelectionText, normalizedRectangularSelection, replaceRectangularSelection]);

  const tryPasteTextIntoEditor = useCallback(
    (text: string) => {
      if (!contentRef.current) {
        return false;
      }

      const inserted = replaceSelectionWithText(contentRef.current, text);
      if (!inserted) {
        return false;
      }

      dispatchEditorInputEvent(contentRef.current);
      syncSelectionAfterInteraction();
      return true;
    },
    [syncSelectionAfterInteraction]
  );

  const isEditorContextMenuActionDisabled = useCallback(
    (action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
      const hasSelection = !!editorContextMenu?.hasSelection;

      switch (action) {
        case 'copy':
          return !hasSelection;
        case 'cut':
        case 'delete':
          return isLargeReadOnlyMode || !hasSelection;
        case 'paste':
          return isLargeReadOnlyMode;
        case 'selectAll':
          return false;
        default:
          return false;
      }
    },
    [editorContextMenu?.hasSelection, isLargeReadOnlyMode]
  );

  const handleEditorContextMenuAction = useCallback(
    async (action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
      if (isEditorContextMenuActionDisabled(action)) {
        setEditorContextMenu(null);
        return;
      }

      if (action === 'paste') {
        let pasted = false;

        if (navigator.clipboard?.readText) {
          try {
            const clipboardText = await navigator.clipboard.readText();
            pasted = tryPasteTextIntoEditor(clipboardText);
          } catch (error) {
            console.warn('Failed to read clipboard text:', error);
          }
        }

        if (!pasted) {
          const commandSucceeded = document.execCommand('paste');
          if (!commandSucceeded) {
            console.warn('Paste command blocked. Use Ctrl+V in editor.');
          }
        }

        setEditorContextMenu(null);
        return;
      }

      const succeeded = runEditorContextCommand(action);

      setEditorContextMenu(null);
      if (succeeded) {
        syncSelectionAfterInteraction();
      }
    },
    [isEditorContextMenuActionDisabled, runEditorContextCommand, syncSelectionAfterInteraction, tryPasteTextIntoEditor]
  );

  const hasContextBookmark =
    editorContextMenu !== null && bookmarks.includes(editorContextMenu.lineNumber);

  const handleAddBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    addBookmark(tab.id, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [addBookmark, editorContextMenu, tab.id]);

  const handleRemoveBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    removeBookmark(tab.id, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [editorContextMenu, removeBookmark, tab.id]);

  const handleLineNumberDoubleClick = useCallback(
    (line: number) => {
      toggleBookmark(tab.id, line);
    },
    [tab.id, toggleBookmark]
  );

  const flushPendingSync = useCallback(async () => {
    if (syncInFlightRef.current || isComposingRef.current || !contentRef.current) {
      return;
    }

    const baseText = syncedTextRef.current;
    const targetText = normalizeSegmentText(getEditableText(contentRef.current));
    pendingSyncRequestedRef.current = false;

    if (isHugeEditableMode) {
      const segment = editableSegmentRef.current;
      if (segment.endLine <= segment.startLine) {
        return;
      }

      hugeWindowLockedRef.current = true;

      if (baseText === targetText) {
        syncedTextRef.current = targetText;
        scheduleHugeEditableWindowUnlock();
        return;
      }

      syncInFlightRef.current = true;

      try {
        const newLineCount = await invoke<number>('replace_line_range', {
          id: tab.id,
          startLine: segment.startLine,
          endLine: segment.endLine,
          newText: targetText,
        });

        const newLineCountSafe = Math.max(1, newLineCount);
        const currentScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
        const currentLine = Math.max(0, Math.floor(currentScrollTop / itemSize));
        const buffer = largeFetchBuffer;
        const nextStart = Math.max(0, currentLine - buffer);
        const nextEnd = Math.max(nextStart + 1, Math.min(newLineCountSafe, currentLine + viewportLines + buffer));

        const nextSegment: EditorSegmentState = {
          startLine: nextStart,
          endLine: nextEnd,
          text: targetText,
        };

        editableSegmentRef.current = nextSegment;
        setEditableSegment(nextSegment);
        syncedTextRef.current = targetText;
        suppressExternalReloadRef.current = true;
        updateTab(tab.id, { lineCount: newLineCountSafe, isDirty: true });
        dispatchDocumentUpdated(tab.id);

        if (contentRef.current) {
          const alignedTop = alignScrollOffset(currentScrollTop);
          if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
            scrollContainerRef.current.scrollTop = alignedTop;
          }
        }
      } catch (e) {
        console.error('Large segment sync error:', e);
      } finally {
        syncInFlightRef.current = false;
        scheduleHugeEditableWindowUnlock();

        if (pendingSyncRequestedRef.current && !isComposingRef.current) {
          void flushPendingSync();
        }
      }

      return;
    }

    const diff = buildCodeUnitDiff(baseText, targetText);

    if (!diff) {
      syncedTextRef.current = targetText;
      return;
    }

    syncInFlightRef.current = true;

    try {
      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.start);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.end);

      const newLineCount = await invoke<number>('edit_text', {
        id: tab.id,
        startChar,
        endChar,
        newText: diff.newText,
      });

      syncedTextRef.current = targetText;
      suppressExternalReloadRef.current = true;
      updateTab(tab.id, { lineCount: newLineCount, isDirty: true });
      dispatchDocumentUpdated(tab.id);
      await syncVisibleTokens(newLineCount);
    } catch (e) {
      console.error('Edit sync error:', e);
    } finally {
      syncInFlightRef.current = false;

      if (pendingSyncRequestedRef.current && !isComposingRef.current) {
        void flushPendingSync();
      }
    }
  }, [
    height,
    isHugeEditableMode,
    itemSize,
    largeFetchBuffer,
    scheduleHugeEditableWindowUnlock,
    syncVisibleTokens,
    tab.id,
    updateTab,
  ]);

  const handleCleanupDocumentFromContext = useCallback(
    async (action: EditorCleanupAction) => {
      if (isLargeReadOnlyMode) {
        setEditorContextMenu(null);
        return;
      }

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
        dispatchDocumentUpdated(tab.id);

        await loadTextFromBackend();
        await syncVisibleTokens(safeLineCount);
        syncSelectionAfterInteraction();
      } catch (error) {
        console.error('Failed to cleanup document:', error);
      }
    },
    [
      flushPendingSync,
      isLargeReadOnlyMode,
      loadTextFromBackend,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tab.id,
      updateTab,
    ]
  );

  const queueTextSync = useCallback(
    () => {
      pendingSyncRequestedRef.current = true;

      if (isHugeEditableMode) {
        hugeWindowLockedRef.current = true;
      }

      if (editTimeout.current) {
        clearTimeout(editTimeout.current);
      }

      const debounceMs =
        tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD
          ? LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS
          : NORMAL_EDIT_SYNC_DEBOUNCE_MS;

      editTimeout.current = setTimeout(() => {
        void flushPendingSync();
      }, debounceMs);
    },
    [flushPendingSync, isHugeEditableMode, tab.lineCount]
  );

  const handleInput = useCallback(
    () => {
      clearVerticalSelectionState();

      if (!tab.isDirty) {
        updateTab(tab.id, { isDirty: true });
      }

      syncSelectionAfterInteraction();

      if (!isComposingRef.current) {
        queueTextSync();
      }
    },
    [clearVerticalSelectionState, tab.id, tab.isDirty, updateTab, queueTextSync, syncSelectionAfterInteraction]
  );

  const handleRectangularSelectionInputByKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!normalizedRectangularSelection || event.isComposing) {
        return false;
      }

      const key = event.key;
      const lower = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === 'c' || lower === 'x' || lower === 'v') {
          return false;
        }

        if (lower === 'a') {
          event.preventDefault();
          event.stopPropagation();
          clearRectangularSelection();
          return true;
        }

        return false;
      }

      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearRectangularSelection();
        return true;
      }

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        replaceRectangularSelection('');
        return true;
      }

      if (key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        replaceRectangularSelection('\t');
        return true;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        replaceRectangularSelection(key);
        return true;
      }

      return false;
    },
    [clearRectangularSelection, normalizedRectangularSelection, replaceRectangularSelection]
  );

  const insertTextAtSelection = useCallback((text: string) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets) {
      return false;
    }

    const currentText = getEditableText(element);
    const nextText = `${currentText.slice(0, selectionOffsets.start)}${text}${currentText.slice(selectionOffsets.end)}`;
    element.textContent = toInputLayerText(nextText);
    const logicalNextOffset = selectionOffsets.start + text.length;
    const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
    setCaretToCodeUnitOffset(element, layerNextOffset);
    return true;
  }, []);

  const handleBeforeInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      if (!nativeEvent || nativeEvent.isComposing) {
        return;
      }

      if (normalizedRectangularSelection && nativeEvent.inputType === 'insertText') {
        event.preventDefault();
        event.stopPropagation();
        replaceRectangularSelection(nativeEvent.data ?? '');
        return;
      }

      if (nativeEvent.inputType !== 'insertParagraph' && nativeEvent.inputType !== 'insertLineBreak') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (insertTextAtSelection('\n')) {
        handleInput();
      }
    },
    [handleInput, insertTextAtSelection, normalizedRectangularSelection, replaceRectangularSelection]
  );

  const toggleSelectedLinesComment = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const element = contentRef.current;
      if (!element) {
        return;
      }

      let selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets) {
        const text = getEditableText(element);
        const layerEndOffset = mapLogicalOffsetToInputLayerOffset(text, text.length);
        setCaretToCodeUnitOffset(element, layerEndOffset);
        selectionOffsets = getSelectionOffsetsInElement(element);
      }

      if (!selectionOffsets) {
        return;
      }

      const currentText = getEditableText(element);
      const syntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
      const prefix = getLineCommentPrefixForSyntaxKey(syntaxKey);
      const lineRange = resolveSelectionLineRange(
        currentText,
        selectionOffsets.start,
        selectionOffsets.end,
        selectionOffsets.isCollapsed
      );

      const selectedBlock = currentText.slice(lineRange.start, lineRange.end);
      const selectedLines = selectedBlock.split('\n');
      const hasNonEmptyLine = selectedLines.some((line) => line.trim().length > 0);
      if (!hasNonEmptyLine) {
        return;
      }

      const shouldUncomment = selectedLines
        .filter((line) => line.trim().length > 0)
        .every((line) => isLineCommentedByPrefix(line, prefix));

      const transformedLines = selectedLines.map((line) => {
        if (!line.trim()) {
          return line;
        }

        if (shouldUncomment) {
          return removeLineCommentPrefix(line, prefix);
        }

        return addLineCommentPrefix(line, prefix);
      });

      const transformedBlock = transformedLines.join('\n');
      if (transformedBlock === selectedBlock) {
        return;
      }

      const nextText = `${currentText.slice(0, lineRange.start)}${transformedBlock}${currentText.slice(lineRange.end)}`;
      element.textContent = toInputLayerText(nextText);

      const nextSelectionStartLogical =
        lineRange.start +
        mapOffsetAcrossLineTransformation(
          selectedLines,
          transformedLines,
          selectionOffsets.start - lineRange.start
        );
      const nextSelectionEndLogical =
        lineRange.start +
        mapOffsetAcrossLineTransformation(
          selectedLines,
          transformedLines,
          selectionOffsets.end - lineRange.start
        );

      const nextSelectionStartLayer = mapLogicalOffsetToInputLayerOffset(nextText, nextSelectionStartLogical);
      const nextSelectionEndLayer = mapLogicalOffsetToInputLayerOffset(nextText, nextSelectionEndLogical);

      if (selectionOffsets.isCollapsed) {
        setCaretToCodeUnitOffset(element, nextSelectionEndLayer);
      } else {
        setSelectionToCodeUnitOffsets(element, nextSelectionStartLayer, nextSelectionEndLayer);
      }

      event.preventDefault();
      event.stopPropagation();
      dispatchEditorInputEvent(element);
    },
    [tab]
  );

  const handleEditableKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (handleRectangularSelectionInputByKey(event)) {
        return;
      }

      if (isVerticalSelectionShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        const direction =
          event.key === 'ArrowUp'
            ? 'up'
            : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
            ? 'left'
            : 'right';

        if (!rectangularSelectionRef.current) {
          beginRectangularSelectionFromCaret();
        }

        void nudgeRectangularSelectionByKey(direction as 'up' | 'down' | 'left' | 'right');
        return;
      }

      if (isToggleLineCommentShortcut(event)) {
        clearVerticalSelectionState();
        toggleSelectedLinesComment(event);
        return;
      }

      if (event.key !== 'Enter' || event.isComposing) {
        if (
          normalizedRectangularSelection &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        ) {
          clearRectangularSelection();
        }
        if (!event.shiftKey || event.key !== 'Shift') {
          clearVerticalSelectionState();
        }
        return;
      }

      clearVerticalSelectionState();
      clearRectangularSelection();
      event.preventDefault();
      event.stopPropagation();
      if (insertTextAtSelection('\n')) {
        handleInput();
      }
    },
    [
      clearRectangularSelection,
      clearVerticalSelectionState,
      beginRectangularSelectionFromCaret,
      expandVerticalSelection,
      handleInput,
      handleRectangularSelectionInputByKey,
      insertTextAtSelection,
      nudgeRectangularSelectionByKey,
      normalizedRectangularSelection,
      toggleSelectedLinesComment,
    ]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;

    if (isHugeEditableMode) {
      hugeWindowLockedRef.current = true;
    }
  }, [isHugeEditableMode]);

  const handleCompositionEnd = useCallback(
    () => {
      isComposingRef.current = false;
      queueTextSync();
    },
    [queueTextSync]
  );

  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }) => {
      if (isLargeReadOnlyMode && isScrollbarDragRef.current) {
        return;
      }

      if (isHugeEditableMode && (pendingSyncRequestedRef.current || syncInFlightRef.current || isComposingRef.current)) {
        return;
      }

      const buffer = largeFetchBuffer;
      const start = Math.max(0, visibleStartIndex - buffer);
      const end = Math.min(tab.lineCount, visibleStopIndex + buffer);

      const cachedCount = isHugeEditableMode
        ? Math.max(0, editableSegment.endLine - editableSegment.startLine)
        : usePlainLineRendering
        ? plainLines.length
        : lineTokens.length;
      const cachedStart = isHugeEditableMode
        ? editableSegment.startLine
        : usePlainLineRendering
        ? plainStartLine
        : startLine;
      const hasNoCache = isHugeEditableMode
        ? editableSegment.endLine <= editableSegment.startLine
        : usePlainLineRendering
        ? plainLines.length === 0
        : tokens.length === 0;
      const isOutside = hasNoCache || start < cachedStart || end > cachedStart + cachedCount;

      if (isOutside) {
        if (requestTimeout.current) clearTimeout(requestTimeout.current);
        const debounceMs = isHugeEditableMode
          ? HUGE_EDITABLE_FETCH_DEBOUNCE_MS
          : tab.largeFileMode
          ? LARGE_FILE_FETCH_DEBOUNCE_MS
          : NORMAL_FILE_FETCH_DEBOUNCE_MS;
        requestTimeout.current = setTimeout(
          () => syncVisibleTokens(tab.lineCount, {
            start: visibleStartIndex,
            stop: visibleStopIndex,
          }),
          debounceMs
        );
      }
    },
    [
      editableSegment.endLine,
      editableSegment.startLine,
      isLargeReadOnlyMode,
      isHugeEditableMode,
      isComposingRef,
      largeFetchBuffer,
      usePlainLineRendering,
      plainLines.length,
      plainStartLine,
      lineTokens.length,
      pendingSyncRequestedRef,
      tokens.length,
      syncInFlightRef,
      startLine,
      syncVisibleTokens,
      tab.lineCount,
      tab.largeFileMode,
    ]
  );

  const renderTokens = useCallback((tokensArr: SyntaxToken[]) => {
    if (!tokensArr || tokensArr.length === 0) return null;

    return tokensArr.map((token, i) => {
      const key = `t-${i}`;
      if (token.text === undefined || token.text === null) return null;
      const typeClass = getTokenTypeClass(token);

      return (
        <span key={key} className={typeClass}>
          {token.text}
        </span>
      );
    });
  }, []);

  const renderPlainLine = useCallback((text: string) => {
    if (!text) {
      return null;
    }

    return <span>{text}</span>;
  }, []);

  const getLineHighlightRange = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!searchHighlight || searchHighlight.length <= 0 || searchHighlight.line !== lineNumber) {
        return null;
      }

      const start = Math.max(0, searchHighlight.column - 1);
      const end = Math.min(lineTextLength, start + searchHighlight.length);

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [searchHighlight]
  );

  const getPairHighlightColumnsForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!isPairHighlightEnabled || pairHighlights.length === 0) {
        return [];
      }

      return pairHighlights
        .filter((position) => position.line === lineNumber)
        .map((position) => position.column - 1)
        .filter((columnIndex) => columnIndex >= 0 && columnIndex < lineTextLength);
    },
    [isPairHighlightEnabled, pairHighlights]
  );

  const getRectangularHighlightRangeForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!normalizedRectangularSelection) {
        return null;
      }

      if (
        lineNumber < normalizedRectangularSelection.startLine ||
        lineNumber > normalizedRectangularSelection.endLine
      ) {
        return null;
      }

      const start = Math.max(0, Math.min(lineTextLength, normalizedRectangularSelection.startColumn - 1));
      const end = Math.max(start, Math.min(lineTextLength, normalizedRectangularSelection.endColumn - 1));

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [normalizedRectangularSelection]
  );

  const getInlineHighlightClass = useCallback((isSearchMatch: boolean, isPairMatch: boolean) => {
    if (isSearchMatch && isPairMatch) {
      return SEARCH_AND_PAIR_HIGHLIGHT_CLASS;
    }

    if (isSearchMatch) {
      return SEARCH_HIGHLIGHT_CLASS;
    }

    if (isPairMatch) {
      return PAIR_HIGHLIGHT_CLASS;
    }

    return '';
  }, []);

  const buildLineHighlightSegments = useCallback(
    (
      lineTextLength: number,
      searchRange: { start: number; end: number } | null,
      pairColumns: number[],
      rectangularRange: { start: number; end: number } | null
    ) => {
      const boundaries = new Set<number>([0, lineTextLength]);

      if (searchRange) {
        boundaries.add(searchRange.start);
        boundaries.add(searchRange.end);
      }

      pairColumns.forEach((column) => {
        boundaries.add(column);
        boundaries.add(Math.min(lineTextLength, column + 1));
      });

      if (rectangularRange) {
        boundaries.add(rectangularRange.start);
        boundaries.add(rectangularRange.end);
      }

      const sorted = Array.from(boundaries).sort((left, right) => left - right);
      const segments: Array<{ start: number; end: number; className: string }> = [];

      for (let i = 0; i < sorted.length - 1; i += 1) {
        const start = sorted[i];
        const end = sorted[i + 1];

        if (end <= start) {
          continue;
        }

        const isSearchMatch = !!searchRange && start >= searchRange.start && end <= searchRange.end;
        const isPairMatch = pairColumns.some((column) => start >= column && end <= column + 1);
        const isRectangularMatch =
          !!rectangularRange && start >= rectangularRange.start && end <= rectangularRange.end;

        let className = getInlineHighlightClass(isSearchMatch, isPairMatch);
        if (isRectangularMatch) {
          className = className
            ? `${className} ${RECTANGULAR_SELECTION_HIGHLIGHT_CLASS}`
            : RECTANGULAR_SELECTION_HIGHLIGHT_CLASS;
        }

        segments.push({
          start,
          end,
          className,
        });
      }

      return segments;
    },
    [getInlineHighlightClass]
  );

  const renderHighlightedPlainLine = useCallback(
    (text: string, lineNumber: number) => {
      const safeText = text || '';
      const range = getLineHighlightRange(lineNumber, safeText.length);
      const pairColumns = getPairHighlightColumnsForLine(lineNumber, safeText.length);
      const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, safeText.length);

      if (!range && pairColumns.length === 0 && !rectangularRange) {
        return renderPlainLine(safeText);
      }

      const segments = buildLineHighlightSegments(safeText.length, range, pairColumns, rectangularRange);

      return (
        <span>
          {segments.map((segment, segmentIndex) => {
            const part = safeText.slice(segment.start, segment.end);
            if (!segment.className) {
              return <span key={`plain-segment-${lineNumber}-${segmentIndex}`}>{part}</span>;
            }

            return (
              <mark key={`plain-segment-${lineNumber}-${segmentIndex}`} className={segment.className}>
                {part}
              </mark>
            );
          })}
        </span>
      );
    },
    [
      buildLineHighlightSegments,
      getLineHighlightRange,
      getPairHighlightColumnsForLine,
      getRectangularHighlightRangeForLine,
      renderPlainLine,
    ]
  );

  const getTokenTypeClass = useCallback((token: SyntaxToken) => {
    let typeClass = '';
    if (token.type) {
      const cleanType = token.type.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const text = (token.text || '').trim();
      const cleanText = text.toLowerCase();
      const trimmedType = cleanType.replace(/^_+/, '');
      const normalizedType = trimmedType.replace(/_+/g, '_');
      typeClass = `token-${cleanType}`;

      if (cleanType.includes('string')) typeClass += ' token-string';
      if (
        cleanType.includes('keyword') ||
        normalizedType.includes('keyword') ||
        [
          'fn',
          'let',
          'pub',
          'use',
          'mod',
          'struct',
          'enum',
          'impl',
          'trait',
          'where',
          'type',
          'match',
          'if',
          'else',
          'for',
          'while',
          'loop',
          'return',
          'break',
          'continue',
          'as',
          'move',
          'ref',
          'mut',
          'static',
          'unsafe',
          'extern',
          'crate',
          'self',
          'super',
          'const',
          'var',
          'function',
          'async',
          'await',
          'yield',
          'class',
          'extends',
          'implements',
          'interface',
          'namespace',
          'module',
          'package',
          'import',
          'export',
          'from',
          'default',
          'switch',
          'case',
          'do',
          'try',
          'catch',
          'finally',
          'throw',
          'throws',
          'new',
          'typeof',
          'instanceof',
          'void',
          'delete',
          'this',
          'def',
          'lambda',
          'pass',
          'raise',
          'except',
          'elif',
          'global',
          'nonlocal',
          'del',
          'assert',
          'is',
          'in',
          'not',
          'and',
          'or',
          'typedef',
        ].includes(cleanType) ||
        [
          'fn',
          'let',
          'pub',
          'use',
          'mod',
          'struct',
          'enum',
          'impl',
          'trait',
          'where',
          'type',
          'match',
          'if',
          'else',
          'for',
          'while',
          'loop',
          'return',
          'break',
          'continue',
          'as',
          'move',
          'ref',
          'mut',
          'static',
          'unsafe',
          'extern',
          'crate',
          'self',
          'super',
          'const',
          'var',
          'function',
          'async',
          'await',
          'yield',
          'class',
          'extends',
          'implements',
          'interface',
          'namespace',
          'module',
          'package',
          'import',
          'export',
          'from',
          'default',
          'switch',
          'case',
          'do',
          'try',
          'catch',
          'finally',
          'throw',
          'throws',
          'new',
          'typeof',
          'instanceof',
          'void',
          'delete',
          'this',
          'def',
          'lambda',
          'pass',
          'raise',
          'except',
          'elif',
          'global',
          'nonlocal',
          'del',
          'assert',
          'is',
          'in',
          'not',
          'and',
          'or',
          'typedef',
        ].includes(normalizedType)
      ) {
        typeClass += ' token-keyword';
      }
      if (cleanType.includes('comment')) typeClass += ' token-comment';
      if (
        cleanType.includes('number') ||
        cleanType.includes('integer') ||
        cleanType.includes('float') ||
        cleanType.includes('decimal') ||
        cleanType.includes('hex') ||
        cleanType.includes('octal') ||
        cleanType.includes('binary')
      ) {
        typeClass += ' token-number';
      }

      if (cleanType.includes('literal') || normalizedType.includes('literal')) {
        if (/^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)) {
          typeClass += ' token-number';
        } else if (cleanText.length > 0) {
          typeClass += ' token-constant';
        }
      }

      if (cleanType.includes('scalar') || normalizedType.includes('scalar')) {
        if (cleanType.includes('boolean') || ['true', 'false', 'yes', 'no'].includes(cleanText)) {
          typeClass += ' token-boolean token-constant';
        } else if (
          cleanType.includes('int') ||
          cleanType.includes('float') ||
          /^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)
        ) {
          typeClass += ' token-number';
        } else {
          typeClass += ' token-string';
        }
      }
      if (
        (cleanType.includes('identifier') && !cleanType.includes('property')) ||
        cleanType === 'name' ||
        cleanType.endsWith('_name') ||
        normalizedType === 'name' ||
        normalizedType.endsWith('_name')
      ) {
        typeClass += ' token-identifier';
      }
      if (
        cleanType.includes('type') ||
        cleanType.includes('class') ||
        cleanType.includes('interface') ||
        cleanType.includes('enum') ||
        cleanType.includes('struct') ||
        cleanType.includes('trait') ||
        cleanType.includes('module') ||
        cleanType.includes('namespace') ||
        normalizedType.includes('class') ||
        normalizedType.includes('interface') ||
        normalizedType.includes('enum') ||
        normalizedType.includes('struct') ||
        normalizedType.includes('trait') ||
        normalizedType.includes('module') ||
        normalizedType.includes('namespace') ||
        [
          'usize',
          'u8',
          'u16',
          'u32',
          'u64',
          'u128',
          'i8',
          'i16',
          'i32',
          'i64',
          'i128',
          'f32',
          'f64',
          'bool',
          'char',
          'str',
          'string',
          'option',
          'result',
          'vec',
          'box',
        ].includes(cleanType)
      ) {
        typeClass += ' token-type';
      }

      if (
        (cleanType.includes('key') && !cleanType.includes('keyword')) ||
        cleanType.includes('property') ||
        cleanType.includes('field') ||
        cleanType.includes('member') ||
        normalizedType.includes('key') ||
        normalizedType.includes('property') ||
        normalizedType.includes('field') ||
        normalizedType.includes('member')
      ) {
        typeClass += ' token-property';
      }

      if (cleanType.includes('date') || cleanType.includes('time')) {
        typeClass += ' token-string';
      }

      if (
        cleanType.includes('function') ||
        cleanType.includes('method') ||
        cleanType.includes('call') ||
        cleanType.includes('constructor') ||
        normalizedType.includes('function') ||
        normalizedType.includes('method') ||
        normalizedType.includes('call') ||
        normalizedType.includes('constructor')
      ) {
        typeClass += ' token-function';
      }

      if (cleanType.includes('regex') || normalizedType.includes('regex')) {
        typeClass += ' token-regex';
      }

      if (cleanType.includes('escape') || normalizedType.includes('escape')) {
        typeClass += ' token-escape';
      }

      if (
        cleanType.includes('annotation') ||
        cleanType.includes('decorator') ||
        cleanType.includes('attribute') ||
        normalizedType.includes('annotation') ||
        normalizedType.includes('decorator') ||
        normalizedType.includes('attribute')
      ) {
        typeClass += ' token-attribute_item';
      }

      if (
        cleanType.includes('tag') ||
        normalizedType.includes('tag') ||
        ['stag', 'etag', 'emptyelemtag', 'doctype'].includes(cleanType) ||
        ['stag', 'etag', 'emptyelemtag', 'doctype'].includes(normalizedType)
      ) {
        typeClass += ' token-tag';
      }

      if (
        cleanType.includes('directive') ||
        cleanType.includes('preproc') ||
        normalizedType.includes('directive') ||
        normalizedType.includes('preproc') ||
        [
          'define',
          'ifdef',
          'ifndef',
          'if',
          'elif',
          'else',
          'endif',
          'include',
          'pragma',
          'line',
          'error',
        ].includes(normalizedType) ||
        cleanText.startsWith('#')
      ) {
        typeClass += ' token-preprocessor';
      }

      if (cleanType.includes('error') || normalizedType.includes('error')) {
        typeClass += ' token-error';
      }

      if (
        cleanType.includes('constant') ||
        normalizedType.includes('constant') ||
        cleanType.includes('boolean') ||
        [
          'true',
          'false',
          'null',
          'nullptr',
          'none',
          'nil',
          'undefined',
          'yes',
          'no',
        ].includes(cleanType) ||
        [
          'true',
          'false',
          'null',
          'nullptr',
          'none',
          'nil',
          'undefined',
          'yes',
          'no',
        ].includes(normalizedType) ||
        ['true', 'false', 'null', 'nullptr', 'none', 'nil', 'undefined', 'yes', 'no'].includes(
          cleanText
        )
      ) {
        typeClass += ' token-boolean token-constant';
      }

      if (
        cleanType.includes('charref') ||
        cleanType.includes('entityref') ||
        normalizedType.includes('charref') ||
        normalizedType.includes('entityref')
      ) {
        typeClass += ' token-constant';
      }

      if (
        cleanType.includes('punctuation') ||
        cleanType.includes('delimiter') ||
        cleanType.includes('bracket') ||
        normalizedType.includes('punctuation') ||
        normalizedType.includes('delimiter') ||
        normalizedType.includes('bracket')
      ) {
        typeClass += ' token-punctuation';
      }

      if (cleanType.includes('operator') || normalizedType.includes('operator')) {
        typeClass += ' token-operator';
      }

      if (
        /^(if|ifdef|ifndef|elif|else|endif|define|include|pragma|line|error)$/i.test(normalizedType)
      ) {
        typeClass += ' token-preprocessor';
      }

      if (/^_+$/.test(cleanType) && text.length > 0) {
        if (
          /^(=|==|===|!=|!==|<=|>=|<|>|\||\|\||\+|\+\+|\*|\?|,|\.|:|-|--|\/|%|!|&|&&|\^|~|->|=>)$/.test(
            text
          )
        ) {
          typeClass += ' token-operator';
        } else {
          typeClass += ' token-punctuation';
        }
      }

      if (/^_+[a-z]+$/.test(cleanType) && text.length > 0 && !typeClass.includes('token-preprocessor')) {
        if (/^#/.test(text)) {
          typeClass += ' token-preprocessor';
        }
      }
    }

    return typeClass;
  }, []);

  const renderHighlightedTokens = useCallback(
    (tokensArr: SyntaxToken[], lineNumber: number) => {
      if (!tokensArr || tokensArr.length === 0) return null;

      const lineText = tokensArr.map((token) => token.text ?? '').join('');
      const range = getLineHighlightRange(lineNumber, lineText.length);
      const pairColumns = getPairHighlightColumnsForLine(lineNumber, lineText.length);
      const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, lineText.length);

      if (!range && pairColumns.length === 0 && !rectangularRange) {
        return renderTokens(tokensArr);
      }

      const segments = buildLineHighlightSegments(lineText.length, range, pairColumns, rectangularRange);

      let cursor = 0;
      let segmentIndex = 0;
      const rendered: React.ReactNode[] = [];

      tokensArr.forEach((token, tokenIndex) => {
        if (token.text === undefined || token.text === null) {
          return;
        }

        const tokenText = token.text;
        const tokenLength = tokenText.length;
        const tokenStart = cursor;
        const tokenEnd = tokenStart + tokenLength;
        const typeClass = getTokenTypeClass(token);

        if (tokenLength === 0) {
          rendered.push(
            <span key={`t-empty-${tokenIndex}`} className={typeClass}>
              {tokenText}
            </span>
          );
          return;
        }

        while (segmentIndex < segments.length && segments[segmentIndex].end <= tokenStart) {
          segmentIndex += 1;
        }

        let localCursor = tokenStart;
        let localPartIndex = 0;

        while (localCursor < tokenEnd && segmentIndex < segments.length) {
          const segment = segments[segmentIndex];

          if (segment.start >= tokenEnd) {
            break;
          }

          const partStart = Math.max(localCursor, segment.start);
          const partEnd = Math.min(tokenEnd, segment.end);

          if (partEnd <= partStart) {
            segmentIndex += 1;
            continue;
          }

          const tokenSliceStart = partStart - tokenStart;
          const tokenSliceEnd = partEnd - tokenStart;
          const partText = tokenText.slice(tokenSliceStart, tokenSliceEnd);

          if (!segment.className) {
            rendered.push(
              <span key={`t-part-${tokenIndex}-${localPartIndex}`} className={typeClass}>
                {partText}
              </span>
            );
          } else {
            rendered.push(
              <mark key={`t-part-${tokenIndex}-${localPartIndex}`} className={segment.className}>
                <span className={typeClass}>{partText}</span>
              </mark>
            );
          }

          localCursor = partEnd;
          localPartIndex += 1;

          if (segment.end <= localCursor) {
            segmentIndex += 1;
          }
        }

        if (localCursor < tokenEnd) {
          rendered.push(
            <span key={`t-tail-${tokenIndex}`} className={typeClass}>
              {tokenText.slice(localCursor - tokenStart)}
            </span>
          );
        }

        cursor = tokenEnd;
      });

      return rendered;
    },
    [
      buildLineHighlightSegments,
      getLineHighlightRange,
      getPairHighlightColumnsForLine,
      getRectangularHighlightRangeForLine,
      getTokenTypeClass,
      renderTokens,
    ]
  );

  useEffect(() => {
    if (isLargeReadOnlyMode) {
      initializedRef.current = false;
      suppressExternalReloadRef.current = false;
      syncInFlightRef.current = false;
      pendingSyncRequestedRef.current = false;
      hugeWindowLockedRef.current = false;
      hugeWindowFollowScrollOnUnlockRef.current = false;
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
      syncedTextRef.current = '';
      setTokens([]);
      setStartLine(0);
      editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
      setEditableSegment({ startLine: 0, endLine: 0, text: '' });

      void syncVisibleTokens(Math.max(1, tab.lineCount));
      return;
    }

    let cancelled = false;

    initializedRef.current = false;
    suppressExternalReloadRef.current = false;
    syncInFlightRef.current = false;
    pendingSyncRequestedRef.current = false;
    hugeWindowLockedRef.current = false;
    hugeWindowFollowScrollOnUnlockRef.current = false;
    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
      hugeWindowUnlockTimerRef.current = null;
    }
    syncedTextRef.current = '';
    editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
    setEditableSegment({ startLine: 0, endLine: 0, text: '' });

    const bootstrap = async () => {
      try {
        await loadTextFromBackend();
        if (cancelled) return;

        await syncVisibleTokens(Math.max(1, tab.lineCount));
        if (!cancelled) {
          initializedRef.current = true;
        }
      } catch (e) {
        console.error('Failed to load file text:', e);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      if (editTimeout.current) clearTimeout(editTimeout.current);
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    };
  }, [tab.id, loadTextFromBackend, syncVisibleTokens, isLargeReadOnlyMode]);

  useEffect(() => {
    if (isLargeReadOnlyMode) {
      void syncVisibleTokens(Math.max(1, tab.lineCount));
      return;
    }

    if (!initializedRef.current) {
      return;
    }

    if (suppressExternalReloadRef.current) {
      suppressExternalReloadRef.current = false;
      return;
    }

    const syncExternalChange = async () => {
      try {
        await loadTextFromBackend();
        await syncVisibleTokens(Math.max(1, tab.lineCount));
      } catch (e) {
        console.error('Failed to sync external edit:', e);
      }
    };

    syncExternalChange();
  }, [tab.lineCount, loadTextFromBackend, syncVisibleTokens, isLargeReadOnlyMode]);

  useEffect(() => {
    if (!usePlainLineRendering) {
      setPlainLines([]);
      setPlainStartLine(0);
    }

    if (!isHugeEditableMode) {
      editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
      setEditableSegment({ startLine: 0, endLine: 0, text: '' });
      hugeWindowLockedRef.current = false;
      hugeWindowFollowScrollOnUnlockRef.current = false;
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    }

    if (!isLargeReadOnlyMode) {
      largeModePromptOpenRef.current = false;
      setShowLargeModeEditPrompt(false);
    }
  }, [isHugeEditableMode, isLargeReadOnlyMode, tab.id, usePlainLineRendering]);

  useEffect(() => {
    if (!isHugeEditableMode || !scrollContainerRef.current) {
      return;
    }

    const scrollTop = scrollContainerRef.current.scrollTop;
    if (contentRef.current && Math.abs(contentRef.current.scrollTop - scrollTop) > 0.001) {
      contentRef.current.scrollTop = scrollTop;
    }
  }, [editableSegment.endLine, editableSegment.startLine, isHugeEditableMode]);

  useEffect(() => {
    window.addEventListener('pointerup', endScrollbarDragSelectionGuard);
    window.addEventListener('blur', endScrollbarDragSelectionGuard);

    return () => {
      window.removeEventListener('pointerup', endScrollbarDragSelectionGuard);
      window.removeEventListener('blur', endScrollbarDragSelectionGuard);
    };
  }, [endScrollbarDragSelectionGuard]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!rectangularSelectionPointerActiveRef.current) {
        return;
      }

      event.preventDefault();
      rectangularSelectionLastClientPointRef.current = { x: event.clientX, y: event.clientY };

      const scrollElement = getRectangularSelectionScrollElement();
      if (scrollElement) {
        const rect = scrollElement.getBoundingClientRect();
        if (event.clientY <= rect.top + RECTANGULAR_AUTO_SCROLL_EDGE_PX) {
          rectangularSelectionAutoScrollDirectionRef.current = -1;
        } else if (event.clientY >= rect.bottom - RECTANGULAR_AUTO_SCROLL_EDGE_PX) {
          rectangularSelectionAutoScrollDirectionRef.current = 1;
        } else {
          rectangularSelectionAutoScrollDirectionRef.current = 0;
        }
      }

      updateRectangularSelectionFromPoint(event.clientX, event.clientY);

      if (
        rectangularSelectionAutoScrollDirectionRef.current !== 0 &&
        rectangularSelectionAutoScrollRafRef.current === null
      ) {
        const step = () => {
          if (!rectangularSelectionPointerActiveRef.current) {
            rectangularSelectionAutoScrollRafRef.current = null;
            return;
          }

          const direction = rectangularSelectionAutoScrollDirectionRef.current;
          const point = rectangularSelectionLastClientPointRef.current;
          const scrollElement = getRectangularSelectionScrollElement();

          if (direction !== 0 && point && scrollElement) {
            const before = scrollElement.scrollTop;
            const rect = scrollElement.getBoundingClientRect();
            const distance = direction < 0
              ? Math.max(0, (rect.top + RECTANGULAR_AUTO_SCROLL_EDGE_PX) - point.y)
              : Math.max(0, point.y - (rect.bottom - RECTANGULAR_AUTO_SCROLL_EDGE_PX));
            const ratio = Math.min(1, distance / RECTANGULAR_AUTO_SCROLL_EDGE_PX);
            const delta = Math.max(1, Math.round(RECTANGULAR_AUTO_SCROLL_MAX_STEP_PX * ratio)) * direction;

            scrollElement.scrollTop = alignScrollOffset(before + delta);
            handleScroll();

            if (Math.abs(scrollElement.scrollTop - before) > 0.001) {
              updateRectangularSelectionFromPoint(point.x, point.y);
            }
          }

          if (rectangularSelectionPointerActiveRef.current && rectangularSelectionAutoScrollDirectionRef.current !== 0) {
            rectangularSelectionAutoScrollRafRef.current = window.requestAnimationFrame(step);
          } else {
            rectangularSelectionAutoScrollRafRef.current = null;
          }
        };

        rectangularSelectionAutoScrollRafRef.current = window.requestAnimationFrame(step);
      }
    };

    const handlePointerUp = () => {
      rectangularSelectionPointerActiveRef.current = false;
      rectangularSelectionLastClientPointRef.current = null;
      rectangularSelectionAutoScrollDirectionRef.current = 0;
      if (rectangularSelectionAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
        rectangularSelectionAutoScrollRafRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);

      if (rectangularSelectionAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
        rectangularSelectionAutoScrollRafRef.current = null;
      }
    };
  }, [getRectangularSelectionScrollElement, handleScroll, updateRectangularSelectionFromPoint]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const handleCopyLike = (event: ClipboardEvent, cut: boolean) => {
      if (!normalizedRectangularSelection) {
        return;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const rectangularText = getRectangularSelectionText(text);

      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData('text/plain', rectangularText);

      if (cut) {
        replaceRectangularSelection('');
      }
    };

    const handleCopy = (event: ClipboardEvent) => {
      handleCopyLike(event, false);
    };

    const handleCut = (event: ClipboardEvent) => {
      handleCopyLike(event, true);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!normalizedRectangularSelection) {
        return;
      }

      const pasted = event.clipboardData?.getData('text/plain') ?? '';
      event.preventDefault();
      event.stopPropagation();
      replaceRectangularSelection(pasted);
    };

    element.addEventListener('copy', handleCopy);
    element.addEventListener('cut', handleCut);
    element.addEventListener('paste', handlePaste);

    return () => {
      element.removeEventListener('copy', handleCopy);
      element.removeEventListener('cut', handleCut);
      element.removeEventListener('paste', handlePaste);
    };
  }, [getRectangularSelectionText, normalizedRectangularSelection, replaceRectangularSelection]);

  useEffect(() => {
    if (isPairHighlightEnabled) {
      return;
    }

    setPairHighlights((prev) => (prev.length === 0 ? prev : []));
  }, [isPairHighlightEnabled]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (verticalSelectionRef.current && !hasSelectionInsideEditor()) {
        clearVerticalSelectionState();
      }
      syncSelectionState();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [clearVerticalSelectionState, hasSelectionInsideEditor, syncSelectionState]);

  useEffect(() => {
    if (!editorContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (editorContextMenuRef.current && target && !editorContextMenuRef.current.contains(target)) {
        setEditorContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditorContextMenu(null);
      }
    };

    const handleWindowBlur = () => {
      setEditorContextMenu(null);
    };

    const handleScroll = () => {
      setEditorContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('resize', handleWindowBlur);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('resize', handleWindowBlur);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editorContextMenu]);

  useEffect(() => {
    setEditorContextMenu(null);
    clearRectangularSelection();
  }, [tab.id]);

  useEffect(() => {
    if (!highlightCurrentLine) {
      return;
    }

    syncSelectionState();
  }, [highlightCurrentLine, syncSelectionState]);

  useEffect(() => {
    const handleExternalPaste = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string; text?: string }>;
      const detail = customEvent.detail;
      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      const text = typeof detail.text === 'string' ? detail.text : '';
      if (!tryPasteTextIntoEditor(text)) {
        console.warn('Failed to paste text into editor.');
      }
    };

    window.addEventListener('rutar:paste-text', handleExternalPaste as EventListener);
    return () => {
      window.removeEventListener('rutar:paste-text', handleExternalPaste as EventListener);
    };
  }, [tab.id, tryPasteTextIntoEditor]);

  useEffect(() => {
    setActiveLineNumber(1);
    setSearchHighlight(null);
    setPairHighlights([]);

    if (contentTreeFlashTimerRef.current) {
      window.clearTimeout(contentTreeFlashTimerRef.current);
      contentTreeFlashTimerRef.current = null;
    }

    setContentTreeFlashLine(null);
  }, [tab.id]);

  useEffect(() => {
    const handleNavigateToLine = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
        length?: number;
        source?: string;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      const targetLine = Number.isFinite(detail.line) ? Math.max(1, Math.floor(detail.line as number)) : 1;
      const targetColumn = Number.isFinite(detail.column) ? Math.max(1, Math.floor(detail.column as number)) : 1;
      const targetLength = Number.isFinite(detail.length) ? Math.max(0, Math.floor(detail.length as number)) : 0;
      const shouldMoveCaretToLineStart = detail.source === 'content-tree';
      setActiveLineNumber(targetLine);

      const placeCaretAtTargetPosition = () => {
        if (!contentRef.current) {
          return;
        }

        const lineForCaret = isHugeEditableMode
          ? Math.max(1, targetLine - editableSegmentRef.current.startLine)
          : targetLine;
        const columnForCaret = shouldMoveCaretToLineStart ? 1 : targetColumn;

        setCaretToLineColumn(contentRef.current, lineForCaret, columnForCaret);
      };

      if (detail.source === 'content-tree') {
        if (contentTreeFlashTimerRef.current) {
          window.clearTimeout(contentTreeFlashTimerRef.current);
          contentTreeFlashTimerRef.current = null;
        }

        setContentTreeFlashLine(targetLine);
        contentTreeFlashTimerRef.current = window.setTimeout(() => {
          setContentTreeFlashLine(null);
          contentTreeFlashTimerRef.current = null;
        }, 1000);
      }

      setSearchHighlight({
        line: targetLine,
        column: targetColumn,
        length: targetLength,
        id: Date.now(),
      });

      const targetScrollTop = alignScrollOffset((targetLine - 1) * itemSize);
      const listElement = listRef.current?._outerRef as HTMLDivElement | undefined;

      if (isHugeEditableMode) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetScrollTop;
        }

        if (contentRef.current) {
          contentRef.current.scrollTop = targetScrollTop;
          contentRef.current.focus();

          window.requestAnimationFrame(() => {
            placeCaretAtTargetPosition();
            window.setTimeout(() => {
              placeCaretAtTargetPosition();
            }, 60);
          });
        }

        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }

        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (isLargeReadOnlyMode) {
        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }
        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (contentRef.current) {
        contentRef.current.scrollTop = targetScrollTop;
        contentRef.current.focus();

        window.requestAnimationFrame(() => {
          placeCaretAtTargetPosition();
        });
      }

      if (listElement) {
        listElement.scrollTop = targetScrollTop;
      }

      void syncVisibleTokens(Math.max(1, tab.lineCount));
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:navigate-to-content-tree', handleNavigateToLine as EventListener);
    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:navigate-to-content-tree', handleNavigateToLine as EventListener);
    };
  }, [isHugeEditableMode, isLargeReadOnlyMode, itemSize, syncVisibleTokens, tab.id, tab.lineCount]);

  useEffect(() => {
    const handleForcedRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId: string;
        lineCount?: number;
        preserveCaret?: boolean;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      const preserveCaret = detail.preserveCaret === true;
      const caretOffsets = preserveCaret && contentRef.current
        ? getSelectionOffsetsInElement(contentRef.current)
        : null;
      const caretLogicalOffset = caretOffsets
        ? Math.max(0, caretOffsets.isCollapsed ? caretOffsets.end : caretOffsets.start)
        : null;

      if (typeof detail.lineCount === 'number' && Number.isFinite(detail.lineCount)) {
        updateTab(tab.id, { lineCount: Math.max(1, detail.lineCount) });
      }

      void (async () => {
        await loadTextFromBackend();

        if (preserveCaret && caretLogicalOffset !== null && contentRef.current) {
          const editorText = getEditableText(contentRef.current);
          const safeLogicalOffset = Math.min(caretLogicalOffset, editorText.length);
          const layerOffset = mapLogicalOffsetToInputLayerOffset(editorText, safeLogicalOffset);
          setCaretToCodeUnitOffset(contentRef.current, layerOffset);
        }

        await syncVisibleTokens(Math.max(1, detail.lineCount ?? tab.lineCount));
      })();
    };

    window.addEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    return () => {
      window.removeEventListener('rutar:force-refresh', handleForcedRefresh as EventListener);
    };
  }, [loadTextFromBackend, syncVisibleTokens, tab.id, tab.lineCount, updateTab]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full overflow-hidden bg-background relative"
      tabIndex={isLargeReadOnlyMode ? 0 : -1}
      onPointerDown={handleLargeModePointerDown}
      onKeyDown={handleLargeModeEditIntent}
    >
      {!isLargeReadOnlyMode && isHugeEditableMode && (
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 w-full h-full z-0 outline-none overflow-auto editor-scroll-stable"
          style={{
            overflowX: horizontalOverflowMode,
            overflowY: 'auto',
          }}
          onScroll={handleScroll}
          onPointerDown={handleHugeScrollablePointerDown}
        >
          <div
            className="relative"
            style={{
              minHeight: `${Math.max(1, tab.lineCount) * itemSize}px`,
              minWidth: '100%',
            }}
          >
            <div
              ref={contentRef}
              contentEditable="plaintext-only"
              suppressContentEditableWarning
              className="absolute left-0 right-0 editor-input-layer"
              style={{
                top: hugeEditablePaddingTop,
                fontFamily: settings.fontFamily,
                fontSize: `${renderedFontSizePx}px`,
                lineHeight: `${lineHeightPx}px`,
                whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                paddingLeft: contentPaddingLeft,
                paddingBottom: hugeEditablePaddingBottom,
              }}
              onInput={handleInput}
              onBeforeInput={handleBeforeInput}
              onKeyDown={handleEditableKeyDown}
              onPointerDown={handleEditorPointerDown}
              onKeyUp={syncSelectionAfterInteraction}
              onPointerUp={syncSelectionAfterInteraction}
              onFocus={syncSelectionAfterInteraction}
              onContextMenu={handleEditorContextMenu}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {!isLargeReadOnlyMode && !isHugeEditableMode && (
        <div
          ref={contentRef}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          className="absolute inset-0 w-full h-full z-0 outline-none overflow-auto editor-input-layer editor-scroll-stable"
          style={{
            overflowX: horizontalOverflowMode,
            overflowY: 'auto',
            fontFamily: settings.fontFamily,
            fontSize: `${renderedFontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            paddingLeft: contentPaddingLeft,
          }}
          onInput={handleInput}
          onBeforeInput={handleBeforeInput}
          onKeyDown={handleEditableKeyDown}
          onScroll={handleScroll}
          onPointerDown={handleEditorPointerDown}
          onKeyUp={syncSelectionAfterInteraction}
          onPointerUp={syncSelectionAfterInteraction}
          onFocus={syncSelectionAfterInteraction}
          onContextMenu={handleEditorContextMenu}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          spellCheck={false}
        />
      )}

      {width > 0 && height > 0 && (
        <div
          ref={backdropRef}
          className={`absolute inset-0 w-full h-full z-10 overflow-hidden ${
            isLargeReadOnlyMode ? '' : 'pointer-events-none'
          }`}
        >
          <List
            ref={listRef}
            height={height}
            width={width}
            itemCount={tab.lineCount}
            itemSize={getListItemSize}
            estimatedItemSize={itemSize}
            onItemsRendered={onItemsRendered}
            overscanCount={20}
            style={{ overflowX: horizontalOverflowMode, overflowY: 'auto' }}
            onScroll={isLargeReadOnlyMode ? handleScroll : undefined}
            onPointerDown={isLargeReadOnlyMode ? handleReadOnlyListPointerDown : undefined}
          >
            {({ index, style }) => {
              const relativeIndex = isHugeEditableMode
                ? index - editableSegment.startLine
                : usePlainLineRendering
                ? index - plainStartLine
                : index - startLine;
              const plainRelativeIndex = index - plainStartLine;
              const lineTokensArr =
                !usePlainLineRendering && relativeIndex >= 0 && relativeIndex < lineTokens.length
                  ? lineTokens[relativeIndex]
                  : [];
              const plainLine =
                isHugeEditableMode && relativeIndex >= 0 && relativeIndex < editableSegmentLines.length
                  ? editableSegmentLines[relativeIndex]
                  : usePlainLineRendering && plainRelativeIndex >= 0 && plainRelativeIndex < plainLines.length
                  ? plainLines[plainRelativeIndex]
                  : '';

              return (
                <div
                  ref={(element) => measureRenderedLineHeight(index, element)}
                  style={{
                    ...style,
                    width: wordWrap ? '100%' : 'max-content',
                    minWidth: '100%',
                    fontFamily: settings.fontFamily,
                    fontSize: `${renderedFontSizePx}px`,
                    lineHeight: `${lineHeightPx}px`,
                  }}
                  className={`px-4 hover:bg-muted/5 text-foreground group editor-line flex items-start transition-colors duration-1000 ${
                    contentTreeFlashLine === index + 1
                      ? 'bg-primary/15 dark:bg-primary/20'
                      : highlightCurrentLine && activeLineNumber === index + 1
                      ? 'bg-accent/45 dark:bg-accent/25'
                      : ''
                  }`}
                >
                  <span
                    className={`shrink-0 line-number w-12 text-right mr-2 border-r border-border/50 pr-2 transition-colors ${
                      bookmarks.includes(index + 1)
                        ? 'text-amber-500/90 font-semibold group-hover:text-amber-500'
                        : 'text-muted-foreground/40 group-hover:text-muted-foreground'
                    } pointer-events-auto cursor-pointer`}
                    style={{ fontSize: `${alignToDevicePixel(Math.max(10, renderedFontSizePx - 2))}px` }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleLineNumberDoubleClick(index + 1);
                    }}
                  >
                    {index + 1}
                  </span>
                  <div
                    className={wordWrap ? 'min-w-0 flex-1' : 'shrink-0'}
                    style={{
                      whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                    }}
                  >
                    {usePlainLineRendering
                      ? renderHighlightedPlainLine(plainLine, index + 1)
                      : lineTokensArr.length > 0
                      ? renderHighlightedTokens(lineTokensArr, index + 1)
                      : <span className="opacity-10 italic">...</span>}
                  </div>
                </div>
              );
            }}
          </List>
        </div>
      )}

      {editorContextMenu && (
        <div
          ref={editorContextMenuRef}
          className="fixed z-[90] w-40 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: editorContextMenu.x, top: editorContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              handleEditorContextMenuAction('copy');
            }}
            disabled={isEditorContextMenuActionDisabled('copy')}
          >
            {tr('toolbar.copy')}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              handleEditorContextMenuAction('cut');
            }}
            disabled={isEditorContextMenuActionDisabled('cut')}
          >
            {tr('toolbar.cut')}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              handleEditorContextMenuAction('paste');
            }}
            disabled={isEditorContextMenuActionDisabled('paste')}
          >
            {tr('toolbar.paste')}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              handleEditorContextMenuAction('delete');
            }}
            disabled={isEditorContextMenuActionDisabled('delete')}
          >
            {deleteLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              handleEditorContextMenuAction('selectAll');
            }}
            disabled={isEditorContextMenuActionDisabled('selectAll')}
          >
            {selectAllLabel}
          </button>
          <div className="my-1 h-px bg-border" />
          <div
            className="group/edit relative"
            onMouseEnter={(event) => {
              updateSubmenuVerticalAlignment('edit', event.currentTarget);
            }}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <span>{editMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.edit = element;
              }}
              style={editSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${editSubmenuPositionClassName} group-hover/edit:pointer-events-auto group-hover/edit:visible group-hover/edit:opacity-100`}
            >
              {cleanupMenuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleCleanupDocumentFromContext(item.action);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="group/sort relative"
            onMouseEnter={(event) => {
              updateSubmenuVerticalAlignment('sort', event.currentTarget);
            }}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <span>{sortMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.sort = element;
              }}
              style={sortSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${sortSubmenuPositionClassName} group-hover/sort:pointer-events-auto group-hover/sort:visible group-hover/sort:opacity-100`}
            >
              {sortMenuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleCleanupDocumentFromContext(item.action);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <div
            className="group/bookmark relative"
            onMouseEnter={(event) => {
              updateSubmenuVerticalAlignment('bookmark', event.currentTarget);
            }}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <span>{bookmarkMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.bookmark = element;
              }}
              style={bookmarkSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-28 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${bookmarkSubmenuPositionClassName} group-hover/bookmark:pointer-events-auto group-hover/bookmark:visible group-hover/bookmark:opacity-100`}
            >
              <button
                type="button"
                className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleAddBookmarkFromContext}
                disabled={hasContextBookmark}
              >
                {addBookmarkLabel}
              </button>
              <button
                type="button"
                className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleRemoveBookmarkFromContext}
                disabled={!hasContextBookmark}
              >
                {removeBookmarkLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLargeModeEditPrompt && isLargeReadOnlyMode && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35">
          <div className="w-[min(92vw,420px)] rounded-lg border border-border bg-background p-4 shadow-2xl">
            <p className="text-sm font-medium text-foreground">{tr('editor.largeMode.readOnlyTitle')}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {tr('editor.largeMode.readOnlyDesc')}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={handleKeepReadOnlyMode}
              >
                {tr('editor.largeMode.keepReadOnly')}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                onClick={handleEnterEditableMode}
              >
                {tr('editor.largeMode.enterEditable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
