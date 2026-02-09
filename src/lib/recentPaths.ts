import { useStore } from '@/store/useStore';

export const MAX_RECENT_PATHS = 12;

export function appendRecentPath(paths: string[], path: string): string[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return paths;
  }

  const nextPaths = [
    normalizedPath,
    ...paths.filter((item) => item !== normalizedPath),
  ].slice(0, MAX_RECENT_PATHS);

  if (nextPaths.length === paths.length && nextPaths.every((item, index) => item === paths[index])) {
    return paths;
  }

  return nextPaths;
}

export function sanitizeRecentPathList(paths: unknown): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  const cleanPaths = paths.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const uniquePaths: string[] = [];

  for (const path of cleanPaths) {
    const normalizedPath = path.trim();
    if (!normalizedPath || uniquePaths.includes(normalizedPath)) {
      continue;
    }

    uniquePaths.push(normalizedPath);

    if (uniquePaths.length >= MAX_RECENT_PATHS) {
      break;
    }
  }

  return uniquePaths;
}

export function addRecentFilePath(path: string) {
  const state = useStore.getState();
  const nextPaths = appendRecentPath(state.settings.recentFiles, path);

  if (nextPaths !== state.settings.recentFiles) {
    state.updateSettings({ recentFiles: nextPaths });
  }
}

export function addRecentFolderPath(path: string) {
  const state = useStore.getState();
  const nextPaths = appendRecentPath(state.settings.recentFolders, path);

  if (nextPaths !== state.settings.recentFolders) {
    state.updateSettings({ recentFolders: nextPaths });
  }
}
