/**
 * Helpers that decide whether the search panel should switch into
 * "cross-file" mode driven by the user-supplied target path, versus
 * staying in the existing in-document mode.
 */

const WILDCARD_CHARS = /[*?[]/;

function isWindowsLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\');
}

export function normalizeTargetPath(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  let normalized = trimmed.replace(/\\/g, '/');
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  if (isWindowsLikePath(trimmed)) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

export function containsWildcardChars(value: string): boolean {
  return WILDCARD_CHARS.test(value);
}

/**
 * Whether the target contains a recursive glob marker (`**`).
 *
 * The backend already honours `**` as "any depth" inside `globset` patterns,
 * so when the user types something like `C:/dir/**\/*.txt` we treat the
 * include-subdirectories toggle as informational only (the glob itself drives
 * recursion).
 */
export function containsRecursiveGlob(value: string): boolean {
  return value.includes('**');
}

export interface CrossFileTargetDecision {
  isCrossFile: boolean;
  isEmpty: boolean;
  hasWildcard: boolean;
  hasRecursiveGlob: boolean;
}

export function evaluateCrossFileTarget(
  searchTarget: string,
  activeTabPath: string | null | undefined,
): CrossFileTargetDecision {
  const trimmed = searchTarget.trim();
  if (!trimmed) {
    return {
      isCrossFile: false,
      isEmpty: true,
      hasWildcard: false,
      hasRecursiveGlob: false,
    };
  }

  const hasWildcard = containsWildcardChars(trimmed);
  const hasRecursiveGlob = containsRecursiveGlob(trimmed);
  if (hasWildcard) {
    return {
      isCrossFile: true,
      isEmpty: false,
      hasWildcard: true,
      hasRecursiveGlob,
    };
  }

  const normalizedTarget = normalizeTargetPath(trimmed);
  const normalizedActive = normalizeTargetPath(activeTabPath ?? '');

  if (!normalizedActive) {
    return {
      isCrossFile: true,
      isEmpty: false,
      hasWildcard: false,
      hasRecursiveGlob: false,
    };
  }

  return {
    isCrossFile: normalizedTarget !== normalizedActive,
    isEmpty: false,
    hasWildcard: false,
    hasRecursiveGlob: false,
  };
}
