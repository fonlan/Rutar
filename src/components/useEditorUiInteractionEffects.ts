import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';
import type { VerticalSelectionState } from './Editor.types';

interface UseEditorUiInteractionEffectsParams {
  selectionChangeRafRef: MutableRefObject<number | null>;
  pointerSelectionActiveRef: MutableRefObject<boolean>;
  verticalSelectionRef: MutableRefObject<VerticalSelectionState | null>;
  hasSelectionInsideEditor: () => boolean;
  clearVerticalSelectionState: () => void;
  handleScroll: () => void;
  syncSelectionState: () => void;
  syncTextSelectionHighlight: () => void;
  editorContextMenu: EditorContextMenuState | null;
  editorContextMenuRef: MutableRefObject<HTMLDivElement | null>;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
}

export function useEditorUiInteractionEffects({
  selectionChangeRafRef,
  pointerSelectionActiveRef,
  verticalSelectionRef,
  hasSelectionInsideEditor,
  clearVerticalSelectionState,
  handleScroll,
  syncSelectionState,
  syncTextSelectionHighlight,
  editorContextMenu,
  editorContextMenuRef,
  setEditorContextMenu,
}: UseEditorUiInteractionEffectsParams) {
  useEffect(() => {
    const flushSelectionChange = () => {
      selectionChangeRafRef.current = null;

      if (verticalSelectionRef.current && !hasSelectionInsideEditor()) {
        clearVerticalSelectionState();
      }

      if (pointerSelectionActiveRef.current) {
        return;
      }

      handleScroll();

      syncSelectionState();
      syncTextSelectionHighlight();
    };

    const handleSelectionChange = () => {
      if (selectionChangeRafRef.current !== null) {
        return;
      }

      selectionChangeRafRef.current = window.requestAnimationFrame(flushSelectionChange);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (selectionChangeRafRef.current !== null) {
        window.cancelAnimationFrame(selectionChangeRafRef.current);
        selectionChangeRafRef.current = null;
      }
    };
  }, [
    clearVerticalSelectionState,
    handleScroll,
    hasSelectionInsideEditor,
    selectionChangeRafRef,
    syncSelectionState,
    syncTextSelectionHighlight,
    pointerSelectionActiveRef,
    verticalSelectionRef,
  ]);

  useEffect(() => {
    if (!editorContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (editorContextMenuRef.current && target && !editorContextMenuRef.current.contains(target)) {
        setEditorContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditorContextMenu(null);
      }
    };

    const handleWindowBlur = () => {
      setEditorContextMenu(null);
    };

    const handleScroll = () => {
      setEditorContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('resize', handleWindowBlur);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('resize', handleWindowBlur);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editorContextMenu, editorContextMenuRef, setEditorContextMenu]);
}
