export function getParentDirectoryPath(filePath: string): string | null {
  const normalizedPath = filePath.trim();

  if (!normalizedPath) {
    return null;
  }

  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));

  if (separatorIndex < 0) {
    return null;
  }

  if (separatorIndex === 0) {
    return normalizedPath[0];
  }

  if (separatorIndex === 2 && /^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
    return normalizedPath.slice(0, 3);
  }

  return normalizedPath.slice(0, separatorIndex);
}

export function pathBaseName(path: string) {
  const normalizedPath = path.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}
