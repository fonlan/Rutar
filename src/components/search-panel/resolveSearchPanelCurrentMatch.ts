import type {
  FilterMatch,
  SearchMatch,
} from './types';

function resolveCurrentMatch<T>(matches: T[], currentIndex: number): T | null {
  return currentIndex >= 0 && currentIndex < matches.length
    ? matches[currentIndex]
    : null;
}

export function resolveCurrentFilterMatch(
  matches: FilterMatch[],
  currentIndex: number
): FilterMatch | null {
  return resolveCurrentMatch(matches, currentIndex);
}

export function resolveCurrentSearchMatch(
  matches: SearchMatch[],
  currentIndex: number
): SearchMatch | null {
  return resolveCurrentMatch(matches, currentIndex);
}
