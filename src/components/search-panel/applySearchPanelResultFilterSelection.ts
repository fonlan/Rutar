import type { MutableRefObject } from 'react';
import { resolveFilterStepTarget, resolveSearchPanelResultFilterStepSelection, resolveSearchStepTarget } from './resolveSearchPanelStepTargets';
import type { SearchPanelResultFilterStepSelection } from './resolveSearchPanelStepTargets';
import type { FilterMatch, SearchMatch } from './types';

interface ApplySearchPanelResultFilterStepGuardOptions<TMatch> {
  noMatchMessage: string;
  selection: SearchPanelResultFilterStepSelection<TMatch>;
  setFeedbackMessage: (value: string | null) => void;
}

type ResolvedSearchPanelResultFilterStepSelection<TMatch> = Extract<
  SearchPanelResultFilterStepSelection<TMatch>,
  { kind: 'resolved' }
>;

export function applySearchPanelResultFilterStepGuard<TMatch>({
  noMatchMessage,
  selection,
  setFeedbackMessage,
}: ApplySearchPanelResultFilterStepGuardOptions<TMatch>): ResolvedSearchPanelResultFilterStepSelection<TMatch> | null {
  if (selection.kind === 'missing-target') {
    return null;
  }

  if (selection.kind === 'no-match') {
    setFeedbackMessage(noMatchMessage);
    return null;
  }

  return selection;
}
interface ResolveGuardedFilterResultFilterStepSelectionOptions {
  batchMatches?: FilterMatch[];
  matches: FilterMatch[];
  noMatchMessage: string;
  setFeedbackMessage: (value: string | null) => void;
  targetIndexInBatch?: number | null;
  targetMatch?: FilterMatch | null;
}

export function resolveGuardedFilterResultFilterStepSelection({
  batchMatches,
  matches,
  noMatchMessage,
  setFeedbackMessage,
  targetIndexInBatch,
  targetMatch,
}: ResolveGuardedFilterResultFilterStepSelectionOptions): ResolvedSearchPanelResultFilterStepSelection<FilterMatch> | null {
  const selection = resolveSearchPanelResultFilterStepSelection({
    batchMatches,
    matches,
    targetIndexInBatch,
    targetMatch,
    resolveTarget: resolveFilterStepTarget,
  });

  return applySearchPanelResultFilterStepGuard({
    noMatchMessage,
    selection,
    setFeedbackMessage,
  });
}
interface ResolveGuardedSearchResultFilterStepSelectionOptions {
  batchMatches?: SearchMatch[];
  matches: SearchMatch[];
  noMatchMessage: string;
  setFeedbackMessage: (value: string | null) => void;
  targetIndexInBatch?: number | null;
  targetMatch?: SearchMatch | null;
}

export function resolveGuardedSearchResultFilterStepSelection({
  batchMatches,
  matches,
  noMatchMessage,
  setFeedbackMessage,
  targetIndexInBatch,
  targetMatch,
}: ResolveGuardedSearchResultFilterStepSelectionOptions): ResolvedSearchPanelResultFilterStepSelection<SearchMatch> | null {
  const selection = resolveSearchPanelResultFilterStepSelection({
    batchMatches,
    matches,
    targetIndexInBatch,
    targetMatch,
    resolveTarget: resolveSearchStepTarget,
  });

  return applySearchPanelResultFilterStepGuard({
    noMatchMessage,
    selection,
    setFeedbackMessage,
  });
}
interface ApplyFilterResultFilterSelectionOptions {
  currentFilterMatchIndexRef: MutableRefObject<number>;
  scrollResultItemIntoView: (index: number) => void;
  setCurrentFilterMatchIndex: (value: number) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  targetIndex: number;
}

interface ApplySearchResultFilterSelectionOptions {
  currentMatchIndexRef: MutableRefObject<number>;
  scrollResultItemIntoView: (index: number) => void;
  setCurrentMatchIndex: (value: number) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  targetIndex: number;
}

export function applyFilterResultFilterSelection({
  currentFilterMatchIndexRef,
  scrollResultItemIntoView,
  setCurrentFilterMatchIndex,
  setErrorMessage,
  setFeedbackMessage,
  targetIndex,
}: ApplyFilterResultFilterSelectionOptions) {
  currentFilterMatchIndexRef.current = targetIndex;
  setCurrentFilterMatchIndex(targetIndex);
  setErrorMessage(null);
  setFeedbackMessage(null);
  window.requestAnimationFrame(() => {
    scrollResultItemIntoView(targetIndex);
  });
}

export function applySearchResultFilterSelection({
  currentMatchIndexRef,
  scrollResultItemIntoView,
  setCurrentMatchIndex,
  setErrorMessage,
  setFeedbackMessage,
  targetIndex,
}: ApplySearchResultFilterSelectionOptions) {
  currentMatchIndexRef.current = targetIndex;
  setCurrentMatchIndex(targetIndex);
  setErrorMessage(null);
  setFeedbackMessage(null);
  window.requestAnimationFrame(() => {
    scrollResultItemIntoView(targetIndex);
  });
}