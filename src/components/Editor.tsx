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

type EditorSubmenuKey = 'edit' | 'sort' | 'convert' | 'bookmark';
type EditorSubmenuVerticalAlign = 'top' | 'bottom';

const DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign> = {
  edit: 'top',
  sort: 'top',
  convert: 'top',
  bookmark: 'top',
};

const DEFAULT_SUBMENU_MAX_HEIGHTS: Record<EditorSubmenuKey, number | null> = {
  edit: null,
  sort: null,
  convert: null,
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

interface TextSelectionState {
  start: number;
  end: number;
}

interface ToggleLineCommentsBackendResult {
  changed: boolean;
  lineCount: number;
  documentVersion: number;
  selectionStartChar: number;
  selectionEndChar: number;
}

interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
}

interface ReplaceRectangularSelectionResultPayload {
  nextText: string;
  caretOffset: number;
}

interface TextDragMoveState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  sourceStart: number;
  sourceEnd: number;
  sourceText: string;
  baseText: string;
  dropOffset: number;
  dragging: boolean;
}

type EditorInputElement = HTMLDivElement | HTMLTextAreaElement;

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
const SEARCH_HIGHLIGHT_CLASS = 'rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70';
const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';
const SEARCH_AND_PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-emerald-300/55 text-black ring-1 ring-emerald-500/45 dark:bg-emerald-400/40 dark:ring-emerald-300/45';
const RECTANGULAR_SELECTION_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-violet-300/45 text-black ring-1 ring-violet-500/40 dark:bg-violet-400/30 dark:ring-violet-300/40';
const TEXT_SELECTION_HIGHLIGHT_CLASS =
  'bg-blue-400/35 dark:bg-blue-500/30';
const RECTANGULAR_AUTO_SCROLL_EDGE_PX = 36;
const RECTANGULAR_AUTO_SCROLL_MAX_STEP_PX = 18;
const SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX = 12;
const SEARCH_NAVIGATE_MIN_VISIBLE_TEXT_WIDTH_PX = 32;
const DEFER_POINTER_SELECTION_STATE_SYNC_DURING_DRAG = false;
const USE_NATIVE_TEXT_SELECTION_HIGHLIGHT = false;
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

function isLargeModeEditIntent(event: React.KeyboardEvent<EditorInputElement>) {
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

function isTextareaInputElement(element: EditorInputElement | null): element is HTMLTextAreaElement {
  return !!element && element.tagName === 'TEXTAREA';
}

function setInputLayerText(element: EditorInputElement, text: string) {
  if (isTextareaInputElement(element)) {
    element.value = normalizeEditorText((text || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
    return;
  }

  element.textContent = toInputLayerText(text);
}

function getEditableText(element: EditorInputElement) {
  if (isTextareaInputElement(element)) {
    return normalizeEditorText((element.value || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
  }

  return normalizeEditorText((element.textContent || '').replaceAll(EMPTY_LINE_PLACEHOLDER, ''));
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

function setCaretToLineColumn(element: EditorInputElement, line: number, column: number) {
  const content = normalizeEditorText(getEditableText(element));
  const layerText = toInputLayerText(content);
  const targetOffset = getCodeUnitOffsetFromLineColumn(content, line, column);

  if (isTextareaInputElement(element)) {
    if (element.value !== content) {
      element.value = content;
    }

    const layerOffset = mapLogicalOffsetToInputLayerOffset(content, targetOffset);
    const safeOffset = Math.min(layerOffset, content.length);
    if (document.activeElement !== element) {
      element.focus();
    }
    element.setSelectionRange(safeOffset, safeOffset);
    return;
  }

  if (element.textContent !== layerText) {
    element.textContent = layerText;
  }

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

function getCaretLineInElement(element: EditorInputElement) {
  if (isTextareaInputElement(element)) {
    const text = getEditableText(element);
    const safeOffset = Math.max(0, Math.min(element.selectionStart ?? 0, text.length));
    const textBeforeCaret = normalizeLineText(text.slice(0, safeOffset));
    return textBeforeCaret.split('\n').length;
  }

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

function getSelectionOffsetsInElement(element: EditorInputElement) {
  if (isTextareaInputElement(element)) {
    const text = getEditableText(element);
    const rawStart = Math.max(0, Math.min(element.selectionStart ?? 0, text.length));
    const rawEnd = Math.max(0, Math.min(element.selectionEnd ?? rawStart, text.length));
    const start = Math.min(rawStart, rawEnd);
    const end = Math.max(rawStart, rawEnd);

    return {
      start,
      end,
      isCollapsed: start === end,
    };
  }

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

function getSelectionAnchorFocusOffsetsInElement(element: EditorInputElement) {
  if (isTextareaInputElement(element)) {
    const text = getEditableText(element);
    const start = Math.max(0, Math.min(element.selectionStart ?? 0, text.length));
    const end = Math.max(0, Math.min(element.selectionEnd ?? start, text.length));
    const isBackward = element.selectionDirection === 'backward';

    return isBackward
      ? {
          anchor: end,
          focus: start,
        }
      : {
          anchor: start,
          focus: end,
        };
  }

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

function getLogicalOffsetFromDomPoint(element: EditorInputElement, node: Node, offset: number) {
  if (isTextareaInputElement(element)) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return normalizeLineText(range.toString()).replaceAll(EMPTY_LINE_PLACEHOLDER, '').length;
}

function getLogicalOffsetFromPoint(element: EditorInputElement, clientX: number, clientY: number) {
  if (isTextareaInputElement(element)) {
    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
    if (anchorFocusOffsets) {
      return anchorFocusOffsets.focus;
    }

    return getSelectionOffsetsInElement(element)?.end ?? null;
  }

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

function setCaretToCodeUnitOffset(element: EditorInputElement, offset: number) {
  const targetOffset = Math.max(0, Math.floor(offset));

  if (isTextareaInputElement(element)) {
    if (document.activeElement !== element) {
      element.focus();
    }

    const maxOffset = getEditableText(element).length;
    const safeOffset = Math.min(targetOffset, maxOffset);
    element.setSelectionRange(safeOffset, safeOffset);
    return;
  }

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

function setSelectionToCodeUnitOffsets(element: EditorInputElement, startOffset: number, endOffset: number) {
  const safeStartOffset = Math.max(0, Math.floor(startOffset));
  const safeEndOffset = Math.max(0, Math.floor(endOffset));

  if (isTextareaInputElement(element)) {
    if (document.activeElement !== element) {
      element.focus();
    }

    const maxOffset = getEditableText(element).length;
    const normalizedStart = Math.min(safeStartOffset, maxOffset);
    const normalizedEnd = Math.min(safeEndOffset, maxOffset);
    const rangeStart = Math.min(normalizedStart, normalizedEnd);
    const rangeEnd = Math.max(normalizedStart, normalizedEnd);
    element.setSelectionRange(rangeStart, rangeEnd);
    return;
  }

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

function dispatchEditorInputEvent(element: EditorInputElement) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function normalizeInputLayerDom(element: EditorInputElement) {
  if (isTextareaInputElement(element)) {
    return;
  }

  const hasSingleTextNode =
    element.childNodes.length === 1 &&
    element.firstChild !== null &&
    element.firstChild.nodeType === Node.TEXT_NODE;

  if (hasSingleTextNode) {
    return;
  }

  const selectionOffsets = getSelectionOffsetsInElement(element);
  const normalizedText = getEditableText(element);
  const nextLayerText = toInputLayerText(normalizedText);

  element.textContent = nextLayerText;

  if (!selectionOffsets) {
    return;
  }

  const nextStartOffset = mapLogicalOffsetToInputLayerOffset(normalizedText, selectionOffsets.start);
  const nextEndOffset = mapLogicalOffsetToInputLayerOffset(normalizedText, selectionOffsets.end);
  setSelectionToCodeUnitOffsets(element, nextStartOffset, nextEndOffset);
}

async function writePlainTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Clipboard copy not supported');
  }
}

function replaceSelectionWithText(element: EditorInputElement, text: string) {
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
  setInputLayerText(element, nextText);
  const logicalNextOffset = selectionOffsets.start + normalizedText.length;
  const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
  setCaretToCodeUnitOffset(element, layerNextOffset);
  return true;
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

  return Math.round(value);
}

function isPointerOnScrollbar(element: HTMLElement, clientX: number, clientY: number) {
  const verticalScrollbarWidth = Math.max(0, element.offsetWidth - element.clientWidth);
  const horizontalScrollbarHeight = Math.max(0, element.offsetHeight - element.clientHeight);
  const hasVerticalScrollableRange = element.scrollHeight > element.clientHeight + 1;
  const hasHorizontalScrollableRange = element.scrollWidth > element.clientWidth + 1;
  const effectiveVerticalHitWidth = verticalScrollbarWidth > 0 ? verticalScrollbarWidth : hasVerticalScrollableRange ? 14 : 0;
  const effectiveHorizontalHitHeight =
    horizontalScrollbarHeight > 0 ? horizontalScrollbarHeight : hasHorizontalScrollableRange ? 14 : 0;

  if (effectiveVerticalHitWidth <= 0 && effectiveHorizontalHitHeight <= 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const withinVerticalBounds = clientY >= rect.top && clientY <= rect.bottom;
  const withinHorizontalBounds = clientX >= rect.left && clientX <= rect.right;
  const onVerticalScrollbar =
    effectiveVerticalHitWidth > 0 &&
    withinVerticalBounds &&
    clientX >= rect.right - effectiveVerticalHitWidth &&
    clientX <= rect.right;
  const onHorizontalScrollbar =
    effectiveHorizontalHitHeight > 0 &&
    withinHorizontalBounds &&
    clientY >= rect.bottom - effectiveHorizontalHitHeight &&
    clientY <= rect.bottom;

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
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const activeSyntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
  const [lineTokens, setLineTokens] = useState<SyntaxToken[][]>([]);
  const [startLine, setStartLine] = useState(0);
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [plainStartLine, setPlainStartLine] = useState(0);
  const [editableSegment, setEditableSegment] = useState<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });
  const [hugeScrollableContentWidth, setHugeScrollableContentWidth] = useState(0);
  const [activeLineNumber, setActiveLineNumber] = useState(1);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlightState | null>(null);
  const [textSelectionHighlight, setTextSelectionHighlight] = useState<TextSelectionState | null>(null);
  const [pairHighlights, setPairHighlights] = useState<PairHighlightPosition[]>([]);
  const [rectangularSelection, setRectangularSelection] = useState<RectangularSelectionState | null>(null);
  const [lineNumberMultiSelection, setLineNumberMultiSelection] = useState<number[]>([]);
  const [outlineFlashLine, setOutlineFlashLine] = useState<number | null>(null);
  const [showLargeModeEditPrompt, setShowLargeModeEditPrompt] = useState(false);
  const [showBase64DecodeErrorToast, setShowBase64DecodeErrorToast] = useState(false);
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState | null>(null);
  const [submenuVerticalAlignments, setSubmenuVerticalAlignments] = useState<
    Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>
  >(() => ({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS }));
  const [submenuMaxHeights, setSubmenuMaxHeights] = useState<
    Record<EditorSubmenuKey, number | null>
  >(() => ({ ...DEFAULT_SUBMENU_MAX_HEIGHTS }));
  const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);
  const lineNumberListRef = useRef<any>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const requestTimeout = useRef<any>(null);
  const editTimeout = useRef<any>(null);
  const isScrollbarDragRef = useRef(false);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const editorContextMenuRef = useRef<HTMLDivElement>(null);
  const submenuPanelRefs = useRef<Record<EditorSubmenuKey, HTMLDivElement | null>>({
    edit: null,
    sort: null,
    convert: null,
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
  const outlineFlashTimerRef = useRef<any>(null);
  const base64DecodeErrorToastTimerRef = useRef<number | null>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const verticalSelectionRef = useRef<VerticalSelectionState | null>(null);
  const rectangularSelectionPointerActiveRef = useRef(false);
  const rectangularSelectionRef = useRef<RectangularSelectionState | null>(null);
  const rectangularSelectionLastClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const rectangularSelectionAutoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const rectangularSelectionAutoScrollRafRef = useRef<number | null>(null);
  const textDragMoveStateRef = useRef<TextDragMoveState | null>(null);
  const textDragMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textDragCursorAppliedRef = useRef(false);
  const pointerSelectionActiveRef = useRef(false);
  const lineNumberSelectionAnchorLineRef = useRef<number | null>(null);
  const selectionChangeRafRef = useRef<number | null>(null);
  const pairHighlightRequestIdRef = useRef(0);
  const editableSegmentRef = useRef<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });

  const syncedTextRef = useRef('');
  const lineNumberMultiSelectionSet = useMemo(() => new Set(lineNumberMultiSelection), [lineNumberMultiSelection]);

  const fontSize = settings.fontSize || 14;
  const tabSize = Number.isFinite(settings.tabWidth) ? Math.min(8, Math.max(1, Math.floor(settings.tabWidth))) : 4;
  const wordWrap = !!settings.wordWrap;
  const showLineNumbers = settings.showLineNumbers !== false;
  const highlightCurrentLine = settings.highlightCurrentLine !== false;
  const renderedFontSizePx = useMemo(() => alignToDevicePixel(fontSize), [fontSize]);
  const lineHeightPx = useMemo(() => Math.max(1, Math.round(renderedFontSizePx * 1.5)), [renderedFontSizePx]);
  const useNativeTextSelectionHighlight = USE_NATIVE_TEXT_SELECTION_HIGHLIGHT;
  const itemSize = lineHeightPx;
  const lineNumberColumnWidthPx = showLineNumbers ? 72 : 0;
  const contentViewportLeftPx = lineNumberColumnWidthPx;
  const contentViewportWidth = Math.max(0, width - contentViewportLeftPx);
  const contentTextPaddingPx = 6;
  const editorScrollbarSafetyPaddingPx = 14;
  const contentTextPadding = `${contentTextPaddingPx}px`;
  const contentTextRightPadding = `${contentTextPaddingPx + editorScrollbarSafetyPaddingPx}px`;
  const contentBottomSafetyPadding = `${editorScrollbarSafetyPaddingPx}px`;
  const horizontalOverflowMode = wordWrap ? 'hidden' : 'auto';
  const isLargeReadOnlyMode = false;
  const usePlainLineRendering = tab.largeFileMode || tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const isHugeEditableMode = tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD;
  const isPairHighlightEnabled = !usePlainLineRendering;
  const deleteLabel = tr('editor.context.delete');
  const selectAllLabel = tr('editor.context.selectAll');
  const editMenuLabel = tr('editor.context.edit');
  const sortMenuLabel = tr('editor.context.sort');
  const convertMenuLabel = tr('editor.context.convert');
  const convertBase64EncodeLabel = tr('editor.context.convert.base64Encode');
  const convertBase64DecodeLabel = tr('editor.context.convert.base64Decode');
  const copyBase64EncodeResultLabel = tr('editor.context.convert.copyBase64EncodeResult');
  const copyBase64DecodeResultLabel = tr('editor.context.convert.copyBase64DecodeResult');
  const base64DecodeFailedToastLabel = tr('editor.context.convert.base64DecodeFailed');
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
  const convertSubmenuPositionClassName =
    submenuVerticalAlignments.convert === 'bottom'
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
  const convertSubmenuStyle =
    submenuMaxHeights.convert === null
      ? undefined
      : {
          maxHeight: `${submenuMaxHeights.convert}px`,
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
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
  const bookmarks = useStore((state) => state.bookmarksByTab[tab.id] ?? EMPTY_BOOKMARKS);
  const largeFetchBuffer = isHugeEditableMode
    ? HUGE_EDITABLE_FETCH_BUFFER_LINES
    : tab.largeFileMode
    ? LARGE_FILE_FETCH_BUFFER_LINES
    : DEFAULT_FETCH_BUFFER_LINES;
  const hugeEditablePaddingTop = `${alignScrollOffset(Math.max(0, editableSegment.startLine) * itemSize)}px`;
  const hugeEditableSegmentHeightPx = `${alignScrollOffset(
    Math.max(1, editableSegment.endLine - editableSegment.startLine) * itemSize
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

      const measuredHeight = Math.max(itemSize, Math.round(element.scrollHeight));
      const previousHeight = rowHeightsRef.current.get(index);

      if (previousHeight !== undefined && Math.abs(previousHeight - measuredHeight) < 0.5) {
        return;
      }

      rowHeightsRef.current.set(index, measuredHeight);
      listRef.current?.resetAfterIndex?.(index);
      lineNumberListRef.current?.resetAfterIndex?.(index);
    },
    [itemSize, wordWrap]
  );

  useEffect(() => {
    rowHeightsRef.current.clear();
    listRef.current?.resetAfterIndex?.(0, true);
    lineNumberListRef.current?.resetAfterIndex?.(0, true);
  }, [lineHeightPx, renderedFontSizePx, settings.fontFamily, tab.id, tab.lineCount, width, wordWrap, showLineNumbers]);

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
          setInputLayerText(contentRef.current, text);
          // In huge editable mode, scrolling is controlled by the outer container.
          // Keep textarea internal scroll at origin to avoid pointer/selection drift.
          if (Math.abs(contentRef.current.scrollTop) > 0.001) {
            contentRef.current.scrollTop = 0;
          }

          if (Math.abs(contentRef.current.scrollLeft) > 0.001) {
            contentRef.current.scrollLeft = 0;
          }
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

      const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
      if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - alignedTop) > 0.001) {
        lineNumberOuter.scrollTop = alignedTop;
      }
    });
  }, [editableSegment.endLine, editableSegment.startLine, isHugeEditableMode]);

  const handleScroll = useCallback(() => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;

    const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
    const currentScrollTop = scrollElement?.scrollTop ?? 0;
    if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - currentScrollTop) > 0.001) {
      lineNumberOuter.scrollTop = currentScrollTop;
    }

    if (!isLargeReadOnlyMode && scrollElement && listRef.current) {
      const listEl = listRef.current._outerRef;
      if (listEl) {
        const scrollTop = scrollElement.scrollTop;
        const scrollLeft = scrollElement.scrollLeft;
        const listMaxTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
        const listMaxLeft = Math.max(0, listEl.scrollWidth - listEl.clientWidth);
        const targetTop = Math.min(scrollTop, listMaxTop);
        const targetLeft = Math.min(scrollLeft, listMaxLeft);

        if (isScrollbarDragRef.current) {
          if (Math.abs(listEl.scrollTop - targetTop) > 0.001) {
            listEl.scrollTop = targetTop;
          }

          if (Math.abs(listEl.scrollLeft - targetLeft) > 0.001) {
            listEl.scrollLeft = targetLeft;
          }

          return;
        }

        if (Math.abs(listEl.scrollTop - targetTop) > 0.001) {
          listEl.scrollTop = targetTop;
        }

        if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - targetTop) > 0.001) {
          lineNumberOuter.scrollTop = targetTop;
        }

        if (Math.abs(listEl.scrollLeft - targetLeft) > 0.001) {
          listEl.scrollLeft = targetLeft;
        }

        if (Math.abs(scrollElement.scrollTop - targetTop) > 0.001) {
          scrollElement.scrollTop = targetTop;
        }

        // Keep input-layer horizontal scroll as source of truth.
        // Avoid snapping it back based on backdrop width.
      }
    }

    if (isLargeReadOnlyMode && scrollElement) {
      if (lineNumberOuter && Math.abs(lineNumberOuter.scrollTop - scrollElement.scrollTop) > 0.001) {
        lineNumberOuter.scrollTop = scrollElement.scrollTop;
      }
    }
  }, [isHugeEditableMode, isLargeReadOnlyMode]);

  useEffect(() => {
    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;
    if (!scrollElement || isLargeReadOnlyMode) {
      return;
    }

    let rafId = 0;
    const onNativeScroll = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        handleScroll();
      });
    };

    scrollElement.addEventListener('scroll', onNativeScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', onNativeScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [handleScroll, isHugeEditableMode, isLargeReadOnlyMode]);

  useEffect(() => {
    if (isLargeReadOnlyMode) {
      return;
    }

    let firstRafId = 0;
    let secondRafId = 0;

    firstRafId = window.requestAnimationFrame(() => {
      handleScroll();
      secondRafId = window.requestAnimationFrame(() => {
        handleScroll();
      });
    });

    return () => {
      if (firstRafId) {
        window.cancelAnimationFrame(firstRafId);
      }

      if (secondRafId) {
        window.cancelAnimationFrame(secondRafId);
      }
    };
  }, [handleScroll, isLargeReadOnlyMode, tab.lineCount]);

  useEffect(() => {
    if (!showLineNumbers) {
      return;
    }

    const scrollElement = isHugeEditableMode ? scrollContainerRef.current : contentRef.current;
    const lineNumberOuter = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;
    if (!scrollElement || !lineNumberOuter) {
      return;
    }

    if (Math.abs(lineNumberOuter.scrollTop - scrollElement.scrollTop) > 0.001) {
      lineNumberOuter.scrollTop = scrollElement.scrollTop;
    }
  }, [showLineNumbers, isHugeEditableMode, tab.id, tab.lineCount, editableSegment.startLine, editableSegment.endLine]);

  const setPointerSelectionNativeHighlightMode = useCallback((enabled: boolean) => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    if (enabled) {
      element.style.setProperty('--editor-native-selection-bg', 'hsl(217 91% 60% / 0.28)');
      return;
    }

    element.style.removeProperty('--editor-native-selection-bg');
  }, []);

  const getTextDragMeasureContext = useCallback(() => {
    if (!textDragMeasureCanvasRef.current) {
      textDragMeasureCanvasRef.current = document.createElement('canvas');
    }

    return textDragMeasureCanvasRef.current.getContext('2d');
  }, []);

  const measureTextWidthByEditorStyle = useCallback(
    (element: HTMLTextAreaElement, text: string) => {
      if (!text) {
        return 0;
      }

      const context = getTextDragMeasureContext();
      if (!context) {
        return 0;
      }

      const style = window.getComputedStyle(element);
      const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
      const fontVariant = style.fontVariant && style.fontVariant !== 'normal' ? `${style.fontVariant} ` : '';
      const fontWeight = style.fontWeight && style.fontWeight !== 'normal' ? `${style.fontWeight} ` : '';
      const fontSize = style.fontSize || `${renderedFontSizePx}px`;
      const fontFamily = style.fontFamily || settings.fontFamily;
      context.font = `${fontStyle}${fontVariant}${fontWeight}${fontSize} ${fontFamily}`;
      return context.measureText(text).width;
    },
    [getTextDragMeasureContext, renderedFontSizePx, settings.fontFamily]
  );

  const estimateLineTextForNavigation = useCallback(
    (lineNumber: number, incomingLineText: string) => {
      if (incomingLineText) {
        return incomingLineText;
      }

      if (!contentRef.current || lineNumber <= 0) {
        return '';
      }

      const allText = getEditableText(contentRef.current);
      if (!allText) {
        return '';
      }

      const lines = allText.split('\n');
      const lineIndex = lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        return '';
      }

      return lines[lineIndex] ?? '';
    },
    []
  );

  const getFallbackSearchSidebarOcclusionPx = useCallback(() => {
    const sidebarElement = document.querySelector<HTMLElement>('[data-rutar-search-sidebar="true"]');
    if (!sidebarElement) {
      return 0;
    }

    const rect = sidebarElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }

    return Math.max(0, window.innerWidth - rect.left);
  }, []);

  const ensureSearchMatchVisibleHorizontally = useCallback(
    (
      scrollElement: HTMLDivElement | HTMLTextAreaElement | null,
      lineNumber: number,
      columnNumber: number,
      matchLength: number,
      incomingLineText: string,
      occludedRightPx: number,
      lineListElement?: HTMLDivElement
    ) => {
      if (!scrollElement || wordWrap) {
        return;
      }

      const textareaElement = contentRef.current;
      if (!textareaElement) {
        return;
      }

      const lineText = estimateLineTextForNavigation(lineNumber, incomingLineText);
      const zeroBasedStart = Math.max(0, columnNumber - 1);
      const safeStart = Math.min(zeroBasedStart, lineText.length);
      const safeLength = Math.max(1, matchLength || 1);
      const safeEnd = Math.min(lineText.length, safeStart + safeLength);

      const prefixWidth = measureTextWidthByEditorStyle(textareaElement, lineText.slice(0, safeStart));
      const matchWidth = Math.max(
        measureTextWidthByEditorStyle(textareaElement, lineText.slice(safeStart, safeEnd)),
        measureTextWidthByEditorStyle(textareaElement, lineText.charAt(safeStart) || ' ')
      );

      const style = window.getComputedStyle(textareaElement);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;

      const fallbackOccludedRightPx = getFallbackSearchSidebarOcclusionPx();
      const effectiveOccludedRight = Math.max(0, occludedRightPx, fallbackOccludedRightPx);
      const baseVisibleWidth = Math.max(
        0,
        scrollElement.clientWidth - paddingLeft - paddingRight - SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX * 2
      );
      const availableVisibleWidth = Math.max(
        SEARCH_NAVIGATE_MIN_VISIBLE_TEXT_WIDTH_PX,
        baseVisibleWidth - effectiveOccludedRight
      );

      const targetStartX = Math.max(0, prefixWidth - SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX);
      const targetEndX = Math.max(
        targetStartX,
        prefixWidth + matchWidth + SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX
      );

      let nextScrollLeft = scrollElement.scrollLeft;
      const viewportStartX = nextScrollLeft;
      const viewportEndX = viewportStartX + availableVisibleWidth;

      if (targetEndX > viewportEndX) {
        nextScrollLeft = targetEndX - availableVisibleWidth;
      } else if (targetStartX < viewportStartX) {
        nextScrollLeft = targetStartX;
      }

      const maxScrollableWidthByElement = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
      const maxScrollableWidthByTextarea = Math.max(0, textareaElement.scrollWidth - textareaElement.clientWidth);
      const maxScrollableWidthByList = lineListElement
        ? Math.max(0, lineListElement.scrollWidth - lineListElement.clientWidth)
        : 0;
      const maxScrollableWidth = Math.max(
        maxScrollableWidthByElement,
        maxScrollableWidthByTextarea,
        maxScrollableWidthByList
      );

      const alignedNextScrollLeft = alignScrollOffset(Math.max(0, Math.min(nextScrollLeft, maxScrollableWidth)));
      if (Math.abs(scrollElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        scrollElement.scrollLeft = alignedNextScrollLeft;
      }

      if (lineListElement && Math.abs(lineListElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        lineListElement.scrollLeft = alignedNextScrollLeft;
      }
    },
    [
      estimateLineTextForNavigation,
      getFallbackSearchSidebarOcclusionPx,
      measureTextWidthByEditorStyle,
      wordWrap,
    ]
  );

  const estimateDropOffsetForTextareaPoint = useCallback(
    (element: HTMLTextAreaElement, text: string, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;
      const scrollLeft = element.scrollLeft;
      const scrollTop = element.scrollTop;
      const availableWidth = Math.max(16, element.clientWidth - paddingLeft - paddingRight);

      const relativeY = Math.max(0, clientY - rect.top + scrollTop);
      const lineIndex = Math.max(0, Math.floor(relativeY / lineHeightPx));

      const lineStarts = [0];
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '\n') {
          lineStarts.push(index + 1);
        }
      }

      const clampedLineIndex = Math.min(lineStarts.length - 1, lineIndex);
      const lineStart = lineStarts[clampedLineIndex] ?? 0;
      const lineEnd = clampedLineIndex + 1 < lineStarts.length ? lineStarts[clampedLineIndex + 1] - 1 : text.length;
      const lineText = text.slice(lineStart, lineEnd);

      const context = getTextDragMeasureContext();
      if (!context) {
        return lineStart;
      }

      const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
      const fontVariant = style.fontVariant && style.fontVariant !== 'normal' ? `${style.fontVariant} ` : '';
      const fontWeight = style.fontWeight && style.fontWeight !== 'normal' ? `${style.fontWeight} ` : '';
      const fontSize = style.fontSize || `${renderedFontSizePx}px`;
      const fontFamily = style.fontFamily || settings.fontFamily;
      context.font = `${fontStyle}${fontVariant}${fontWeight}${fontSize} ${fontFamily}`;

      const pointerX = Math.max(0, clientX - rect.left + scrollLeft - paddingLeft);
      const wrappedLines = wordWrap ? Math.max(1, Math.floor(pointerX / availableWidth)) : 0;

      if (!wordWrap || wrappedLines === 0) {
        let currentWidth = 0;
        for (let index = 0; index < lineText.length; index += 1) {
          const charWidth = context.measureText(lineText[index] ?? '').width;
          if (pointerX <= currentWidth + charWidth / 2) {
            return lineStart + index;
          }
          currentWidth += charWidth;
        }
        return lineEnd;
      }

      let wrappedStart = 0;
      let wrappedRow = 0;
      while (wrappedStart < lineText.length) {
        let wrappedEnd = wrappedStart;
        let wrappedWidth = 0;
        while (wrappedEnd < lineText.length) {
          const charWidth = context.measureText(lineText[wrappedEnd] ?? '').width;
          if (wrappedWidth > 0 && wrappedWidth + charWidth > availableWidth) {
            break;
          }
          wrappedWidth += charWidth;
          wrappedEnd += 1;
        }

        if (wrappedEnd === wrappedStart) {
          wrappedEnd = wrappedStart + 1;
        }

        if (wrappedRow === wrappedLines || wrappedEnd >= lineText.length) {
          let currentWidth = 0;
          for (let index = wrappedStart; index < wrappedEnd; index += 1) {
            const charWidth = context.measureText(lineText[index] ?? '').width;
            if (pointerX <= currentWidth + charWidth / 2 + wrappedRow * availableWidth) {
              return lineStart + index;
            }
            currentWidth += charWidth;
          }

          return lineStart + wrappedEnd;
        }

        wrappedStart = wrappedEnd;
        wrappedRow += 1;
      }

      return lineEnd;
    },
    [getTextDragMeasureContext, lineHeightPx, renderedFontSizePx, settings.fontFamily, wordWrap]
  );

  const resolveDropOffsetFromPointer = useCallback(
    (element: HTMLTextAreaElement, clientX: number, clientY: number) => {
      const text = getEditableText(element);
      const estimated = estimateDropOffsetForTextareaPoint(element, text, clientX, clientY);
      return Math.max(0, Math.min(text.length, estimated));
    },
    [estimateDropOffsetForTextareaPoint]
  );

  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        setLineNumberMultiSelection((prev) => (prev.length === 0 ? prev : []));
      }
      const currentElement = contentRef.current;
      const pointerOnEditorScrollbar =
        !isLargeReadOnlyMode &&
        currentElement &&
        isTextareaInputElement(currentElement) &&
        isPointerOnScrollbar(currentElement, event.clientX, event.clientY);

      if (
        !isLargeReadOnlyMode &&
        currentElement &&
        isTextareaInputElement(currentElement) &&
        event.button === 2 &&
        rectangularSelectionRef.current
      ) {
        textDragMoveStateRef.current = null;
        pointerSelectionActiveRef.current = false;
        if (!useNativeTextSelectionHighlight) {
          setPointerSelectionNativeHighlightMode(false);
        }
        verticalSelectionRef.current = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        !isLargeReadOnlyMode &&
        currentElement &&
        isTextareaInputElement(currentElement) &&
        event.button === 0 &&
        !pointerOnEditorScrollbar &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        const selectionOffsets = getSelectionOffsetsInElement(currentElement);
        if (selectionOffsets && !selectionOffsets.isCollapsed) {
          const pointerLogicalOffset = resolveDropOffsetFromPointer(currentElement, event.clientX, event.clientY);
          if (pointerLogicalOffset >= selectionOffsets.start && pointerLogicalOffset <= selectionOffsets.end) {
            textDragMoveStateRef.current = {
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              sourceStart: selectionOffsets.start,
              sourceEnd: selectionOffsets.end,
              sourceText: currentElement.value.slice(selectionOffsets.start, selectionOffsets.end),
              baseText: currentElement.value,
              dropOffset: pointerLogicalOffset,
              dragging: false,
            };
          } else {
            textDragMoveStateRef.current = null;
          }
        } else {
          textDragMoveStateRef.current = null;
        }
      } else {
        textDragMoveStateRef.current = null;
      }

      pointerSelectionActiveRef.current = false;
      if (!useNativeTextSelectionHighlight) {
        setPointerSelectionNativeHighlightMode(false);
      }
      verticalSelectionRef.current = null;

      if (
        !isLargeReadOnlyMode &&
        event.altKey &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        contentRef.current
      ) {
        event.stopPropagation();
        if (useNativeTextSelectionHighlight) {
          setPointerSelectionNativeHighlightMode(false);
        }
        const isTextarea = isTextareaInputElement(contentRef.current);
        if (!isTextarea) {
          event.preventDefault();
        }

        const clientX = event.clientX;
        const clientY = event.clientY;

        contentRef.current.focus();
        rectangularSelectionPointerActiveRef.current = true;
        rectangularSelectionLastClientPointRef.current = { x: clientX, y: clientY };

        if (isTextarea) {
          window.requestAnimationFrame(() => {
            if (!rectangularSelectionPointerActiveRef.current || !contentRef.current) {
              return;
            }

            const logicalOffset = getLogicalOffsetFromPoint(contentRef.current, clientX, clientY);
            if (logicalOffset === null) {
              return;
            }

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
          });

          return;
        }

        const logicalOffset = getLogicalOffsetFromPoint(contentRef.current, clientX, clientY);
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
      if (!pointerOnEditorScrollbar) {
        if (
          DEFER_POINTER_SELECTION_STATE_SYNC_DURING_DRAG &&
          event.isPrimary &&
          event.button === 0
        ) {
          pointerSelectionActiveRef.current = true;
          if (!useNativeTextSelectionHighlight) {
            setPointerSelectionNativeHighlightMode(true);
            setTextSelectionHighlight((prev) => (prev === null ? prev : null));
          }
        }
        return;
      }

      textDragMoveStateRef.current = null;
      isScrollbarDragRef.current = true;
      editorElement.style.userSelect = 'none';
      editorElement.style.webkitUserSelect = 'none';
    },
    [isLargeReadOnlyMode, resolveDropOffsetFromPointer, setPointerSelectionNativeHighlightMode, useNativeTextSelectionHighlight]
  );

  const handleHugeScrollablePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHugeEditableMode || !scrollContainerRef.current) {
      return;
    }

    if (!isPointerOnScrollbar(scrollContainerRef.current, event.clientX, event.clientY)) {
      return;
    }

    textDragMoveStateRef.current = null;
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

  const editableSegmentLines = useMemo(() => {
    if (!isHugeEditableMode) {
      return [];
    }

    if (editableSegment.endLine <= editableSegment.startLine) {
      return [];
    }

    return editableSegment.text.split('\n');
  }, [editableSegment.endLine, editableSegment.startLine, editableSegment.text, isHugeEditableMode]);

  const syncHugeScrollableContentWidth = useCallback(() => {
    if (!isHugeEditableMode || wordWrap) {
      setHugeScrollableContentWidth(0);
      return;
    }

    const element = contentRef.current;
    if (!element) {
      return;
    }

    const measuredWidth = Math.max(contentViewportWidth, element.scrollWidth);
    setHugeScrollableContentWidth((prev) => (prev === measuredWidth ? prev : measuredWidth));
  }, [contentViewportWidth, isHugeEditableMode, wordWrap]);

  useEffect(() => {
    if (!isHugeEditableMode || wordWrap) {
      setHugeScrollableContentWidth(0);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      syncHugeScrollableContentWidth();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    contentViewportWidth,
    editableSegment.text,
    isHugeEditableMode,
    renderedFontSizePx,
    settings.fontFamily,
    syncHugeScrollableContentWidth,
    wordWrap,
  ]);

  const fetchTokens = useCallback(
    async (start: number, end: number) => {
      const version = ++currentRequestVersion.current;
      try {
        const lineResult = await invoke<SyntaxToken[][]>('get_syntax_token_lines', {
          id: tab.id,
          startLine: start,
          endLine: end,
        });

        if (version !== currentRequestVersion.current) return;
        if (!Array.isArray(lineResult)) return;

        setLineTokens(lineResult);
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
      setInputLayerText(contentRef.current, normalized);
    }

    syncedTextRef.current = normalized;
    pendingSyncRequestedRef.current = false;
  }, [fetchEditableSegment, height, isHugeEditableMode, itemSize, largeFetchBuffer, tab.id]);

  const updateCursorPositionFromSelection = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const text = normalizeSegmentText(getEditableText(contentRef.current));
    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(contentRef.current);
    const focusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(contentRef.current)?.end;

    if (focusOffset === null || focusOffset === undefined) {
      return;
    }

    const localPosition = codeUnitOffsetToLineColumn(text, focusOffset);

    const absoluteLine = isHugeEditableMode
      ? editableSegmentRef.current.startLine + localPosition.line
      : localPosition.line;
    const safeLine = Math.max(1, Math.min(Math.max(1, tab.lineCount), Math.floor(absoluteLine)));
    const safeColumn = Math.max(1, Math.floor(localPosition.column + 1));

    setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
    setCursorPosition(tab.id, safeLine, safeColumn);
  }, [isHugeEditableMode, setCursorPosition, tab.id, tab.lineCount]);

  const updatePairHighlightsFromSelection = useCallback(async () => {
    const requestId = pairHighlightRequestIdRef.current + 1;
    pairHighlightRequestIdRef.current = requestId;

    if (!isPairHighlightEnabled || !contentRef.current) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const selectionOffsets = getSelectionOffsetsInElement(contentRef.current);

    if (!selectionOffsets || !selectionOffsets.isCollapsed) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const text = normalizeSegmentText(getEditableText(contentRef.current));

    let matched: PairOffsetsResultPayload | null = null;
    try {
      matched = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
        text,
        offset: selectionOffsets.end,
      });
    } catch (error) {
      if (requestId === pairHighlightRequestIdRef.current) {
        setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      }
      console.error('Failed to find matching pair offsets:', error);
      return;
    }

    if (requestId !== pairHighlightRequestIdRef.current) {
      return;
    }

    if (!matched) {
      setPairHighlights((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const sortedIndexes =
      matched.leftOffset <= matched.rightOffset
        ? [matched.leftOffset, matched.rightOffset]
        : [matched.rightOffset, matched.leftOffset];
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

    setPairHighlights((prev) =>
      arePairHighlightPositionsEqual(prev, nextHighlights) ? prev : nextHighlights
    );
  }, [isHugeEditableMode, isPairHighlightEnabled]);

  const syncSelectionState = useCallback(() => {
    updateCursorPositionFromSelection();
    void updatePairHighlightsFromSelection();
  }, [updateCursorPositionFromSelection, updatePairHighlightsFromSelection]);

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

  const clearLineNumberMultiSelection = useCallback(() => {
    setLineNumberMultiSelection((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const mapAbsoluteLineToSourceLine = useCallback(
    (absoluteLine: number) => {
      const safeLine = Math.max(1, Math.floor(absoluteLine));
      if (!isHugeEditableMode) {
        return safeLine;
      }

      const segment = editableSegmentRef.current;
      const segmentStartLine = segment.startLine + 1;
      const segmentEndLine = segment.endLine;
      if (safeLine < segmentStartLine || safeLine > segmentEndLine) {
        return null;
      }

      return safeLine - segment.startLine;
    },
    [isHugeEditableMode]
  );

  const buildLineNumberSelectionRangeText = useCallback(
    (text: string, selectedLines: number[]) => {
      if (!text || selectedLines.length === 0) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const segments: string[] = [];

      for (const line of selectedLines) {
        const sourceLine = mapAbsoluteLineToSourceLine(line);
        if (sourceLine === null) {
          continue;
        }
        const bounds = getLineBoundsByLineNumber(text, starts, sourceLine);
        if (!bounds) {
          continue;
        }

        const endOffset = bounds.end < text.length && text[bounds.end] === '\n' ? bounds.end + 1 : bounds.end;
        segments.push(text.slice(bounds.start, endOffset));
      }

      return segments.join('');
    },
    [mapAbsoluteLineToSourceLine]
  );

  const applyLineNumberMultiSelectionEdit = useCallback(
    async (mode: 'cut' | 'delete') => {
      const selectedLines = lineNumberMultiSelection;
      if (selectedLines.length === 0 || isLargeReadOnlyMode) {
        return false;
      }

      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const baseText = normalizeSegmentText(getEditableText(element));
      if (!baseText) {
        clearLineNumberMultiSelection();
        return false;
      }

      const starts = buildLineStartOffsets(baseText);
      const ranges = selectedLines
        .map((line) => {
          const sourceLine = mapAbsoluteLineToSourceLine(line);
          if (sourceLine === null) {
            return null;
          }
          const bounds = getLineBoundsByLineNumber(baseText, starts, sourceLine);
          if (!bounds) {
            return null;
          }

          const endOffset =
            bounds.end < baseText.length && baseText[bounds.end] === '\n' ? bounds.end + 1 : bounds.end;

          return {
            start: bounds.start,
            end: endOffset,
          };
        })
        .filter((range): range is { start: number; end: number } => !!range)
        .sort((left, right) => left.start - right.start);

      if (ranges.length === 0) {
        clearLineNumberMultiSelection();
        return false;
      }

      const mergedRanges: Array<{ start: number; end: number }> = [];
      for (const range of ranges) {
        const previous = mergedRanges[mergedRanges.length - 1];
        if (!previous || range.start > previous.end) {
          mergedRanges.push({ ...range });
          continue;
        }

        if (range.end > previous.end) {
          previous.end = range.end;
        }
      }

      if (mode === 'cut') {
        const selectedText = mergedRanges.map((range) => baseText.slice(range.start, range.end)).join('');
        if (selectedText && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(selectedText).catch(() => {
            console.warn('Failed to write line selection to clipboard.');
          });
        }
      }

      const nextPieces: string[] = [];
      let cursor = 0;
      for (const range of mergedRanges) {
        nextPieces.push(baseText.slice(cursor, range.start));
        cursor = range.end;
      }
      nextPieces.push(baseText.slice(cursor));
      const nextText = nextPieces.join('');

      if (nextText === baseText) {
        clearLineNumberMultiSelection();
        return false;
      }

      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, 0);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, baseText.length);

      try {
        const newLineCount = isHugeEditableMode
          ? await invoke<number>('replace_line_range', {
              id: tab.id,
              startLine: editableSegmentRef.current.startLine,
              endLine: editableSegmentRef.current.endLine,
              newText: nextText,
            })
          : await invoke<number>('edit_text', {
              id: tab.id,
              startChar,
              endChar,
              newText: nextText,
            });

        setInputLayerText(element, nextText);
        setCaretToCodeUnitOffset(element, 0);

        if (isHugeEditableMode) {
          const nextSegment: EditorSegmentState = {
            startLine: editableSegmentRef.current.startLine,
            endLine: editableSegmentRef.current.endLine,
            text: nextText,
          };
          editableSegmentRef.current = nextSegment;
          setEditableSegment(nextSegment);
        }

        syncedTextRef.current = nextText;
        suppressExternalReloadRef.current = true;

        const safeLineCount = Math.max(1, newLineCount);
        updateTab(tab.id, { lineCount: safeLineCount, isDirty: true });
        dispatchDocumentUpdated(tab.id);

        clearLineNumberMultiSelection();
        lineNumberSelectionAnchorLineRef.current = null;
        setActiveLineNumber(1);
        setCursorPosition(tab.id, 1, 1);
        window.requestAnimationFrame(() => {
          handleScroll();
          syncSelectionState();

          window.requestAnimationFrame(() => {
            handleScroll();
          });
        });

        await syncVisibleTokens(safeLineCount);
        return true;
      } catch (error) {
        console.error('Failed to apply line-number multi-selection edit:', error);
        return false;
      }
    },
    [
      clearLineNumberMultiSelection,
      isLargeReadOnlyMode,
      lineNumberMultiSelection,
      mapAbsoluteLineToSourceLine,
      setCursorPosition,
      handleScroll,
      syncSelectionState,
      syncVisibleTokens,
      tab.id,
      updateTab,
    ]
  );

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

  const getRectangularSelectionTextFromBackend = useCallback(async () => {
    const element = contentRef.current;
    if (!element || !normalizedRectangularSelection) {
      return '';
    }

    const text = normalizeSegmentText(getEditableText(element));

    try {
      return await invoke<string>('get_rectangular_selection_text', {
        text,
        startLine: normalizedRectangularSelection.startLine,
        endLine: normalizedRectangularSelection.endLine,
        startColumn: normalizedRectangularSelection.startColumn,
        endColumn: normalizedRectangularSelection.endColumn,
      });
    } catch (error) {
      console.error('Failed to get rectangular selection text from backend:', error);
      return getRectangularSelectionText(text);
    }
  }, [getRectangularSelectionText, normalizedRectangularSelection]);

  const getSelectedEditorText = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return '';
    }

    if (normalizedRectangularSelection) {
      const text = normalizeSegmentText(getEditableText(element));
      return getRectangularSelectionText(text);
    }

    if (isTextareaInputElement(element)) {
      const start = Math.max(0, Math.min(element.selectionStart ?? 0, element.value.length));
      const end = Math.max(0, Math.min(element.selectionEnd ?? start, element.value.length));
      if (end <= start) {
        return '';
      }

      return normalizeLineText(element.value.slice(start, end));
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return '';
    }

    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) {
      return '';
    }

    return normalizeLineText(selection.toString());
  }, [getRectangularSelectionText, normalizedRectangularSelection]);

  const replaceRectangularSelectionLocally = useCallback(
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

      setInputLayerText(element, nextText);
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

  const replaceRectangularSelection = useCallback(
    async (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));

      try {
        const result = await invoke<ReplaceRectangularSelectionResultPayload>(
          'replace_rectangular_selection_text',
          {
            text,
            startLine: normalizedRectangularSelection.startLine,
            endLine: normalizedRectangularSelection.endLine,
            startColumn: normalizedRectangularSelection.startColumn,
            endColumn: normalizedRectangularSelection.endColumn,
            insertText,
            collapseToStart: options?.collapseToStart === true,
          }
        );

        const nextText = normalizeSegmentText(result?.nextText ?? text);
        const caretLogicalOffset = Math.max(
          0,
          Math.min(nextText.length, Math.floor(result?.caretOffset ?? 0))
        );

        setInputLayerText(element, nextText);
        const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
        setCaretToCodeUnitOffset(element, layerCaretOffset);
        clearRectangularSelection();
        dispatchEditorInputEvent(element);
        window.requestAnimationFrame(() => {
          syncSelectionState();
        });
        return true;
      } catch (error) {
        console.error('Failed to replace rectangular selection with backend command:', error);
        return replaceRectangularSelectionLocally(insertText, options);
      }
    },
    [
      clearRectangularSelection,
      normalizedRectangularSelection,
      replaceRectangularSelectionLocally,
      syncSelectionState,
    ]
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
      handleScroll();
      syncSelectionState();

      window.requestAnimationFrame(() => {
        handleScroll();
      });
    });
  }, [handleScroll, syncSelectionState]);

  const applyTextDragMove = useCallback(
    (element: HTMLTextAreaElement, state: TextDragMoveState) => {
      if (!state.dragging) {
        return false;
      }

      const sourceStart = state.sourceStart;
      const sourceEnd = state.sourceEnd;
      const baseText = state.baseText;
      if (sourceStart < 0 || sourceEnd <= sourceStart || sourceEnd > baseText.length) {
        return false;
      }

      let dropOffset = Math.max(0, Math.min(baseText.length, state.dropOffset));
      if (dropOffset >= sourceStart && dropOffset <= sourceEnd) {
        return false;
      }

      const sourceText = baseText.slice(sourceStart, sourceEnd);
      const textWithoutSource = `${baseText.slice(0, sourceStart)}${baseText.slice(sourceEnd)}`;

      let adjustedDropOffset = dropOffset;
      if (dropOffset > sourceEnd) {
        adjustedDropOffset -= sourceText.length;
      }

      adjustedDropOffset = Math.max(0, Math.min(textWithoutSource.length, adjustedDropOffset));
      const nextText = `${textWithoutSource.slice(0, adjustedDropOffset)}${sourceText}${textWithoutSource.slice(adjustedDropOffset)}`;
      if (nextText === baseText) {
        return false;
      }

      setInputLayerText(element, nextText);
      const caretLogicalOffset = adjustedDropOffset + sourceText.length;
      const caretLayerOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, caretLayerOffset);
      dispatchEditorInputEvent(element);
      syncSelectionAfterInteraction();
      return true;
    },
    [syncSelectionAfterInteraction]
  );

  const syncTextSelectionHighlight = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      setTextSelectionHighlight(null);
      return;
    }

    if (rectangularSelectionRef.current) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const offsets = getSelectionOffsetsInElement(element);
    if (!offsets || offsets.isCollapsed) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const start = Math.min(offsets.start, offsets.end);
    const end = Math.max(offsets.start, offsets.end);

    setTextSelectionHighlight((prev) => {
      if (prev && prev.start === start && prev.end === end) {
        return prev;
      }

      return { start, end };
    });
  }, []);

  const finalizePointerSelectionInteraction = useCallback(() => {
    if (!DEFER_POINTER_SELECTION_STATE_SYNC_DURING_DRAG) {
      pointerSelectionActiveRef.current = false;
      if (!useNativeTextSelectionHighlight) {
        setPointerSelectionNativeHighlightMode(false);
      }
      return;
    }

    const wasPointerSelectionActive = pointerSelectionActiveRef.current;
    pointerSelectionActiveRef.current = false;

    if (!wasPointerSelectionActive) {
      if (!useNativeTextSelectionHighlight) {
        setPointerSelectionNativeHighlightMode(false);
      }
      return;
    }

    window.requestAnimationFrame(() => {
      handleScroll();
      syncSelectionState();
      if (!useNativeTextSelectionHighlight) {
        syncTextSelectionHighlight();
        setPointerSelectionNativeHighlightMode(false);
      }
    });
  }, [
    handleScroll,
    setPointerSelectionNativeHighlightMode,
    syncSelectionState,
    syncTextSelectionHighlight,
    useNativeTextSelectionHighlight,
  ]);

  useEffect(() => {
    if (!normalizedRectangularSelection) {
      return;
    }

    setTextSelectionHighlight((prev) => (prev === null ? prev : null));
  }, [normalizedRectangularSelection]);

  useEffect(() => {
    if (!useNativeTextSelectionHighlight) {
      return;
    }

    if (normalizedRectangularSelection) {
      setPointerSelectionNativeHighlightMode(false);
    } else {
      setPointerSelectionNativeHighlightMode(true);
    }
  }, [normalizedRectangularSelection, setPointerSelectionNativeHighlightMode, useNativeTextSelectionHighlight]);

  const hasSelectionInsideEditor = useCallback(() => {
    if (!contentRef.current) {
      return false;
    }

    if (lineNumberMultiSelection.length > 0) {
      return true;
    }

    if (isTextareaInputElement(contentRef.current)) {
      const start = contentRef.current.selectionStart ?? 0;
      const end = contentRef.current.selectionEnd ?? 0;
      return end > start;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    const range = selection.getRangeAt(0);
    return contentRef.current.contains(range.commonAncestorContainer) && selection.toString().length > 0;
  }, [lineNumberMultiSelection.length]);

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
    (event: React.MouseEvent<EditorInputElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!contentRef.current) {
        return;
      }

      contentRef.current.focus();

      const menuWidth = 160;
      const menuHeight = 360;
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
        hasSelection:
          hasSelectionInsideEditor() ||
          ((normalizedRectangularSelection?.width ?? 0) > 0 && normalizedRectangularSelection !== null),
        lineNumber: activeLineNumber,
        submenuDirection: canOpenSubmenuRight ? 'right' : 'left',
      });
    },
    [activeLineNumber, hasSelectionInsideEditor, normalizedRectangularSelection]
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
        void replaceRectangularSelection('');
        return true;
      }

      if (action === 'delete') {
        void replaceRectangularSelection('');
        return true;
      }

      if (action === 'paste') {
        return false;
      }

      if (action === 'selectAll') {
        clearRectangularSelection();
      }
    }

    if (action === 'selectAll') {
      const text = getEditableText(contentRef.current);
      setSelectionToCodeUnitOffsets(contentRef.current, 0, text.length);
      return true;
    }

    if (action === 'paste') {
      return false;
    }

    if (action === 'delete') {
      return replaceSelectionWithText(contentRef.current, '');
    }

    if (action === 'copy' || action === 'cut') {
      const selected = getSelectedEditorText();
      if (!selected) {
        return false;
      }

      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(selected).catch(() => {
          console.warn('Failed to write selection to clipboard.');
        });
      }

      if (action === 'cut') {
        return replaceSelectionWithText(contentRef.current, '');
      }

      return true;
    }

    return false;
  }, [
    clearRectangularSelection,
    getRectangularSelectionText,
    getSelectedEditorText,
    normalizedRectangularSelection,
    replaceRectangularSelection,
  ]);

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
      window.requestAnimationFrame(() => {
        handleScroll();
        window.requestAnimationFrame(() => {
          handleScroll();
        });
      });
      return true;
    },
    [handleScroll, syncSelectionAfterInteraction]
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

      if ((action === 'copy' || action === 'cut' || action === 'delete') && lineNumberMultiSelection.length > 0) {
        if (action === 'copy') {
          if (contentRef.current) {
            const text = normalizeSegmentText(getEditableText(contentRef.current));
            const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn('Failed to write line selection to clipboard.');
              });
            }
          }

          setEditorContextMenu(null);
          return;
        }

        await applyLineNumberMultiSelectionEdit(action === 'cut' ? 'cut' : 'delete');
        setEditorContextMenu(null);
        return;
      }

      if (action === 'selectAll' && lineNumberMultiSelection.length > 0) {
        clearLineNumberMultiSelection();
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

      if ((action === 'copy' || action === 'cut') && normalizedRectangularSelection) {
        const selected = await getRectangularSelectionTextFromBackend();
        if (!selected) {
          setEditorContextMenu(null);
          return;
        }

        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(selected).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }

        if (action === 'cut') {
          void replaceRectangularSelection('');
          syncSelectionAfterInteraction();
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
    [
      applyLineNumberMultiSelectionEdit,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      getRectangularSelectionTextFromBackend,
      isEditorContextMenuActionDisabled,
      lineNumberMultiSelection,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      runEditorContextCommand,
      syncSelectionAfterInteraction,
      tryPasteTextIntoEditor,
    ]
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
      const safeLine = Math.max(1, Math.floor(line));
      const hasBookmark = bookmarks.includes(safeLine);

      toggleBookmark(tab.id, safeLine);

      if (!hasBookmark && !bookmarkSidebarOpen) {
        toggleBookmarkSidebar(true);
      }
    },
    [bookmarkSidebarOpen, bookmarks, tab.id, toggleBookmark, toggleBookmarkSidebar]
  );

  const handleLineNumberClick = useCallback(
    (line: number, shiftKey: boolean, additiveKey: boolean) => {
      const safeLine = Math.max(1, Math.floor(line));

      if (additiveKey) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
        clearRectangularSelection();
        setLineNumberMultiSelection((prev) => {
          const exists = prev.includes(safeLine);
          if (exists) {
            return prev.filter((lineNumber) => lineNumber !== safeLine);
          }

          return [...prev, safeLine].sort((left, right) => left - right);
        });

        const element = contentRef.current;
        if (element && !isLargeReadOnlyMode) {
          const text = normalizeSegmentText(getEditableText(element));
          const starts = buildLineStartOffsets(text);
          const lineInSource = mapAbsoluteLineToSourceLine(safeLine);
          if (lineInSource === null) {
            return;
          }
          const bounds = getLineBoundsByLineNumber(text, starts, lineInSource);
          if (bounds) {
            const caretOffset = mapLogicalOffsetToInputLayerOffset(text, bounds.start);
            setCaretToCodeUnitOffset(element, caretOffset);
          }
        }

        setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
        setCursorPosition(tab.id, safeLine, 1);
        syncSelectionAfterInteraction();
        return;
      }

      clearLineNumberMultiSelection();

      if (lineNumberSelectionAnchorLineRef.current === null) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
      }

      const anchorLine = lineNumberSelectionAnchorLineRef.current;
      const selectionStartLine = shiftKey ? Math.min(anchorLine, safeLine) : safeLine;
      const selectionEndLine = shiftKey ? Math.max(anchorLine, safeLine) : safeLine;

      if (!shiftKey) {
        lineNumberSelectionAnchorLineRef.current = safeLine;
      }

      setActiveLineNumber((prev) => (prev === safeLine ? prev : safeLine));
      setCursorPosition(tab.id, safeLine, 1);

      const element = contentRef.current;
      if (!element || isLargeReadOnlyMode) {
        return;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const startLineInSource = mapAbsoluteLineToSourceLine(selectionStartLine);
      const endLineInSource = mapAbsoluteLineToSourceLine(selectionEndLine);
      if (startLineInSource === null || endLineInSource === null) {
        return;
      }
      const startBounds = getLineBoundsByLineNumber(text, starts, startLineInSource);
      const endBounds = getLineBoundsByLineNumber(text, starts, endLineInSource);
      if (!startBounds || !endBounds) {
        return;
      }

      const selectionStartOffset = mapLogicalOffsetToInputLayerOffset(text, startBounds.start);
      const logicalEndOffset = endBounds.end < text.length && text[endBounds.end] === '\n'
        ? endBounds.end + 1
        : endBounds.end;
      const selectionEndOffset = mapLogicalOffsetToInputLayerOffset(text, logicalEndOffset);

      clearRectangularSelection();
      setSelectionToCodeUnitOffsets(element, selectionStartOffset, selectionEndOffset);
      syncSelectionAfterInteraction();
    },
    [
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      isLargeReadOnlyMode,
      mapAbsoluteLineToSourceLine,
      setCursorPosition,
      syncSelectionAfterInteraction,
      tab.id,
    ]
  );

  const handleLineNumberWheel = useCallback(
    (event) => {
      if (event.ctrlKey) {
        return;
      }

      const scrollElement = getRectangularSelectionScrollElement();
      if (!scrollElement) {
        return;
      }

      const hasVerticalDelta = Math.abs(event.deltaY) > 0.001;
      const horizontalDelta = Math.abs(event.deltaX) > 0.001 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      const hasHorizontalDelta = Math.abs(horizontalDelta) > 0.001;

      if (!hasVerticalDelta && !hasHorizontalDelta) {
        return;
      }

      event.preventDefault();

      if (hasVerticalDelta) {
        const maxTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        const targetTop = Math.max(0, Math.min(maxTop, alignScrollOffset(scrollElement.scrollTop + event.deltaY)));
        if (Math.abs(scrollElement.scrollTop - targetTop) > 0.001) {
          scrollElement.scrollTop = targetTop;
        }
      }

      if (hasHorizontalDelta) {
        const maxLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
        const targetLeft = Math.max(
          0,
          Math.min(maxLeft, alignScrollOffset(scrollElement.scrollLeft + horizontalDelta))
        );

        if (Math.abs(scrollElement.scrollLeft - targetLeft) > 0.001) {
          scrollElement.scrollLeft = targetLeft;
        }
      }
    },
    [getRectangularSelectionScrollElement]
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

  const handleConvertSelectionFromContext = useCallback(
    async (
      action: 'base64_encode' | 'base64_decode' | 'copy_base64_encode' | 'copy_base64_decode'
    ) => {
      const shouldCopyResult = action === 'copy_base64_encode' || action === 'copy_base64_decode';
      const shouldDecode = action === 'base64_decode' || action === 'copy_base64_decode';

      if ((isLargeReadOnlyMode && !shouldCopyResult) || !editorContextMenu?.hasSelection || !contentRef.current) {
        setEditorContextMenu(null);
        return;
      }

      const selectedText = normalizedRectangularSelection
        ? await getRectangularSelectionTextFromBackend()
        : getSelectedEditorText();
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
          console.error('Failed to convert Base64 text:', error);
        }
        setEditorContextMenu(null);
        return;
      }

      if (shouldCopyResult) {
        void writePlainTextToClipboard(nextText).catch((error) => {
          console.warn('Failed to write conversion result to clipboard:', error);
        });
        setEditorContextMenu(null);
        return;
      }

      if (normalizedRectangularSelection) {
        void replaceRectangularSelection(nextText);
      } else {
        const replaced = replaceSelectionWithText(contentRef.current, nextText);
        if (replaced) {
          dispatchEditorInputEvent(contentRef.current);
          syncSelectionAfterInteraction();
        }
      }

      setEditorContextMenu(null);
    },
    [
      editorContextMenu?.hasSelection,
      getRectangularSelectionTextFromBackend,
      getSelectedEditorText,
      isLargeReadOnlyMode,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      triggerBase64DecodeErrorToast,
      syncSelectionAfterInteraction,
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

      if (contentRef.current && !isComposingRef.current) {
        normalizeInputLayerDom(contentRef.current);
        syncHugeScrollableContentWidth();
      }

      if (!tab.isDirty) {
        updateTab(tab.id, { isDirty: true });
      }

      syncSelectionAfterInteraction();
      window.requestAnimationFrame(handleScroll);

      if (!isComposingRef.current) {
        queueTextSync();
      }
    },
    [
      clearVerticalSelectionState,
      handleScroll,
      tab.id,
      tab.isDirty,
      updateTab,
      queueTextSync,
      syncHugeScrollableContentWidth,
      syncSelectionAfterInteraction,
    ]
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
        void replaceRectangularSelection('');
        return true;
      }

      if (key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection('\t');
        return true;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection(key);
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

    if (isTextareaInputElement(element)) {
      const start = selectionOffsets.start;
      const end = selectionOffsets.end;
      const nextText = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
      element.setRangeText(text, start, end, 'end');
      if (element.value !== nextText) {
        element.value = nextText;
      }
      return true;
    }

    const currentText = getEditableText(element);
    const nextText = `${currentText.slice(0, selectionOffsets.start)}${text}${currentText.slice(selectionOffsets.end)}`;
    setInputLayerText(element, nextText);
    const logicalNextOffset = selectionOffsets.start + text.length;
    const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
    setCaretToCodeUnitOffset(element, layerNextOffset);
    return true;
  }, []);

  const toggleSelectedLinesComment = useCallback(
    async (event: React.KeyboardEvent<HTMLDivElement>) => {
      const element = contentRef.current;
      if (!element) {
        return;
      }

      let selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets) {
        const text = normalizeSegmentText(getEditableText(element));
        const layerEndOffset = mapLogicalOffsetToInputLayerOffset(text, text.length);
        setCaretToCodeUnitOffset(element, layerEndOffset);
        selectionOffsets = getSelectionOffsetsInElement(element);
      }

      if (!selectionOffsets) {
        return;
      }
      const prefix = getLineCommentPrefixForSyntaxKey(activeSyntaxKey);

      try {
        const baseText = normalizeSegmentText(getEditableText(element));
        const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, selectionOffsets.start);
        const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, selectionOffsets.end);

        const result = await invoke<ToggleLineCommentsBackendResult>('toggle_line_comments', {
          id: tab.id,
          startChar,
          endChar,
          isCollapsed: selectionOffsets.isCollapsed,
          prefix,
        });

        if (!result.changed) {
          return;
        }

        const safeLineCount = Math.max(1, result.lineCount ?? tab.lineCount);
        updateTab(tab.id, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        dispatchDocumentUpdated(tab.id);

        await loadTextFromBackend();
        await syncVisibleTokens(safeLineCount);

        const refreshedElement = contentRef.current;
        if (refreshedElement) {
          const refreshedText = normalizeSegmentText(getEditableText(refreshedElement));

          const selectionStartLogical =
            Math.max(0, Math.min(refreshedText.length, result.selectionStartChar ?? 0));
          const selectionEndLogical =
            Math.max(0, Math.min(refreshedText.length, result.selectionEndChar ?? selectionStartLogical));

          const selectionStartLayer = mapLogicalOffsetToInputLayerOffset(refreshedText, selectionStartLogical);
          const selectionEndLayer = mapLogicalOffsetToInputLayerOffset(refreshedText, selectionEndLogical);

          if (selectionOffsets.isCollapsed) {
            setCaretToCodeUnitOffset(refreshedElement, selectionEndLayer);
          } else {
            setSelectionToCodeUnitOffsets(refreshedElement, selectionStartLayer, selectionEndLayer);
          }

          syncSelectionAfterInteraction();
        }

        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        console.error('Failed to toggle line comments:', error);
      }
    },
    [
      activeSyntaxKey,
      loadTextFromBackend,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tab.id,
      tab.lineCount,
      updateTab,
    ]
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
        void toggleSelectedLinesComment(event);
        return;
      }

      if (event.key !== 'Enter' || event.isComposing) {
        if (event.key === 'Delete' && lineNumberMultiSelection.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('delete');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'x' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('cut');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'c' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          const element = contentRef.current;
          if (element) {
            const text = normalizeSegmentText(getEditableText(element));
            const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn('Failed to write line selection to clipboard.');
              });
            }
          }
          return;
        }

        if (
          normalizedRectangularSelection &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        ) {
          clearRectangularSelection();
        }
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey && event.key !== 'Shift') {
          clearLineNumberMultiSelection();
        }
        if (!event.shiftKey || event.key !== 'Shift') {
          clearVerticalSelectionState();
        }
        return;
      }

      clearVerticalSelectionState();
      clearRectangularSelection();
      clearLineNumberMultiSelection();
      event.preventDefault();
      event.stopPropagation();
      if (insertTextAtSelection('\n')) {
        handleInput();
      }
    },
    [
      applyLineNumberMultiSelectionEdit,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      clearVerticalSelectionState,
      beginRectangularSelectionFromCaret,
      expandVerticalSelection,
      lineNumberMultiSelection,
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
        : lineTokens.length === 0;
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
      lineTokens.length,
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

  const getTextSelectionHighlightRangeForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!textSelectionHighlight || textSelectionHighlight.end <= textSelectionHighlight.start) {
        return null;
      }

      let sourceText = '';
      let targetLineInSource = lineNumber;

      if (isHugeEditableMode) {
        const segment = editableSegmentRef.current;
        if (lineNumber < segment.startLine + 1 || lineNumber > segment.endLine) {
          return null;
        }

        sourceText = segment.text;
        targetLineInSource = Math.max(1, lineNumber - segment.startLine);
      } else {
        const element = contentRef.current;
        if (!element) {
          return null;
        }

        sourceText = normalizeSegmentText(getEditableText(element));
      }

      const lineStart = getCodeUnitOffsetFromLineColumn(sourceText, targetLineInSource, 1);
      const lineEnd = lineStart + lineTextLength;
      const selectionStart = textSelectionHighlight.start;
      const selectionEnd = textSelectionHighlight.end;

      const start = Math.max(lineStart, selectionStart);
      const end = Math.min(lineEnd, selectionEnd);
      if (end <= start) {
        return null;
      }

      return {
        start: start - lineStart,
        end: end - lineStart,
      };
    },
    [isHugeEditableMode, textSelectionHighlight]
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
      rectangularRange: { start: number; end: number } | null,
      textSelectionRange: { start: number; end: number } | null
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

      if (textSelectionRange) {
        boundaries.add(textSelectionRange.start);
        boundaries.add(textSelectionRange.end);
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
        const isTextSelectionMatch =
          !!textSelectionRange && start >= textSelectionRange.start && end <= textSelectionRange.end;

        let className = getInlineHighlightClass(isSearchMatch, isPairMatch);
        if (isRectangularMatch) {
          className = className
            ? `${className} ${RECTANGULAR_SELECTION_HIGHLIGHT_CLASS}`
            : RECTANGULAR_SELECTION_HIGHLIGHT_CLASS;
        }

        if (isTextSelectionMatch) {
          className = className
            ? `${className} ${TEXT_SELECTION_HIGHLIGHT_CLASS}`
            : TEXT_SELECTION_HIGHLIGHT_CLASS;
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
      const textSelectionRange = useNativeTextSelectionHighlight
        ? null
        : getTextSelectionHighlightRangeForLine(lineNumber, safeText.length);

      if (!range && pairColumns.length === 0 && !rectangularRange && !textSelectionRange) {
        return renderPlainLine(safeText);
      }

      const segments = buildLineHighlightSegments(
        safeText.length,
        range,
        pairColumns,
        rectangularRange,
        textSelectionRange
      );

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
      getTextSelectionHighlightRangeForLine,
      renderPlainLine,
      useNativeTextSelectionHighlight,
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

      if (normalizedType === 'setting_value') {
        if (['true', 'false', 'yes', 'no', 'on', 'off'].includes(cleanText)) {
          typeClass += ' token-boolean token-constant';
        } else if (/^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)) {
          typeClass += ' token-number';
        } else if (cleanText.length > 0) {
          typeClass += ' token-string';
        }
      }

      if (normalizedType === 'section_name_text' || normalizedType === 'section_name') {
        typeClass += ' token-type';
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

        if (text === ':') {
          typeClass += ' token-pair_separator';
        }
      }

      if (/^_+[a-z]+$/.test(cleanType) && text.length > 0 && !typeClass.includes('token-preprocessor')) {
        if (/^#/.test(text)) {
          typeClass += ' token-preprocessor';
        }
      }

      if (/^key_+$/.test(normalizedType) && /^['"]$/.test(text)) {
        typeClass += ' token-key_quote token-punctuation';
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
      const textSelectionRange = useNativeTextSelectionHighlight
        ? null
        : getTextSelectionHighlightRangeForLine(lineNumber, lineText.length);

      if (!range && pairColumns.length === 0 && !rectangularRange && !textSelectionRange) {
        return renderTokens(tokensArr);
      }

      const segments = buildLineHighlightSegments(
        lineText.length,
        range,
        pairColumns,
        rectangularRange,
        textSelectionRange
      );

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
      getTextSelectionHighlightRangeForLine,
      getTokenTypeClass,
      renderTokens,
      useNativeTextSelectionHighlight,
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
      setLineTokens([]);
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
    setLineTokens([]);
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
    window.addEventListener('pointerup', endScrollbarDragSelectionGuard);
    window.addEventListener('pointercancel', endScrollbarDragSelectionGuard);
    window.addEventListener('blur', endScrollbarDragSelectionGuard);

    return () => {
      window.removeEventListener('pointerup', endScrollbarDragSelectionGuard);
      window.removeEventListener('pointercancel', endScrollbarDragSelectionGuard);
      window.removeEventListener('blur', endScrollbarDragSelectionGuard);
    };
  }, [endScrollbarDragSelectionGuard]);

  useEffect(() => {
    window.addEventListener('pointerup', finalizePointerSelectionInteraction);
    window.addEventListener('pointercancel', finalizePointerSelectionInteraction);
    window.addEventListener('blur', finalizePointerSelectionInteraction);

    return () => {
      window.removeEventListener('pointerup', finalizePointerSelectionInteraction);
      window.removeEventListener('pointercancel', finalizePointerSelectionInteraction);
      window.removeEventListener('blur', finalizePointerSelectionInteraction);
    };
  }, [finalizePointerSelectionInteraction]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const textDragState = textDragMoveStateRef.current;
      if (textDragState && event.pointerId === textDragState.pointerId) {
        const element = contentRef.current;
        if (element && isTextareaInputElement(element) && !isLargeReadOnlyMode) {
          const deltaX = event.clientX - textDragState.startClientX;
          const deltaY = event.clientY - textDragState.startClientY;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
            if (distanceSquared >= 16) {
              textDragState.dragging = true;
              if (!textDragCursorAppliedRef.current) {
                document.body.style.cursor = 'copy';
                element.style.cursor = 'copy';
                textDragCursorAppliedRef.current = true;
              }
            }

          if (textDragState.dragging) {
            const dropOffset = resolveDropOffsetFromPointer(element, event.clientX, event.clientY);
            textDragState.dropOffset = dropOffset;

            const layerOffset = mapLogicalOffsetToInputLayerOffset(element.value, dropOffset);
            setCaretToCodeUnitOffset(element, layerOffset);
            event.preventDefault();
          }
        }
      }

      if (!rectangularSelectionPointerActiveRef.current) {
        return;
      }

      const clientX = event.clientX;
      const clientY = event.clientY;
      const element = contentRef.current;
      if (!isTextareaInputElement(element)) {
        event.preventDefault();
      }

      rectangularSelectionLastClientPointRef.current = { x: clientX, y: clientY };

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

      if (isTextareaInputElement(element)) {
        window.requestAnimationFrame(() => {
          if (!rectangularSelectionPointerActiveRef.current) {
            return;
          }
          updateRectangularSelectionFromPoint(clientX, clientY);
        });
      } else {
        updateRectangularSelectionFromPoint(clientX, clientY);
      }

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
      const textDragState = textDragMoveStateRef.current;
      if (textDragState) {
        const element = contentRef.current;
        if (element && isTextareaInputElement(element) && !isLargeReadOnlyMode) {
          applyTextDragMove(element, textDragState);
        }
        textDragMoveStateRef.current = null;
      }

      if (textDragCursorAppliedRef.current) {
        document.body.style.removeProperty('cursor');
        const element = contentRef.current;
        if (element) {
          element.style.removeProperty('cursor');
        }
        textDragCursorAppliedRef.current = false;
      }

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

      if (textDragCursorAppliedRef.current) {
        document.body.style.removeProperty('cursor');
        const element = contentRef.current;
        if (element) {
          element.style.removeProperty('cursor');
        }
        textDragCursorAppliedRef.current = false;
      }
    };
  }, [
    applyTextDragMove,
    getRectangularSelectionScrollElement,
    handleScroll,
    isLargeReadOnlyMode,
    resolveDropOffsetFromPointer,
    updateRectangularSelectionFromPoint,
  ]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const handleCopyLike = (event: ClipboardEvent, cut: boolean) => {
      if (!normalizedRectangularSelection) {
        if (lineNumberMultiSelection.length > 0) {
          const text = normalizeSegmentText(getEditableText(element));
          const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
          if (!selected) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.clipboardData?.setData('text/plain', selected);

          if (cut && !isLargeReadOnlyMode) {
            void applyLineNumberMultiSelectionEdit('cut');
          }
        }
        return;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const rectangularText = getRectangularSelectionText(text);

      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData('text/plain', rectangularText);

      if (cut) {
        void replaceRectangularSelection('');
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
      void replaceRectangularSelection(pasted);
    };

    element.addEventListener('copy', handleCopy);
    element.addEventListener('cut', handleCut);
    element.addEventListener('paste', handlePaste);

    return () => {
      element.removeEventListener('copy', handleCopy);
      element.removeEventListener('cut', handleCut);
      element.removeEventListener('paste', handlePaste);
    };
  }, [
    applyLineNumberMultiSelectionEdit,
    buildLineNumberSelectionRangeText,
    getRectangularSelectionText,
    isLargeReadOnlyMode,
    lineNumberMultiSelection,
    normalizedRectangularSelection,
    replaceRectangularSelection,
  ]);

  useEffect(() => {
    if (isPairHighlightEnabled) {
      return;
    }

    setPairHighlights((prev) => (prev.length === 0 ? prev : []));
  }, [isPairHighlightEnabled]);

  useEffect(() => {
    return () => {
      if (base64DecodeErrorToastTimerRef.current !== null) {
        window.clearTimeout(base64DecodeErrorToastTimerRef.current);
      }

      if (useNativeTextSelectionHighlight) {
        setPointerSelectionNativeHighlightMode(false);
      }
    };
  }, [setPointerSelectionNativeHighlightMode, useNativeTextSelectionHighlight]);

  useEffect(() => {
    const flushSelectionChange = () => {
      selectionChangeRafRef.current = null;

      if (verticalSelectionRef.current && !hasSelectionInsideEditor()) {
        clearVerticalSelectionState();
      }

      handleScroll();

      if (
        !DEFER_POINTER_SELECTION_STATE_SYNC_DURING_DRAG ||
        !pointerSelectionActiveRef.current
      ) {
        syncSelectionState();
        if (!useNativeTextSelectionHighlight) {
          syncTextSelectionHighlight();
        }
      }
    };

    const handleSelectionChange = () => {
      if (selectionChangeRafRef.current !== null) {
        return;
      }

      selectionChangeRafRef.current = window.requestAnimationFrame(flushSelectionChange);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (selectionChangeRafRef.current !== null) {
        window.cancelAnimationFrame(selectionChangeRafRef.current);
        selectionChangeRafRef.current = null;
      }
    };
  }, [
    clearVerticalSelectionState,
    handleScroll,
    hasSelectionInsideEditor,
    syncSelectionState,
    syncTextSelectionHighlight,
    useNativeTextSelectionHighlight,
  ]);

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

    if (textDragCursorAppliedRef.current) {
      document.body.style.removeProperty('cursor');
      const element = contentRef.current;
      if (element) {
        element.style.removeProperty('cursor');
      }
      textDragCursorAppliedRef.current = false;
    }

    textDragMoveStateRef.current = null;
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
    return () => {
      if (textDragCursorAppliedRef.current) {
        document.body.style.removeProperty('cursor');
        const element = contentRef.current;
        if (element) {
          element.style.removeProperty('cursor');
        }
        textDragCursorAppliedRef.current = false;
      }

      textDragMoveStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    setActiveLineNumber(1);
    lineNumberSelectionAnchorLineRef.current = null;
    setLineNumberMultiSelection([]);
    setCursorPosition(tab.id, 1, 1);
    setSearchHighlight(null);
    setTextSelectionHighlight(null);
    setPairHighlights([]);

    if (outlineFlashTimerRef.current) {
      window.clearTimeout(outlineFlashTimerRef.current);
      outlineFlashTimerRef.current = null;
    }

    setOutlineFlashLine(null);
  }, [setCursorPosition, tab.id]);

  useEffect(() => {
    const handleNavigateToLine = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabId?: string;
        line?: number;
        column?: number;
        length?: number;
        lineText?: string;
        occludedRightPx?: number;
        source?: string;
      }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      const targetLine = Number.isFinite(detail.line) ? Math.max(1, Math.floor(detail.line as number)) : 1;
      const targetColumn = Number.isFinite(detail.column) ? Math.max(1, Math.floor(detail.column as number)) : 1;
      const targetLength = Number.isFinite(detail.length) ? Math.max(0, Math.floor(detail.length as number)) : 0;
      const targetLineText = typeof detail.lineText === 'string' ? detail.lineText : '';
      const targetOccludedRightPx = Number.isFinite(detail.occludedRightPx)
        ? Math.max(0, Math.floor(detail.occludedRightPx as number))
        : 0;
      const shouldMoveCaretToLineStart = detail.source === 'outline';
      const targetCaretColumn = shouldMoveCaretToLineStart ? 1 : targetColumn;
      setActiveLineNumber(targetLine);
      setCursorPosition(tab.id, targetLine, targetCaretColumn);

      const placeCaretAtTargetPosition = () => {
        if (!contentRef.current) {
          return;
        }

        const lineForCaret = isHugeEditableMode
          ? Math.max(1, targetLine - editableSegmentRef.current.startLine)
          : targetLine;
        const columnForCaret = targetCaretColumn;

        setCaretToLineColumn(contentRef.current, lineForCaret, columnForCaret);
      };

      if (detail.source === 'outline') {
        if (outlineFlashTimerRef.current) {
          window.clearTimeout(outlineFlashTimerRef.current);
          outlineFlashTimerRef.current = null;
        }

        setOutlineFlashLine(targetLine);
        outlineFlashTimerRef.current = window.setTimeout(() => {
          setOutlineFlashLine(null);
          outlineFlashTimerRef.current = null;
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
      const lineNumberElement = lineNumberListRef.current?._outerRef as HTMLDivElement | undefined;

      if (isHugeEditableMode) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetScrollTop;
        }

        if (contentRef.current) {
          contentRef.current.focus();

          ensureSearchMatchVisibleHorizontally(
            scrollContainerRef.current,
            targetLine,
            targetColumn,
            targetLength,
            targetLineText,
            targetOccludedRightPx,
            listElement
          );

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

        if (lineNumberElement) {
          lineNumberElement.scrollTop = targetScrollTop;
        }

        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (isLargeReadOnlyMode) {
        if (listElement) {
          listElement.scrollTop = targetScrollTop;
        }

        if (lineNumberElement) {
          lineNumberElement.scrollTop = targetScrollTop;
        }
        void syncVisibleTokens(Math.max(1, tab.lineCount));
        return;
      }

      if (contentRef.current) {
        contentRef.current.scrollTop = targetScrollTop;
        contentRef.current.focus();

        ensureSearchMatchVisibleHorizontally(
          contentRef.current,
          targetLine,
          targetColumn,
          targetLength,
          targetLineText,
          targetOccludedRightPx,
          listElement
        );

        window.requestAnimationFrame(() => {
          placeCaretAtTargetPosition();
        });
      }

      if (listElement) {
        listElement.scrollTop = targetScrollTop;
      }

      if (lineNumberElement) {
        lineNumberElement.scrollTop = targetScrollTop;
      }

      void syncVisibleTokens(Math.max(1, tab.lineCount));
    };

    const handleSearchClose = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const detail = customEvent.detail;

      if (!detail || detail.tabId !== tab.id) {
        return;
      }

      setSearchHighlight(null);
    };

    window.addEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:navigate-to-outline', handleNavigateToLine as EventListener);
    window.addEventListener('rutar:search-close', handleSearchClose as EventListener);
    return () => {
      window.removeEventListener('rutar:navigate-to-line', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:navigate-to-outline', handleNavigateToLine as EventListener);
      window.removeEventListener('rutar:search-close', handleSearchClose as EventListener);
    };
  }, [
    ensureSearchMatchVisibleHorizontally,
    isHugeEditableMode,
    isLargeReadOnlyMode,
    itemSize,
    setCursorPosition,
    syncVisibleTokens,
    tab.id,
    tab.lineCount,
  ]);

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
      className={`flex-1 w-full h-full overflow-hidden bg-background relative editor-syntax-${activeSyntaxKey}`}
      tabIndex={isLargeReadOnlyMode ? 0 : -1}
      onPointerDown={handleLargeModePointerDown}
      onKeyDown={handleLargeModeEditIntent}
    >
      {!isLargeReadOnlyMode && isHugeEditableMode && (
        <div
          ref={scrollContainerRef}
          className="absolute top-0 bottom-0 right-0 z-20 outline-none overflow-auto editor-scroll-stable"
          style={{
            left: `${contentViewportLeftPx}px`,
            width: `${contentViewportWidth}px`,
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
              minWidth: wordWrap
                ? '100%'
                : `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`,
            }}
          >
            <textarea
              ref={contentRef}
              className="absolute left-0 right-0 editor-input-layer"
              style={{
                top: hugeEditablePaddingTop,
                height: hugeEditableSegmentHeightPx,
                width: wordWrap
                  ? '100%'
                  : `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`,
                right: 'auto',
                fontFamily: settings.fontFamily,
                fontSize: `${renderedFontSizePx}px`,
                lineHeight: `${lineHeightPx}px`,
                whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                tabSize,
                paddingLeft: contentTextPadding,
                paddingRight: contentTextRightPadding,
                paddingBottom: contentBottomSafetyPadding,
                resize: 'none',
                overflowX: 'hidden',
                overflowY: 'hidden',
              }}
              wrap={wordWrap ? 'soft' : 'off'}
              onInput={handleInput}
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
        <textarea
          ref={contentRef}
          className="absolute top-0 bottom-0 right-0 z-20 outline-none overflow-auto editor-input-layer editor-scroll-stable"
          style={{
            left: `${contentViewportLeftPx}px`,
            width: `${contentViewportWidth}px`,
            overflowX: horizontalOverflowMode,
            overflowY: 'auto',
            fontFamily: settings.fontFamily,
            fontSize: `${renderedFontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            tabSize,
            paddingLeft: contentTextPadding,
            paddingRight: contentTextRightPadding,
            paddingBottom: contentBottomSafetyPadding,
            resize: 'none',
          }}
          wrap={wordWrap ? 'soft' : 'off'}
          onInput={handleInput}
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
          className={`absolute top-0 bottom-0 right-0 z-10 overflow-hidden ${
            isLargeReadOnlyMode ? '' : 'pointer-events-none'
          }`}
          style={{
            left: `${contentViewportLeftPx}px`,
            width: `${contentViewportWidth}px`,
          }}
        >
          <List
            ref={listRef}
            height={height}
            width={contentViewportWidth}
            itemCount={tab.lineCount}
            itemSize={getListItemSize}
            estimatedItemSize={itemSize}
            onItemsRendered={onItemsRendered}
            overscanCount={20}
            style={{
              overflowX: isLargeReadOnlyMode ? horizontalOverflowMode : 'hidden',
              overflowY: isLargeReadOnlyMode ? 'auto' : 'hidden',
              paddingBottom: contentBottomSafetyPadding,
            }}
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
                    minWidth:
                      !wordWrap && isHugeEditableMode
                        ? `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`
                        : '100%',
                    paddingLeft: contentTextPadding,
                    paddingRight: contentTextRightPadding,
                    fontFamily: settings.fontFamily,
                    fontSize: `${renderedFontSizePx}px`,
                    lineHeight: `${lineHeightPx}px`,
                  }}
                className={`hover:bg-muted/5 text-foreground group editor-line flex items-start transition-colors duration-1000 ${
                    outlineFlashLine === index + 1
                      ? 'bg-primary/15 dark:bg-primary/20'
                      : lineNumberMultiSelectionSet.has(index + 1)
                      ? 'bg-blue-500/25 dark:bg-blue-500/20'
                      : highlightCurrentLine && activeLineNumber === index + 1
                      ? 'bg-accent/45 dark:bg-accent/25'
                      : ''
                  }`}
                >
                  <div
                    className={wordWrap ? 'min-w-0 flex-1' : 'shrink-0'}
                    style={{
                      whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                      tabSize,
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

      {width > 0 && height > 0 && showLineNumbers && (
        <div
          className="absolute left-0 top-0 bottom-0 z-30 border-r border-border/50 bg-background"
          style={{ width: `${lineNumberColumnWidthPx}px` }}
          onWheel={handleLineNumberWheel}
        >
          <List
            ref={lineNumberListRef}
            height={height}
            width={lineNumberColumnWidthPx}
            itemCount={tab.lineCount}
            itemSize={getListItemSize}
            estimatedItemSize={itemSize}
            overscanCount={20}
            style={{
              overflowX: 'hidden',
              overflowY: 'hidden',
            }}
          >
            {({ index, style }) => (
              <div
                style={{
                  ...style,
                  fontFamily: settings.fontFamily,
                  fontSize: `${alignToDevicePixel(Math.max(10, renderedFontSizePx - 2))}px`,
                  lineHeight: `${lineHeightPx}px`,
                }}
                className={`flex h-full items-start justify-end px-2 text-right transition-colors ${
                  bookmarks.includes(index + 1)
                    ? 'text-amber-500/90 font-semibold'
                    : lineNumberMultiSelectionSet.has(index + 1)
                    ? 'text-blue-600 dark:text-blue-300 font-semibold'
                    : 'text-muted-foreground/45'
                } pointer-events-auto cursor-pointer select-none`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const lineNumber = index + 1;

                  if (event.detail === 2) {
                    handleLineNumberDoubleClick(lineNumber);
                    return;
                  }

                  handleLineNumberClick(
                    lineNumber,
                    event.shiftKey,
                    event.ctrlKey || event.metaKey
                  );
                }}
              >
                {index + 1}
              </div>
            )}
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
          {editorContextMenu.hasSelection && (
            <div
              className="group/convert relative"
              onMouseEnter={(event) => {
                updateSubmenuVerticalAlignment('convert', event.currentTarget);
              }}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <span>{convertMenuLabel}</span>
                <span className="text-[10px] text-muted-foreground">▶</span>
              </button>
              <div
                ref={(element) => {
                  submenuPanelRefs.current.convert = element;
                }}
                style={convertSubmenuStyle}
                className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${convertSubmenuPositionClassName} group-hover/convert:pointer-events-auto group-hover/convert:visible group-hover/convert:opacity-100`}
              >
                <button
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleConvertSelectionFromContext('base64_encode');
                  }}
                >
                  {convertBase64EncodeLabel}
                </button>
                <button
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleConvertSelectionFromContext('base64_decode');
                  }}
                >
                  {convertBase64DecodeLabel}
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleConvertSelectionFromContext('copy_base64_encode');
                  }}
                >
                  {copyBase64EncodeResultLabel}
                </button>
                <button
                  type="button"
                  className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    void handleConvertSelectionFromContext('copy_base64_decode');
                  }}
                >
                  {copyBase64DecodeResultLabel}
                </button>
              </div>
            </div>
          )}
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

      <div
        className={`pointer-events-none fixed bottom-6 right-6 z-[100] rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 shadow-lg transition-all dark:text-red-200 ${
          showBase64DecodeErrorToast ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
        role="status"
        aria-live="polite"
      >
        {base64DecodeFailedToastLabel}
      </div>
    </div>
  );
}
