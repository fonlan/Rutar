import { useEffect } from 'react';

type DiffPane = 'source' | 'target';

interface UseDiffSharedScrollOptions {
  activePanel: DiffPane;
  refreshSharedScrollMetrics: () => void;
  syncPanelsFromEditorScroll: (side: DiffPane) => void;
  invalidations: readonly unknown[];
}

// Keeps the shared diff scrollbar metrics fresh whenever something that
// affects pane heights changes (font size, wrap mode, line count, ratio,
// active pane). Uses one rAF tick after each invalidation; also listens to
// window resize so layout shifts after the first frame stay in sync.
export function useDiffSharedScroll(options: UseDiffSharedScrollOptions) {
  const { activePanel, refreshSharedScrollMetrics, syncPanelsFromEditorScroll, invalidations } = options;
  useEffect(() => {
    const syncSharedMetrics = () => {
      refreshSharedScrollMetrics();
      syncPanelsFromEditorScroll(activePanel);
    };
    const rafId = window.requestAnimationFrame(syncSharedMetrics);
    const handleWindowResize = () => {
      syncSharedMetrics();
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [activePanel, refreshSharedScrollMetrics, syncPanelsFromEditorScroll, ...invalidations]);
}
