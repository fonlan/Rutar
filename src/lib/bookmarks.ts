export function dispatchNavigateToLineFromBookmark(tabId: string, line: number) {
  const safeLine = Number.isFinite(line) ? Math.max(1, Math.floor(line)) : 1;

  const emitNavigate = () => {
    window.dispatchEvent(
      new CustomEvent('rutar:navigate-to-line', {
        detail: {
          tabId,
          line: safeLine,
          column: 1,
          length: 0,
          source: 'bookmark',
        },
      })
    );
  };

  emitNavigate();

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      emitNavigate();
    });

    window.setTimeout(() => {
      emitNavigate();
    }, 0);
  }
}
