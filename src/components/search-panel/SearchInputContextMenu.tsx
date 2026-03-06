import { type RefObject } from 'react';
import type { SearchSidebarInputContextAction, SearchSidebarInputContextMenuState } from './types';

interface SearchInputContextMenuProps {
  contextMenu: SearchSidebarInputContextMenuState;
  copyLabel: string;
  cutLabel: string;
  deleteLabel: string;
  menuRef: RefObject<HTMLDivElement | null>;
  pasteLabel: string;
  onAction: (action: SearchSidebarInputContextAction) => void | Promise<void>;
}

export function SearchInputContextMenu({
  contextMenu,
  copyLabel,
  cutLabel,
  deleteLabel,
  menuRef,
  pasteLabel,
  onAction,
}: SearchInputContextMenuProps) {
  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[60] min-w-[120px] rounded-md border border-border bg-background p-1 shadow-2xl"
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => void onAction('copy')}
        disabled={!contextMenu.hasSelection}
      >
        {copyLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => void onAction('cut')}
        disabled={!contextMenu.canEdit || !contextMenu.hasSelection}
      >
        {cutLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => void onAction('paste')}
        disabled={!contextMenu.canEdit}
      >
        {pasteLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => void onAction('delete')}
        disabled={!contextMenu.canEdit || !contextMenu.hasSelection}
      >
        {deleteLabel}
      </button>
    </div>
  );
}
