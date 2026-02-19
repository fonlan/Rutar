import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState, EditorConvertAction } from './EditorContextMenu';

interface UseEditorContextConvertActionsParams {
  editorContextMenuHasSelection: boolean;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  normalizedRectangularSelection: unknown;
  base64DecodeErrorToastTimerRef: MutableRefObject<number | null>;
  setShowBase64DecodeErrorToast: (value: boolean) => void;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
  getRectangularSelectionTextFromBackend: () => Promise<string>;
  getSelectedEditorText: () => string;
  replaceRectangularSelection: (insertText: string) => Promise<boolean>;
  replaceSelectionWithText: (element: HTMLTextAreaElement, nextText: string) => boolean;
  dispatchEditorInputEvent: (element: HTMLTextAreaElement) => void;
  syncSelectionAfterInteraction: () => void;
  writePlainTextToClipboard: (text: string) => Promise<void>;
}

export function useEditorContextConvertActions({
  editorContextMenuHasSelection,
  contentRef,
  normalizedRectangularSelection,
  base64DecodeErrorToastTimerRef,
  setShowBase64DecodeErrorToast,
  setEditorContextMenu,
  getRectangularSelectionTextFromBackend,
  getSelectedEditorText,
  replaceRectangularSelection,
  replaceSelectionWithText,
  dispatchEditorInputEvent,
  syncSelectionAfterInteraction,
  writePlainTextToClipboard,
}: UseEditorContextConvertActionsParams) {
  const triggerBase64DecodeErrorToast = useCallback(() => {
    if (base64DecodeErrorToastTimerRef.current !== null) {
      window.clearTimeout(base64DecodeErrorToastTimerRef.current);
    }

    setShowBase64DecodeErrorToast(true);
    base64DecodeErrorToastTimerRef.current = window.setTimeout(() => {
      setShowBase64DecodeErrorToast(false);
      base64DecodeErrorToastTimerRef.current = null;
    }, 2200);
  }, [base64DecodeErrorToastTimerRef, setShowBase64DecodeErrorToast]);

  const handleConvertSelectionFromContext = useCallback(
    async (action: EditorConvertAction) => {
      const shouldCopyResult = action === 'copy_base64_encode' || action === 'copy_base64_decode';
      const shouldDecode = action === 'base64_decode' || action === 'copy_base64_decode';

      if (!editorContextMenuHasSelection || !contentRef.current) {
        setEditorContextMenu(null);
        return;
      }

      const selectedText = normalizedRectangularSelection
        ? await getRectangularSelectionTextFromBackend()
        : getSelectedEditorText();
      if (!selectedText) {
        setEditorContextMenu(null);
        return;
      }

      let nextText = '';

      try {
        nextText = await invoke<string>('convert_text_base64', {
          text: selectedText,
          action: shouldDecode ? 'base64_decode' : 'base64_encode',
        });
      } catch (error) {
        if (shouldDecode) {
          triggerBase64DecodeErrorToast();
        } else {
          console.error('Failed to convert Base64 text:', error);
        }
        setEditorContextMenu(null);
        return;
      }

      if (shouldCopyResult) {
        void writePlainTextToClipboard(nextText).catch((error) => {
          console.warn('Failed to write conversion result to clipboard:', error);
        });
        setEditorContextMenu(null);
        return;
      }

      if (normalizedRectangularSelection) {
        void replaceRectangularSelection(nextText);
      } else {
        const replaced = replaceSelectionWithText(contentRef.current, nextText);
        if (replaced) {
          dispatchEditorInputEvent(contentRef.current);
          syncSelectionAfterInteraction();
        }
      }

      setEditorContextMenu(null);
    },
    [
      contentRef,
      dispatchEditorInputEvent,
      editorContextMenuHasSelection,
      getRectangularSelectionTextFromBackend,
      getSelectedEditorText,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      replaceSelectionWithText,
      setEditorContextMenu,
      syncSelectionAfterInteraction,
      triggerBase64DecodeErrorToast,
      writePlainTextToClipboard,
    ]
  );

  return {
    handleConvertSelectionFromContext,
  };
}
