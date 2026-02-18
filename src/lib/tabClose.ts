import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { AppLanguage, FileTab } from '@/store/useStore';
import { requestTabCloseConfirm } from '@/lib/closeConfirm';

type UpdateTab = (id: string, updates: Partial<FileTab>) => void;

export type TabCloseDecision = 'save' | 'discard' | 'cancel' | 'save_all' | 'discard_all';

function getTabDisplayName(tab: FileTab) {
  return tab.name || tab.path || 'Untitled';
}

export function shouldEnableBulkTabCloseActions(
  tabs: ReadonlyArray<Pick<FileTab, 'isDirty'>>,
  allowAllActions: boolean
): boolean {
  if (!allowAllActions) {
    return false;
  }

  let dirtyCount = 0;
  for (const tab of tabs) {
    if (!tab.isDirty) {
      continue;
    }

    dirtyCount += 1;
    if (dirtyCount > 1) {
      return true;
    }
  }

  return false;
}

export async function saveTab(tab: FileTab, updateTab: UpdateTab): Promise<boolean> {
  if (tab.path) {
    await invoke('save_file', { id: tab.id });
    updateTab(tab.id, { isDirty: false });
    return true;
  }

  const selected = await save({
    defaultPath: tab.name || 'Untitled.txt',
  });

  if (!selected || typeof selected !== 'string') {
    return false;
  }

  await invoke('save_file_as', { id: tab.id, path: selected });
  const name = selected.split(/[\\/]/).pop() || selected;
  updateTab(tab.id, { path: selected, name, isDirty: false });
  return true;
}

export async function confirmTabClose(
  tab: FileTab,
  language: AppLanguage,
  allowAllActions: boolean
): Promise<TabCloseDecision> {
  if (!tab.isDirty) {
    return 'discard';
  }

  return requestTabCloseConfirm({
    language,
    tabName: getTabDisplayName(tab),
    allowAllActions,
  });
}

export async function ensureTabCanClose(
  tab: FileTab,
  language: AppLanguage,
  updateTab: UpdateTab
): Promise<boolean> {
  const decision = await confirmTabClose(tab, language, false);

  if (decision === 'cancel') {
    return false;
  }

  if (decision === 'discard') {
    return true;
  }

  try {
    return await saveTab(tab, updateTab);
  } catch (error) {
    console.error('Failed to save file before closing tab:', error);
    return false;
  }
}
