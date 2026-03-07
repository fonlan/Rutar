import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect } from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type { FilterRuleGroupPayload, FilterRuleInputPayload } from './types';
import { normalizeFilterRuleGroups } from './utils';

interface UseFilterRuleGroupPersistenceOptions {
  filterGroupNameInput: string;
  filterRulesPayload: FilterRuleInputPayload[];
  messages: ReturnType<typeof getSearchPanelMessages>;
  normalizedFilterRuleGroups: FilterRuleGroupPayload[];
  selectedFilterGroupName: string;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
  setFilterGroupNameInput: (value: string) => void;
  setFilterRuleGroups: (value: FilterRuleGroupPayload[]) => void;
  setSelectedFilterGroupName: (value: string) => void;
}

export function useFilterRuleGroupPersistence({
  filterGroupNameInput,
  filterRulesPayload,
  messages,
  normalizedFilterRuleGroups,
  selectedFilterGroupName,
  setErrorMessage,
  setFeedbackMessage,
  setFilterGroupNameInput,
  setFilterRuleGroups,
  setSelectedFilterGroupName,
}: UseFilterRuleGroupPersistenceOptions) {
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
    setFilterGroupNameInput,
    setSelectedFilterGroupName,
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
    setFilterGroupNameInput,
    setSelectedFilterGroupName,
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
    handleDeleteFilterRuleGroup,
    handleExportFilterRuleGroups,
    handleImportFilterRuleGroups,
    handleSaveFilterRuleGroup,
  };
}