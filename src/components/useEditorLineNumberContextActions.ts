import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';

interface UseEditorLineNumberContextActionsParams {
  editorContextMenu: EditorContextMenuState | null;
  lineNumberContextLineRef: MutableRefObject<number | null>;
  handleLineNumberClick: (line: number, shiftKey: boolean, additiveKey: boolean) => void;
  handleLineNumberDoubleClick: (line: number) => void;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
}

export function useEditorLineNumberContextActions({
  editorContextMenu,
  lineNumberContextLineRef,
  handleLineNumberClick,
  handleLineNumberDoubleClick,
  setEditorContextMenu,
}: UseEditorLineNumberContextActionsParams) {
  const handleSelectCurrentLineFromContext = useCallback(() => {
    if (!editorContextMenu || editorContextMenu.target !== 'lineNumber') {
      return;
    }

    const targetLine = lineNumberContextLineRef.current ?? editorContextMenu.lineNumber;
    handleLineNumberClick(targetLine, false, false);
    setEditorContextMenu(null);
  }, [editorContextMenu, handleLineNumberClick, lineNumberContextLineRef, setEditorContextMenu]);

  const handleAddCurrentLineBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu || editorContextMenu.target !== 'lineNumber') {
      return;
    }

    const targetLine = lineNumberContextLineRef.current ?? editorContextMenu.lineNumber;
    handleLineNumberDoubleClick(targetLine);
    setEditorContextMenu(null);
  }, [editorContextMenu, handleLineNumberDoubleClick, lineNumberContextLineRef, setEditorContextMenu]);

  return {
    handleSelectCurrentLineFromContext,
    handleAddCurrentLineBookmarkFromContext,
  };
}
