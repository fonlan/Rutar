import type { FileTab } from '@/store/useStore';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';

export function isMarkdownTab(
  tab: Pick<FileTab, 'name' | 'path' | 'syntaxOverride'> | null | undefined
) {
  if (!tab) {
    return false;
  }

  const resolvedSyntax = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
  return resolvedSyntax === 'markdown';
}
