import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(),
    onDragDropEvent: vi.fn(async () => vi.fn()),
    onCloseRequested: vi.fn(async () => vi.fn()),
  })),
}));

vi.mock('@/components/TitleBar', () => ({
  TitleBar: () => React.createElement('div', { 'data-testid': 'mock-titlebar' }),
}));

vi.mock('@/components/Toolbar', () => ({
  Toolbar: () => React.createElement('div', { 'data-testid': 'mock-toolbar' }),
}));

vi.mock('@/components/MarkdownPreviewPanel', () => ({
  MarkdownPreviewPanel: () => React.createElement('div', { 'data-testid': 'mock-preview' }),
}));

import { appTestUtils } from './App';

describe('appTestUtils.areStringArraysEqual', () => {
  it('returns true when arrays are identical by length and order', () => {
    expect(appTestUtils.areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false when arrays differ by length or order', () => {
    expect(appTestUtils.areStringArraysEqual(['a'], ['a', 'b'])).toBe(false);
    expect(appTestUtils.areStringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

describe('appTestUtils.normalizeLineEnding', () => {
  it('keeps explicit valid line endings unchanged', () => {
    expect(appTestUtils.normalizeLineEnding('CRLF')).toBe('CRLF');
    expect(appTestUtils.normalizeLineEnding('LF')).toBe('LF');
    expect(appTestUtils.normalizeLineEnding('CR')).toBe('CR');
  });

  it('falls back to platform default for unknown values', () => {
    const expected = appTestUtils.detectWindowsPlatform() ? 'CRLF' : 'LF';
    expect(appTestUtils.normalizeLineEnding()).toBe(expected);
    expect(appTestUtils.normalizeLineEnding('UNKNOWN' as never)).toBe(expected);
  });
});

describe('appTestUtils event dispatchers', () => {
  it('dispatches rutar:force-refresh with expected detail', () => {
    let detail:
      | { tabId: string; lineCount: number; preserveCaret: boolean }
      | undefined;

    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as {
        tabId: string;
        lineCount: number;
        preserveCaret: boolean;
      };
    };

    window.addEventListener('rutar:force-refresh', listener as EventListener);
    appTestUtils.dispatchEditorForceRefresh('tab-1', 42);
    window.removeEventListener('rutar:force-refresh', listener as EventListener);

    expect(detail).toEqual({
      tabId: 'tab-1',
      lineCount: 42,
      preserveCaret: false,
    });
  });

  it('dispatches rutar:document-updated with tab id', () => {
    let detail: { tabId: string } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as { tabId: string };
    };

    window.addEventListener('rutar:document-updated', listener as EventListener);
    appTestUtils.dispatchDocumentUpdated('tab-doc');
    window.removeEventListener('rutar:document-updated', listener as EventListener);

    expect(detail).toEqual({ tabId: 'tab-doc' });
  });

  it('dispatches rutar:navigate-to-line with fixed column', () => {
    let detail: { tabId: string; line: number; column: number } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as {
        tabId: string;
        line: number;
        column: number;
      };
    };

    window.addEventListener('rutar:navigate-to-line', listener as EventListener);
    appTestUtils.dispatchNavigateToLine('tab-nav', 7);
    window.removeEventListener('rutar:navigate-to-line', listener as EventListener);

    expect(detail).toEqual({
      tabId: 'tab-nav',
      line: 7,
      column: 1,
    });
  });

  it('dispatches rutar:gesture-preview with sequence', () => {
    let detail: { sequence: string } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as { sequence: string };
    };

    window.addEventListener('rutar:gesture-preview', listener as EventListener);
    appTestUtils.dispatchGesturePreview('RDLU');
    window.removeEventListener('rutar:gesture-preview', listener as EventListener);

    expect(detail).toEqual({ sequence: 'RDLU' });
  });
});
