import type { CursorPosition } from '@/store/useStore';
import type {
  FilterMatch,
  SearchMatch,
} from './types';

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
