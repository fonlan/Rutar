import type { FileTab } from '@/store/useStore';

const MARKDOWN_EXTENSION_RE =
  /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|rmd|qmd|mdx)$/i;

export function isMarkdownTab(
  tab: Pick<FileTab, 'name' | 'path' | 'syntaxOverride'> | null | undefined
) {
  if (!tab) {
    return false;
  }

  if (tab.syntaxOverride === 'markdown') {
    return true;
  }

  const candidate = (tab.path || tab.name || '').trim();
  if (!candidate) {
    return false;
  }

  const normalized = candidate.split(/[\\/]/).pop() ?? candidate;
  return MARKDOWN_EXTENSION_RE.test(normalized);
}
