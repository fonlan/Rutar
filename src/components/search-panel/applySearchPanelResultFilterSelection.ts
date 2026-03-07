import type { MutableRefObject } from 'react';

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