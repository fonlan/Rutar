import { invoke } from '@tauri-apps/api/core';
import * as monaco from 'monaco-editor';
import { useCallback, useRef, type MutableRefObject } from 'react';
import { isQuoteCharacter, type PairOffsetsResultPayload } from '@/lib/pairOffsets';

export type DiffPane = 'source' | 'target';

type DiffPaneTab = { largeFileMode?: boolean } | null | undefined;

const MATCHING_QUOTE_HIGHLIGHT_CLASS_NAME = 'rutar-matching-quote-highlight';

// Encapsulates the matching-quote highlight pipeline for both diff panes.
// Each pane keeps an independent request sequence so racing invokes for one
// side never stomp the other; the caller still wires the call sites because
// the diff editor reacts to many different events.
export function useDiffPairAutocomplete(
  sourceEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  targetEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  sourceTab: DiffPaneTab,
  targetTab: DiffPaneTab,
) {
  const sourceDecorationIdsRef = useRef<string[]>([]);
  const targetDecorationIdsRef = useRef<string[]>([]);
  const requestSeqRef = useRef({ source: 0, target: 0 });

  const clearPaneQuotePairDecorations = useCallback(
    (side: DiffPane, targetEditor: monaco.editor.IStandaloneCodeEditor | null) => {
      requestSeqRef.current[side] += 1;
      const decorationIdsRef = side === 'source' ? sourceDecorationIdsRef : targetDecorationIdsRef;
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

  const updatePaneQuotePairDecorations = useCallback(
    async (side: DiffPane) => {
      const editor = side === 'source' ? sourceEditorRef.current : targetEditorRef.current;
      const paneTab = side === 'source' ? sourceTab : targetTab;
      const model = editor?.getModel();
      if (!editor || !model || paneTab?.largeFileMode) {
        clearPaneQuotePairDecorations(side, editor ?? null);
        return;
      }
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        clearPaneQuotePairDecorations(side, editor);
        return;
      }
      const position = editor.getPosition();
      if (!position) {
        clearPaneQuotePairDecorations(side, editor);
        return;
      }
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const leftChar = offset > 0 ? text.charAt(offset - 1) : '';
      const rightChar = offset < text.length ? text.charAt(offset) : '';
      if (!isQuoteCharacter(leftChar) && !isQuoteCharacter(rightChar)) {
        clearPaneQuotePairDecorations(side, editor);
        return;
      }
      const requestSeq = requestSeqRef.current[side] + 1;
      requestSeqRef.current[side] = requestSeq;
      try {
        const payload = await invoke<PairOffsetsResultPayload | null>('find_matching_pair_offsets', {
          text,
          offset,
        });
        if (requestSeqRef.current[side] !== requestSeq) {
          return;
        }
        const currentEditor = side === 'source' ? sourceEditorRef.current : targetEditorRef.current;
        if (!currentEditor || currentEditor !== editor) {
          return;
        }
        if (!payload) {
          clearPaneQuotePairDecorations(side, editor);
          return;
        }
        const leftQuote = text.charAt(payload.leftOffset);
        const rightQuote = text.charAt(payload.rightOffset);
        if (!isQuoteCharacter(leftQuote) || leftQuote !== rightQuote) {
          clearPaneQuotePairDecorations(side, editor);
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
        const decorationIdsRef = side === 'source' ? sourceDecorationIdsRef : targetDecorationIdsRef;
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, nextDecorations);
      } catch (error) {
        if (requestSeqRef.current[side] === requestSeq) {
          clearPaneQuotePairDecorations(side, editor);
        }
        console.error(`Failed to resolve matching quote pair for ${side} diff pane:`, error);
      }
    },
    [clearPaneQuotePairDecorations, sourceEditorRef, sourceTab, targetEditorRef, targetTab],
  );

  return { clearPaneQuotePairDecorations, updatePaneQuotePairDecorations };
}
