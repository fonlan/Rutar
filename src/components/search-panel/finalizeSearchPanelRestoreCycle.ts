import type { MutableRefObject } from 'react';

interface FinalizeSearchPanelRestoreCycleOptions {
  activeTabId: string;
  previousActiveTabIdRef: MutableRefObject<string | null>;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setIsResultFilterSearching: (value: boolean) => void;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
}

export function finalizeSearchPanelRestoreCycle({
  activeTabId,
  previousActiveTabIdRef,
  setErrorMessage,
  setFeedbackMessage,
  setIsResultFilterSearching,
  stopResultFilterSearchRef,
}: FinalizeSearchPanelRestoreCycleOptions) {
  setIsResultFilterSearching(false);
  stopResultFilterSearchRef.current = true;
  setErrorMessage(null);
  setFeedbackMessage(null);
  previousActiveTabIdRef.current = activeTabId;
}