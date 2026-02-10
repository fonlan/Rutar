import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { FileTab, SyntaxKey } from '@/store/useStore';

export type StructuredFormatSyntaxKey = Extract<SyntaxKey, 'json' | 'yaml' | 'xml' | 'html' | 'toml'>;

const STRUCTURED_SYNTAX_KEYS = new Set<StructuredFormatSyntaxKey>(['json', 'yaml', 'xml', 'html', 'toml']);

export function detectStructuredFormatSyntaxKey(tab?: FileTab | null): StructuredFormatSyntaxKey | null {
  if (!tab) {
    return null;
  }

  const activeSyntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
  if (!STRUCTURED_SYNTAX_KEYS.has(activeSyntaxKey as StructuredFormatSyntaxKey)) {
    return null;
  }

  return activeSyntaxKey as StructuredFormatSyntaxKey;
}

export function isStructuredFormatSupported(tab?: FileTab | null) {
  return detectStructuredFormatSyntaxKey(tab) !== null;
}
