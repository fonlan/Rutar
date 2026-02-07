import { FileTab } from '@/store/useStore';

const STRUCTURED_EXTENSIONS = new Set(['json', 'jsonc', 'yaml', 'yml', 'xml', 'svg', 'toml']);

function extFromPath(path?: string) {
  if (!path) {
    return null;
  }

  const fileName = path.split(/[\\/]/).pop() || path;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function isStructuredFormatSupported(tab?: FileTab | null) {
  if (!tab) {
    return false;
  }

  const ext = extFromPath(tab.path || tab.name);
  if (!ext) {
    return false;
  }

  return STRUCTURED_EXTENSIONS.has(ext);
}

