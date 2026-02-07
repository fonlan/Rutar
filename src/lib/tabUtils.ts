import { FileTab } from '@/store/useStore';

export function isReusableBlankTab(tab?: FileTab | null) {
  if (!tab) {
    return false;
  }

  return !tab.path && !tab.isDirty && tab.lineCount <= 1;
}
