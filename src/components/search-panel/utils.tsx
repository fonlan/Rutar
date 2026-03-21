import { type CSSProperties } from 'react';
import { getSearchPanelMessages } from '@/i18n';
import type {
  FilterMatch,
  FilterRule,
  FilterRuleApplyTo,
  FilterRuleGroupPayload,
  FilterRuleInputPayload,
  FilterRuleMatchMode,
  SearchMatch,
  SearchMode,
  SearchSidebarTextInputElement,
} from './types';

export const FILTER_MATCH_MODES: FilterRuleMatchMode[] = ['contains', 'regex', 'wildcard'];
export const SEARCH_CHUNK_SIZE = 300;
export const FILTER_CHUNK_SIZE = 300;
export const RESULT_PANEL_DEFAULT_HEIGHT = 224;
export const RESULT_PANEL_MIN_HEIGHT = 140;
export const RESULT_PANEL_MAX_HEIGHT = 640;
export const SEARCH_SIDEBAR_DEFAULT_WIDTH = 325;
export const SEARCH_SIDEBAR_MIN_WIDTH = 280;
export const SEARCH_SIDEBAR_MAX_WIDTH = 900;
export const SEARCH_SIDEBAR_RIGHT_OFFSET = 12;
export const DEFAULT_FILTER_RULE_BACKGROUND = '#fff7a8';
export const DEFAULT_FILTER_RULE_TEXT = '#1f2937';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

export function getReservedLayoutHeight(selector: string) {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  if (elements.length === 0) {
    return 0;
  }

  return Array.from(elements).reduce((total, element) => {
    return total + element.getBoundingClientRect().height;
  }, 0);
}

export function dispatchEditorForceRefresh(tabId: string, lineCount?: number) {
  window.dispatchEvent(
    new CustomEvent('rutar:force-refresh', {
      detail: { tabId, lineCount },
    })
  );
}

export function dispatchNavigateToMatch(tabId: string, match: SearchMatch, occludedRightPx = 0) {
  const matchLength = Math.max(0, match.endChar - match.startChar);

  window.dispatchEvent(
    new CustomEvent('rutar:navigate-to-line', {
      detail: {
        tabId,
        line: match.line,
        column: match.column,
        length: matchLength,
        lineText: match.lineText,
        occludedRightPx: Math.max(0, occludedRightPx),
      },
    })
  );
}

export function dispatchNavigateToLine(
  tabId: string,
  line: number,
  column: number,
  length: number,
  lineText = '',
  occludedRightPx = 0,
  source?: string
) {
  const detail: {
    tabId: string;
    line: number;
    column: number;
    length: number;
    lineText: string;
    occludedRightPx: number;
    source?: string;
  } = {
    tabId,
    line,
    column,
    length,
    lineText,
    occludedRightPx: Math.max(0, occludedRightPx),
  };
  if (source) {
    detail.source = source;
  }

  window.dispatchEvent(
    new CustomEvent('rutar:navigate-to-line', {
      detail,
    })
  );
}

export function dispatchSearchClose(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:search-close', {
      detail: { tabId },
    })
  );
}

export function createDefaultFilterRule(index: number): FilterRule {
  return {
    id: `filter-rule-${Date.now()}-${index}`,
    keyword: '',
    matchMode: 'contains',
    backgroundColor: DEFAULT_FILTER_RULE_BACKGROUND,
    textColor: DEFAULT_FILTER_RULE_TEXT,
    bold: false,
    italic: false,
    applyTo: 'line',
  };
}

export function normalizeFilterRuleInputPayload(rule: FilterRuleInputPayload): FilterRuleInputPayload | null {
  const keyword = rule.keyword.trim();
  if (!keyword) {
    return null;
  }

  const matchMode = FILTER_MATCH_MODES.includes(rule.matchMode) ? rule.matchMode : 'contains';
  const applyTo: FilterRuleApplyTo = rule.applyTo === 'match' ? 'match' : 'line';

  return {
    keyword,
    matchMode,
    backgroundColor: rule.backgroundColor?.trim() || '',
    textColor: rule.textColor?.trim() || DEFAULT_FILTER_RULE_TEXT,
    bold: !!rule.bold,
    italic: !!rule.italic,
    applyTo,
  };
}

export function normalizeFilterRuleGroups(groups: FilterRuleGroupPayload[]): FilterRuleGroupPayload[] {
  return groups
    .map((group) => ({
      name: group.name.trim(),
      rules: (group.rules || []).map(normalizeFilterRuleInputPayload).filter((rule): rule is FilterRuleInputPayload => !!rule),
    }))
    .filter((group) => group.name.length > 0 && group.rules.length > 0);
}

export function buildFilterRulesFromPayload(rules: FilterRuleInputPayload[]): FilterRule[] {
  const normalizedRules = rules
    .map(normalizeFilterRuleInputPayload)
    .filter((rule): rule is FilterRuleInputPayload => !!rule);

  if (normalizedRules.length === 0) {
    return [createDefaultFilterRule(0)];
  }

  return normalizedRules.map((rule, index) => ({
    id: `filter-rule-${Date.now()}-${index}`,
    keyword: rule.keyword,
    matchMode: rule.matchMode,
    backgroundColor: rule.backgroundColor,
    textColor: rule.textColor,
    bold: rule.bold,
    italic: rule.italic,
    applyTo: rule.applyTo,
  }));
}

export function reorderFilterRules(rules: FilterRule[], draggingRuleId: string, targetRuleId: string): FilterRule[] {
  if (draggingRuleId === targetRuleId) {
    return rules;
  }

  const sourceIndex = rules.findIndex((rule) => rule.id === draggingRuleId);
  const targetIndex = rules.findIndex((rule) => rule.id === targetRuleId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return rules;
  }

  const nextRules = [...rules];
  const [movedRule] = nextRules.splice(sourceIndex, 1);
  nextRules.splice(targetIndex, 0, movedRule);
  return nextRules;
}

export function normalizeFilterRules(rules: FilterRule[]) {
  return rules
    .map((rule) => ({
      id: rule.id,
      keyword: rule.keyword.trim(),
      matchMode: rule.matchMode,
      backgroundColor: rule.backgroundColor,
      textColor: rule.textColor,
      bold: rule.bold,
      italic: rule.italic,
      applyTo: rule.applyTo,
    }))
    .filter((rule) => rule.keyword.length > 0);
}

export function buildFilterRulesPayload(rules: FilterRule[]): FilterRuleInputPayload[] {
  return normalizeFilterRules(rules).map((rule) => ({
    keyword: rule.keyword,
    matchMode: rule.matchMode,
    backgroundColor: rule.backgroundColor,
    textColor: rule.textColor,
    bold: rule.bold,
    italic: rule.italic,
    applyTo: rule.applyTo,
  }));
}

function cssColor(value: string | undefined, fallback: string) {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value;
}

export function getSearchModeValue(mode: SearchMode) {
  return mode;
}

export function decodeSearchReplaceEscapeSequences(value: string) {
  let decoded = '';

  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch !== '\\') {
      decoded += ch;
      continue;
    }

    const next = value[index + 1];
    if (next === 'n') {
      decoded += '\n';
      index += 1;
      continue;
    }
    if (next === 'r') {
      decoded += '\r';
      index += 1;
      continue;
    }
    if (next === 't') {
      decoded += '\t';
      index += 1;
      continue;
    }
    if (next === '\\') {
      decoded += '\\';
      index += 1;
      continue;
    }

    decoded += ch;
  }

  return decoded;
}

export function resolveSearchKeyword(value: string, parseEscapeSequences: boolean) {
  if (!parseEscapeSequences) {
    return value;
  }

  return decodeSearchReplaceEscapeSequences(value);
}

interface SearchStatusTextArgs {
  currentFilterMatchIndex: number;
  currentMatchIndex: number;
  errorMessage: string | null;
  filterMatchCount: number;
  hasConfiguredFilterRules: boolean;
  isFilterMode: boolean;
  isSearching: boolean;
  keyword: string;
  matchCount: number;
  messages: ReturnType<typeof getSearchPanelMessages>;
  totalFilterMatchedLineCount: number | null;
  totalMatchCount: number | null;
}

interface PlainTextResultEntriesArgs {
  filterRulesPayloadLength: number;
  isFilterMode: boolean;
  keyword: string;
  visibleFilterMatches: FilterMatch[];
  visibleMatches: SearchMatch[];
}

export function getDisplayCountText(value: number | null, countingLabel: string) {
  return value === null ? countingLabel : `${value}`;
}

export function getPlainTextResultEntries({
  filterRulesPayloadLength,
  isFilterMode,
  keyword,
  visibleFilterMatches,
  visibleMatches,
}: PlainTextResultEntriesArgs): string[] {
  if (isFilterMode) {
    if (filterRulesPayloadLength === 0 || visibleFilterMatches.length === 0) {
      return [];
    }

    return visibleFilterMatches.map((match) => match.lineText || '');
  }

  if (!keyword || visibleMatches.length === 0) {
    return [];
  }

  return visibleMatches.map((match) => match.lineText || '');
}

export function getSearchStatusText({
  currentFilterMatchIndex,
  currentMatchIndex,
  errorMessage,
  filterMatchCount,
  hasConfiguredFilterRules,
  isFilterMode,
  isSearching,
  keyword,
  matchCount,
  messages,
  totalFilterMatchedLineCount,
  totalMatchCount,
}: SearchStatusTextArgs) {
  if (isFilterMode) {
    if (!hasConfiguredFilterRules) {
      return messages.statusEnterToFilter;
    }

    if (errorMessage) {
      return errorMessage;
    }

    if (isSearching) {
      return messages.statusFiltering;
    }

    if (filterMatchCount === 0) {
      return messages.statusFilterNoMatches;
    }

    if (totalFilterMatchedLineCount === null) {
      return messages.statusFilterTotalPending(Math.min(currentFilterMatchIndex + 1, filterMatchCount));
    }

    return messages.statusFilterTotalReady(
      totalFilterMatchedLineCount,
      Math.min(currentFilterMatchIndex + 1, filterMatchCount)
    );
  }

  if (!keyword) {
    return messages.statusEnterToSearch;
  }

  if (errorMessage) {
    return errorMessage;
  }

  if (isSearching) {
    return messages.statusSearching;
  }

  if (matchCount === 0) {
    return messages.statusNoMatches;
  }

  if (totalMatchCount === null) {
    return messages.statusTotalPending(Math.min(currentMatchIndex + 1, matchCount));
  }

  return messages.statusTotalReady(totalMatchCount, Math.min(currentMatchIndex + 1, matchCount));
}

export function renderMatchPreview(match: SearchMatch) {
  const lineText = match.lineText || '';
  const previewSegments = match.previewSegments ?? [];

  if (previewSegments.length === 0) {
    return <span>{lineText || ' '}</span>;
  }

  return (
    <>
      {previewSegments.map((segment, index) => {
        if (!segment.text) {
          return null;
        }

        if (segment.isSecondaryMatch) {
          return (
            <mark key={`secondary-${index}`} className="rounded-sm px-0.5" style={{ backgroundColor: '#bae6fd' }}>
              {segment.text}
            </mark>
          );
        }

        if (segment.isPrimaryMatch) {
          return (
            <mark key={`primary-${index}`} className="rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70">
              {segment.text}
            </mark>
          );
        }

        return <span key={`plain-${index}`}>{segment.text}</span>;
      })}
    </>
  );
}

export function renderFilterPreview(match: FilterMatch) {
  const lineText = match.lineText || '';
  const previewSegments = match.previewSegments ?? [];
  const style = match.style;
  const textColor = cssColor(style?.textColor, 'inherit');
  const bgColor = cssColor(style?.backgroundColor, 'transparent');
  const isBold = !!style?.bold;
  const isItalic = !!style?.italic;
  const secondaryHighlightBg = '#bae6fd';

  const applySegmentStyle = (isRuleMatch: boolean, isSecondaryMatch: boolean): CSSProperties => {
    const nextStyle: CSSProperties = {
      backgroundColor: isSecondaryMatch ? secondaryHighlightBg : isRuleMatch ? bgColor : 'transparent',
    };

    if (isRuleMatch) {
      nextStyle.color = textColor;
      nextStyle.fontWeight = isBold ? 700 : 400;
      nextStyle.fontStyle = isItalic ? 'italic' : 'normal';
    }

    return nextStyle;
  };

  if (previewSegments.length === 0) {
    return <span>{lineText || ' '}</span>;
  }

  return (
    <>
      {previewSegments.map((segment, index) => {
        if (!segment.text) {
          return null;
        }

        return (
          <span
            key={`segment-${index}`}
            style={applySegmentStyle(!!segment.isRuleMatch, !!segment.isSecondaryMatch)}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}

export function matchModeLabel(mode: FilterRuleMatchMode, messages: ReturnType<typeof getSearchPanelMessages>) {
  if (mode === 'contains') {
    return messages.filterMatchContains;
  }

  if (mode === 'regex') {
    return messages.filterMatchRegex;
  }

  return messages.filterMatchWildcard;
}

export async function writePlainTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Clipboard copy not supported');
  }
}

export function resolveSearchSidebarTextInputTarget(
  target: EventTarget | null
): SearchSidebarTextInputElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const inputElement = target.closest('input, textarea');
  if (!inputElement) {
    return null;
  }

  if (inputElement instanceof HTMLTextAreaElement) {
    return inputElement;
  }

  if (!(inputElement instanceof HTMLInputElement)) {
    return null;
  }

  const inputType = (inputElement.type || 'text').toLowerCase();
  return TEXT_INPUT_TYPES.has(inputType) ? inputElement : null;
}

export function getTextInputSelectionRange(input: SearchSidebarTextInputElement) {
  const start = input.selectionStart ?? 0;
  const rawEnd = input.selectionEnd ?? start;
  const end = rawEnd < start ? start : rawEnd;
  return { start, end };
}

export function hasTextInputSelection(input: SearchSidebarTextInputElement) {
  const { start, end } = getTextInputSelectionRange(input);
  return end > start;
}

export function isTextInputEditable(input: SearchSidebarTextInputElement) {
  return !input.readOnly && !input.disabled;
}

export function dispatchTextInputEvent(input: SearchSidebarTextInputElement) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function replaceSelectedInputText(
  input: SearchSidebarTextInputElement,
  text: string,
  selectionMode: SelectionMode
) {
  const { start, end } = getTextInputSelectionRange(input);
  input.setRangeText(text, start, end, selectionMode);
  dispatchTextInputEvent(input);
}
