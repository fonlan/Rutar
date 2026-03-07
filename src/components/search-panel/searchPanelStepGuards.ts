interface SearchPanelMatchCollection<TMatch> {
  matches: TMatch[];
}

export function hasSearchPanelMatches<TMatch, TResult extends SearchPanelMatchCollection<TMatch>>(result: TResult | null | undefined): result is TResult {
  return !!result && result.matches.length > 0;
}

export function hasSearchPanelTargetMatch<TMatch>(targetMatch: TMatch | null | undefined): targetMatch is TMatch {
  return targetMatch != null;
}
