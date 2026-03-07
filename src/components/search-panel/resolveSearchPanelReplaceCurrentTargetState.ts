import { resolveSearchPanelBoundedIndex } from './resolveSearchPanelBoundedIndex';
import type { SearchMatch } from './types';

interface ResolveReplaceCurrentTargetStateOptions {
  currentMatchIndex: number;
  matches: SearchMatch[];
}

interface ResolvedReplaceCurrentTargetState {
  boundedCurrentIndex: number;
  targetMatch: SearchMatch;
}

export function resolveReplaceCurrentTargetState({
  currentMatchIndex,
  matches,
}: ResolveReplaceCurrentTargetStateOptions): ResolvedReplaceCurrentTargetState {
  const boundedCurrentIndex = resolveSearchPanelBoundedIndex(currentMatchIndex, matches.length);

  return {
    boundedCurrentIndex,
    targetMatch: matches[boundedCurrentIndex],
  };
}