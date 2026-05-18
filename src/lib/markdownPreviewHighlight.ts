type PrismLanguageGrammar = Record<string, unknown>;

type PrismApi = {
  highlightElement: (element: Element) => void;
  languages: Record<string, PrismLanguageGrammar | unknown>;
  manual?: boolean;
};

type GlobalScopeWithPrism = typeof globalThis & { Prism?: PrismApi };

const HIGHLIGHTED_MARK_ATTRIBUTE = 'data-rutar-prism-highlighted';
const LANGUAGE_CLASS_PATTERN = /^(?:lang|language)-.+$/i;

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  bat: 'batch',
  cmd: 'batch',
  conf: 'ini',
  cxx: 'cpp',
  'c++': 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  containerfile: 'docker',
  dockerfile: 'docker',
  golang: 'go',
  htm: 'markup',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  jsonc: 'json',
  kt: 'kotlin',
  make: 'makefile',
  md: 'markdown',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sass: 'scss',
  sh: 'bash',
  shell: 'bash',
  sqlite: 'sql',
  terraform: 'hcl',
  tf: 'hcl',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

let highlighterPromise: Promise<PrismApi | null> | null = null;
function reservePrismGlobal(): GlobalScopeWithPrism {
  const scope = globalThis as GlobalScopeWithPrism;
  if (!scope.Prism) {
    scope.Prism = {
      manual: true,
      languages: {},
      highlightElement: () => undefined,
    } as PrismApi;
  } else {
    scope.Prism.manual = true;
  }
  return scope;
}

async function bootstrapPrism(): Promise<PrismApi | null> {
  const scope = reservePrismGlobal();

  await import('prismjs');

  const prism = scope.Prism;
  if (!prism || typeof prism.highlightElement !== 'function') {
    return null;
  }

  prism.manual = true;

  await import('prismjs/components/prism-markup');
  await import('prismjs/components/prism-css');
  await import('prismjs/components/prism-clike');
  await import('prismjs/components/prism-c');
  await import('prismjs/components/prism-cpp');
  await import('prismjs/components/prism-csharp');
  await import('prismjs/components/prism-javascript');
  await import('prismjs/components/prism-typescript');
  await import('prismjs/components/prism-jsx');
  await import('prismjs/components/prism-tsx');
  await import('prismjs/components/prism-batch');
  await import('prismjs/components/prism-bash');
  await import('prismjs/components/prism-diff');
  await import('prismjs/components/prism-docker');
  await import('prismjs/components/prism-go');
  await import('prismjs/components/prism-hcl');
  await import('prismjs/components/prism-ini');
  await import('prismjs/components/prism-java');
  await import('prismjs/components/prism-json');
  await import('prismjs/components/prism-kotlin');
  await import('prismjs/components/prism-lua');
  await import('prismjs/components/prism-makefile');
  await import('prismjs/components/prism-markdown');
  await import('prismjs/components/prism-markup-templating');
  await import('prismjs/components/prism-php');
  await import('prismjs/components/prism-powershell');
  await import('prismjs/components/prism-python');
  await import('prismjs/components/prism-ruby');
  await import('prismjs/components/prism-rust');
  await import('prismjs/components/prism-scss');
  await import('prismjs/components/prism-sql');
  await import('prismjs/components/prism-swift');
  await import('prismjs/components/prism-toml');
  await import('prismjs/components/prism-yaml');

  return prism;
}

async function getPrismApi(): Promise<PrismApi | null> {
  if (!highlighterPromise) {
    highlighterPromise = bootstrapPrism().catch((error) => {
      console.warn('Failed to load Prism for markdown preview:', error);
      return null;
    });
  }
  return highlighterPromise;
}
function extractLanguageName(element: HTMLElement): string | null {
  const classes = element.classList;
  for (let index = 0; index < classes.length; index += 1) {
    const className = classes.item(index);
    if (!className) {
      continue;
    }
    const match = className.match(new RegExp('^(?:lang|language)-(.+)$', 'i'));
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

function isMermaidCodeBlock(element: HTMLElement): boolean {
  const classNames = element.className.toLowerCase();
  return classNames.includes('language-mermaid') || classNames.includes('lang-mermaid');
}

function resolvePrismLanguage(prism: PrismApi, language: string): string | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const aliased = LANGUAGE_ALIAS_MAP[normalized];
  if (aliased && Object.prototype.hasOwnProperty.call(prism.languages, aliased)) {
    return aliased;
  }
  if (Object.prototype.hasOwnProperty.call(prism.languages, normalized)) {
    return normalized;
  }
  return null;
}

function applyPrismLanguageClass(element: HTMLElement, language: string) {
  for (const className of Array.from(element.classList)) {
    if (LANGUAGE_CLASS_PATTERN.test(className)) {
      element.classList.remove(className);
    }
  }
  element.classList.add('language-' + language);
}

export async function highlightMarkdownCodeBlocks(article: HTMLElement | null): Promise<void> {
  if (!article) {
    return;
  }

  // Skip the Prism load entirely when there are no code blocks at all.
  if (!article.querySelector('pre > code')) {
    return;
  }

  const prism = await getPrismApi();
  if (!prism) {
    return;
  }

  // Re-query AFTER the async Prism load: the article's children may have been
  // swapped during initial mount (e.g. React StrictMode's mount → simulated
  // unmount → remount writes innerHTML again, disconnecting the original code
  // elements). Querying here guarantees we operate on the currently-connected
  // DOM nodes.
  if (!article.isConnected) {
    return;
  }

  const candidates = Array.from(article.querySelectorAll<HTMLElement>('pre > code')).filter(
    (element) => {
      if (isMermaidCodeBlock(element)) {
        return false;
      }
      if (element.getAttribute(HIGHLIGHTED_MARK_ATTRIBUTE) === 'true') {
        return false;
      }
      return extractLanguageName(element) !== null;
    },
  );

  if (candidates.length === 0) {
    return;
  }

  for (const codeElement of candidates) {
    if (!codeElement.isConnected) {
      continue;
    }
    if (codeElement.getAttribute(HIGHLIGHTED_MARK_ATTRIBUTE) === 'true') {
      continue;
    }

    const declaredLanguage = extractLanguageName(codeElement);
    if (!declaredLanguage) {
      continue;
    }

    const prismLanguage = resolvePrismLanguage(prism, declaredLanguage);
    if (!prismLanguage) {
      continue;
    }

    applyPrismLanguageClass(codeElement, prismLanguage);

    try {
      prism.highlightElement(codeElement);
      codeElement.setAttribute(HIGHLIGHTED_MARK_ATTRIBUTE, 'true');
    } catch (error) {
      console.warn('Prism highlight failed for markdown preview code block:', error);
    }
  }
}
