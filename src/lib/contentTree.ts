import { invoke } from '@tauri-apps/api/core';
import { FileTab, ContentTreeNode, ContentTreeType } from '@/store/useStore';

const CONTENT_TREE_TYPE_BY_EXTENSION: Record<string, Exclude<ContentTreeType, null>> = {
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
};

export function detectContentTreeType(tab: FileTab | null | undefined): ContentTreeType {
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

  return CONTENT_TREE_TYPE_BY_EXTENSION[extension] ?? null;
}

export function dispatchNavigateToLineFromContentTree(tabId: string, line: number, column: number) {
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
        source: 'content-tree',
      },
    })
  );

    window.dispatchEvent(
      new CustomEvent('rutar:navigate-to-content-tree', {
        detail: {
        tabId,
        line: safeLine,
        column: safeColumn,
        length: 0,
        source: 'content-tree',
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

export async function loadContentTree(
  tab: FileTab,
  treeType: Exclude<ContentTreeType, null>
): Promise<ContentTreeNode[]> {
  return invoke<ContentTreeNode[]>('get_content_tree', {
    id: tab.id,
    fileType: treeType,
  });
}
