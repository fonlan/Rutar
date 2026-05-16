import { invoke } from '@tauri-apps/api/core';
import * as monaco from 'monaco-editor';
import { useCallback, useRef, type MutableRefObject } from 'react';
import { isQuoteCharacter, type PairOffsetsResultPayload } from '@/lib/pairOffsets';

const MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME = 'rutar-matching-quote-highlight';

// Encapsulates the matching-quote highlight pipeline used by the main editor:
// requests the paired offset from the Rust side, validates that the caret is
// still on a matching quote, and applies / clears inline decorations.
// The hook returns `clear` and `update` so the editor lifecycle and event
// callbacks keep their current call sites.
export function useEditorPairAutocomplete(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  largeFileMode: boolean,
) {
  const decorationIdsRef = useRef<string[]>([]);
  const requestSeqRef = useRef(0);

  const clearQuotePairDecorations = useCallback(
    (targetEditor: monaco.editor.IStandaloneCodeEditor | null) => {
      requestSeqRef.current += 1;
      if (!targetEditor) {
        decorationIdsRef.current = [];
        return;
      }
      if (decorationIdsRef.current.length === 0) {
        return;
      }
      decorationIdsRef.current = targetEditor.deltaDecorations(decorationIdsRef.current, []);
    },
    [],
  );

  const updateQuotePairDecorations = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || largeFileMode) {
      clearQuotePairDecorations(editor ?? null);
      return;
    }

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      clearQuotePairDecorations(editor);
      return;
    }

    const position = editor.getPosition();
    if (!position) {
      clearQuotePairDecorations(editor);
      return;
    }

    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const leftChar = offset > 0 ? text.charAt(offset - 1) : '';
    const rightChar = offset < text.length ? text.charAt(offset) : '';
    if (!isQuoteCharacter(leftChar) && !isQuoteCharacter(rightChar)) {
      clearQuotePairDecorations(editor);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    try {
      const payload = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
        text,
        offset,
      });
      if (requestSeqRef.current !== requestSeq || editorRef.current !== editor) {
        return;
      }
      if (!payload) {
        clearQuotePairDecorations(editor);
        return;
      }

      const leftQuote = text.charAt(payload.leftOffset);
      const rightQuote = text.charAt(payload.rightOffset);
      if (!isQuoteCharacter(leftQuote) || leftQuote !== rightQuote) {
        clearQuotePairDecorations(editor);
        return;
      }

      const lineCount = Math.max(1, model.getLineCount());
      const leftLine = Math.max(1, Math.min(payload.leftLine, lineCount));
      const rightLine = Math.max(1, Math.min(payload.rightLine, lineCount));
      const leftColumn = Math.max(1, payload.leftColumn);
      const rightColumn = Math.max(1, payload.rightColumn);
      const nextDecorations: monaco.editor.IModelDeltaDecoration[] = [
        {
          range: {
            startLineNumber: leftLine,
            startColumn: leftColumn,
            endLineNumber: leftLine,
            endColumn: leftColumn + 1,
          },
          options: {
            inlineClassName: MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME,
          },
        },
        {
          range: {
            startLineNumber: rightLine,
            startColumn: rightColumn,
            endLineNumber: rightLine,
            endColumn: rightColumn + 1,
          },
          options: {
            inlineClassName: MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME,
          },
        },
      ];
      decorationIdsRef.current = editor.deltaDecorations(
        decorationIdsRef.current,
        nextDecorations,
      );
    } catch (error) {
      if (requestSeqRef.current === requestSeq && editorRef.current === editor) {
        clearQuotePairDecorations(editor);
      }
      console.error('Failed to resolve matching quote pair in Monaco editor:', error);
    }
  }, [clearQuotePairDecorations, editorRef, largeFileMode]);

  return { clearQuotePairDecorations, updateQuotePairDecorations };
}
