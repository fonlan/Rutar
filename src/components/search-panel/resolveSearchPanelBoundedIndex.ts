export function resolveSearchPanelBoundedIndex(
  currentIndex: number,
  matchCount: number
): number {
  if (matchCount <= 0) {
    return 0;
  }

  return Math.min(currentIndex, matchCount - 1);
}

export function resolveSearchPanelWrappedIndex(
  candidateIndex: number,
  matchCount: number
): number {
  if (matchCount <= 0) {
    return 0;
  }

  return (candidateIndex + matchCount) % matchCount;
}
