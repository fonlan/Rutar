import { dispatchEditorForceRefresh } from './utils';

interface ApplyReplaceSuccessEffectsOptions {
  activeTabId: string;
  feedbackMessage: string;
  fallbackLineCount: number;
  nextLineCount?: number | null;
  rememberReplaceValue: (value: string) => void;
  replaceValue: string;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  updateTab: (tabId: string, updates: { lineCount: number; isDirty: boolean }) => void;
}

export function applyReplaceSuccessEffects({
  activeTabId,
  feedbackMessage,
  fallbackLineCount,
  nextLineCount,
  rememberReplaceValue,
  replaceValue,
  setErrorMessage,
  setFeedbackMessage,
  updateTab,
}: ApplyReplaceSuccessEffectsOptions) {
  const safeLineCount = Math.max(1, nextLineCount ?? fallbackLineCount);

  updateTab(activeTabId, { lineCount: safeLineCount, isDirty: true });
  dispatchEditorForceRefresh(activeTabId, safeLineCount);
  setFeedbackMessage(feedbackMessage);
  setErrorMessage(null);
  rememberReplaceValue(replaceValue);
}