import { useMemo } from 'react';
import type { FilterMatch, FilterRule, SearchMatch } from './types';
import {
  buildFilterRulesPayload,
  DEFAULT_FILTER_RULE_BACKGROUND,
  DEFAULT_FILTER_RULE_TEXT,
  normalizeFilterRules,
  resolveSearchKeyword,
} from './utils';

interface UseSearchPanelDerivedStateOptions {
  appliedResultFilterKeyword: string;
  caseSensitive: boolean;
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  filterMatches: FilterMatch[];
  filterRules: FilterRule[];
  keyword: string;
  matches: SearchMatch[];
  parseEscapeSequences: boolean;
}

export function useSearchPanelDerivedState({
  appliedResultFilterKeyword,
  caseSensitive,
  currentFilterMatchIndex,
  currentMatchIndex,
  filterMatches,
  filterRules,
  keyword,
  matches,
  parseEscapeSequences,
}: UseSearchPanelDerivedStateOptions) {
  const effectiveFilterRules = useMemo(() => normalizeFilterRules(filterRules), [filterRules]);
  const filterRulesPayload = useMemo(() => buildFilterRulesPayload(filterRules), [filterRules]);
  const hasAnyConfiguredFilterRule = useMemo(
    () =>
      filterRules.length > 1
      || filterRules.some((rule) => {
        const nextKeyword = rule.keyword.trim();
        return (
          nextKeyword.length > 0
          || rule.matchMode !== 'contains'
          || rule.backgroundColor !== DEFAULT_FILTER_RULE_BACKGROUND
          || rule.textColor !== DEFAULT_FILTER_RULE_TEXT
          || rule.bold
          || rule.italic
          || rule.applyTo !== 'line'
        );
      }),
    [filterRules]
  );
  const filterRulesKey = useMemo(() => JSON.stringify(filterRulesPayload), [filterRulesPayload]);

  const normalizedResultFilterKeyword = appliedResultFilterKeyword.trim().toLowerCase();
  const isResultFilterActive = normalizedResultFilterKeyword.length > 0;

  const backendResultFilterKeyword = useMemo(() => {
    if (!isResultFilterActive) {
      return '';
    }

    return caseSensitive ? appliedResultFilterKeyword.trim() : normalizedResultFilterKeyword;
  }, [appliedResultFilterKeyword, caseSensitive, isResultFilterActive, normalizedResultFilterKeyword]);

  const effectiveSearchKeyword = useMemo(
    () => resolveSearchKeyword(keyword, parseEscapeSequences),
    [keyword, parseEscapeSequences]
  );

  const visibleFilterMatches = useMemo(() => filterMatches, [filterMatches]);
  const visibleMatches = useMemo(() => matches, [matches]);

  const visibleCurrentFilterMatchIndex = useMemo(() => {
    if (visibleFilterMatches.length === 0) {
      return -1;
    }

    return Math.min(currentFilterMatchIndex, visibleFilterMatches.length - 1);
  }, [currentFilterMatchIndex, visibleFilterMatches]);

  const visibleCurrentMatchIndex = useMemo(() => {
    if (visibleMatches.length === 0) {
      return -1;
    }

    return Math.min(currentMatchIndex, visibleMatches.length - 1);
  }, [currentMatchIndex, visibleMatches]);

  return {
    backendResultFilterKeyword,
    effectiveFilterRules,
    effectiveSearchKeyword,
    filterRulesKey,
    filterRulesPayload,
    hasAnyConfiguredFilterRule,
    isResultFilterActive,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  };
}