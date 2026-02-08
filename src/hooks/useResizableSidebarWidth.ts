import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface UseResizableSidebarWidthOptions {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (nextWidth: number) => void;
  resizeEdge?: 'right' | 'left';
}

function clampWidth(value: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, value));
}

export function useResizableSidebarWidth({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  resizeEdge = 'right',
}: UseResizableSidebarWidthOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(width);
  const currentWidthRef = useRef(width);
  const pendingWidthRef = useRef(width);
  const rafRef = useRef<number | null>(null);

  const applyWidthToContainer = useCallback((nextWidth: number) => {
    currentWidthRef.current = nextWidth;

    if (containerRef.current) {
      containerRef.current.style.width = `${nextWidth}px`;
    }
  }, []);

  useEffect(() => {
    if (isResizing) {
      return;
    }

    const nextWidth = clampWidth(width, minWidth, maxWidth);
    applyWidthToContainer(nextWidth);
  }, [applyWidthToContainer, isResizing, maxWidth, minWidth, width]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handlePointerMove = (event: PointerEvent) => {
      const offsetX =
        resizeEdge === 'right'
          ? event.clientX - dragStartXRef.current
          : dragStartXRef.current - event.clientX;
      const nextWidth = clampWidth(dragStartWidthRef.current + offsetX, minWidth, maxWidth);

      if (nextWidth === pendingWidthRef.current) {
        return;
      }

      pendingWidthRef.current = nextWidth;

      if (rafRef.current !== null) {
        return;
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        applyWidthToContainer(pendingWidthRef.current);
      });
    };

    const stopResize = () => {
      setIsResizing(false);
      onWidthChange(currentWidthRef.current);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [applyWidthToContainer, isResizing, maxWidth, minWidth, onWidthChange, resizeEdge]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStartXRef.current = event.clientX;
      const startWidth = clampWidth(currentWidthRef.current, minWidth, maxWidth);
      dragStartWidthRef.current = startWidth;
      pendingWidthRef.current = startWidth;
      applyWidthToContainer(startWidth);
      setIsResizing(true);
    },
    [applyWidthToContainer, maxWidth, minWidth]
  );

  return {
    containerRef,
    isResizing,
    startResize,
  };
}
