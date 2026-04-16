import { Image as TauriImage } from '@tauri-apps/api/image';
import { invoke } from '@tauri-apps/api/core';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { marked } from 'marked';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { t } from '@/i18n';
import { isMarkdownTab } from '@/lib/markdown';
import { resolveMarkdownImageSrc, resolveMarkdownOpenTarget } from '@/lib/markdownPaths';
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

interface MermaidViewportState {
  scale: number;
}

interface MermaidPanState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  viewport: HTMLDivElement;
}

type MermaidApi = {
  initialize: (options: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

interface PreviewImageContextMenuState {
  x: number;
  y: number;
  imageElement: HTMLImageElement;
}

const MIN_PREVIEW_WIDTH_RATIO = 0.2;
const MAX_PREVIEW_WIDTH_RATIO = 0.8;
const LIVE_UPDATE_DEBOUNCE_MS = 140;
const MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE = 'data-rutar-open-target';
const MERMAID_VIEWPORT_SELECTOR = '[data-mermaid-viewport]';
const MERMAID_CANVAS_SELECTOR = '[data-mermaid-canvas]';
const MERMAID_SVG_SELECTOR = `${MERMAID_CANVAS_SELECTOR} svg`;
const DEFAULT_MERMAID_VIEWPORT_STATE: MermaidViewportState = {
  scale: 1,
};
const MIN_MERMAID_SCALE = 1;
const MAX_MERMAID_SCALE = 4;
const MERMAID_ZOOM_STEP = 1.18;
const MERMAID_STATE_EPSILON = 0.001;
const DEFAULT_MERMAID_BASE_WIDTH = 640;
const DEFAULT_MERMAID_BASE_HEIGHT = 360;
const PREVIEW_IMAGE_CONTEXT_MENU_WIDTH = 160;
const PREVIEW_IMAGE_CONTEXT_MENU_HEIGHT = 42;
const PREVIEW_IMAGE_CONTEXT_MENU_PADDING = 8;
let mermaidApiPromise: Promise<MermaidApi> | null = null;

function syncMarkdownOpenTargetAttribute(
  element: Element,
  rawTarget: string,
  tabPath: string | null | undefined,
) {
  const openTarget = resolveMarkdownOpenTarget(rawTarget, tabPath);
  const previousTarget = element.getAttribute(MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE);

  if (!openTarget) {
    if (previousTarget === null) {
      return false;
    }

    element.removeAttribute(MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE);
    return true;
  }

  if (previousTarget === openTarget) {
    return false;
  }

  element.setAttribute(MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE, openTarget);
  return true;
}

function rewriteMarkdownPreviewHtml(html: string, tabPath: string | null | undefined) {
  if (!html || (!html.includes('<img') && !html.includes('<a'))) {
    return html;
  }

  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  let didUpdate = false;

  for (const imageElement of parsedDocument.querySelectorAll('img[src]')) {
    const rawSrc = imageElement.getAttribute('src');
    if (!rawSrc) {
      continue;
    }

    const resolvedSrc = resolveMarkdownImageSrc(rawSrc, tabPath);
    if (resolvedSrc && resolvedSrc !== rawSrc) {
      imageElement.setAttribute('src', resolvedSrc);
      didUpdate = true;
    }

    if (syncMarkdownOpenTargetAttribute(imageElement, rawSrc, tabPath)) {
      didUpdate = true;
    }
  }

  for (const anchorElement of parsedDocument.querySelectorAll('a[href]')) {
    const rawHref = anchorElement.getAttribute('href');
    if (!rawHref) {
      continue;
    }

    if (syncMarkdownOpenTargetAttribute(anchorElement, rawHref, tabPath)) {
      didUpdate = true;
    }
  }

  return didUpdate ? parsedDocument.body.innerHTML : html;
}

function clampPreviewRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(MIN_PREVIEW_WIDTH_RATIO, Math.min(MAX_PREVIEW_WIDTH_RATIO, value));
}

function clampPreviewContextMenuPosition(value: number, menuSize: number, viewportSize: number) {
  return Math.max(
    PREVIEW_IMAGE_CONTEXT_MENU_PADDING,
    Math.min(value, viewportSize - menuSize - PREVIEW_IMAGE_CONTEXT_MENU_PADDING),
  );
}

async function copyMarkdownPreviewImageToClipboard(imageElement: HTMLImageElement) {
  const imageWidth = Math.max(1, Math.round(imageElement.naturalWidth || imageElement.width || 0));
  const imageHeight = Math.max(1, Math.round(imageElement.naturalHeight || imageElement.height || 0));
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Markdown preview image is not ready to copy.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  context.drawImage(imageElement, 0, 0, imageWidth, imageHeight);
  const imageData = context.getImageData(0, 0, imageWidth, imageHeight);
  const clipboardImage = await TauriImage.new(Uint8Array.from(imageData.data), imageWidth, imageHeight);

  try {
    await writeImage(clipboardImage);
  } finally {
    await clipboardImage.close().catch(() => undefined);
  }
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

function clampMermaidScale(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MERMAID_VIEWPORT_STATE.scale;
  }

  return Math.max(MIN_MERMAID_SCALE, Math.min(MAX_MERMAID_SCALE, value));
}

function getMermaidSvgElement(viewport: HTMLElement) {
  return viewport.querySelector<SVGSVGElement>(MERMAID_SVG_SELECTOR);
}

function readMermaidViewportState(viewport: HTMLElement): MermaidViewportState {
  const scale = clampMermaidScale(Number(viewport.dataset.mermaidScale ?? '1'));
  return {
    scale,
  };
}

function parseSvgLength(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([0-9]*\.?[0-9]+)/);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function readSvgViewBoxSize(svg: SVGSVGElement) {
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    return null;
  }

  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function measureMermaidBaseSize(viewport: HTMLDivElement, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  const attrWidth = parseSvgLength(svg.getAttribute('width'));
  const attrHeight = parseSvgLength(svg.getAttribute('height'));
  const viewBoxSize = readSvgViewBoxSize(svg);
  const width = rect.width > 0
    ? rect.width
    : attrWidth
      ?? viewBoxSize?.width
      ?? (viewport.clientWidth > 0 ? viewport.clientWidth : DEFAULT_MERMAID_BASE_WIDTH);
  const ratio = rect.width > 0 && rect.height > 0
    ? rect.height / rect.width
    : attrWidth && attrHeight && attrWidth > 0
      ? attrHeight / attrWidth
      : viewBoxSize && viewBoxSize.width > 0
        ? viewBoxSize.height / viewBoxSize.width
        : DEFAULT_MERMAID_BASE_HEIGHT / DEFAULT_MERMAID_BASE_WIDTH;
  const height = rect.height > 0
    ? rect.height
    : attrHeight
      ?? Math.max(1, width * ratio);

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function readMermaidBaseSize(viewport: HTMLElement) {
  const baseWidth = Number(viewport.dataset.mermaidBaseWidth ?? '');
  const baseHeight = Number(viewport.dataset.mermaidBaseHeight ?? '');
  return {
    width: Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : DEFAULT_MERMAID_BASE_WIDTH,
    height: Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : DEFAULT_MERMAID_BASE_HEIGHT,
  };
}

function getMermaidViewportBounds(viewport: HTMLElement, scale: number) {
  const baseSize = readMermaidBaseSize(viewport);
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  const contentWidth = baseSize.width * scale;
  const contentHeight = baseSize.height * scale;

  return {
    maxScrollLeft: Math.max(0, contentWidth - viewportWidth),
    maxScrollTop: Math.max(0, contentHeight - viewportHeight),
  };
}

function canPanMermaidViewport(viewport: HTMLElement, scale: number) {
  const bounds = getMermaidViewportBounds(viewport, scale);
  return bounds.maxScrollLeft > 0.5 || bounds.maxScrollTop > 0.5;
}

function writeMermaidViewportState(
  viewport: HTMLDivElement,
  nextState: MermaidViewportState & {
    scrollLeft?: number;
    scrollTop?: number;
  },
) {
  const scale = clampMermaidScale(nextState.scale);
  const svg = getMermaidSvgElement(viewport);
  if (!svg) {
    return;
  }

  const baseSize = readMermaidBaseSize(viewport);
  svg.style.width = `${baseSize.width * scale}px`;
  svg.style.height = `${baseSize.height * scale}px`;
  svg.style.maxWidth = 'none';

  const bounds = getMermaidViewportBounds(viewport, scale);
  const scrollLeft = scale <= 1 + MERMAID_STATE_EPSILON
    ? 0
    : Math.max(0, Math.min(bounds.maxScrollLeft, nextState.scrollLeft ?? viewport.scrollLeft));
  const scrollTop = scale <= 1 + MERMAID_STATE_EPSILON
    ? 0
    : Math.max(0, Math.min(bounds.maxScrollTop, nextState.scrollTop ?? viewport.scrollTop));

  viewport.dataset.mermaidScale = scale.toFixed(4);
  viewport.dataset.mermaidCanPan = canPanMermaidViewport(viewport, scale) ? 'true' : 'false';
  viewport.classList.toggle('is-zoomed', scale > 1 + MERMAID_STATE_EPSILON);
  viewport.scrollLeft = scrollLeft;
  viewport.scrollTop = scrollTop;

  const host = viewport.closest('.mermaid-host');
  const resetButton = host?.querySelector<HTMLButtonElement>('[data-mermaid-action="reset"]');
  if (resetButton) {
    resetButton.disabled = scale <= 1 + MERMAID_STATE_EPSILON;
  }
}

function zoomMermaidViewport(
  viewport: HTMLDivElement,
  direction: 'in' | 'out',
  anchor?: { clientX: number; clientY: number },
) {
  const currentState = readMermaidViewportState(viewport);
  const scaleFactor = direction === 'in' ? MERMAID_ZOOM_STEP : 1 / MERMAID_ZOOM_STEP;
  const nextScale = clampMermaidScale(currentState.scale * scaleFactor);
  if (Math.abs(nextScale - currentState.scale) < MERMAID_STATE_EPSILON) {
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const anchorX = anchor ? anchor.clientX - rect.left : rect.width / 2;
  const anchorY = anchor ? anchor.clientY - rect.top : rect.height / 2;
  const safeAnchorX = Number.isFinite(anchorX) ? anchorX : 0;
  const safeAnchorY = Number.isFinite(anchorY) ? anchorY : 0;
  const contentX = (viewport.scrollLeft + safeAnchorX) / currentState.scale;
  const contentY = (viewport.scrollTop + safeAnchorY) / currentState.scale;

  writeMermaidViewportState(viewport, {
    scale: nextScale,
    scrollLeft: contentX * nextScale - safeAnchorX,
    scrollTop: contentY * nextScale - safeAnchorY,
  });
}

function resetMermaidViewport(viewport: HTMLDivElement) {
  writeMermaidViewportState(viewport, {
    ...DEFAULT_MERMAID_VIEWPORT_STATE,
    scrollLeft: 0,
    scrollTop: 0,
  });
}

function initializeMermaidViewport(viewport: HTMLDivElement) {
  const svg = getMermaidSvgElement(viewport);
  if (!svg) {
    return;
  }

  const baseSize = measureMermaidBaseSize(viewport, svg);
  viewport.dataset.mermaidBaseWidth = baseSize.width.toFixed(2);
  viewport.dataset.mermaidBaseHeight = baseSize.height.toFixed(2);
  resetMermaidViewport(viewport);
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
  const [isResizing, setIsResizing] = useState(false);
  const [previewImageContextMenu, setPreviewImageContextMenu] = useState<PreviewImageContextMenuState | null>(null);
  const [isCopyingPreviewImage, setIsCopyingPreviewImage] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizePreviewRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const previewImageContextMenuRef = useRef<HTMLDivElement | null>(null);
  const latestScrollRatioRef = useRef<ScrollRatioState>({ top: 0, left: 0 });
  const mermaidRenderVersionRef = useRef(0);
  const mermaidPanStateRef = useRef<MermaidPanState | null>(null);
  const mermaidPanCleanupRef = useRef<(() => void) | null>(null);
  const requestVersionRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const inFlightRefreshRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const resizePendingRatioRef = useRef(clampPreviewRatio(previewWidthRatio));
  const resizeFrameRef = useRef<number | null>(null);
  const markdownEnabled = isMarkdownTab(tab);
  const deferredMarkdownSource = useDeferredValue(markdownSource);

  const updateResizePreviewLine = useCallback((clientX: number, top: number, height: number) => {
    const previewLine = resizePreviewRef.current;
    if (!previewLine) {
      return;
    }

    previewLine.style.left = `${Math.round(clientX)}px`;
    previewLine.style.top = `${Math.round(top)}px`;
    previewLine.style.height = `${Math.round(height)}px`;
  }, []);

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

  useEffect(() => {
    if (!previewImageContextMenu) {
      return;
    }

    const handleWindowPointerDown = (event: PointerEvent) => {
      if (
        previewImageContextMenuRef.current
        && event.target instanceof Node
        && previewImageContextMenuRef.current.contains(event.target)
      ) {
        return;
      }

      setPreviewImageContextMenu(null);
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setPreviewImageContextMenu(null);
    };

    const handleWindowBlur = () => {
      setPreviewImageContextMenu(null);
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [previewImageContextMenu]);
  const handlePreviewScroll = useCallback(() => {
    const previewScroller = previewScrollRef.current;
    if (!previewScroller) {
      return;
    }

    const previewMaxTop = Math.max(0, previewScroller.scrollHeight - previewScroller.clientHeight);
    const previewMaxLeft = Math.max(0, previewScroller.scrollWidth - previewScroller.clientWidth);
    const ratios = {
      top: previewMaxTop > 0 ? previewScroller.scrollTop / previewMaxTop : 0,
      left: previewMaxLeft > 0 ? previewScroller.scrollLeft / previewMaxLeft : 0,
    };

    latestScrollRatioRef.current = ratios;



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

  const renderedHtml = useMemo(() => {
    if (!markdownEnabled || !deferredMarkdownSource) {
      return '';
    }

    const parsedHtml = marked.parse(deferredMarkdownSource) as string;
    return rewriteMarkdownPreviewHtml(parsedHtml, tab?.path);
  }, [deferredMarkdownSource, markdownEnabled, tab?.path]);


  const stopMermaidPan = useCallback(() => {
    mermaidPanCleanupRef.current?.();
    mermaidPanCleanupRef.current = null;
    mermaidPanStateRef.current = null;
  }, []);

  const handlePreviewClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const targetElement = event.target;
    if (!(targetElement instanceof Element)) {
      return;
    }

    const mermaidActionElement = targetElement.closest<HTMLElement>('[data-mermaid-action]');
    if (mermaidActionElement) {
      const host = mermaidActionElement.closest('.mermaid-host');
      const viewport = host?.querySelector<HTMLDivElement>(MERMAID_VIEWPORT_SELECTOR);
      if (!viewport) {
        return;
      }

      const action = mermaidActionElement.dataset.mermaidAction;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'zoom-in') {
        zoomMermaidViewport(viewport, 'in');
      } else if (action === 'zoom-out') {
        zoomMermaidViewport(viewport, 'out');
      } else if (action === 'reset') {
        resetMermaidViewport(viewport);
      }
      return;
    }

    const linkElement = targetElement.closest('a[href]');
    if (linkElement) {
      const openTarget = linkElement.getAttribute(MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE);
      if (!openTarget) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void openUrl(openTarget).catch((error) => {
        console.error('Failed to open markdown preview link:', error);
      });
      return;
    }

    const imageElement = targetElement.closest('img[src]');
    if (!imageElement) {
      return;
    }

    const openTarget = imageElement.getAttribute(MARKDOWN_PREVIEW_OPEN_TARGET_ATTRIBUTE);
    if (!openTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void openUrl(openTarget).catch((error) => {
      console.error('Failed to open markdown preview image:', error);
    });
  }, []);

  const handlePreviewPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const targetElement = event.target;
    if (!(targetElement instanceof Element)) {
      return;
    }

    if (targetElement.closest('[data-mermaid-action]')) {
      return;
    }

    const viewport = targetElement.closest<HTMLDivElement>(MERMAID_VIEWPORT_SELECTOR);
    if (!viewport) {
      return;
    }

    const currentState = readMermaidViewportState(viewport);
    if (!canPanMermaidViewport(viewport, currentState.scale)) {
      return;
    }

    stopMermaidPan();
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      document.body.style.userSelect = '';
      viewport.classList.remove('is-panning');
      try {
        viewport.releasePointerCapture(pointerId);
      } catch {
      }
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const panState = mermaidPanStateRef.current;
      if (!panState || moveEvent.pointerId !== panState.pointerId) {
        return;
      }

      writeMermaidViewportState(panState.viewport, {
        scale: currentState.scale,
        scrollLeft: panState.startScrollLeft - (moveEvent.clientX - panState.startClientX),
        scrollTop: panState.startScrollTop - (moveEvent.clientY - panState.startClientY),
      });
    };

    const onPointerUp = (endEvent: PointerEvent) => {
      const panState = mermaidPanStateRef.current;
      if (!panState || endEvent.pointerId !== panState.pointerId) {
        return;
      }

      stopMermaidPan();
    };

    mermaidPanStateRef.current = {
      pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      viewport,
    };
    mermaidPanCleanupRef.current = cleanup;
    viewport.classList.add('is-panning');
    document.body.style.userSelect = 'none';
    try {
      viewport.setPointerCapture(pointerId);
    } catch {
    }
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
  }, [stopMermaidPan]);
  const handlePreviewContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const targetElement = event.target;
    if (!(targetElement instanceof Element)) {
      setPreviewImageContextMenu(null);
      return;
    }

    const imageElement = targetElement.closest('img[src]');
    if (!(imageElement instanceof HTMLImageElement) || !previewArticleRef.current?.contains(imageElement)) {
      setPreviewImageContextMenu(null);
      return;
    }

    event.stopPropagation();
    setPreviewImageContextMenu({
      x: clampPreviewContextMenuPosition(
        event.clientX,
        PREVIEW_IMAGE_CONTEXT_MENU_WIDTH,
        window.innerWidth,
      ),
      y: clampPreviewContextMenuPosition(
        event.clientY,
        PREVIEW_IMAGE_CONTEXT_MENU_HEIGHT,
        window.innerHeight,
      ),
      imageElement,
    });
  }, []);
  const handleCopyPreviewImage = useCallback(async () => {
    if (!previewImageContextMenu || isCopyingPreviewImage) {
      return;
    }

    setIsCopyingPreviewImage(true);

    try {
      await copyMarkdownPreviewImageToClipboard(previewImageContextMenu.imageElement);
    } catch (error) {
      console.error('Failed to copy markdown preview image:', error);
    } finally {
      setIsCopyingPreviewImage(false);
      setPreviewImageContextMenu(null);
    }
  }, [isCopyingPreviewImage, previewImageContextMenu]);

  useEffect(() => {
    if (!open || !markdownEnabled || !renderedHtml) {
      return;
    }

    stopMermaidPan();
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

          const shell = document.createElement('div');
          shell.className = 'mermaid-interactive-shell';

          const controlRow = document.createElement('div');
          controlRow.className = 'mermaid-control-row';

          const zoomOutButton = document.createElement('button');
          zoomOutButton.type = 'button';
          zoomOutButton.className = 'mermaid-control-button';
          zoomOutButton.dataset.mermaidAction = 'zoom-out';
          zoomOutButton.textContent = '-';
          zoomOutButton.title = t(language, 'preview.mermaid.zoomOut');
          zoomOutButton.setAttribute('aria-label', t(language, 'preview.mermaid.zoomOut'));

          const zoomInButton = document.createElement('button');
          zoomInButton.type = 'button';
          zoomInButton.className = 'mermaid-control-button';
          zoomInButton.dataset.mermaidAction = 'zoom-in';
          zoomInButton.textContent = '+';
          zoomInButton.title = t(language, 'preview.mermaid.zoomIn');
          zoomInButton.setAttribute('aria-label', t(language, 'preview.mermaid.zoomIn'));

          const resetButton = document.createElement('button');
          resetButton.type = 'button';
          resetButton.className = 'mermaid-control-button mermaid-control-button-reset';
          resetButton.dataset.mermaidAction = 'reset';
          resetButton.textContent = t(language, 'preview.mermaid.resetView');
          resetButton.title = t(language, 'preview.mermaid.resetView');
          resetButton.setAttribute('aria-label', t(language, 'preview.mermaid.resetView'));

          controlRow.appendChild(zoomOutButton);
          controlRow.appendChild(zoomInButton);
          controlRow.appendChild(resetButton);

          const viewport = document.createElement('div');
          viewport.className = 'mermaid-interactive-viewport';
          viewport.dataset.mermaidViewport = 'true';
          viewport.title = t(language, 'preview.mermaid.interactionHint');
          viewport.setAttribute('aria-label', t(language, 'preview.mermaid.interactionHint'));

          const canvas = document.createElement('div');
          canvas.className = 'mermaid-interactive-canvas';
          canvas.dataset.mermaidCanvas = 'true';
          canvas.innerHTML = renderResult.svg;

          zoomOutButton.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            zoomMermaidViewport(viewport, 'out');
          });
          zoomInButton.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            zoomMermaidViewport(viewport, 'in');
          });
          resetButton.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            resetMermaidViewport(viewport);
          });

          viewport.appendChild(canvas);
          shell.appendChild(controlRow);
          shell.appendChild(viewport);
          host.replaceChildren(shell);
          initializeMermaidViewport(viewport);
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
  // Mermaid computes its SVG layout from the current preview width, so splitter drags
  // need to trigger a fresh render even when the markdown source itself is unchanged.
  }, [appTheme, applyScrollRatio, language, markdownEnabled, open, previewWidthRatio, renderedHtml, stopMermaidPan]);

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

  useEffect(() => stopMermaidPan, [stopMermaidPan]);

  useEffect(() => {
    resizePendingRatioRef.current = clampPreviewRatio(previewWidthRatio);
  }, [previewWidthRatio]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
  }, []);

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
    const nextPreviewState = {
      clientX: event.clientX,
      top: containerRect.top,
      height: containerRect.height,
    };

    const computeRatio = (clientX: number) => {
      const nextWidth = containerRect.right - clientX;
      return clampPreviewRatio(nextWidth / containerRect.width);
    };

    resizePendingRatioRef.current = computeRatio(event.clientX);
    updateResizePreviewLine(
      nextPreviewState.clientX,
      nextPreviewState.top,
      nextPreviewState.height
    );
    setIsResizing(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      resizePendingRatioRef.current = computeRatio(moveEvent.clientX);

      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        updateResizePreviewLine(moveEvent.clientX, containerRect.top, containerRect.height);
      });
    };

    const cleanup = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);
      setPreviewWidthRatio(resizePendingRatioRef.current);
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
  }, [open, setPreviewWidthRatio, updateResizePreviewLine]);

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const targetElement = event.target;
    if (targetElement instanceof Element) {
      const mermaidViewport = targetElement.closest<HTMLDivElement>(MERMAID_VIEWPORT_SELECTOR);
      if (mermaidViewport) {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          zoomMermaidViewport(mermaidViewport, event.deltaY < 0 ? 'in' : 'out', {
            clientX: event.clientX,
            clientY: event.clientY,
          });
          return;
        }

        if (canPanMermaidViewport(mermaidViewport, readMermaidViewportState(mermaidViewport).scale)) {
          return;
        }
      }
    }

  }, []);

  return (
    <div
      ref={panelRef}
      aria-hidden={!open}
      className={cn(
        // Width animation causes repeated Monaco wrap/layout recalculation when adjacent
        // sidebars change size, which is especially expensive for markdown tabs that
        // contain very long base64 image lines under word-wrap mode.
        'relative h-full shrink-0 overflow-hidden bg-background/95 transition-[opacity,border-color] duration-200 ease-out',
        open
          ? 'border-l border-border opacity-100 pointer-events-auto'
          : 'border-l border-transparent opacity-0 pointer-events-none'
      )}
      onContextMenu={handlePreviewContextMenu}
      style={{ width: open ? `${clampPreviewRatio(previewWidthRatio) * 100}%` : '0px' }}
    >
      <div
        ref={resizePreviewRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed bottom-auto top-0 z-[85] w-px bg-primary/70 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]',
          isResizing ? 'opacity-100' : 'opacity-0'
        )}
      />
      <section
        className={cn(
          'relative flex h-full w-full flex-col transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {previewImageContextMenu ? (
          <div
            ref={previewImageContextMenuRef}
            role="menu"
            className="fixed z-[90] w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: previewImageContextMenu.x, top: previewImageContextMenu.y }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCopyingPreviewImage}
              onClick={() => {
                void handleCopyPreviewImage();
              }}
            >
              {tr('preview.copyImage')}
            </button>
          </div>
        ) : null}
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
          onScroll={handlePreviewScroll}
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
              onClick={handlePreviewClick}
              onPointerDown={handlePreviewPointerDown}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
