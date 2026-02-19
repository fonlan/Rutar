import { invoke } from '@tauri-apps/api/core';
import { Bookmark, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@/i18n';
import { dispatchNavigateToLineFromBookmark } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';
import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';
import { useStore } from '@/store/useStore';

const BOOKMARK_SIDEBAR_MIN_WIDTH = 160;
const BOOKMARK_SIDEBAR_MAX_WIDTH = 520;
const EMPTY_BOOKMARKS: number[] = [];

function normalizeBookmarkLinePreview(value: string) {
  return (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
}

export function BookmarkSidebar() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const bookmarkSidebarWidth = useStore((state) => state.bookmarkSidebarWidth);
  const setBookmarkSidebarWidth = useStore((state) => state.setBookmarkSidebarWidth);
  const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
  const bookmarksByTab = useStore((state) => state.bookmarksByTab);
  const removeBookmark = useStore((state) => state.removeBookmark);
  const language = useStore((state) => state.settings.language);
  const [linePreviewByNumber, setLinePreviewByNumber] = useState<Record<number, string>>({});
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const { containerRef, isResizing, startResize } = useResizableSidebarWidth({
    width: bookmarkSidebarWidth,
    minWidth: BOOKMARK_SIDEBAR_MIN_WIDTH,
    maxWidth: BOOKMARK_SIDEBAR_MAX_WIDTH,
    onWidthChange: setBookmarkSidebarWidth,
  });

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const bookmarks = activeTabId ? bookmarksByTab[activeTabId] ?? EMPTY_BOOKMARKS : EMPTY_BOOKMARKS;
  const hasBookmarks = bookmarks.length > 0;
  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((left, right) => left - right),
    [bookmarks]
  );

  const loadBookmarkLinePreviews = useCallback(async () => {
    if (!activeTabId || sortedBookmarks.length === 0) {
      setLinePreviewByNumber((previous) => {
        return Object.keys(previous).length > 0 ? {} : previous;
      });
      return;
    }

    const lines = Array.from(new Set(sortedBookmarks));

    try {
      const previews = await invoke<string[]>('get_bookmark_line_previews', {
        id: activeTabId,
        lines,
      });

      const nextPreviewByNumber: Record<number, string> = {};
      lines.forEach((line, index) => {
        const preview = Array.isArray(previews) ? previews[index] ?? '' : '';
        nextPreviewByNumber[line] = normalizeBookmarkLinePreview(preview);
      });

      setLinePreviewByNumber(nextPreviewByNumber);
    } catch (error) {
      console.error('Failed to load bookmark line previews:', error);
      const fallbackPreviewByNumber: Record<number, string> = {};
      lines.forEach((line) => {
        fallbackPreviewByNumber[line] = '';
      });
      setLinePreviewByNumber(fallbackPreviewByNumber);
    }
  }, [activeTabId, sortedBookmarks]);

  useEffect(() => {
    if (!bookmarkSidebarOpen) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      await loadBookmarkLinePreviews();
      if (cancelled) {
        return;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [bookmarkSidebarOpen, loadBookmarkLinePreviews]);

  useEffect(() => {
    if (!bookmarkSidebarOpen || !activeTabId) {
      return;
    }

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId !== activeTabId) {
        return;
      }

      void loadBookmarkLinePreviews();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    return () => {
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [activeTabId, bookmarkSidebarOpen, loadBookmarkLinePreviews]);

  if (!bookmarkSidebarOpen || !activeTabId || !activeTab) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden"
      style={{ width: `${bookmarkSidebarWidth}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="p-3 text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2 border-b">
        <Bookmark className="w-3 h-3" />
        <span className="truncate">{tr('bookmark.sidebar.title')}</span>
        <button
          type="button"
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
          title={tr('sidebar.close')}
          aria-label={tr('sidebar.close')}
          onClick={() => toggleBookmarkSidebar(false)}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-2">
        {!hasBookmarks ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">{tr('bookmark.sidebar.empty')}</div>
        ) : (
          sortedBookmarks.map((line) => (
            <div key={line} className="px-2 py-1">
              <div
                className="group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title={`${tr('bookmark.sidebar.line')} ${line}`}
                onClick={() => dispatchNavigateToLineFromBookmark(activeTabId, line)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                  }

                  event.preventDefault();
                  dispatchNavigateToLineFromBookmark(activeTabId, line);
                }}
                role="button"
                tabIndex={0}
                aria-label={`${tr('bookmark.sidebar.line')} ${line}`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2 text-left">
                  <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {tr('bookmark.sidebar.line')} {line}
                    </div>
                    <div
                      className="truncate text-[11px] text-muted-foreground/90"
                      title={linePreviewByNumber[line] || tr('bookmark.sidebar.emptyLine')}
                    >
                      {linePreviewByNumber[line] || tr('bookmark.sidebar.emptyLine')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 opacity-0 transition-colors group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  title={tr('bookmark.remove')}
                  aria-label={tr('bookmark.remove')}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeBookmark(activeTabId, line);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize bookmark sidebar"
        onPointerDown={startResize}
        className={cn(
          'absolute top-0 right-[-3px] h-full w-1.5 cursor-col-resize touch-none transition-colors',
          isResizing ? 'bg-primary/40' : 'hover:bg-primary/25'
        )}
      />
    </div>
  );
}
