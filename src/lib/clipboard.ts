import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Strict plain-text writer. Uses the standard async clipboard API and throws
 * when unavailable. Suitable for callers that already gate UI on a feature
 * detection or that want a hard failure.
 *
 * For a more permissive variant with a textarea `execCommand` fallback, see
 * `src/components/search-panel/utils.tsx`.
 */
export async function writePlainTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard write is not supported.');
}

/**
 * Strict plain-text reader. Uses the standard async clipboard API and throws
 * when unavailable.
 */
export async function readPlainTextFromClipboard(): Promise<string> {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  throw new Error('Clipboard read is not supported.');
}

/**
 * Like `readPlainTextFromClipboard`, but prefers the Tauri clipboard plugin
 * first and falls back to the browser API. Used by callers that need to read
 * text inside the WebView where the browser API is sometimes restricted.
 */
export async function readPlainTextFromClipboardWithTauriFallback(): Promise<string> {
  try {
    return await readClipboardText();
  } catch {
    return readPlainTextFromClipboard();
  }
}
