import { shouldLoadMoreForSearchPanelStep } from './resolveSearchPanelBoundedIndex';

interface LoadMoreSearchPanelStepMatchesOptions<TMatch> {
  currentIndex: number;
  loadMore: () => Promise<TMatch[] | null>;
  loadMoreLocked: boolean;
  matchCount: number;
  step: number;
}

export async function loadMoreSearchPanelStepMatches<TMatch>({
  currentIndex,
  loadMore,
  loadMoreLocked,
  matchCount,
  step,
}: LoadMoreSearchPanelStepMatchesOptions<TMatch>): Promise<TMatch[] | null> {
  if (loadMoreLocked || !shouldLoadMoreForSearchPanelStep(currentIndex, matchCount, step)) {
    return null;
  }

  return loadMore();
}
