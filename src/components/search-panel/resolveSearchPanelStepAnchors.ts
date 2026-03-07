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
