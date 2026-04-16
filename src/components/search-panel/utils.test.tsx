import { describe, expect, it } from 'vitest';
import { getReservedLayoutHeight } from './utils';

function mockHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      height,
    }),
  });
}

describe('search-panel utils', () => {
  it('sums all reserved toolbar and titlebar heights', () => {
    const titlebar = document.createElement('div');
    titlebar.setAttribute('data-layout-region', 'titlebar');
    mockHeight(titlebar, 32);

    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-layout-region', 'toolbar');
    mockHeight(toolbar, 40);

    const markdownToolbar = document.createElement('div');
    markdownToolbar.setAttribute('data-layout-region', 'toolbar');
    mockHeight(markdownToolbar, 40);

    document.body.appendChild(titlebar);
    document.body.appendChild(toolbar);
    document.body.appendChild(markdownToolbar);

    expect(
      getReservedLayoutHeight('[data-layout-region="titlebar"], [data-layout-region="toolbar"]'),
    ).toBe(112);

    titlebar.remove();
    toolbar.remove();
    markdownToolbar.remove();
  });
});
