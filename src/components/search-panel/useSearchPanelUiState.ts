import { useMemo } from 'react';
import { getSearchPanelMessages, t } from '@/i18n';
import type { FilterRuleGroupPayload, PanelMode } from './types';
import { normalizeFilterRuleGroups } from './utils';

interface UseSearchPanelUiStateOptions {
  filterRuleGroups: FilterRuleGroupPayload[];
  fontFamily: string;
  fontSize: number;
  language: Parameters<typeof getSearchPanelMessages>[0];
  panelMode: PanelMode;
}

export function useSearchPanelUiState({
  filterRuleGroups,
  fontFamily,
  fontSize,
  language,
  panelMode,
}: UseSearchPanelUiStateOptions) {
  const messages = useMemo(() => getSearchPanelMessages(language), [language]);
  const isReplaceMode = panelMode === 'replace';
  const isFilterMode = panelMode === 'filter';
  const inputContextCopyLabel = useMemo(() => t(language, 'toolbar.copy'), [language]);
  const inputContextCutLabel = useMemo(() => t(language, 'toolbar.cut'), [language]);
  const inputContextPasteLabel = useMemo(() => t(language, 'toolbar.paste'), [language]);
  const normalizedFilterRuleGroups = useMemo(
    () => normalizeFilterRuleGroups(filterRuleGroups),
    [filterRuleGroups]
  );
  const resultListTextStyle = useMemo(
    () => ({ fontFamily, fontSize: `${Math.max(10, fontSize || 14)}px` }),
    [fontFamily, fontSize]
  );

  return {
    inputContextCopyLabel,
    inputContextCutLabel,
    inputContextPasteLabel,
    isFilterMode,
    isReplaceMode,
    messages,
    normalizedFilterRuleGroups,
    resultListTextStyle,
  };
}