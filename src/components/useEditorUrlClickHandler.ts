import { openUrl } from '@tauri-apps/plugin-opener';
import type * as monaco from 'monaco-editor';
import { useCallback } from 'react';

// Recognises bare URL strings; the trim step decides where each ends.
const HTTP_URL_PATTERN_SOURCE = 'h' + 't' + 'tps?:' + '\\/\\/' + '[^\\s<>"' + "'" + '`]+';
const HTTP_URL_TRAILING_PUNCTUATION_PATTERN = new RegExp('[),.;:!?]+$');

function trimHttpUrlCandidate(rawUrl: string) {
  if (!rawUrl) {
    return '';
  }

  return rawUrl.replace(HTTP_URL_TRAILING_PUNCTUATION_PATTERN, '');
}

function getHttpUrlAtLineColumn(lineText: string, column: number) {
  if (!lineText) {
    return null;
  }

  const safeColumn = Math.max(0, Math.min(Math.floor(column), lineText.length));
  const regex = new RegExp(HTTP_URL_PATTERN_SOURCE, 'gi');

  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(lineText)) !== null) {
    const rawUrl = match[0] ?? '';
    const trimmedUrl = trimHttpUrlCandidate(rawUrl);
    if (!trimmedUrl) {
      continue;
    }

    const start = match.index;
    const end = start + trimmedUrl.length;
    if (safeColumn >= start && safeColumn <= end) {
      return trimmedUrl;
    }
  }

  return null;
}

// Stable handler for Monaco mousedown events that look like a modifier-click
// over a URL; opens the URL via the Tauri opener plugin. Returns true when
// the event was consumed.
export function useEditorUrlClickHandler() {
  return useCallback((
    editor: monaco.editor.IStandaloneCodeEditor,
    event: monaco.editor.IEditorMouseEvent,
  ): boolean => {
    if (!event.event.leftButton) {
      return false;
    }
    if (!event.event.ctrlKey && !event.event.metaKey) {
      return false;
    }
    const position = event.target.position;
    if (!position) {
      return false;
    }
    const model = editor.getModel();
    if (!model) {
      return false;
    }
    const lineText = model.getLineContent(position.lineNumber);
    const url = getHttpUrlAtLineColumn(lineText, position.column - 1);
    if (!url) {
      return false;
    }
    event.event.preventDefault();
    event.event.stopPropagation();
    void openUrl(url).catch((error) => {
      console.error('Failed to open hyperlink in Monaco editor:', error);
    });
    return true;
  }, []);
}
