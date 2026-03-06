import {
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import { SearchPanelHeader } from './SearchPanelHeader';
import type { PanelMode } from './types';
import { SEARCH_SIDEBAR_RIGHT_OFFSET } from './utils';

interface SearchSidebarChromeProps {
  canReplace: boolean;
  children: ReactNode;
  errorMessage: string | null;
  feedbackMessage: string | null;
  isOpen: boolean;
  isSearchUiActive: boolean;
  isSearchSidebarResizing: boolean;
  messages: ReturnType<typeof getSearchPanelMessages>;
  panelMode: PanelMode;
  searchSidebarBottomOffset: string;
  searchSidebarContainerRef: RefObject<HTMLDivElement | null>;
  searchSidebarTopOffset: string;
  searchSidebarWidth: number;
  statusText: string;
  onBlurCapture: FocusEventHandler<HTMLDivElement>;
  onClose: () => void;
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  onFocusCapture: FocusEventHandler<HTMLDivElement>;
  onModeChange: (mode: PanelMode) => void;
  onPointerDownCapture: PointerEventHandler<HTMLDivElement>;
  onResizePointerDown: PointerEventHandler<HTMLDivElement>;
}

export function SearchSidebarChrome({
  canReplace,
  children,
  errorMessage,
  feedbackMessage,
  isOpen,
  isSearchUiActive,
  isSearchSidebarResizing,
  messages,
  panelMode,
  searchSidebarBottomOffset,
  searchSidebarContainerRef,
  searchSidebarTopOffset,
  searchSidebarWidth,
  statusText,
  onBlurCapture,
  onClose,
  onContextMenu,
  onFocusCapture,
  onModeChange,
  onPointerDownCapture,
  onResizePointerDown,
}: SearchSidebarChromeProps) {
  return (
    <div
      ref={searchSidebarContainerRef}
      data-rutar-search-sidebar="true"
      className={cn(
        'fixed z-40 transform-gpu overflow-hidden transition-transform duration-200 ease-out',
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      style={{
        width: `${searchSidebarWidth}px`,
        right: `${SEARCH_SIDEBAR_RIGHT_OFFSET}px`,
        top: searchSidebarTopOffset,
        bottom: searchSidebarBottomOffset,
        transform: isOpen
          ? 'translateX(0)'
          : `translateX(calc(100% + ${SEARCH_SIDEBAR_RIGHT_OFFSET}px))`,
      }}
      onContextMenu={onContextMenu}
    >
      <div
        className={cn(
          'flex h-full flex-col overflow-y-auto border-l border-border p-3 shadow-2xl transition-colors',
          isSearchUiActive ? 'bg-background/95 backdrop-blur' : 'bg-background/65',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        onPointerDownCapture={onPointerDownCapture}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <SearchPanelHeader
          canReplace={canReplace}
          panelMode={panelMode}
          messages={messages}
          onClose={onClose}
          onModeChange={onModeChange}
        />

        {children}

        <div
          className={cn(
            'mt-2 text-xs',
            errorMessage ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {feedbackMessage || statusText} · {messages.shortcutHint}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize search sidebar"
        onPointerDown={onResizePointerDown}
        className={cn(
          'absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none transition-colors',
          !isOpen && 'pointer-events-none opacity-0',
          isSearchSidebarResizing ? 'bg-primary/40' : 'hover:bg-primary/25'
        )}
      />
    </div>
  );
}
