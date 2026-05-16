import * as monaco from 'monaco-editor';
import { useEffect, useRef, type MutableRefObject } from 'react';

const BOOKMARK_LINE_NUMBER_CLASS_NAME = 'rutar-bookmark-line-number-highlight';

// Paints the gutter-bookmark highlights for the active tab. The hook owns the
// Monaco decoration IDs so they survive across renders and clear cleanly when
// the model is swapped or torn down.
export function useEditorBookmarkDecorations(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  bookmarks: number[],
  tabId: string,
) {
  const decorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
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
    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      nextDecorations,
    );
  }, [bookmarks, tabId, editorRef]);
}
