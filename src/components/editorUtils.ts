// @ts-nocheck

interface CodeUnitDiff {
  start: number;
  end: number;
  newText: string;
}

interface PairHighlightPosition {
  line: number;
  column: number;
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

type EditorInputElement = HTMLDivElement | HTMLTextAreaElement;

const EMPTY_LINE_PLACEHOLDER = '\u200B';
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const HTTP_URL_TRAILING_PUNCTUATION_PATTERN = /[),.;:!?]+$/;
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

function focusEditorInputWithoutScroll(element: EditorInputElement) {
  if (document.activeElement === element) {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
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
    const previousScrollTop = element.scrollTop;
    const previousScrollLeft = element.scrollLeft;
    if (element.value !== content) {
      element.value = content;
    }

    const layerOffset = mapLogicalOffsetToInputLayerOffset(content, targetOffset);
    const safeOffset = Math.min(layerOffset, content.length);
    focusEditorInputWithoutScroll(element);
    element.setSelectionRange(safeOffset, safeOffset);
    if (Math.abs(element.scrollTop - previousScrollTop) > 0.001) {
      element.scrollTop = previousScrollTop;
    }
    if (Math.abs(element.scrollLeft - previousScrollLeft) > 0.001) {
      element.scrollLeft = previousScrollLeft;
    }
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
    focusEditorInputWithoutScroll(element);

    const maxOffset = getEditableText(element).length;
    const safeOffset = Math.min(targetOffset, maxOffset);
    element.setSelectionRange(safeOffset, safeOffset);
    return;
  }

  focusEditorInputWithoutScroll(element);

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
    focusEditorInputWithoutScroll(element);

    const maxOffset = getEditableText(element).length;
    const normalizedStart = Math.min(safeStartOffset, maxOffset);
    const normalizedEnd = Math.min(safeEndOffset, maxOffset);
    const rangeStart = Math.min(normalizedStart, normalizedEnd);
    const rangeEnd = Math.max(normalizedStart, normalizedEnd);
    element.setSelectionRange(rangeStart, rangeEnd);
    return;
  }

  focusEditorInputWithoutScroll(element);

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

function trimHttpUrlCandidate(rawUrl: string) {
  if (!rawUrl) {
    return '';
  }

  return rawUrl.replace(HTTP_URL_TRAILING_PUNCTUATION_PATTERN, '');
}

function getHttpUrlRangesInLine(lineText: string) {
  if (!lineText) {
    return [];
  }

  const regex = new RegExp(HTTP_URL_PATTERN.source, 'gi');
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(lineText)) !== null) {
    const rawUrl = match[0] ?? '';
    const trimmedUrl = trimHttpUrlCandidate(rawUrl);
    if (!trimmedUrl) {
      continue;
    }

    const start = match.index;
    const end = start + trimmedUrl.length;
    if (end <= start) {
      continue;
    }

    ranges.push({ start, end });
  }

  return ranges;
}

function getHttpUrlAtTextOffset(text: string, offset: number) {
  const normalizedText = normalizeLineText(text || '');
  if (!normalizedText) {
    return null;
  }

  const safeOffset = Math.max(0, Math.min(Math.floor(offset), normalizedText.length));
  const lineStart = normalizedText.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  const lineEndIndex = normalizedText.indexOf('\n', safeOffset);
  const lineEnd = lineEndIndex === -1 ? normalizedText.length : lineEndIndex;
  const lineText = normalizedText.slice(lineStart, lineEnd);
  if (!lineText) {
    return null;
  }

  const ranges = getHttpUrlRangesInLine(lineText);
  for (const range of ranges) {
    const matchStart = lineStart + range.start;
    const matchEnd = lineStart + range.end;
    if (safeOffset >= matchStart && safeOffset <= matchEnd) {
      return lineText.slice(range.start, range.end);
    }
  }

  return null;
}

function appendClassName(baseClassName: string, extraClassName: string) {
  if (!extraClassName) {
    return baseClassName;
  }

  return baseClassName ? `${baseClassName} ${extraClassName}` : extraClassName;
}

function dispatchDocumentUpdated(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:document-updated', {
      detail: { tabId },
    })
  );
}

export const editorTestUtils = {
  isToggleLineCommentShortcut,
  isVerticalSelectionShortcut,
  isTextareaInputElement,
  setInputLayerText,
  getEditableText,
  normalizeEditorText,
  normalizeLineText,
  normalizeEditableLineText,
  normalizeSegmentText,
  toInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  getCaretLineInElement,
  getSelectionOffsetsInElement,
  getSelectionAnchorFocusOffsetsInElement,
  getLogicalOffsetFromDomPoint,
  getLogicalOffsetFromPoint,
  getCodeUnitOffsetFromLineColumn,
  setCaretToLineColumn,
  codeUnitOffsetToLineColumn,
  arePairHighlightPositionsEqual,
  buildCodeUnitDiff,
  codeUnitOffsetToUnicodeScalarIndex,
  alignToDevicePixel,
  alignScrollOffset,
  normalizeRectangularSelection,
  buildLineStartOffsets,
  getLineBoundsByLineNumber,
  getOffsetForColumnInLine,
  setCaretToCodeUnitOffset,
  setSelectionToCodeUnitOffsets,
  dispatchEditorInputEvent,
  normalizeInputLayerDom,
  writePlainTextToClipboard,
  replaceSelectionWithText,
  isPointerOnScrollbar,
  trimHttpUrlCandidate,
  getHttpUrlRangesInLine,
  getHttpUrlAtTextOffset,
  appendClassName,
  dispatchDocumentUpdated,
};


