import { convertFileSrc } from '@tauri-apps/api/core';

const EXTERNAL_IMAGE_SRC_PATTERN = /^(?:https?:|data:|blob:|asset:|\/\/)/i;
const EXTERNAL_OPEN_TARGET_PATTERN = /^(?:https?:|mailto:|tel:|data:|blob:)/i;
const FILE_URL_PATTERN = /^file:/i;
const FRAGMENT_LINK_PATTERN = /^#/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_FILE_URL_PATH_PATTERN = /^\/[a-zA-Z]:/;
const UNC_PATH_PATTERN = /^\\\\/;

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

export function isNativeAbsolutePath(filePath: string) {
  return (
    filePath.startsWith('/')
    || WINDOWS_ABSOLUTE_PATH_PATTERN.test(filePath)
    || UNC_PATH_PATTERN.test(filePath)
  );
}

export function nativePathToFileUrl(nativePath: string, isDirectory = false): string | null {
  const trimmedPath = nativePath.trim();
  if (!trimmedPath) {
    return null;
  }

  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmedPath)) {
    const normalizedPath = trimmedPath.replace(/\\/g, '/');
    const encodedPath = normalizedPath
      .split('/')
      .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
      .join('/');
    const pathname = isDirectory && !encodedPath.endsWith('/') ? `${encodedPath}/` : encodedPath;
    return `file:///${pathname}`;
  }

  if (UNC_PATH_PATTERN.test(trimmedPath)) {
    const normalizedPath = trimmedPath.slice(2).replace(/\\/g, '/');
    const separatorIndex = normalizedPath.indexOf('/');
    const host = separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : normalizedPath;
    const encodedPath = separatorIndex >= 0
      ? normalizedPath
        .slice(separatorIndex)
        .split('/')
        .map((segment, index) => (index === 0 ? '' : encodeURIComponent(segment)))
        .join('/')
      : '';
    const pathname = isDirectory && !encodedPath.endsWith('/') ? `${encodedPath}/` : encodedPath;
    return `file://${host}${pathname}`;
  }

  if (trimmedPath.startsWith('/')) {
    const encodedPath = trimmedPath
      .split('/')
      .map((segment, index) => (index === 0 ? '' : encodeURIComponent(segment)))
      .join('/');
    const pathname = isDirectory && !encodedPath.endsWith('/') ? `${encodedPath}/` : encodedPath;
    return `file://${pathname}`;
  }

  return null;
}

export function fileUrlToNativePath(fileUrl: string): string | null {
  try {
    const parsedUrl = new URL(fileUrl);
    if (parsedUrl.protocol !== 'file:') {
      return null;
    }

    const decodedPath = decodeURIComponent(parsedUrl.pathname);
    if (parsedUrl.host) {
      return `\\\\${parsedUrl.host}${decodedPath.replace(/\//g, '\\')}`;
    }

    if (WINDOWS_FILE_URL_PATH_PATTERN.test(decodedPath)) {
      return decodedPath.slice(1).replace(/\//g, '\\');
    }

    return decodedPath;
  } catch {
    return null;
  }
}

export function resolveMarkdownImageSrc(src: string, tabPath: string | null | undefined) {
  const trimmedSrc = src.trim();
  if (!trimmedSrc || EXTERNAL_IMAGE_SRC_PATTERN.test(trimmedSrc)) {
    return trimmedSrc;
  }

  const absolutePath = FILE_URL_PATTERN.test(trimmedSrc)
    ? fileUrlToNativePath(trimmedSrc)
    : isNativeAbsolutePath(trimmedSrc)
      ? trimmedSrc
      : null;
  if (absolutePath) {
    return convertFileSrc(absolutePath);
  }

  const parentDirectoryPath = tabPath ? getParentDirectoryPath(tabPath) : null;
  const parentDirectoryUrl = parentDirectoryPath ? nativePathToFileUrl(parentDirectoryPath, true) : null;
  if (!parentDirectoryUrl) {
    return trimmedSrc;
  }

  try {
    const resolvedUrl = new URL(trimmedSrc, parentDirectoryUrl).toString();
    const resolvedPath = fileUrlToNativePath(resolvedUrl);
    return resolvedPath ? convertFileSrc(resolvedPath) : trimmedSrc;
  } catch {
    return trimmedSrc;
  }
}

export function resolveMarkdownOpenTarget(target: string, tabPath: string | null | undefined) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || FRAGMENT_LINK_PATTERN.test(trimmedTarget)) {
    return null;
  }

  if (trimmedTarget.startsWith('//')) {
    return `https:${trimmedTarget}`;
  }

  if (FILE_URL_PATTERN.test(trimmedTarget) || EXTERNAL_OPEN_TARGET_PATTERN.test(trimmedTarget)) {
    return trimmedTarget;
  }

  if (isNativeAbsolutePath(trimmedTarget)) {
    return nativePathToFileUrl(trimmedTarget);
  }

  const parentDirectoryPath = tabPath ? getParentDirectoryPath(tabPath) : null;
  const parentDirectoryUrl = parentDirectoryPath ? nativePathToFileUrl(parentDirectoryPath, true) : null;
  if (!parentDirectoryUrl) {
    return null;
  }

  try {
    const resolvedUrl = new URL(trimmedTarget, parentDirectoryUrl).toString();
    if (FILE_URL_PATTERN.test(resolvedUrl) || EXTERNAL_OPEN_TARGET_PATTERN.test(resolvedUrl)) {
      return resolvedUrl;
    }
  } catch {
  }

  return null;
}
