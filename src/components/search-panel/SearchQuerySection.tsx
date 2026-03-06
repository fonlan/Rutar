import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { HistoryDropdownInput } from '@/components/HistoryDropdownInput';
import { getSearchPanelMessages } from '@/i18n';
import { ModeButton } from './ModeButton';
import type { SearchMode } from './types';

export interface SearchQuerySectionProps {
  canReplace: boolean;
  caseSensitive: boolean;
  isReplaceMode: boolean;
  keyword: string;
  messages: ReturnType<typeof getSearchPanelMessages>;
  parseEscapeSequences: boolean;
  recentReplaceValues: string[];
  recentSearchKeywords: string[];
  replaceValue: string;
  resultToggleTitle: string;
  reverseSearch: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchMode: SearchMode;
  onCaseSensitiveChange: (checked: boolean) => void;
  onKeywordChange: (value: string) => void;
  onKeywordClear: () => void;
  onKeywordKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onParseEscapeSequencesChange: (checked: boolean) => void;
  onReplaceAll: () => void;
  onReplaceCurrent: () => void;
  onReplaceValueChange: (value: string) => void;
  onReplaceValueClear: () => void;
  onReverseSearchChange: (checked: boolean) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onToggleAllResults: () => void;
}

export function SearchQuerySection({
  canReplace,
  caseSensitive,
  isReplaceMode,
  keyword,
  messages,
  onCaseSensitiveChange,
  onKeywordChange,
  onKeywordClear,
  onKeywordKeyDown,
  onNavigateNext,
  onNavigatePrev,
  onParseEscapeSequencesChange,
  onReplaceAll,
  onReplaceCurrent,
  onReplaceValueChange,
  onReplaceValueClear,
  onReverseSearchChange,
  onSearchModeChange,
  onToggleAllResults,
  parseEscapeSequences,
  recentReplaceValues,
  recentSearchKeywords,
  replaceValue,
  resultToggleTitle,
  reverseSearch,
  searchInputRef,
  searchMode,
}: SearchQuerySectionProps) {
  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <HistoryDropdownInput
          inputRef={searchInputRef}
          value={keyword}
          onChange={onKeywordChange}
          onKeyDown={onKeywordKeyDown}
          placeholder={messages.findPlaceholder}
          ariaLabel={messages.findPlaceholder}
          name="search-keyword"
          history={recentSearchKeywords}
          historyLabel={messages.findHistory}
          clearLabel={messages.clearInput}
          emptyValueLabel={messages.historyEmptyValue}
          onClear={onKeywordClear}
        />
      </div>

      {isReplaceMode && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-4 text-xs text-muted-foreground">→</span>
          <HistoryDropdownInput
            value={replaceValue}
            onChange={onReplaceValueChange}
            placeholder={messages.replacePlaceholder}
            ariaLabel={messages.replacePlaceholder}
            name="replace-value"
            history={recentReplaceValues}
            historyLabel={messages.replaceHistory}
            clearLabel={messages.clearInput}
            emptyValueLabel={messages.historyEmptyValue}
            onClear={onReplaceValueClear}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ModeButton active={searchMode === 'literal'} label={messages.modeLiteral} onClick={() => onSearchModeChange('literal')} />
        <ModeButton active={searchMode === 'regex'} label={messages.modeRegex} onClick={() => onSearchModeChange('regex')} />
        <ModeButton active={searchMode === 'wildcard'} label={messages.modeWildcard} onClick={() => onSearchModeChange('wildcard')} />

        <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => onCaseSensitiveChange(event.target.checked)}
          />
          {messages.caseSensitive}
        </label>

        {isReplaceMode && (
          <label
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title={messages.parseEscapeSequencesHint}
          >
            <input
              type="checkbox"
              checked={parseEscapeSequences}
              onChange={(event) => onParseEscapeSequencesChange(event.target.checked)}
              title={messages.parseEscapeSequencesHint}
            />
            {messages.parseEscapeSequences}
          </label>
        )}

        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={reverseSearch}
            onChange={(event) => onReverseSearchChange(event.target.checked)}
          />
          {messages.reverseSearch}
        </label>
      </div>

      {isReplaceMode ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onNavigatePrev}
            title={messages.prevMatch}
          >
            <ArrowUp className="h-3 w-3" />
            {messages.previous}
          </button>

          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onNavigateNext}
            title={messages.nextMatch}
          >
            <ArrowDown className="h-3 w-3" />
            {messages.next}
          </button>

          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={onReplaceCurrent}
            disabled={!canReplace}
            title={canReplace ? messages.replaceCurrentMatch : messages.noFileOpen}
          >
            {messages.replace}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={onReplaceAll}
            disabled={!canReplace}
            title={canReplace ? messages.replaceAllMatches : messages.noFileOpen}
          >
            {messages.replaceAll}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onNavigatePrev}
            title={messages.prevMatch}
          >
            <ArrowUp className="h-3 w-3" />
            {messages.previous}
          </button>

          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onNavigateNext}
            title={messages.nextMatch}
          >
            <ArrowDown className="h-3 w-3" />
            {messages.next}
          </button>

          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onToggleAllResults}
            title={resultToggleTitle}
          >
            {messages.all}
          </button>
        </div>
      )}

    </>
  );
}
