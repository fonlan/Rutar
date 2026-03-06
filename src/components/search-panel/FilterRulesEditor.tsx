import {
  ArrowDown,
  ArrowUp,
  CirclePlus,
  GripVertical,
  Palette,
  Trash2,
  X,
} from 'lucide-react';
import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import { ModeButton } from './ModeButton';
import type {
  FilterRule,
  FilterRuleDragState,
  FilterRuleGroupPayload,
} from './types';
import {
  DEFAULT_FILTER_RULE_BACKGROUND,
  FILTER_MATCH_MODES,
  matchModeLabel,
} from './utils';

export interface FilterRulesEditorProps {
  messages: ReturnType<typeof getSearchPanelMessages>;
  effectiveFilterRules: FilterRule[];
  filterGroupNameInput: string;
  filterRuleDragState: FilterRuleDragState | null;
  filterRules: FilterRule[];
  filterToggleLabel: string;
  hasAnyConfiguredFilterRule: boolean;
  normalizedFilterRuleGroups: FilterRuleGroupPayload[];
  selectedFilterGroupName: string;
  onAddFilterRule: () => void;
  onClearFilterGroupNameInput: () => void;
  onClearFilterRules: () => void;
  onDeleteFilterRuleGroup: () => void | Promise<void>;
  onExportFilterRuleGroups: () => void | Promise<void>;
  onFilterGroupNameInputChange: (value: string) => void;
  onImportFilterRuleGroups: () => void | Promise<void>;
  onKeywordKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onLoadFilterRuleGroup: () => void;
  onMoveFilterRule: (id: string, direction: -1 | 1) => void;
  onRemoveFilterRule: (id: string) => void;
  onRuleDragEnd: () => void;
  onRuleDragOver: (event: ReactDragEvent<HTMLElement>, ruleId: string) => void;
  onRuleDragStart: (event: ReactDragEvent<HTMLElement>, ruleId: string) => void;
  onRuleDrop: (event: ReactDragEvent<HTMLElement>, targetRuleId: string) => void;
  onSaveFilterRuleGroup: () => void | Promise<void>;
  onSelectedFilterGroupChange: (value: string) => void;
  onToggleResultPanelAndRefresh: () => void;
  onUpdateFilterRule: (id: string, updater: (rule: FilterRule) => FilterRule) => void;
}

interface FilterRuleCardProps {
  index: number;
  messages: ReturnType<typeof getSearchPanelMessages>;
  rule: FilterRule;
  totalRules: number;
  isDropTarget: boolean;
  onKeywordKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onMoveFilterRule: (id: string, direction: -1 | 1) => void;
  onRemoveFilterRule: (id: string) => void;
  onRuleDragEnd: () => void;
  onRuleDragOver: (event: ReactDragEvent<HTMLElement>, ruleId: string) => void;
  onRuleDragStart: (event: ReactDragEvent<HTMLElement>, ruleId: string) => void;
  onRuleDrop: (event: ReactDragEvent<HTMLElement>, targetRuleId: string) => void;
  onUpdateFilterRule: (id: string, updater: (rule: FilterRule) => FilterRule) => void;
}

function FilterRuleCard({
  index,
  isDropTarget,
  messages,
  onKeywordKeyDown,
  onMoveFilterRule,
  onRemoveFilterRule,
  onRuleDragEnd,
  onRuleDragOver,
  onRuleDragStart,
  onRuleDrop,
  onUpdateFilterRule,
  rule,
  totalRules,
}: FilterRuleCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border/70 p-2 transition-colors',
        isDropTarget ? 'border-primary bg-primary/5' : undefined
      )}
      onDragOver={(event) => onRuleDragOver(event, rule.id)}
      onDrop={(event) => onRuleDrop(event, rule.id)}
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span
            draggable
            onDragStart={(event) => onRuleDragStart(event, rule.id)}
            onDragEnd={onRuleDragEnd}
            title={messages.filterDragPriorityHint}
            className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3 w-3" />
          </span>
          {messages.filterPriority} #{index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={() => onMoveFilterRule(rule.id, -1)}
            disabled={index === 0}
            title={messages.filterMoveUp}
            aria-label={messages.filterMoveUp}
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={() => onMoveFilterRule(rule.id, 1)}
            disabled={index === totalRules - 1}
            title={messages.filterMoveDown}
            aria-label={messages.filterMoveDown}
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onRemoveFilterRule(rule.id)}
            title={messages.filterDeleteRule}
            aria-label={messages.filterDeleteRule}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          value={rule.keyword}
          onChange={(event) => {
            onUpdateFilterRule(rule.id, (previous) => ({
              ...previous,
              keyword: event.target.value,
            }));
          }}
          onKeyDown={onKeywordKeyDown}
          placeholder={messages.filterRuleKeywordPlaceholder}
          aria-label={messages.filterRuleKeywordPlaceholder}
          name={`filter-rule-keyword-${rule.id}`}
          autoComplete="off"
          className="h-8 w-full rounded-md border border-input bg-background px-2 pr-8 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
        />
        {rule.keyword && (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                keyword: '',
              }));
            }}
            title={messages.clearInput}
            aria-label={messages.clearInput}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {FILTER_MATCH_MODES.map((modeOption) => {
          return (
            <ModeButton
              key={`${rule.id}-${modeOption}`}
              active={rule.matchMode === modeOption}
              label={matchModeLabel(modeOption, messages)}
              onClick={() => {
                onUpdateFilterRule(rule.id, (previous) => ({
                  ...previous,
                  matchMode: modeOption,
                }));
              }}
            />
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label
          className={cn(
            'inline-flex items-center gap-1 text-[11px]',
            !rule.backgroundColor ? 'text-muted-foreground/60' : 'text-muted-foreground'
          )}
        >
          <Palette className="h-3 w-3" />
          {messages.filterBackground}
          <input
            type="color"
            disabled={!rule.backgroundColor}
            value={rule.backgroundColor || DEFAULT_FILTER_RULE_BACKGROUND}
            onChange={(event) => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                backgroundColor: event.target.value,
              }));
            }}
            className="h-6 w-8 rounded border border-border bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!rule.backgroundColor}
            onChange={(event) => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                backgroundColor: event.target.checked ? '' : previous.backgroundColor || DEFAULT_FILTER_RULE_BACKGROUND,
              }));
            }}
          />
          {messages.filterNoBackground}
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {messages.filterTextColor}
          <input
            type="color"
            value={rule.textColor}
            onChange={(event) => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                textColor: event.target.value,
              }));
            }}
            className="h-6 w-8 rounded border border-border bg-transparent p-0"
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={rule.bold}
            onChange={(event) => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                bold: event.target.checked,
              }));
            }}
          />
          {messages.filterStyleBold}
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={rule.italic}
            onChange={(event) => {
              onUpdateFilterRule(rule.id, (previous) => ({
                ...previous,
                italic: event.target.checked,
              }));
            }}
          />
          {messages.filterStyleItalic}
        </label>

        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            rule.applyTo === 'line'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() => {
            onUpdateFilterRule(rule.id, (previous) => ({
              ...previous,
              applyTo: 'line',
            }));
          }}
        >
          {messages.filterApplyLine}
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            rule.applyTo === 'match'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() => {
            onUpdateFilterRule(rule.id, (previous) => ({
              ...previous,
              applyTo: 'match',
            }));
          }}
        >
          {messages.filterApplyMatch}
        </button>
      </div>
    </div>
  );
}

export function FilterRulesEditor({
  effectiveFilterRules,
  filterGroupNameInput,
  filterRuleDragState,
  filterRules,
  filterToggleLabel,
  hasAnyConfiguredFilterRule,
  messages,
  normalizedFilterRuleGroups,
  onAddFilterRule,
  onClearFilterGroupNameInput,
  onClearFilterRules,
  onDeleteFilterRuleGroup,
  onExportFilterRuleGroups,
  onFilterGroupNameInputChange,
  onImportFilterRuleGroups,
  onKeywordKeyDown,
  onLoadFilterRuleGroup,
  onMoveFilterRule,
  onRemoveFilterRule,
  onRuleDragEnd,
  onRuleDragOver,
  onRuleDragStart,
  onRuleDrop,
  onSaveFilterRuleGroup,
  onSelectedFilterGroupChange,
  onToggleResultPanelAndRefresh,
  onUpdateFilterRule,
  selectedFilterGroupName,
}: FilterRulesEditorProps) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onAddFilterRule}
          >
            <CirclePlus className="h-3.5 w-3.5" />
            {messages.filterAddRule}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={onClearFilterRules}
            disabled={!hasAnyConfiguredFilterRule}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {messages.filterClearRules}
          </button>
        </div>
        <button
          type="button"
          className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          onClick={onToggleResultPanelAndRefresh}
          title={messages.filterRunHint}
        >
          {filterToggleLabel}
        </button>
      </div>

      <div className="rounded-md border border-border/70 p-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              value={filterGroupNameInput}
              onChange={(event) => onFilterGroupNameInputChange(event.target.value)}
              placeholder={messages.filterGroupNamePlaceholder}
              aria-label={messages.filterGroupNamePlaceholder}
              name="filter-group-name"
              autoComplete="off"
              className="h-8 w-full rounded-md border border-input bg-background px-2 pr-8 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
            />
            {filterGroupNameInput && (
              <button
                type="button"
                className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClearFilterGroupNameInput}
                title={messages.clearInput}
                aria-label={messages.clearInput}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => void onSaveFilterRuleGroup()}
          >
            {messages.filterSaveGroup}
          </button>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <select
            value={selectedFilterGroupName}
            onChange={(event) => onSelectedFilterGroupChange(event.target.value)}
            name="filter-group-select"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={messages.filterGroupSelectPlaceholder}
          >
            <option value="">{messages.filterGroupSelectPlaceholder}</option>
            {normalizedFilterRuleGroups.map((group) => (
              <option key={group.name} value={group.name}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onLoadFilterRuleGroup}
          >
            {messages.filterLoadGroup}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => void onDeleteFilterRuleGroup()}
          >
            {messages.filterDeleteGroup}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => void onImportFilterRuleGroups()}
          >
            {messages.filterImportGroups}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => void onExportFilterRuleGroups()}
          >
            {messages.filterExportGroups}
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {normalizedFilterRuleGroups.length > 0
              ? `${normalizedFilterRuleGroups.length}`
              : messages.filterGroupsEmptyHint}
          </span>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">{messages.filterRunHint}</div>

      {filterRules.map((rule, index) => {
        const isDropTarget = filterRuleDragState?.overRuleId === rule.id;

        return (
          <FilterRuleCard
            key={rule.id}
            index={index}
            isDropTarget={isDropTarget}
            messages={messages}
            onKeywordKeyDown={onKeywordKeyDown}
            onMoveFilterRule={onMoveFilterRule}
            onRemoveFilterRule={onRemoveFilterRule}
            onRuleDragEnd={onRuleDragEnd}
            onRuleDragOver={onRuleDragOver}
            onRuleDragStart={onRuleDragStart}
            onRuleDrop={onRuleDrop}
            onUpdateFilterRule={onUpdateFilterRule}
            rule={rule}
            totalRules={filterRules.length}
          />
        );
      })}

      {effectiveFilterRules.length === 0 && (
        <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
          {messages.filterRuleEmptyHint}
        </div>
      )}
    </div>
  );
}
