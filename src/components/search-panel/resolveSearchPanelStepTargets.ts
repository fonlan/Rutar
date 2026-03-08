import { resolveSearchPanelStepCandidateIndex, resolveSearchPanelWrappedIndex } from './resolveSearchPanelBoundedIndex';
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

interface MergeResultFilterStepMatchesOptions<TMatch> {
  batchMatches?: TMatch[];
  compare: (left: TMatch, right: TMatch) => number;
  getKey: (match: TMatch) => string;
  matches: TMatch[];
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

interface ResolveSearchPanelLocalNavigationSelectionOptions<TMatch> {
  appendedMatches?: TMatch[] | null;
  candidateIndex: number;
  matches: TMatch[];
}

interface ResolveSearchPanelLocalStepSelectionOptions<TMatch> {
  appendedMatches?: TMatch[] | null;
  currentIndex: number;
  matches: TMatch[];
  step: number;
}

function mergeResultFilterStepMatches<TMatch>({
  batchMatches,
  compare,
  getKey,
  matches,
}: MergeResultFilterStepMatchesOptions<TMatch>): TMatch[] {
  if (!Array.isArray(batchMatches) || batchMatches.length === 0) {
    return matches;
  }

  const mergedMatches = new Map<string, TMatch>();

  matches.forEach((match) => {
    mergedMatches.set(getKey(match), match);
  });
  batchMatches.forEach((match) => {
    mergedMatches.set(getKey(match), match);
  });

  return Array.from(mergedMatches.values()).sort(compare);
}

function getFilterMatchKey(match: Pick<FilterMatch, 'line' | 'column' | 'ruleIndex'>) {
  return [match.line, match.column, match.ruleIndex].join(':');
}

function compareFilterMatches(left: FilterMatch, right: FilterMatch) {
  return left.line - right.line || left.column - right.column || left.ruleIndex - right.ruleIndex;
}

function getSearchMatchKey(match: Pick<SearchMatch, 'start' | 'end'>) {
  return [match.start, match.end].join(':');
}

function compareSearchMatches(left: SearchMatch, right: SearchMatch) {
  return left.start - right.start || left.end - right.end;
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
  const nextMatches = mergeResultFilterStepMatches({
    batchMatches: resolvedBatchMatches ?? undefined,
    compare: compareFilterMatches,
    getKey: getFilterMatchKey,
    matches,
  });
  const resolvedTargetMatch = resolvedBatchMatches
    ? resolvedBatchMatches[
        Math.min(
          Math.max(0, targetIndexInBatch ?? 0),
          Math.max(0, resolvedBatchMatches.length - 1)
        )
      ] ?? targetMatch
    : targetMatch;
  const targetIndex = nextMatches.findIndex(
    (item) => getFilterMatchKey(item) === getFilterMatchKey(resolvedTargetMatch)
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
  const nextMatches = mergeResultFilterStepMatches({
    batchMatches: resolvedBatchMatches ?? undefined,
    compare: compareSearchMatches,
    getKey: getSearchMatchKey,
    matches,
  });
  const resolvedTargetMatch = resolvedBatchMatches
    ? resolvedBatchMatches[
        Math.min(
          Math.max(0, targetIndexInBatch ?? 0),
          Math.max(0, resolvedBatchMatches.length - 1)
        )
      ] ?? targetMatch
    : targetMatch;
  const targetIndex = nextMatches.findIndex(
    (item) => getSearchMatchKey(item) === getSearchMatchKey(resolvedTargetMatch)
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

export function resolveSearchPanelLocalNavigationSelection<TMatch>({
  appendedMatches,
  candidateIndex,
  matches,
}: ResolveSearchPanelLocalNavigationSelectionOptions<TMatch>): ResolvedStepTarget<TMatch> {
  if (candidateIndex >= matches.length && appendedMatches && appendedMatches.length > 0) {
    return {
      nextMatches: [...matches, ...appendedMatches],
      targetIndex: candidateIndex,
    };
  }

  return {
    nextMatches: matches,
    targetIndex: resolveSearchPanelWrappedIndex(candidateIndex, matches.length),
  };
}

export function resolveSearchPanelLocalStepSelection<TMatch>({
  appendedMatches,
  currentIndex,
  matches,
  step,
}: ResolveSearchPanelLocalStepSelectionOptions<TMatch>): ResolvedStepTarget<TMatch> {
  return resolveSearchPanelLocalNavigationSelection({
    appendedMatches,
    candidateIndex: resolveSearchPanelStepCandidateIndex(currentIndex, matches.length, step),
    matches,
  });
}