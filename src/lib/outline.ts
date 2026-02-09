import { invoke } from '@tauri-apps/api/core';
import { FileTab, OutlineNode, OutlineType } from '@/store/useStore';

const OUTLINE_TYPE_BY_EXTENSION: Record<string, Exclude<OutlineType, null>> = {
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
};

export function detectOutlineType(tab: FileTab | null | undefined): OutlineType {
  if (!tab) {
    return null;
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
