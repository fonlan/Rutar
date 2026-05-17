import * as monaco from 'monaco-editor';
import { useCallback, type MutableRefObject } from 'react';
import { useQuotePairHighlight } from './useQuotePairHighlight';

export type DiffPane = 'source' | 'target';

type DiffPaneTab = { largeFileMode?: boolean } | null | undefined;

// Wraps two independent `useQuotePairHighlight` instances (one per pane) and
// dispatches by `side`, preserving the original API surface used by
// `DiffEditor.tsx`.
export function useDiffPairAutocomplete(
  sourceEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  targetEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  sourceTab: DiffPaneTab,
  targetTab: DiffPaneTab,
) {
  const { clear: clearSource, update: updateSource } = useQuotePairHighlight({
    editorRef: sourceEditorRef,
    largeFileMode: !!sourceTab?.largeFileMode,
    errorLabel: 'source diff pane',
  });
  const { clear: clearTarget, update: updateTarget } = useQuotePairHighlight({
    editorRef: targetEditorRef,
    largeFileMode: !!targetTab?.largeFileMode,
    errorLabel: 'target diff pane',
  });

  const clearPaneQuotePairDecorations = useCallback(
    (side: DiffPane, targetEditor: monaco.editor.IStandaloneCodeEditor | null) => {
      if (side === 'source') {
        clearSource(targetEditor);
      } else {
        clearTarget(targetEditor);
      }
    },
    [clearSource, clearTarget],
  );

  const updatePaneQuotePairDecorations = useCallback(
    async (side: DiffPane) => {
      if (side === 'source') {
        await updateSource();
      } else {
        await updateTarget();
      }
    },
    [updateSource, updateTarget],
  );

  return { clearPaneQuotePairDecorations, updatePaneQuotePairDecorations };
}
