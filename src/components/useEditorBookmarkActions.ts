import { useCallback, useMemo } from 'react';
import type { EditorContextMenuState } from './EditorContextMenu';

interface UseEditorBookmarkActionsParams {
  tabId: string;
  bookmarks: number[];
  bookmarkSidebarOpen: boolean;
  editorContextMenu: EditorContextMenuState | null;
  addBookmark: (tabId: string, lineNumber: number) => void;
  removeBookmark: (tabId: string, lineNumber: number) => void;
  toggleBookmark: (tabId: string, lineNumber: number) => void;
  toggleBookmarkSidebar: (open: boolean) => void;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
}

export function useEditorBookmarkActions({
  tabId,
  bookmarks,
  bookmarkSidebarOpen,
  editorContextMenu,
  addBookmark,
  removeBookmark,
  toggleBookmark,
  toggleBookmarkSidebar,
  setEditorContextMenu,
}: UseEditorBookmarkActionsParams) {
  const hasContextBookmark = useMemo(
    () => editorContextMenu !== null && bookmarks.includes(editorContextMenu.lineNumber),
    [bookmarks, editorContextMenu]
  );

  const handleAddBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    addBookmark(tabId, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [addBookmark, editorContextMenu, setEditorContextMenu, tabId]);

  const handleRemoveBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    removeBookmark(tabId, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [editorContextMenu, removeBookmark, setEditorContextMenu, tabId]);

  const handleLineNumberDoubleClick = useCallback(
    (line: number) => {
      const safeLine = Math.max(1, Math.floor(line));
      const hasBookmark = bookmarks.includes(safeLine);

      toggleBookmark(tabId, safeLine);

      if (!hasBookmark && !bookmarkSidebarOpen) {
        toggleBookmarkSidebar(true);
      }
    },
    [bookmarkSidebarOpen, bookmarks, tabId, toggleBookmark, toggleBookmarkSidebar]
  );

  return {
    hasContextBookmark,
    handleAddBookmarkFromContext,
    handleRemoveBookmarkFromContext,
    handleLineNumberDoubleClick,
  };
}
