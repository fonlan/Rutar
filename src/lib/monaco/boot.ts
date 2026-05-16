// Side-effect module pulled in by the lazy Editor and DiffEditor chunks.
// Imports Monaco editor CSS and initializes its environment exactly once;
// keeping this out of the app entry prevents Monaco from blocking first paint.

import 'monaco-editor/min/vs/editor/editor.main.css';
import { PERF_MARKS, perfMark } from '../perf-mark';
import { setupMonacoEnvironment } from './setupMonaco';

try {
  perfMark.mark('rutar:monaco:env-setup-start');
  setupMonacoEnvironment();
  perfMark.mark(PERF_MARKS.monacoEnvSetup);
  perfMark.measure('rutar:monaco:env-setup-duration', 'rutar:monaco:env-setup-start', PERF_MARKS.monacoEnvSetup);
} catch (error) {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[monaco/boot] setupMonacoEnvironment threw; continuing.', error);
  }
}
