import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';
import type { PairHighlightPosition, SearchHighlightState, TextSelectionState } from './Editor.types';

interface UseEditorLocalLifecycleEffectsParams {
  isPairHighlightEnabled: boolean;
  setPairHighlights: (updater: PairHighlightPosition[] | ((prev: PairHighlightPosition[]) => PairHighlightPosition[])) => void;
  base64DecodeErrorToastTimerRef: MutableRefObject<number | null>;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
  lineNumberContextLineRef: MutableRefObject<number | null>;
  clearRectangularSelection: () => void;
  textDragCursorAppliedRef: MutableRefObject<boolean>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  textDragMoveStateRef: MutableRefObject<any>;
  tabId: string;
  highlightCurrentLine: boolean;
  syncSelectionState: () => void;
  tryPasteTextIntoEditor: (text: string) => boolean;
  setActiveLineNumber: (lineNumber: number) => void;
  lineNumberSelectionAnchorLineRef: MutableRefObject<number | null>;
  setLineNumberMultiSelection: (lineNumbers: number[]) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
  setSearchHighlight: (value: SearchHighlightState | null) => void;
  setTextSelectionHighlight: (value: TextSelectionState | null) => void;
  outlineFlashTimerRef: MutableRefObject<number | null>;
  setOutlineFlashLine: (lineNumber: number | null) => void;
}

export function useEditorLocalLifecycleEffects({
  isPairHighlightEnabled,
  setPairHighlights,
  base64DecodeErrorToastTimerRef,
  setEditorContextMenu,
  lineNumberContextLineRef,
  clearRectangularSelection,
  textDragCursorAppliedRef,
  contentRef,
  textDragMoveStateRef,
  tabId,
  highlightCurrentLine,
  syncSelectionState,
  tryPasteTextIntoEditor,
  setActiveLineNumber,
  lineNumberSelectionAnchorLineRef,
  setLineNumberMultiSelection,
  setCursorPosition,
  setSearchHighlight,
  setTextSelectionHighlight,
  outlineFlashTimerRef,
  setOutlineFlashLine,
}: UseEditorLocalLifecycleEffectsParams) {
  useEffect(() => {
    if (isPairHighlightEnabled) {
      return;
    }

    setPairHighlights((prev) => (prev.length === 0 ? prev : []));
  }, [isPairHighlightEnabled, setPairHighlights]);

  useEffect(() => {
    return () => {
      if (base64DecodeErrorToastTimerRef.current !== null) {
        window.clearTimeout(base64DecodeErrorToastTimerRef.current);
      }
    };
  }, [base64DecodeErrorToastTimerRef]);

  useEffect(() => {
    setEditorContextMenu(null);
    lineNumberContextLineRef.current = null;
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
  }, [clearRectangularSelection, contentRef, lineNumberContextLineRef, setEditorContextMenu, tabId, textDragCursorAppliedRef, textDragMoveStateRef]);

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
      if (!detail || detail.tabId !== tabId) {
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
  }, [tabId, tryPasteTextIntoEditor]);

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
  }, [contentRef, textDragCursorAppliedRef, textDragMoveStateRef]);

  useEffect(() => {
    setActiveLineNumber(1);
    lineNumberSelectionAnchorLineRef.current = null;
    setLineNumberMultiSelection([]);
    setCursorPosition(tabId, 1, 1);
    setSearchHighlight(null);
    setTextSelectionHighlight(null);
    setPairHighlights([]);

    if (outlineFlashTimerRef.current) {
      window.clearTimeout(outlineFlashTimerRef.current);
      outlineFlashTimerRef.current = null;
    }

    setOutlineFlashLine(null);
  }, [
    lineNumberSelectionAnchorLineRef,
    outlineFlashTimerRef,
    setActiveLineNumber,
    setCursorPosition,
    setLineNumberMultiSelection,
    setOutlineFlashLine,
    setPairHighlights,
    setSearchHighlight,
    setTextSelectionHighlight,
    tabId,
  ]);
}
