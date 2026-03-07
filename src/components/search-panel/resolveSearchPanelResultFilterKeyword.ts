interface ResolveSearchPanelResultFilterKeywordOptions {
  caseSensitive: boolean;
  resultFilterKeyword: string;
}

interface ResolvedSearchPanelResultFilterKeyword {
  normalizedKeyword: string;
  trimmedKeyword: string;
}

export function resolveSearchPanelResultFilterKeyword({
  caseSensitive,
  resultFilterKeyword,
}: ResolveSearchPanelResultFilterKeywordOptions): ResolvedSearchPanelResultFilterKeyword {
  const trimmedKeyword = resultFilterKeyword.trim();

  return {
    normalizedKeyword: trimmedKeyword
      ? caseSensitive
        ? trimmedKeyword
        : trimmedKeyword.toLowerCase()
      : '',
    trimmedKeyword,
  };
}
