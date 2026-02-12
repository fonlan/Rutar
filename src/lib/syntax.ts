import { FileTab, SyntaxKey } from '@/store/useStore';

export const SYNTAX_OPTIONS: Array<{ value: SyntaxKey; label: string }> = [
  { value: 'plain_text', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'rust', label: 'Rust' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'ini', label: 'INI' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash' },
  { value: 'toml', label: 'TOML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
];

const syntaxLabelByValue = new Map(SYNTAX_OPTIONS.map((item) => [item.value, item.label]));
const lineCommentPrefixBySyntax: Partial<Record<SyntaxKey, string>> = {
  plain_text: '#',
  markdown: '#',
  python: '#',
  bash: '#',
  toml: '#',
  ini: '#',
  yaml: '#',
  json: '#',
  javascript: '//',
  typescript: '//',
  rust: '//',
  c: '//',
  cpp: '//',
  go: '//',
  java: '//',
  csharp: '//',
  php: '//',
  kotlin: '//',
  swift: '//',
  css: '//',
  html: '//',
  xml: '//',
};

function toLowerFileName(input: string) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.split(/[\\/]/).pop()?.toLowerCase() ?? '';
}

export function detectSyntaxKeyFromTab(tab: Pick<FileTab, 'name' | 'path'>): SyntaxKey {
  const fileName = toLowerFileName(tab.path || tab.name);
  if (!fileName) {
    return 'plain_text';
  }

  if (fileName === 'dockerfile' || fileName === 'makefile') {
    return 'bash';
  }

  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === fileName.length - 1) {
    return 'plain_text';
  }

  const extension = fileName.slice(dotIndex + 1);
  switch (extension) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'rs':
      return 'rust';
    case 'py':
    case 'pyw':
      return 'python';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'md':
    case 'markdown':
    case 'mdown':
    case 'mkd':
    case 'mkdn':
    case 'mdwn':
    case 'mdtxt':
    case 'mdtext':
    case 'rmd':
    case 'qmd':
    case 'mdx':
      return 'markdown';
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'cnf':
    case 'properties':
      return 'ini';
    case 'html':
    case 'htm':
    case 'xhtml':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'toml':
      return 'toml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'c':
    case 'h':
      return 'c';
    case 'cc':
    case 'cp':
    case 'cpp':
    case 'cxx':
    case 'c++':
    case 'hh':
    case 'hpp':
    case 'hxx':
      return 'cpp';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'cs':
      return 'csharp';
    case 'php':
    case 'phtml':
      return 'php';
    case 'kt':
    case 'kts':
      return 'kotlin';
    case 'swift':
      return 'swift';
    default:
      return 'plain_text';
  }
}

export function getSyntaxLabel(value: SyntaxKey) {
  return syntaxLabelByValue.get(value) ?? 'Plain Text';
}

export function getLineCommentPrefixForSyntaxKey(syntaxKey?: SyntaxKey | null) {
  if (!syntaxKey) {
    return '#';
  }

  return lineCommentPrefixBySyntax[syntaxKey] ?? '#';
}
