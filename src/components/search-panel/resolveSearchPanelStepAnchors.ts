import type { CursorPosition } from '@/store/useStore';
import type {
  FilterMatch,
  SearchMatch,
} from './types';

function resolveCurrentMatch<T>(matches: T[], currentIndex: number): T | null {
  return currentIndex >= 0 && currentIndex < matches.length
    ? matches[currentIndex]
    : null;
}

function resolveCurrentFilterMatch(
  matches: FilterMatch[],
  currentIndex: number
): FilterMatch | null {
  return resolveCurrentMatch(matches, currentIndex);
}

function resolveCurrentSearchMatch(
  matches: SearchMatch[],
  currentIndex: number
): SearchMatch | null {
  return resolveCurrentMatch(matches, currentIndex);
}


export function resolveFilterStepAnchor(currentFilterMatch: FilterMatch | null): {
  currentColumn: number | null;
  currentLine: number | null;
} {
  return {
    currentColumn: currentFilterMatch?.column ?? null,
    currentLine: currentFilterMatch?.line ?? null,
  };
}

export function resolveSearchResultFilterStepAnchor(currentSearchMatch: SearchMatch | null): {
  currentEnd: number | null;
  currentStart: number | null;
} {
  return {
    currentEnd: currentSearchMatch?.end ?? null,
    currentStart: currentSearchMatch?.start ?? null,
  };
}

export function resolveSearchCursorStepAnchor({
  activeCursorPosition,
  currentSearchMatch,
}: {
  activeCursorPosition: CursorPosition | null;
  currentSearchMatch: SearchMatch | null;
}): {
  cursorColumn: number | null;
  cursorLine: number | null;
} {
  return {
    cursorColumn: activeCursorPosition?.column ?? currentSearchMatch?.column ?? null,
    cursorLine: activeCursorPosition?.line ?? currentSearchMatch?.line ?? null,
  };
}

export function resolveCurrentFilterStepAnchor(
  matches: FilterMatch[],
  currentIndex: number
): {
  currentColumn: number | null;
  currentLine: number | null;
} {
  return resolveFilterStepAnchor(resolveCurrentFilterMatch(matches, currentIndex));
}

export function resolveCurrentSearchResultFilterStepAnchor(
  matches: SearchMatch[],
  currentIndex: number
): {
  currentEnd: number | null;
  currentStart: number | null;
} {
  return resolveSearchResultFilterStepAnchor(resolveCurrentSearchMatch(matches, currentIndex));
}

export function resolveCurrentSearchCursorStepAnchor({
  activeCursorPosition,
  currentIndex,
  matches,
}: {
  activeCursorPosition: CursorPosition | null;
  currentIndex: number;
  matches: SearchMatch[];
}): {
  cursorColumn: number | null;
  cursorLine: number | null;
} {
  return resolveSearchCursorStepAnchor({
    activeCursorPosition,
    currentSearchMatch: resolveCurrentSearchMatch(matches, currentIndex),
  });
}
