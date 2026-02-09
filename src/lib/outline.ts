import { invoke } from '@tauri-apps/api/core';
import { FileTab, OutlineNode, OutlineType } from '@/store/useStore';

const OUTLINE_TYPE_BY_SYNTAX_KEY: Record<string, Exclude<OutlineType, null>> = {
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  c: 'c',
  cpp: 'cpp',
  go: 'go',
  java: 'java',
  rust: 'rust',
  csharp: 'csharp',
  php: 'php',
  kotlin: 'kotlin',
  swift: 'swift',
};

const OUTLINE_TYPE_BY_EXTENSION: Record<string, Exclude<OutlineType, null>> = {
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  cnf: 'ini',
  properties: 'ini',
  py: 'python',
  pyw: 'python',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cp: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  'c++': 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  go: 'go',
  java: 'java',
  rs: 'rust',
  cs: 'csharp',
  php: 'php',
  phtml: 'php',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
};

export function detectOutlineType(tab: FileTab | null | undefined): OutlineType {
  if (!tab) {
    return null;
  }

  const syntaxOverride = tab.syntaxOverride?.trim().toLowerCase();
  if (syntaxOverride) {
    const mappedBySyntax = OUTLINE_TYPE_BY_SYNTAX_KEY[syntaxOverride];
    if (mappedBySyntax) {
      return mappedBySyntax;
    }
  }

  const target = (tab.path || tab.name || '').trim().toLowerCase();
  if (!target.includes('.')) {
    return null;
  }

  const extension = target.split('.').pop();
  if (!extension) {
    return null;
  }

  return OUTLINE_TYPE_BY_EXTENSION[extension] ?? null;
}

export function dispatchNavigateToLineFromOutline(tabId: string, line: number, column: number) {
  const safeLine = Number.isFinite(line) ? Math.max(1, Math.floor(line)) : 1;
  const safeColumn = Number.isFinite(column) ? Math.max(1, Math.floor(column)) : 1;

  const emitNavigate = () => {
    window.dispatchEvent(
      new CustomEvent('rutar:navigate-to-line', {
        detail: {
        tabId,
        line: safeLine,
        column: safeColumn,
        length: 0,
        source: 'outline',
      },
    })
  );

    window.dispatchEvent(
      new CustomEvent('rutar:navigate-to-outline', {
        detail: {
        tabId,
        line: safeLine,
        column: safeColumn,
        length: 0,
        source: 'outline',
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

export async function loadOutline(
  tab: FileTab,
  outlineType: Exclude<OutlineType, null>
): Promise<OutlineNode[]> {
  return invoke<OutlineNode[]>('get_outline', {
    id: tab.id,
    fileType: outlineType,
  });
}
