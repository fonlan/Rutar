// Lightweight wrapper around performance.mark / performance.measure that is
// safe to call in any environment (SSR, vitest, browser). When the User
// Timing API is missing or throws, every helper turns into a no-op.

type PerfDumpShape = {
  marks: Array<{ name: string; startTime: number }>;
  measures: Array<{ name: string; duration: number; startTime: number }>;
};

type PerfMarkRecorder = {
  mark(name: string): void;
  measure(name: string, startMark: string, endMark?: string): number | null;
  collect(filter?: string): PerfDumpShape['measures'];
  publish(): void;
};

function getPerformance(): Performance | null {
  if (typeof performance === 'undefined') {
    return null;
  }
  return performance;
}

function safe<T>(operation: () => T, fallback: T): T {
  try {
    return operation();
  } catch {
    return fallback;
  }
}

export const perfMark: PerfMarkRecorder = {
  mark(name) {
    const perf = getPerformance();
    if (!perf || typeof perf.mark !== 'function') {
      return;
    }
    safe(() => perf.mark(name), undefined);
  },
  measure(name, startMark, endMark) {
    const perf = getPerformance();
    if (!perf || typeof perf.measure !== 'function') {
      return null;
    }
    return safe(() => {
      const entry = perf.measure(name, startMark, endMark);
      if (entry && typeof entry.duration === 'number') {
        return entry.duration;
      }
      const measures = perf.getEntriesByName(name, 'measure');
      const latest = measures[measures.length - 1];
      return latest ? latest.duration : null;
    }, null);
  },
  collect(filter) {
    const perf = getPerformance();
    if (!perf || typeof perf.getEntriesByType !== 'function') {
      return [];
    }
    return safe(() => {
      return perf
        .getEntriesByType('measure')
        .filter((entry) => (filter ? entry.name.includes(filter) : true))
        .map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
        }));
    }, []);
  },
  publish() {
    const perf = getPerformance();
    if (!perf || typeof perf.getEntriesByType !== 'function') {
      return;
    }
    safe(() => {
      const marks = perf.getEntriesByType('mark').map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
      }));
      const measures = perf.getEntriesByType('measure').map((entry) => ({
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime,
      }));
      const sink = globalThis as { __rutarPerfDump?: PerfDumpShape };
      sink.__rutarPerfDump = { marks, measures };
    }, undefined);
  },
};

export const PERF_MARKS = {
  appBootStart: 'rutar:boot:start',
  appReactMounted: 'rutar:boot:react-mounted',
  monacoEnvSetup: 'rutar:monaco:env-setup',
  monacoFirstEditorReady: 'rutar:monaco:first-editor-ready',
} as const;
