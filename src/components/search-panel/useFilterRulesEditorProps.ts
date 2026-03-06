import { useMemo } from 'react';
import type { FilterRulesEditorProps } from './FilterRulesEditor';

interface UseFilterRulesEditorPropsOptions
  extends Omit<
    FilterRulesEditorProps,
    | 'onClearFilterGroupNameInput'
    | 'onDeleteFilterRuleGroup'
    | 'onExportFilterRuleGroups'
    | 'onImportFilterRuleGroups'
    | 'onSaveFilterRuleGroup'
  > {
  handleDeleteFilterRuleGroup: () => Promise<void>;
  handleExportFilterRuleGroups: () => Promise<void>;
  handleImportFilterRuleGroups: () => Promise<void>;
  handleSaveFilterRuleGroup: () => Promise<void>;
  setFilterGroupNameInput: (value: string) => void;
}

export function useFilterRulesEditorProps({
  handleDeleteFilterRuleGroup,
  handleExportFilterRuleGroups,
  handleImportFilterRuleGroups,
  handleSaveFilterRuleGroup,
  setFilterGroupNameInput,
  ...props
}: UseFilterRulesEditorPropsOptions): FilterRulesEditorProps {
  return useMemo(
    () => ({
      ...props,
      onClearFilterGroupNameInput: () => setFilterGroupNameInput(''),
      onDeleteFilterRuleGroup: () => void handleDeleteFilterRuleGroup(),
      onExportFilterRuleGroups: () => void handleExportFilterRuleGroups(),
      onImportFilterRuleGroups: () => void handleImportFilterRuleGroups(),
      onSaveFilterRuleGroup: () => void handleSaveFilterRuleGroup(),
    }),
    [
      handleDeleteFilterRuleGroup,
      handleExportFilterRuleGroups,
      handleImportFilterRuleGroups,
      handleSaveFilterRuleGroup,
      props,
      setFilterGroupNameInput,
    ]
  );
}
