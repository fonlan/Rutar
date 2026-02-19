import type { EditorSubmenuKey } from './EditorContextMenu';

export interface SyntaxToken {
  type?: string;
  text?: string;
  start_byte?: number;
  end_byte?: number;
}

export interface EditorSegmentState {
  startLine: number;
  endLine: number;
  text: string;
}

export interface SearchHighlightState {
  line: number;
  column: number;
  length: number;
  id: number;
}

export interface PairHighlightPosition {
  line: number;
  column: number;
}

export type EditorSubmenuVerticalAlign = 'top' | 'bottom';

export const DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign> = {
  edit: 'top',
  sort: 'top',
  convert: 'top',
  bookmark: 'top',
};

export const DEFAULT_SUBMENU_MAX_HEIGHTS: Record<EditorSubmenuKey, number | null> = {
  edit: null,
  sort: null,
  convert: null,
  bookmark: null,
};

export interface VerticalSelectionState {
  baseLine: number;
  baseColumn: number;
  focusLine: number;
}

export interface RectangularSelectionState {
  anchorLine: number;
  anchorColumn: number;
  focusLine: number;
  focusColumn: number;
}

export interface TextSelectionState {
  start: number;
  end: number;
}

export interface ToggleLineCommentsBackendResult {
  changed: boolean;
  lineCount: number;
  documentVersion: number;
  selectionStartChar: number;
  selectionEndChar: number;
}

export interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
  leftLine?: number;
  leftColumn?: number;
  rightLine?: number;
  rightColumn?: number;
}

export interface ReplaceRectangularSelectionResultPayload {
  nextText: string;
  caretOffset: number;
}

export interface TextDragMoveState {
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

export type EditorInputElement = HTMLDivElement | HTMLTextAreaElement;
