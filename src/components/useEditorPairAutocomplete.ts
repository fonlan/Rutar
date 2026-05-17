import * as monaco from 'monaco-editor';
import { type MutableRefObject } from 'react';
import { useQuotePairHighlight } from './useQuotePairHighlight';

// Thin wrapper kept for backward-compatible call sites in `Editor.tsx`.
// Internals are shared with `useDiffPairAutocomplete` via `useQuotePairHighlight`.
export function useEditorPairAutocomplete(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  largeFileMode: boolean,
) {
  const { clear, update } = useQuotePairHighlight({
    editorRef,
    largeFileMode,
    errorLabel: 'Monaco editor',
  });

  return {
    clearQuotePairDecorations: clear,
    updateQuotePairDecorations: update,
  };
}
