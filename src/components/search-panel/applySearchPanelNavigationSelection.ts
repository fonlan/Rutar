import type { MutableRefObject } from 'react';
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