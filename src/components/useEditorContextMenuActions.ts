import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';

type EditorContextAction = 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll';

interface UseEditorContextMenuActionsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  editorContextMenuHasSelection: boolean;
  lineNumberMultiSelection: number[];
  normalizedRectangularSelection: unknown;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
  clearLineNumberMultiSelection: () => void;
  buildLineNumberSelectionRangeText: (text: string, selectedLines: number[]) => string;
  applyLineNumberMultiSelectionEdit: (mode: 'cut' | 'delete') => Promise<boolean>;
  getRectangularSelectionTextFromBackend: () => Promise<string>;
  replaceRectangularSelection: (insertText: string) => Promise<boolean>;
  syncSelectionAfterInteraction: () => void;
  getRectangularSelectionText: (text: string) => string;
  getSelectedEditorText: () => string;
  clearRectangularSelection: () => void;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  setSelectionToCodeUnitOffsets: (element: HTMLTextAreaElement, startOffset: number, endOffset: number) => void;
  replaceSelectionWithText: (element: HTMLTextAreaElement, nextText: string) => boolean;
  dispatchEditorInputEvent: (element: HTMLTextAreaElement) => void;
  handleScroll: () => void;
}

export function useEditorContextMenuActions({
  contentRef,
  editorContextMenuHasSelection,
  lineNumberMultiSelection,
  normalizedRectangularSelection,
  setEditorContextMenu,
  clearLineNumberMultiSelection,
  buildLineNumberSelectionRangeText,
  applyLineNumberMultiSelectionEdit,
  getRectangularSelectionTextFromBackend,
  replaceRectangularSelection,
  syncSelectionAfterInteraction,
  getRectangularSelectionText,
  getSelectedEditorText,
  clearRectangularSelection,
  normalizeSegmentText,
  getEditableText,
  setSelectionToCodeUnitOffsets,
  replaceSelectionWithText,
  dispatchEditorInputEvent,
  handleScroll,
}: UseEditorContextMenuActionsParams) {
  const runEditorContextCommand = useCallback((action: EditorContextAction) => {
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
      const deleted = replaceSelectionWithText(contentRef.current, '');
      if (deleted) {
        dispatchEditorInputEvent(contentRef.current);
      }
      return deleted;
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
        const cut = replaceSelectionWithText(contentRef.current, '');
        if (cut) {
          dispatchEditorInputEvent(contentRef.current);
        }
        return cut;
      }

      return true;
    }

    return false;
  }, [
    clearRectangularSelection,
    contentRef,
    dispatchEditorInputEvent,
    getEditableText,
    getRectangularSelectionText,
    getSelectedEditorText,
    normalizeSegmentText,
    normalizedRectangularSelection,
    replaceRectangularSelection,
    replaceSelectionWithText,
    setSelectionToCodeUnitOffsets,
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
    [contentRef, dispatchEditorInputEvent, handleScroll, replaceSelectionWithText, syncSelectionAfterInteraction]
  );

  const isEditorContextMenuActionDisabled = useCallback(
    (action: EditorContextAction) => {
      const hasSelection = !!editorContextMenuHasSelection;

      switch (action) {
        case 'copy':
          return !hasSelection;
        case 'cut':
        case 'delete':
          return !hasSelection;
        case 'paste':
          return false;
        case 'selectAll':
          return false;
        default:
          return false;
      }
    },
    [editorContextMenuHasSelection]
  );

  const handleEditorContextMenuAction = useCallback(
    async (action: EditorContextAction) => {
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

        try {
          const clipboardText = await readClipboardText();
          pasted = tryPasteTextIntoEditor(clipboardText);
        } catch (error) {
          console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
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
      contentRef,
      getEditableText,
      getRectangularSelectionTextFromBackend,
      isEditorContextMenuActionDisabled,
      lineNumberMultiSelection,
      normalizeSegmentText,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      runEditorContextCommand,
      setEditorContextMenu,
      syncSelectionAfterInteraction,
      tryPasteTextIntoEditor,
    ]
  );

  return {
    tryPasteTextIntoEditor,
    isEditorContextMenuActionDisabled,
    handleEditorContextMenuAction,
  };
}
