import type { RefObject } from 'react';
import type { ActivePanel } from './diffEditor.types';

interface DiffEditorMenuState {
  x: number;
  y: number;
  side: ActivePanel;
}

interface DiffEditorContextMenusProps {
  diffHeaderContextMenu: DiffEditorMenuState | null;
  diffContextMenu: DiffEditorMenuState | null;
  diffHeaderContextMenuRef: RefObject<HTMLDivElement | null>;
  diffContextMenuRef: RefObject<HTMLDivElement | null>;
  handleDiffHeaderContextMenuAction: (
    side: ActivePanel,
    action: 'copy-file-name' | 'copy-directory' | 'copy-path' | 'open-containing-folder'
  ) => Promise<void>;
  handleDiffContextMenuClipboardAction: (
    side: ActivePanel,
    action: 'copy' | 'cut' | 'paste'
  ) => Promise<void>;
  isCopyLinesToPanelDisabled: (fromSide: ActivePanel, targetSide: ActivePanel) => boolean;
  handleCopyLinesToPanel: (fromSide: ActivePanel, targetSide: ActivePanel) => Promise<void>;
  closeDiffContextMenu: () => void;
  diffHeaderMenuPath: string;
  diffHeaderMenuFileName: string;
  diffHeaderMenuDirectory: string | null;
  copyLabel: string;
  cutLabel: string;
  pasteLabel: string;
  copyToLeftLabel: string;
  copyToRightLabel: string;
  copyFileNameLabel: string;
  copyDirectoryPathLabel: string;
  copyFullPathLabel: string;
  openContainingFolderLabel: string;
}

export function DiffEditorContextMenus({
  diffHeaderContextMenu,
  diffContextMenu,
  diffHeaderContextMenuRef,
  diffContextMenuRef,
  handleDiffHeaderContextMenuAction,
  handleDiffContextMenuClipboardAction,
  isCopyLinesToPanelDisabled,
  handleCopyLinesToPanel,
  closeDiffContextMenu,
  diffHeaderMenuPath,
  diffHeaderMenuFileName,
  diffHeaderMenuDirectory,
  copyLabel,
  cutLabel,
  pasteLabel,
  copyToLeftLabel,
  copyToRightLabel,
  copyFileNameLabel,
  copyDirectoryPathLabel,
  copyFullPathLabel,
  openContainingFolderLabel,
}: DiffEditorContextMenusProps) {
  return (
    <>
      {diffHeaderContextMenu && (
        <div
          ref={diffHeaderContextMenuRef}
          className="fixed z-[96] w-52 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: diffHeaderContextMenu.x, top: diffHeaderContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-file-name');
            }}
          >
            {copyFileNameLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-directory');
            }}
            disabled={!diffHeaderMenuDirectory}
          >
            {copyDirectoryPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'copy-path');
            }}
            disabled={!diffHeaderMenuPath}
          >
            {copyFullPathLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void handleDiffHeaderContextMenuAction(diffHeaderContextMenu.side, 'open-containing-folder');
            }}
            disabled={!diffHeaderMenuPath}
            title={diffHeaderMenuFileName}
          >
            {openContainingFolderLabel}
          </button>
        </div>
      )}

      {diffContextMenu && (
        <div
          ref={diffContextMenuRef}
          className="fixed z-[95] w-44 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{ left: diffContextMenu.x, top: diffContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'copy');
            }}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'cut');
            }}
          >
            {cutLabel}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              void handleDiffContextMenuClipboardAction(diffContextMenu.side, 'paste');
            }}
          >
            {pasteLabel}
          </button>
          <div className="my-1 h-px bg-border" />
          {diffContextMenu.side === 'target' && (
            <button
              type="button"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'source')}
              onClick={() => {
                void handleCopyLinesToPanel(diffContextMenu.side, 'source');
                closeDiffContextMenu();
              }}
            >
              {copyToLeftLabel}
            </button>
          )}
          {diffContextMenu.side === 'source' && (
            <button
              type="button"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyLinesToPanelDisabled(diffContextMenu.side, 'target')}
              onClick={() => {
                void handleCopyLinesToPanel(diffContextMenu.side, 'target');
                closeDiffContextMenu();
              }}
            >
              {copyToRightLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
