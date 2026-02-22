import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';
import type { VerticalSelectionState } from './Editor.types';

interface UseEditorUiInteractionEffectsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  selectionChangeRafRef: MutableRefObject<number | null>;
  pointerSelectionActiveRef: MutableRefObject<boolean>;
  verticalSelectionRef: MutableRefObject<VerticalSelectionState | null>;
  hasSelectionInsideEditor: () => boolean;
  clearVerticalSelectionState: () => void;
  handleScroll: () => void;
  syncActiveLineStateNow: () => void;
  syncSelectionState: () => void;
  syncTextSelectionHighlight: () => void;
  editorContextMenu: EditorContextMenuState | null;
  editorContextMenuRef: MutableRefObject<HTMLDivElement | null>;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
}

export function useEditorUiInteractionEffects({
  contentRef,
  selectionChangeRafRef,
  pointerSelectionActiveRef,
  verticalSelectionRef,
  hasSelectionInsideEditor,
  clearVerticalSelectionState,
  handleScroll,
  syncActiveLineStateNow,
  syncSelectionState,
  syncTextSelectionHighlight,
  editorContextMenu,
  editorContextMenuRef,
  setEditorContextMenu,
}: UseEditorUiInteractionEffectsParams) {
  useEffect(() => {
    const flushSelectionChange = () => {
      selectionChangeRafRef.current = null;
      const isEditorFocused = !!contentRef.current && document.activeElement === contentRef.current;
      if (!isEditorFocused && !pointerSelectionActiveRef.current) {
        return;
      }

      if (verticalSelectionRef.current && !hasSelectionInsideEditor()) {
        clearVerticalSelectionState();
      }

      if (pointerSelectionActiveRef.current) {
        return;
      }

      syncSelectionState();
      handleScroll();
      syncTextSelectionHighlight();
    };

    const handleSelectionChange = () => {
      const isEditorFocused = !!contentRef.current && document.activeElement === contentRef.current;
      if (!isEditorFocused && !pointerSelectionActiveRef.current) {
        return;
      }

      const selectionCollapsed = !!(
        contentRef.current
        && contentRef.current.selectionStart === contentRef.current.selectionEnd
      );

      if (!pointerSelectionActiveRef.current || selectionCollapsed) {
        syncActiveLineStateNow();
      }

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
    contentRef,
    handleScroll,
    hasSelectionInsideEditor,
    syncActiveLineStateNow,
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
