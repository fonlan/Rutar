import { useMemo } from 'react';
import { useSearchResultPanelControls } from './useSearchResultPanelControls';
import { getDisplayCountText } from './utils';

type SearchResultPanelControlsOptions = Parameters<typeof useSearchResultPanelControls>[0];
type SearchResultPanelControlsResult = ReturnType<typeof useSearchResultPanelControls>;

interface UseSearchResultPanelStateOptions extends SearchResultPanelControlsOptions {
  resultFilterKeyword: string;
  totalFilterMatchedLineCount: number | null;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
}

interface UseSearchResultPanelStateResult extends SearchResultPanelControlsResult {
  displayTotalFilterMatchedLineCount: number | null;
  displayTotalFilterMatchedLineCountText: string;
  displayTotalMatchCount: number | null;
  displayTotalMatchCountText: string;
  displayTotalMatchedLineCount: number | null;
  displayTotalMatchedLineCountText: string;
  hasAppliedResultFilterKeyword: boolean;
}

export function useSearchResultPanelState({
  resultFilterKeyword,
  totalFilterMatchedLineCount,
  totalMatchCount,
  totalMatchedLineCount,
  messages,
  ...controlsOptions
}: UseSearchResultPanelStateOptions): UseSearchResultPanelStateResult {
  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalFilterMatchedLineCount = totalFilterMatchedLineCount;
  const displayTotalMatchCountText = getDisplayCountText(displayTotalMatchCount, messages.counting);
  const displayTotalMatchedLineCountText = getDisplayCountText(displayTotalMatchedLineCount, messages.counting);
  const displayTotalFilterMatchedLineCountText = getDisplayCountText(
    displayTotalFilterMatchedLineCount,
    messages.counting
  );
  const hasAppliedResultFilterKeyword = resultFilterKeyword.trim().length > 0;
  const controls = useSearchResultPanelControls({
    ...controlsOptions,
    messages,
  });

  return useMemo(
    () => ({
      ...controls,
      displayTotalFilterMatchedLineCount,
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCount,
      displayTotalMatchCountText,
      displayTotalMatchedLineCount,
      displayTotalMatchedLineCountText,
      hasAppliedResultFilterKeyword,
    }),
    [
      controls,
      displayTotalFilterMatchedLineCount,
      displayTotalFilterMatchedLineCountText,
      displayTotalMatchCount,
      displayTotalMatchCountText,
      displayTotalMatchedLineCount,
      displayTotalMatchedLineCountText,
      hasAppliedResultFilterKeyword,
    ]
  );
}