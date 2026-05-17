import { type FileTab } from '@/store/useStore';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';

export function resolveMonacoLanguage(fileTab: FileTab | null | undefined): string {
  if (!fileTab) {
    return 'plaintext';
  }

  const syntaxKey = fileTab.syntaxOverride ?? detectSyntaxKeyFromTab(fileTab);
  switch (syntaxKey) {
    case 'plain_text':
      return 'plaintext';
    case 'markdown':
      return 'markdown';
    case 'dockerfile':
      return 'dockerfile';
    case 'makefile':
      return 'makefile';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'rust':
      return 'rust';
    case 'python':
      return 'python';
    case 'json':
      return 'json';
    case 'jsonc':
      return 'json';
    case 'ini':
      return 'ini';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'batch':
      return 'bat';
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'toml':
      return 'ini';
    case 'yaml':
      return 'yaml';
    case 'xml':
      return 'xml';
    case 'c':
      return 'c';
    case 'cpp':
      return 'cpp';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'csharp':
      return 'csharp';
    case 'hcl':
      return 'hcl';
    case 'lua':
      return 'lua';
    case 'php':
      return 'php';
    case 'kotlin':
      return 'kotlin';
    case 'powershell':
      return 'powershell';
    case 'ruby':
      return 'ruby';
    case 'sql':
      return 'sql';
    case 'swift':
      return 'swift';
    default:
      return 'plaintext';
  }
}
