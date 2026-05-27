import type * as monaco from 'monaco-editor';

const DEFAULT_HORIZONTAL_SCROLLBAR_SIZE = 12;
const FALLBACK_WORD_WRAP_COLUMN = 80;
const MIN_WORD_WRAP_COLUMN = 20;
const WORD_WRAP_COLUMN_RATIO = 0.92;

type MonacoLayoutForWrapping = Pick<monaco.editor.EditorLayoutInfo, 'viewportColumn'>;

export interface MonacoWordWrapOptions {
  wordWrap: 'off' | 'bounded';
  wordWrapColumn: number;
  wrappingStrategy: 'simple';
  scrollBeyondLastColumn: 0;
}

export interface MonacoWordWrapColumnRef {
  current: number | null;
}

export function resolveMonacoWordWrapColumn(layoutInfo: MonacoLayoutForWrapping | null | undefined): number {
  const viewportColumn = layoutInfo?.viewportColumn;
  if (typeof viewportColumn !== 'number' || !Number.isFinite(viewportColumn) || viewportColumn <= 0) {
    return FALLBACK_WORD_WRAP_COLUMN;
  }

  return Math.max(MIN_WORD_WRAP_COLUMN, Math.floor(viewportColumn * WORD_WRAP_COLUMN_RATIO));
}

export function resolveMonacoWordWrapOptions(
  enabled: boolean,
  layoutInfo?: MonacoLayoutForWrapping | null
): MonacoWordWrapOptions {
  return {
    wordWrap: enabled ? 'bounded' : 'off',
    wordWrapColumn: resolveMonacoWordWrapColumn(layoutInfo),
    wrappingStrategy: 'simple',
    scrollBeyondLastColumn: 0,
  };
}

export function resolveMonacoScrollbarOptions(
  wordWrap: boolean,
  overrides: monaco.editor.IEditorScrollbarOptions = {}
): monaco.editor.IEditorScrollbarOptions {
  return {
    horizontal: wordWrap ? 'hidden' : 'auto',
    horizontalScrollbarSize: wordWrap ? 0 : DEFAULT_HORIZONTAL_SCROLLBAR_SIZE,
    ignoreHorizontalScrollbarInContentHeight: wordWrap,
    ...overrides,
  };
}

export function updateMonacoWordWrapColumn(
  editor: monaco.editor.IStandaloneCodeEditor,
  enabled: boolean,
  layoutInfo: MonacoLayoutForWrapping | null | undefined,
  wordWrapColumnRef: MonacoWordWrapColumnRef
) {
  const nextColumn = resolveMonacoWordWrapColumn(layoutInfo);
  if (wordWrapColumnRef.current === nextColumn) {
    return;
  }

  wordWrapColumnRef.current = nextColumn;
  if (enabled) {
    editor.updateOptions({ wordWrapColumn: nextColumn });
  }
}