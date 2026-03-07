import type { MutableRefObject } from 'react';
import { resolveSearchPanelLocalStepSelection } from './resolveSearchPanelStepTargets';
import type {
  FilterMatch,
  SearchMatch,
} from './types';

interface ApplyFilterNavigationSelectionOptions {
  currentFilterMatchIndexRef: MutableRefObject<number>;
  matches: FilterMatch[];
  navigationFeedback: string;
  navigateToFilterMatch: (targetMatch: FilterMatch) => void;
  nextIndex: number;
  setCurrentFilterMatchIndex: (value: number) => void;
  setFeedbackMessage: (value: string | null) => void;
}

interface ApplySearchNavigationSelectionOptions {
  currentMatchIndexRef: MutableRefObject<number>;
  matches: SearchMatch[];
  navigationFeedback: string;
  navigateToMatch: (targetMatch: SearchMatch) => void;
  nextIndex: number;
  setCurrentMatchIndex: (value: number) => void;
  setFeedbackMessage: (value: string | null) => void;
}

interface ApplyFilterLocalStepSelectionOptions {
  appendedMatches?: FilterMatch[] | null;
  currentFilterMatchIndexRef: MutableRefObject<number>;
  matches: FilterMatch[];
  navigationFeedback: string;
  navigateToFilterMatch: (targetMatch: FilterMatch) => void;
  setCurrentFilterMatchIndex: (value: number) => void;
  setFeedbackMessage: (value: string | null) => void;
  step: number;
}

interface ApplySearchLocalStepSelectionOptions {
  appendedMatches?: SearchMatch[] | null;
  currentMatchIndexRef: MutableRefObject<number>;
  matches: SearchMatch[];
  navigationFeedback: string;
  navigateToMatch: (targetMatch: SearchMatch) => void;
  setCurrentMatchIndex: (value: number) => void;
  setFeedbackMessage: (value: string | null) => void;
  step: number;
}

export function applyFilterLocalStepSelection({
  appendedMatches,
  currentFilterMatchIndexRef,
  matches,
  navigationFeedback,
  navigateToFilterMatch,
  setCurrentFilterMatchIndex,
  setFeedbackMessage,
  step,
}: ApplyFilterLocalStepSelectionOptions) {
  const { nextMatches, targetIndex } = resolveSearchPanelLocalStepSelection({
    appendedMatches,
    currentIndex: currentFilterMatchIndexRef.current,
    matches,
    step,
  });

  applyFilterNavigationSelection({
    currentFilterMatchIndexRef,
    matches: nextMatches,
    navigationFeedback,
    navigateToFilterMatch,
    nextIndex: targetIndex,
    setCurrentFilterMatchIndex,
    setFeedbackMessage,
  });
}

export function applySearchLocalStepSelection({
  appendedMatches,
  currentMatchIndexRef,
  matches,
  navigationFeedback,
  navigateToMatch,
  setCurrentMatchIndex,
  setFeedbackMessage,
  step,
}: ApplySearchLocalStepSelectionOptions) {
  const { nextMatches, targetIndex } = resolveSearchPanelLocalStepSelection({
    appendedMatches,
    currentIndex: currentMatchIndexRef.current,
    matches,
    step,
  });

  applySearchNavigationSelection({
    currentMatchIndexRef,
    matches: nextMatches,
    navigationFeedback,
    navigateToMatch,
    nextIndex: targetIndex,
    setCurrentMatchIndex,
    setFeedbackMessage,
  });
}
export function applyFilterNavigationSelection({
  currentFilterMatchIndexRef,
  matches,
  navigationFeedback,
  navigateToFilterMatch,
  nextIndex,
  setCurrentFilterMatchIndex,
  setFeedbackMessage,
}: ApplyFilterNavigationSelectionOptions) {
  currentFilterMatchIndexRef.current = nextIndex;
  setCurrentFilterMatchIndex(nextIndex);
  setFeedbackMessage(navigationFeedback);
  navigateToFilterMatch(matches[nextIndex]);
}

export function applySearchNavigationSelection({
  currentMatchIndexRef,
  matches,
  navigationFeedback,
  navigateToMatch,
  nextIndex,
  setCurrentMatchIndex,
  setFeedbackMessage,
}: ApplySearchNavigationSelectionOptions) {
  currentMatchIndexRef.current = nextIndex;
  setCurrentMatchIndex(nextIndex);
  setFeedbackMessage(navigationFeedback);
  navigateToMatch(matches[nextIndex]);
}