import type {
  FilterMatch,
  SearchMatch,
} from './types';

interface ResolveFilterStepTargetOptions {
  batchMatches?: FilterMatch[];
  matches: FilterMatch[];
  targetIndexInBatch?: number | null;
  targetMatch: FilterMatch;
}

interface ResolveSearchStepTargetOptions {
  batchMatches?: SearchMatch[];
  matches: SearchMatch[];
  targetIndexInBatch?: number | null;
  targetMatch: SearchMatch;
}

export function resolveFilterStepTarget({
  batchMatches,
  matches,
  targetIndexInBatch,
  targetMatch,
}: ResolveFilterStepTargetOptions): {
  nextMatches: FilterMatch[];
  targetIndex: number;
} | null {
  const resolvedBatchMatches = Array.isArray(batchMatches) && batchMatches.length > 0 ? batchMatches : null;
  const nextMatches = resolvedBatchMatches ?? matches;
  const targetIndex = resolvedBatchMatches
    ? Math.min(
        Math.max(0, targetIndexInBatch ?? 0),
        Math.max(0, nextMatches.length - 1)
      )
    : nextMatches.findIndex(
        (item) =>
          item.line === targetMatch.line &&
          item.column === targetMatch.column &&
          item.ruleIndex === targetMatch.ruleIndex
      );

  if (targetIndex < 0 || targetIndex >= nextMatches.length) {
    return null;
  }

  return {
    nextMatches,
    targetIndex,
  };
}

export function resolveSearchStepTarget({
  batchMatches,
  matches,
  targetIndexInBatch,
  targetMatch,
}: ResolveSearchStepTargetOptions): {
  nextMatches: SearchMatch[];
  targetIndex: number;
} | null {
  const resolvedBatchMatches = Array.isArray(batchMatches) && batchMatches.length > 0 ? batchMatches : null;
  const nextMatches = resolvedBatchMatches ?? matches;
  const targetIndex = resolvedBatchMatches
    ? Math.min(
        Math.max(0, targetIndexInBatch ?? 0),
        Math.max(0, nextMatches.length - 1)
      )
    : nextMatches.findIndex(
        (item) => item.start === targetMatch.start && item.end === targetMatch.end
      );

  if (targetIndex < 0 || targetIndex >= nextMatches.length) {
    return null;
  }

  return {
    nextMatches,
    targetIndex,
  };
}