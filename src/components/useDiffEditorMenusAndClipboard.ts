import { invoke } from '@tauri-apps/api/core';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import type { ActivePanel } from './diffEditor.types';

interface DiffContextMenuState {
  x: number;
  y: number;
  side: ActivePanel;
}

interface DiffHeaderContextMenuState {
  x: number;
  y: number;
  side: ActivePanel;
}

interface UseDiffEditorMenusAndClipboardParams {
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setActivePanel: (side: ActivePanel) => void;
  handlePanelPasteText: (side: ActivePanel, pastedText: string) => void;
  resolvePanelPath: (side: ActivePanel) => string;
  resolvePanelDisplayName: (side: ActivePanel) => string;
  pathBaseName: (path: string) => string;
  getParentDirectoryPath: (filePath: string) => string | null;
}

export function useDiffEditorMenusAndClipboard({
  sourceTextareaRef,
  targetTextareaRef,
  setActivePanel,
  handlePanelPasteText,
  resolvePanelPath,
  resolvePanelDisplayName,
  pathBaseName,
  getParentDirectoryPath,
}: UseDiffEditorMenusAndClipboardParams) {
  const [diffContextMenu, setDiffContextMenu] = useState<DiffContextMenuState | null>(null);
  const [diffHeaderContextMenu, setDiffHeaderContextMenu] = useState<DiffHeaderContextMenuState | null>(null);
  const diffContextMenuRef = useRef<HTMLDivElement | null>(null);
  const diffHeaderContextMenuRef = useRef<HTMLDivElement | null>(null);

  const closeMenus = useCallback(() => {
    setDiffContextMenu(null);
    setDiffHeaderContextMenu(null);
  }, []);

  const closeDiffContextMenu = useCallback(() => {
    setDiffContextMenu(null);
  }, []);

  const handlePanelContextMenu = useCallback(
    (side: ActivePanel, event: ReactMouseEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      setActivePanel(side);
      setDiffHeaderContextMenu(null);

      const menuWidth = 176;
      const menuHeight = 168;
      const viewportPadding = 8;
      const x = Math.max(
        viewportPadding,
        Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
      );
      const y = Math.max(
        viewportPadding,
        Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
      );

      setDiffContextMenu({
        x,
        y,
        side,
      });
    },
    [setActivePanel, sourceTextareaRef, targetTextareaRef]
  );

  const handleLineNumberContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenus();
    },
    [closeMenus]
  );

  const handleScrollerContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeMenus();
    },
    [closeMenus]
  );

  const handleSplitterContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenus();
    },
    [closeMenus]
  );

  const handleHeaderContextMenu = useCallback(
    (side: ActivePanel, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setActivePanel(side);
      setDiffContextMenu(null);

      const menuWidth = 208;
      const menuHeight = 172;
      const viewportPadding = 8;
      const x = Math.max(
        viewportPadding,
        Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
      );
      const y = Math.max(
        viewportPadding,
        Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
      );

      setDiffHeaderContextMenu({
        x,
        y,
        side,
      });
    },
    [setActivePanel]
  );

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (!text || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to write clipboard text:', error);
    }
  }, []);

  const handleDiffHeaderContextMenuAction = useCallback(
    async (
      side: ActivePanel,
      action: 'copy-file-name' | 'copy-directory' | 'copy-path' | 'open-containing-folder'
    ) => {
      const filePath = resolvePanelPath(side);
      const fileName = filePath ? pathBaseName(filePath) : resolvePanelDisplayName(side);
      const folderPath = filePath ? getParentDirectoryPath(filePath) : null;
      setDiffHeaderContextMenu(null);

      if (action === 'copy-file-name') {
        await copyTextToClipboard(fileName);
        return;
      }

      if (action === 'copy-directory') {
        if (folderPath) {
          await copyTextToClipboard(folderPath);
        }
        return;
      }

      if (action === 'copy-path') {
        if (filePath) {
          await copyTextToClipboard(filePath);
        }
        return;
      }

      if (!filePath) {
        return;
      }

      try {
        await invoke('open_in_file_manager', { path: filePath });
      } catch (error) {
        console.error('Failed to open file directory from diff header:', error);
      }
    },
    [copyTextToClipboard, getParentDirectoryPath, pathBaseName, resolvePanelDisplayName, resolvePanelPath]
  );

  const runClipboardExecCommand = useCallback((command: 'copy' | 'cut' | 'paste') => {
    try {
      return document.execCommand(command);
    } catch {
      return false;
    }
  }, []);

  const handleDiffContextMenuClipboardAction = useCallback(
    async (side: ActivePanel, action: 'copy' | 'cut' | 'paste') => {
      const textarea = side === 'source' ? sourceTextareaRef.current : targetTextareaRef.current;
      if (!textarea) {
        setDiffContextMenu(null);
        return;
      }

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      setActivePanel(side);

      if (action === 'paste') {
        try {
          const clipboardText = await readClipboardText();
          handlePanelPasteText(side, clipboardText);
        } catch (error) {
          console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
          runClipboardExecCommand('paste');
        }
      } else {
        runClipboardExecCommand(action);
      }

      setDiffContextMenu(null);
    },
    [handlePanelPasteText, runClipboardExecCommand, setActivePanel, sourceTextareaRef, targetTextareaRef]
  );

  useEffect(() => {
    if (!diffContextMenu && !diffHeaderContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const clickedPanelMenu = !!(diffContextMenuRef.current && target && diffContextMenuRef.current.contains(target));
      const clickedHeaderMenu = !!(
        diffHeaderContextMenuRef.current
        && target
        && diffHeaderContextMenuRef.current.contains(target)
      );

      if (!clickedPanelMenu && !clickedHeaderMenu) {
        closeMenus();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenus();
      }
    };
    const handleWindowBlur = () => {
      closeMenus();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [closeMenus, diffContextMenu, diffHeaderContextMenu]);

  const diffHeaderMenuPath = useMemo(
    () => (diffHeaderContextMenu ? resolvePanelPath(diffHeaderContextMenu.side) : ''),
    [diffHeaderContextMenu, resolvePanelPath]
  );
  const diffHeaderMenuFileName = useMemo(
    () => (
      diffHeaderContextMenu
        ? (diffHeaderMenuPath
          ? pathBaseName(diffHeaderMenuPath)
          : resolvePanelDisplayName(diffHeaderContextMenu.side))
        : ''
    ),
    [diffHeaderContextMenu, diffHeaderMenuPath, pathBaseName, resolvePanelDisplayName]
  );
  const diffHeaderMenuDirectory = useMemo(
    () => (diffHeaderMenuPath ? getParentDirectoryPath(diffHeaderMenuPath) : null),
    [diffHeaderMenuPath, getParentDirectoryPath]
  );

  return {
    diffContextMenu,
    diffHeaderContextMenu,
    diffContextMenuRef,
    diffHeaderContextMenuRef,
    handlePanelContextMenu,
    handleLineNumberContextMenu,
    handleScrollerContextMenu,
    handleSplitterContextMenu,
    handleHeaderContextMenu,
    handleDiffHeaderContextMenuAction,
    handleDiffContextMenuClipboardAction,
    closeDiffContextMenu,
    diffHeaderMenuPath,
    diffHeaderMenuFileName,
    diffHeaderMenuDirectory,
  };
}
