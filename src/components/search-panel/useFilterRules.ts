import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type {
  FilterRule,
  FilterRuleDragState,
  FilterRuleGroupPayload,
} from './types';
import {
  buildFilterRulesFromPayload,
  buildFilterRulesPayload,
  createDefaultFilterRule,
  DEFAULT_FILTER_RULE_BACKGROUND,
  DEFAULT_FILTER_RULE_TEXT,
  normalizeFilterRuleGroups,
  normalizeFilterRules,
  reorderFilterRules,
} from './utils';

interface UseFilterRulesOptions {
  messages: ReturnType<typeof getSearchPanelMessages>;
  normalizedFilterRuleGroups: FilterRuleGroupPayload[];
  resetFilterState: (clearTotals?: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setFilterRuleGroups: (value: FilterRuleGroupPayload[]) => void;
}

export function useFilterRules({
  messages,
  normalizedFilterRuleGroups,
  resetFilterState,
  setErrorMessage,
  setFeedbackMessage,
  setFilterRuleGroups,
}: UseFilterRulesOptions) {
  // --- editor state ---
  const [filterRules, setFilterRules] = useState<FilterRule[]>(() => [createDefaultFilterRule(0)]);
  const [selectedFilterGroupName, setSelectedFilterGroupName] = useState('');
  const [filterGroupNameInput, setFilterGroupNameInput] = useState('');
  const [filterRuleDragState, setFilterRuleDragState] = useState<FilterRuleDragState | null>(null);

  const clearMessages = useCallback(() => {
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, [setErrorMessage, setFeedbackMessage]);

  const updateFilterRule = useCallback(
    (id: string, updater: (rule: FilterRule) => FilterRule) => {
      setFilterRules((previousRules) =>
        previousRules.map((rule) => {
          if (rule.id !== id) {
            return rule;
          }

          return updater(rule);
        })
      );
      clearMessages();
      resetFilterState();
    },
    [clearMessages, resetFilterState]
  );

  const addFilterRule = useCallback(() => {
    setFilterRules((previousRules) => [...previousRules, createDefaultFilterRule(previousRules.length)]);
    clearMessages();
  }, [clearMessages]);

  const clearFilterRules = useCallback(() => {
    setFilterRules([createDefaultFilterRule(0)]);
    clearMessages();
    resetFilterState();
  }, [clearMessages, resetFilterState]);

  const removeFilterRule = useCallback(
    (id: string) => {
      setFilterRules((previousRules) => {
        const nextRules = previousRules.filter((rule) => rule.id !== id);
        if (nextRules.length > 0) {
          return nextRules;
        }

        return [createDefaultFilterRule(0)];
      });
      clearMessages();
      resetFilterState();
    },
    [clearMessages, resetFilterState]
  );

  const moveFilterRule = useCallback(
    (id: string, direction: -1 | 1) => {
      setFilterRules((previousRules) => {
        const index = previousRules.findIndex((rule) => rule.id === id);
        if (index < 0) {
          return previousRules;
        }

        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= previousRules.length) {
          return previousRules;
        }

        const nextRules = [...previousRules];
        const [movedRule] = nextRules.splice(index, 1);
        nextRules.splice(targetIndex, 0, movedRule);
        return nextRules;
      });
      clearMessages();
      resetFilterState();
    },
    [clearMessages, resetFilterState]
  );

  const onFilterRuleDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>, ruleId: string) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ruleId);
      setFilterRuleDragState({
        draggingRuleId: ruleId,
        overRuleId: null,
      });
      clearMessages();
    },
    [clearMessages]
  );

  const onFilterRuleDragOver = useCallback((event: ReactDragEvent<HTMLElement>, ruleId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    setFilterRuleDragState((previous) => {
      if (!previous || previous.overRuleId === ruleId) {
        return previous;
      }

      return {
        ...previous,
        overRuleId: ruleId,
      };
    });
  }, []);

  const onFilterRuleDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetRuleId: string) => {
      event.preventDefault();

      setFilterRules((previousRules) => {
        const fallbackSourceId = event.dataTransfer.getData('text/plain');
        const sourceRuleId = filterRuleDragState?.draggingRuleId || fallbackSourceId;
        if (!sourceRuleId) {
          return previousRules;
        }

        return reorderFilterRules(previousRules, sourceRuleId, targetRuleId);
      });

      setFilterRuleDragState(null);
      clearMessages();
      resetFilterState();
    },
    [clearMessages, filterRuleDragState?.draggingRuleId, resetFilterState]
  );

  const onFilterRuleDragEnd = useCallback(() => {
    setFilterRuleDragState(null);
  }, []);

  const handleSelectedFilterGroupChange = useCallback((nextName: string) => {
    setSelectedFilterGroupName(nextName);
    if (nextName) {
      setFilterGroupNameInput(nextName);
    }
  }, []);

  const handleLoadFilterRuleGroup = useCallback(() => {
    if (!selectedFilterGroupName) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    const group = normalizedFilterRuleGroups.find((item) => item.name === selectedFilterGroupName);
    if (!group) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    setFilterRules(buildFilterRulesFromPayload(group.rules));
    setFilterGroupNameInput(group.name);
    setFeedbackMessage(messages.filterGroupLoaded(group.name));
    setErrorMessage(null);
    resetFilterState();
  }, [
    messages,
    normalizedFilterRuleGroups,
    resetFilterState,
    selectedFilterGroupName,
    setErrorMessage,
    setFeedbackMessage,
  ]);

  // --- derived (previously in useSearchPanelDerivedState) ---
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

  // --- persistence ---
  const persistFilterRuleGroups = useCallback(
    async (groups: FilterRuleGroupPayload[]) => {
      const normalized = normalizeFilterRuleGroups(groups);
      await invoke('save_filter_rule_groups_config', {
        groups: normalized,
      });
      setFilterRuleGroups(normalized);
      return normalized;
    },
    [setFilterRuleGroups]
  );

  useEffect(() => {
    let cancelled = false;

    const loadFilterRuleGroups = async () => {
      try {
        const groups = await invoke<FilterRuleGroupPayload[]>('load_filter_rule_groups_config');
        if (cancelled) {
          return;
        }

        const normalized = normalizeFilterRuleGroups(groups || []);
        setFilterRuleGroups(normalized);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const readableError = error instanceof Error ? error.message : String(error);
        setErrorMessage(`${messages.filterGroupLoadFailed}: ${readableError}`);
      }
    };

    void loadFilterRuleGroups();

    return () => {
      cancelled = true;
    };
  }, [messages.filterGroupLoadFailed, setErrorMessage, setFilterRuleGroups]);

  const handleSaveFilterRuleGroup = useCallback(async () => {
    const trimmedName = filterGroupNameInput.trim();
    if (!trimmedName) {
      setErrorMessage(messages.filterGroupNameRequired);
      return;
    }

    if (filterRulesPayload.length === 0) {
      setErrorMessage(messages.filterGroupRuleRequired);
      return;
    }

    const nextGroups = [...normalizedFilterRuleGroups];
    const groupIndex = nextGroups.findIndex((group) => group.name === trimmedName);
    const nextGroup: FilterRuleGroupPayload = {
      name: trimmedName,
      rules: filterRulesPayload,
    };

    if (groupIndex >= 0) {
      nextGroups[groupIndex] = nextGroup;
    } else {
      nextGroups.push(nextGroup);
    }

    try {
      const savedGroups = await persistFilterRuleGroups(nextGroups);
      setSelectedFilterGroupName(trimmedName);
      setFilterGroupNameInput(trimmedName);
      setFeedbackMessage(messages.filterGroupSaved(trimmedName));
      setErrorMessage(null);

      if (!savedGroups.some((group) => group.name === trimmedName)) {
        setSelectedFilterGroupName('');
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupSaveFailed}: ${readableError}`);
    }
  }, [
    filterGroupNameInput,
    filterRulesPayload,
    messages,
    normalizedFilterRuleGroups,
    persistFilterRuleGroups,
    setErrorMessage,
    setFeedbackMessage,
  ]);

  const handleDeleteFilterRuleGroup = useCallback(async () => {
    if (!selectedFilterGroupName) {
      setErrorMessage(messages.filterGroupSelectRequired);
      return;
    }

    const nextGroups = normalizedFilterRuleGroups.filter((group) => group.name !== selectedFilterGroupName);

    try {
      await persistFilterRuleGroups(nextGroups);
      setFeedbackMessage(messages.filterGroupDeleted(selectedFilterGroupName));
      setErrorMessage(null);
      setSelectedFilterGroupName('');
      if (filterGroupNameInput.trim() === selectedFilterGroupName) {
        setFilterGroupNameInput('');
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupSaveFailed}: ${readableError}`);
    }
  }, [
    filterGroupNameInput,
    messages,
    normalizedFilterRuleGroups,
    persistFilterRuleGroups,
    selectedFilterGroupName,
    setErrorMessage,
    setFeedbackMessage,
  ]);

  const handleImportFilterRuleGroups = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      const importedGroups = await invoke<FilterRuleGroupPayload[]>('import_filter_rule_groups', {
        path: selected,
      });
      const importedNormalized = normalizeFilterRuleGroups(importedGroups || []);
      if (importedNormalized.length === 0) {
        setErrorMessage(messages.filterGroupImportFailed);
        return;
      }

      const merged = [...normalizedFilterRuleGroups];
      importedNormalized.forEach((importedGroup) => {
        const existingIndex = merged.findIndex((group) => group.name === importedGroup.name);
        if (existingIndex >= 0) {
          merged[existingIndex] = importedGroup;
        } else {
          merged.push(importedGroup);
        }
      });

      await persistFilterRuleGroups(merged);
      setFeedbackMessage(messages.filterGroupsImported(importedNormalized.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupImportFailed}: ${readableError}`);
    }
  }, [messages, normalizedFilterRuleGroups, persistFilterRuleGroups, setErrorMessage, setFeedbackMessage]);

  const handleExportFilterRuleGroups = useCallback(async () => {
    if (normalizedFilterRuleGroups.length === 0) {
      setErrorMessage(messages.filterGroupsExportEmpty);
      return;
    }

    try {
      const selected = await save({
        defaultPath: 'rutar-filter-rule-groups.json',
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      await invoke('export_filter_rule_groups', {
        path: selected,
        groups: normalizedFilterRuleGroups,
      });

      setFeedbackMessage(messages.filterGroupsExported(normalizedFilterRuleGroups.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterGroupExportFailed}: ${readableError}`);
    }
  }, [messages, normalizedFilterRuleGroups, setErrorMessage, setFeedbackMessage]);

  return {
    addFilterRule,
    clearFilterRules,
    effectiveFilterRules,
    filterGroupNameInput,
    filterRuleDragState,
    filterRules,
    filterRulesKey,
    filterRulesPayload,
    handleDeleteFilterRuleGroup,
    handleExportFilterRuleGroups,
    handleImportFilterRuleGroups,
    handleLoadFilterRuleGroup,
    handleSaveFilterRuleGroup,
    handleSelectedFilterGroupChange,
    hasAnyConfiguredFilterRule,
    moveFilterRule,
    onFilterRuleDragEnd,
    onFilterRuleDragOver,
    onFilterRuleDragStart,
    onFilterRuleDrop,
    removeFilterRule,
    selectedFilterGroupName,
    setFilterGroupNameInput,
    setSelectedFilterGroupName,
    updateFilterRule,
  };
}
