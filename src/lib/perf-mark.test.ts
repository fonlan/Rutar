import { afterEach, describe, expect, it } from 'vitest';
import { PERF_MARKS, perfMark } from './perf-mark';

describe('perfMark', () => {
  afterEach(() => {
    if (typeof performance !== 'undefined' && typeof performance.clearMarks === 'function') {
      performance.clearMarks();
    }
    if (typeof performance !== 'undefined' && typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
    delete (globalThis as { __rutarPerfDump?: unknown }).__rutarPerfDump;
  });

  it('records a measurable span between two marks', () => {
    perfMark.mark(PERF_MARKS.appBootStart);
    perfMark.mark(PERF_MARKS.appReactMounted);
    const duration = perfMark.measure('rutar:test:span', PERF_MARKS.appBootStart, PERF_MARKS.appReactMounted);
    expect(duration).not.toBeNull();
    expect(duration ?? -1).toBeGreaterThanOrEqual(0);
  });

  it('collects measures filtered by substring', () => {
    perfMark.mark('a');
    perfMark.mark('b');
    perfMark.measure('rutar:keep:span', 'a', 'b');
    perfMark.measure('other:drop:span', 'a', 'b');
    const filtered = perfMark.collect('rutar:');
    expect(filtered.some((entry) => entry.name === 'rutar:keep:span')).toBe(true);
    expect(filtered.every((entry) => entry.name.startsWith('rutar:'))).toBe(true);
  });

  it('publish exposes a dump to globalThis', () => {
    perfMark.mark('rutar:test:publish-mark');
    perfMark.publish();
    const sink = globalThis as { __rutarPerfDump?: { marks: Array<{ name: string }> } };
    expect(sink.__rutarPerfDump).toBeDefined();
    expect(sink.__rutarPerfDump?.marks.some((entry) => entry.name === 'rutar:test:publish-mark')).toBe(true);
  });
});
