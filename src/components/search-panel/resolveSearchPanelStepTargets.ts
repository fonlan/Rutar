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

interface ResolveStepTargetOptions<TMatch> {
  batchMatches?: TMatch[];
  matches: TMatch[];
  targetIndexInBatch?: number | null;
  targetMatch: TMatch;
}

interface ResolvedStepTarget<TMatch> {
  nextMatches: TMatch[];
  targetIndex: number;
}

export type SearchPanelResultFilterStepSelection<TMatch> =
  | { kind: 'missing-target' }
  | { kind: 'no-match' }
  | ({ kind: 'resolved' } & ResolvedStepTarget<TMatch>);

interface ResolveSearchPanelResultFilterStepSelectionOptions<TMatch> {
  batchMatches?: TMatch[];
  matches: TMatch[];
  targetIndexInBatch?: number | null;
  targetMatch?: TMatch | null;
  resolveTarget: (
    options: ResolveStepTargetOptions<TMatch>
  ) => ResolvedStepTarget<TMatch> | null;
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
export function resolveSearchPanelResultFilterStepSelection<TMatch>({
  batchMatches,
  matches,
  targetIndexInBatch,
  targetMatch,
  resolveTarget,
}: ResolveSearchPanelResultFilterStepSelectionOptions<TMatch>): SearchPanelResultFilterStepSelection<TMatch> {
  if (!targetMatch) {
    return { kind: 'missing-target' };
  }

  const resolvedTarget = resolveTarget({
    batchMatches,
    matches,
    targetIndexInBatch,
    targetMatch,
  });

  if (!resolvedTarget) {
    return { kind: 'no-match' };
  }

  return {
    kind: 'resolved',
    ...resolvedTarget,
  };
}
