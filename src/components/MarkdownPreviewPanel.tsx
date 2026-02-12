import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { t } from '@/i18n';
import { isMarkdownTab } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { type FileTab, useStore } from '@/store/useStore';

marked.setOptions({
  gfm: true,
  breaks: true,
});

interface MarkdownPreviewPanelProps {
  open: boolean;
  tab: FileTab | null | undefined;
}

interface ScrollRatioState {
  top: number;
  left: number;
}

type MermaidApi = {
  initialize: (options: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

const MIN_PREVIEW_WIDTH_RATIO = 0.2;
const MAX_PREVIEW_WIDTH_RATIO = 0.8;
const LIVE_UPDATE_DEBOUNCE_MS = 140;
let mermaidApiPromise: Promise<MermaidApi> | null = null;

function clampPreviewRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(MIN_PREVIEW_WIDTH_RATIO, Math.min(MAX_PREVIEW_WIDTH_RATIO, value));
}

function isMermaidCodeBlock(element: HTMLElement) {
  const className = (element.className || '').toLowerCase();
  return className.includes('language-mermaid') || className.includes('lang-mermaid');
}

async function getMermaidApi() {
  if (!mermaidApiPromise) {
    mermaidApiPromise = import('mermaid/dist/mermaid.core.mjs')
      .catch(async () => import('mermaid'))
      .then((module) => {
        const candidate =
          (module as { default?: MermaidApi }).default ?? (module as unknown as MermaidApi);
        if (
          !candidate ||
          typeof candidate.initialize !== 'function' ||
          typeof candidate.render !== 'function'
        ) {
          throw new Error('Mermaid API unavailable');
        }

        return candidate;
      });
  }

  return mermaidApiPromise;
}

export function MarkdownPreviewPanel({ open, tab }: MarkdownPreviewPanelProps) {
  const language = useStore((state) => state.settings.language);
  const appTheme = useStore((state) => state.settings.theme);
  const previewWidthRatio = useStore((state) => state.markdownPreviewWidthRatio);
  const setPreviewWidthRatio = useStore((state) => state.setMarkdownPreviewWidthRatio);
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const [markdownSource, setMarkdownSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const sourceScrollRef = useRef<HTMLElement | null>(null);
  const latestScrollRatioRef = useRef<ScrollRatioState>({ top: 0, left: 0 });
  const mermaidRenderVersionRef = useRef(0);
  const requestVersionRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const inFlightRefreshRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const activeTabId = tab?.id ?? null;
  const markdownEnabled = isMarkdownTab(tab);
  const deferredMarkdownSource = useDeferredValue(markdownSource);

  const applyScrollRatio = useCallback((ratioState: ScrollRatioState) => {
    const scroller = previewScrollRef.current;
    if (!scroller) {
      return;
    }

    const safeTopRatio = Number.isFinite(ratioState.top)
      ? Math.max(0, Math.min(1, ratioState.top))
      : 0;
    const safeLeftRatio = Number.isFinite(ratioState.left)
      ? Math.max(0, Math.min(1, ratioState.left))
      : 0;

    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextTop = maxTop * safeTopRatio;
    const nextLeft = maxLeft * safeLeftRatio;

    if (Math.abs(scroller.scrollTop - nextTop) > 0.5) {
      scroller.scrollTop = nextTop;
    }

    if (Math.abs(scroller.scrollLeft - nextLeft) > 0.5) {
      scroller.scrollLeft = nextLeft;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const loadMarkdownContent = useCallback(async (options?: { preserveContent?: boolean }) => {
    if (!open || !tab || !markdownEnabled) {
      setMarkdownSource('');
      setLoadError(null);
      setLoading(false);
      hasLoadedOnceRef.current = false;
      return;
    }

    if (inFlightRefreshRef.current) {
      pendingRefreshRef.current = true;
      return;
    }

    inFlightRefreshRef.current = true;
    pendingRefreshRef.current = false;

    const currentRequestVersion = ++requestVersionRef.current;
    if (!options?.preserveContent || !hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const lineCount = Math.max(1, Number.isFinite(tab.lineCount) ? tab.lineCount : 1);
      const source = await invoke<string>('get_visible_lines', {
        id: tab.id,
        startLine: 0,
        endLine: lineCount,
      });

      if (requestVersionRef.current !== currentRequestVersion) {
        return;
      }

      const normalizedSource = typeof source === 'string' ? source : '';
      setMarkdownSource((previous) => (previous === normalizedSource ? previous : normalizedSource));
      hasLoadedOnceRef.current = true;
    } catch (error) {
      if (requestVersionRef.current !== currentRequestVersion) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message || 'Unknown error');
    } finally {
      inFlightRefreshRef.current = false;
      if (requestVersionRef.current === currentRequestVersion) {
        setLoading(false);
      }

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        clearRefreshTimer();
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          void loadMarkdownContent({ preserveContent: true });
        }, LIVE_UPDATE_DEBOUNCE_MS);
      }
    }
  }, [clearRefreshTimer, markdownEnabled, open, tab]);

  useEffect(() => {
    clearRefreshTimer();
    pendingRefreshRef.current = false;
    void loadMarkdownContent();
  }, [clearRefreshTimer, loadMarkdownContent]);

  useEffect(() => {
    return () => {
      clearRefreshTimer();
    };
  }, [loadMarkdownContent]);

  useEffect(() => {
    if (!open || !tab || !markdownEnabled) {
      return;
    }

    const scheduleRefresh = () => {
      if (inFlightRefreshRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      clearRefreshTimer();
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadMarkdownContent({ preserveContent: true });
      }, LIVE_UPDATE_DEBOUNCE_MS);
    };

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      scheduleRefresh();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    window.addEventListener('rutar:force-refresh', handleDocumentUpdated as EventListener);

    return () => {
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
      window.removeEventListener('rutar:force-refresh', handleDocumentUpdated as EventListener);
      clearRefreshTimer();
    };
  }, [clearRefreshTimer, loadMarkdownContent, markdownEnabled, open, tab]);

  useEffect(() => {
    if (!open || !activeTabId) {
      return;
    }

    let sourceElement: HTMLElement | null = null;
    let rafId = 0;

    const syncFromEditor = () => {
      if (!sourceElement) {
        return;
      }

      const maxTop = Math.max(0, sourceElement.scrollHeight - sourceElement.clientHeight);
      const maxLeft = Math.max(0, sourceElement.scrollWidth - sourceElement.clientWidth);
      const ratios = {
        top: maxTop > 0 ? sourceElement.scrollTop / maxTop : 0,
        left: maxLeft > 0 ? sourceElement.scrollLeft / maxLeft : 0,
      };

      latestScrollRatioRef.current = ratios;
      applyScrollRatio(ratios);
    };

    const bindSource = () => {
      const nextSource = document.querySelector(
        '[data-rutar-gesture-area="true"] .editor-scroll-stable'
      ) as HTMLElement | null;
      if (nextSource === sourceElement) {
        return;
      }

      if (sourceElement) {
        sourceElement.removeEventListener('scroll', syncFromEditor);
      }

      sourceElement = nextSource;
      sourceScrollRef.current = nextSource;

      if (sourceElement) {
        sourceElement.addEventListener('scroll', syncFromEditor, { passive: true });
        syncFromEditor();
      }
    };

    const scheduleBind = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(bindSource);
    };

    const observer = new MutationObserver(scheduleBind);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleBind();

    return () => {
      observer.disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      if (sourceElement) {
        sourceElement.removeEventListener('scroll', syncFromEditor);
      }

      sourceScrollRef.current = null;
    };
  }, [activeTabId, applyScrollRatio, open]);

  const renderedHtml = useMemo(() => {
    if (!markdownEnabled || !deferredMarkdownSource) {
      return '';
    }

    return marked.parse(deferredMarkdownSource) as string;
  }, [deferredMarkdownSource, markdownEnabled]);

  useEffect(() => {
    if (!open || !markdownEnabled || !renderedHtml) {
      return;
    }

    const articleElement = previewArticleRef.current;
    if (!articleElement) {
      return;
    }

    const nextRenderVersion = mermaidRenderVersionRef.current + 1;
    mermaidRenderVersionRef.current = nextRenderVersion;
    let cancelled = false;

    const renderMermaidBlocks = async () => {
      const rawMermaidCodeBlocks = Array.from(
        articleElement.querySelectorAll<HTMLElement>('pre > code')
      ).filter(isMermaidCodeBlock);

      rawMermaidCodeBlocks.forEach((codeElement) => {
        const preElement = codeElement.closest('pre');
        if (!preElement) {
          return;
        }

        const source = (codeElement.textContent ?? '').replace(/\r\n/g, '\n').trim();
        const host = document.createElement('div');
        host.className = 'mermaid-host';
        host.dataset.mermaidSource = source;
        preElement.replaceWith(host);
      });

      const mermaidHosts = Array.from(
        articleElement.querySelectorAll<HTMLDivElement>('.mermaid-host[data-mermaid-source]')
      );

      if (mermaidHosts.length === 0) {
        return;
      }

      const mermaid = await getMermaidApi();
      if (cancelled || mermaidRenderVersionRef.current !== nextRenderVersion) {
        return;
      }
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: appTheme === 'dark' ? 'dark' : 'default',
      });

      for (let index = 0; index < mermaidHosts.length; index += 1) {
        if (cancelled || mermaidRenderVersionRef.current !== nextRenderVersion) {
          return;
        }

        const host = mermaidHosts[index];
        const source = host.dataset.mermaidSource ?? '';

        try {
          const renderId = `rutar-mermaid-${nextRenderVersion}-${index}`;
          const renderResult = await mermaid.render(renderId, source);
          if (cancelled || mermaidRenderVersionRef.current !== nextRenderVersion) {
            return;
          }

          host.innerHTML = renderResult.svg;
          applyScrollRatio(latestScrollRatioRef.current);
        } catch (error) {
          if (cancelled || mermaidRenderVersionRef.current !== nextRenderVersion) {
            return;
          }

          const fallback = document.createElement('pre');
          fallback.className = 'mermaid-render-error';
          const errorMessage = error instanceof Error ? error.message : String(error);
          fallback.textContent = `Mermaid render failed: ${errorMessage}\n\n${source}`;
          host.replaceChildren(fallback);
        }
      }
    };

    void renderMermaidBlocks().catch((error) => {
      if (!cancelled) {
        console.error('Failed to render mermaid diagrams:', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appTheme, applyScrollRatio, markdownEnabled, open, renderedHtml]);

  useEffect(() => {
    if (!open || !markdownEnabled) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      applyScrollRatio(latestScrollRatioRef.current);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [applyScrollRatio, markdownEnabled, open, renderedHtml, previewWidthRatio]);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open) {
      return;
    }

    const panelElement = panelRef.current;
    const parentElement = panelElement?.parentElement;
    if (!panelElement || !parentElement) {
      return;
    }

    event.preventDefault();
    const resizeHandleElement = event.currentTarget;
    const pointerId = event.pointerId;
    resizeHandleElement.setPointerCapture(pointerId);
    const containerRect = parentElement.getBoundingClientRect();

    const updateRatio = (clientX: number) => {
      const nextWidth = containerRect.right - clientX;
      const nextRatio = clampPreviewRatio(nextWidth / containerRect.width);
      setPreviewWidthRatio(nextRatio);
    };

    updateRatio(event.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateRatio(moveEvent.clientX);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        resizeHandleElement.releasePointerCapture(pointerId);
      } catch {
        // Ignore release failures when pointer capture is already gone.
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);
  }, [open, setPreviewWidthRatio]);

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const sourceElement = sourceScrollRef.current;
    if (!sourceElement) {
      return;
    }

    event.preventDefault();

    const maxTop = Math.max(0, sourceElement.scrollHeight - sourceElement.clientHeight);
    const maxLeft = Math.max(0, sourceElement.scrollWidth - sourceElement.clientWidth);
    const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const nextTop = Math.max(0, Math.min(maxTop, sourceElement.scrollTop + event.deltaY));
    const nextLeft = Math.max(0, Math.min(maxLeft, sourceElement.scrollLeft + horizontalDelta));

    if (Math.abs(sourceElement.scrollTop - nextTop) > 0.5) {
      sourceElement.scrollTop = nextTop;
    }

    if (Math.abs(sourceElement.scrollLeft - nextLeft) > 0.5) {
      sourceElement.scrollLeft = nextLeft;
    }
  }, []);

  return (
    <div
      ref={panelRef}
      aria-hidden={!open}
      className={cn(
        'relative h-full shrink-0 overflow-hidden bg-background/95 transition-[width,opacity,border-color] duration-200 ease-out',
        open
          ? 'border-l border-border opacity-100 pointer-events-auto'
          : 'border-l border-transparent opacity-0 pointer-events-none'
      )}
      style={{ width: open ? `${clampPreviewRatio(previewWidthRatio) * 100}%` : '0px' }}
    >
      <section
        className={cn(
          'relative flex h-full w-full flex-col transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div
          className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1/2 cursor-col-resize"
          onPointerDown={handleResizePointerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize markdown preview panel"
        />
        <div
          ref={previewScrollRef}
          className="preview-scroll-shared flex-1 overflow-auto px-5 py-4"
          onWheel={handlePreviewWheel}
        >
          {!tab ? (
            <p className="text-sm text-muted-foreground">{tr('toolbar.disabled.noActiveDocument')}</p>
          ) : !markdownEnabled ? (
            <p className="text-sm text-muted-foreground">{tr('preview.notMarkdown')}</p>
          ) : loading && !hasLoadedOnceRef.current ? (
            <p className="text-sm text-muted-foreground">{tr('preview.loading')}</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">
              {tr('preview.loadFailed')} {loadError}
            </p>
          ) : markdownSource.trim().length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('preview.empty')}</p>
          ) : (
            <article
              ref={previewArticleRef}
              className="markdown-preview"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
