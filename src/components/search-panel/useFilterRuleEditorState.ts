import {
  useCallback,
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
  createDefaultFilterRule,
  reorderFilterRules,
} from './utils';

interface UseFilterRuleEditorStateOptions {
  messages: ReturnType<typeof getSearchPanelMessages>;
  normalizedFilterRuleGroups: FilterRuleGroupPayload[];
  resetFilterState: (clearTotals?: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
}

export function useFilterRuleEditorState({
  messages,
  normalizedFilterRuleGroups,
  resetFilterState,
  setErrorMessage,
  setFeedbackMessage,
}: UseFilterRuleEditorStateOptions) {
  const [filterRules, setFilterRules] = useState<FilterRule[]>([createDefaultFilterRule(0)]);
  const [selectedFilterGroupName, setSelectedFilterGroupName] = useState('');
  const [filterGroupNameInput, setFilterGroupNameInput] = useState('');
  const [filterRuleDragState, setFilterRuleDragState] = useState<FilterRuleDragState | null>(null);

  const clearMessages = useCallback(() => {
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, [setErrorMessage, setFeedbackMessage]);

  const updateFilterRule = useCallback((id: string, updater: (rule: FilterRule) => FilterRule) => {
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
  }, [clearMessages, resetFilterState]);

  const addFilterRule = useCallback(() => {
    setFilterRules((previousRules) => [...previousRules, createDefaultFilterRule(previousRules.length)]);
    clearMessages();
  }, [clearMessages]);

  const clearFilterRules = useCallback(() => {
    setFilterRules([createDefaultFilterRule(0)]);
    clearMessages();
    resetFilterState();
  }, [clearMessages, resetFilterState]);

  const removeFilterRule = useCallback((id: string) => {
    setFilterRules((previousRules) => {
      const nextRules = previousRules.filter((rule) => rule.id !== id);
      if (nextRules.length > 0) {
        return nextRules;
      }

      return [createDefaultFilterRule(0)];
    });
    clearMessages();
    resetFilterState();
  }, [clearMessages, resetFilterState]);

  const moveFilterRule = useCallback((id: string, direction: -1 | 1) => {
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
  }, [clearMessages, resetFilterState]);

  const onFilterRuleDragStart = useCallback((event: ReactDragEvent<HTMLElement>, ruleId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ruleId);
    setFilterRuleDragState({
      draggingRuleId: ruleId,
      overRuleId: null,
    });
    clearMessages();
  }, [clearMessages]);

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

  const onFilterRuleDrop = useCallback((event: ReactDragEvent<HTMLElement>, targetRuleId: string) => {
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
  }, [clearMessages, filterRuleDragState?.draggingRuleId, resetFilterState]);

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

  return {
    addFilterRule,
    clearFilterRules,
    filterGroupNameInput,
    filterRuleDragState,
    filterRules,
    handleLoadFilterRuleGroup,
    handleSelectedFilterGroupChange,
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
