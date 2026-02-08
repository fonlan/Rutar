import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  ArrowDown,
  Check,
  ArrowUp,
  CirclePlus,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Palette,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type UIEvent as ReactUIEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

const MAX_LINE_RANGE = 2147483647;

type SearchMode = 'literal' | 'regex' | 'wildcard';
type SearchOpenMode = 'find' | 'replace' | 'filter';
type SearchResultPanelState = 'closed' | 'minimized' | 'open';
type PanelMode = 'find' | 'replace' | 'filter';
type FilterRuleMatchMode = 'contains' | 'regex' | 'wildcard';
type FilterRuleApplyTo = 'line' | 'match';

const FILTER_MATCH_MODES: FilterRuleMatchMode[] = ['contains', 'regex', 'wildcard'];

interface FilterRule {
  id: string;
  keyword: string;
  matchMode: FilterRuleMatchMode;
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

interface FilterRuleDragState {
  draggingRuleId: string;
  overRuleId: string | null;
}

interface FilterRuleStyle {
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

interface FilterMatchRange {
  startChar: number;
  endChar: number;
}

interface FilterMatch {
  line: number;
  column: number;
  length: number;
  lineText: string;
  ruleIndex: number;
  style: FilterRuleStyle;
  ranges: FilterMatchRange[];
}

interface FilterRuleInputPayload {
  keyword: string;
  matchMode: FilterRuleMatchMode;
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

interface FilterRuleGroupPayload {
  name: string;
  rules: FilterRuleInputPayload[];
}

interface SearchMatch {
  start: number;
  end: number;
  startChar: number;
  endChar: number;
  text: string;
  line: number;
  column: number;
  lineText: string;
}

interface SearchOpenEventDetail {
  mode?: SearchOpenMode;
}

interface SearchRegexResult {
  regex: RegExp | null;
  errorMessage: string | null;
}

interface SearchRunResult {
  matches: SearchMatch[];
  documentVersion: number;
  errorMessage: string | null;
  nextOffset?: number | null;
}

interface FilterRunResult {
  matches: FilterMatch[];
  documentVersion: number;
  errorMessage: string | null;
  nextLine?: number | null;
}

interface SearchChunkBackendResult {
  matches: SearchMatch[];
  documentVersion: number;
  nextOffset: number | null;
}

interface FilterChunkBackendResult {
  matches: FilterMatch[];
  documentVersion: number;
  nextLine: number | null;
}

interface FilterCountBackendResult {
  matchedLines: number;
  documentVersion: number;
}

interface SearchFirstBackendResult {
  firstMatch: SearchMatch | null;
  documentVersion: number;
}

interface SearchCountBackendResult {
  totalMatches: number;
  matchedLines: number;
  documentVersion: number;
}

interface TabSearchPanelSnapshot {
  isOpen: boolean;
  panelMode: PanelMode;
  resultPanelState: SearchResultPanelState;
  keyword: string;
  replaceValue: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  reverseSearch: boolean;
  resultFilterKeyword: string;
  appliedResultFilterKeyword: string;
}

const SEARCH_CHUNK_SIZE = 300;
const FILTER_CHUNK_SIZE = 300;
const SEARCH_SIDEBAR_WIDTH = 'min(90vw, 420px)';
const DEFAULT_FILTER_RULE_BACKGROUND = '#fff7a8';
const DEFAULT_FILTER_RULE_TEXT = '#1f2937';

function getSearchMessages(language: 'zh-CN' | 'en-US') {
  if (language === 'en-US') {
    return {
      counting: 'Counting…',
      invalidRegex: 'Invalid regular expression',
      searchFailed: 'Search failed',
      filterFailed: 'Filter failed',
      replaceFailed: 'Replace failed',
      replaceAllFailed: 'Replace all failed',
      noReplaceMatches: 'No matches to replace',
      replacedCurrent: 'Replaced current match',
      textUnchanged: 'Text unchanged',
      replacedAll: (count: number) => `Replaced all ${count} matches`,
      statusEnterToSearch: 'Enter keyword and press Enter to search',
      statusSearching: 'Searching...',
      statusNoMatches: 'No matches found',
      statusTotalPending: (current: number) => `Total matches counting… · Current ${current}/?`,
      statusTotalReady: (total: number, current: number) => `Total ${total} matches · Current ${current}/${Math.max(total, 1)}`,
      statusEnterToFilter: 'Add filter rules and press Enter to run filter',
      statusFiltering: 'Filtering...',
      statusFilterNoMatches: 'No lines matched filters',
      statusFilterTotalPending: (current: number) => `Matched lines counting… · Current ${current}/?`,
      statusFilterTotalReady: (total: number, current: number) => `Matched lines ${total} · Current ${current}/${Math.max(total, 1)}`,
      find: 'Find',
      replace: 'Replace',
      filter: 'Filter',
      switchToReplaceMode: 'Switch to replace mode',
      switchToFilterMode: 'Switch to filter mode',
      noFileOpen: 'No file opened',
      close: 'Close',
      findPlaceholder: 'Find text',
      filterAddRule: 'Add Rule',
      filterRuleKeywordPlaceholder: 'Filter keyword',
      filterMatchContains: 'Contains',
      filterMatchRegex: 'Regex',
      filterMatchWildcard: 'Wildcard',
      filterApplyLine: 'Whole line',
      filterApplyMatch: 'Match only',
      filterStyleBold: 'Bold',
      filterStyleItalic: 'Italic',
      filterBackground: 'Bg',
      filterNoBackground: 'No Bg',
      filterTextColor: 'Text',
      filterMoveUp: 'Move up',
      filterMoveDown: 'Move down',
      filterDeleteRule: 'Delete',
      filterPriority: 'Priority',
      filterDragPriorityHint: 'Drag to reorder priority',
      filterRuleEmptyHint: 'Add at least one non-empty rule.',
      filterRun: 'Filter',
      filterRunHint: 'Click Filter to run current rules',
      filterGroupNamePlaceholder: 'Rule group name',
      filterSaveGroup: 'Save Group',
      filterLoadGroup: 'Load Group',
      filterDeleteGroup: 'Delete Group',
      filterGroupSelectPlaceholder: 'Select rule group',
      filterGroupsEmptyHint: 'No saved rule groups yet.',
      filterImportGroups: 'Import Groups',
      filterExportGroups: 'Export Groups',
      filterGroupNameRequired: 'Please enter a rule group name',
      filterGroupRuleRequired: 'Add at least one non-empty rule before saving',
      filterGroupSelectRequired: 'Please select a rule group',
      filterGroupsExportEmpty: 'No rule groups to export',
      filterGroupSaved: (name: string) => `Saved rule group: ${name}`,
      filterGroupLoaded: (name: string) => `Loaded rule group: ${name}`,
      filterGroupDeleted: (name: string) => `Deleted rule group: ${name}`,
      filterGroupsImported: (count: number) => `Imported ${count} rule groups`,
      filterGroupsExported: (count: number) => `Exported ${count} rule groups`,
      filterGroupLoadFailed: 'Failed to load rule groups',
      filterGroupSaveFailed: 'Failed to save rule groups',
      filterGroupImportFailed: 'Failed to import rule groups',
      filterGroupExportFailed: 'Failed to export rule groups',
      collapseResults: 'Collapse results',
      expandResults: 'Expand results',
      results: 'Results',
      all: 'All',
      collapse: 'Collapse',
      replacePlaceholder: 'Replace with',
      modeLiteral: 'Literal',
      modeRegex: 'Regex',
      modeWildcard: 'Wildcard',
      caseSensitive: 'Case Sensitive',
      reverseSearch: 'Reverse Search',
      prevMatch: 'Previous match',
      previous: 'Previous',
      nextMatch: 'Next match',
      next: 'Next',
      replaceCurrentMatch: 'Replace current match',
      replaceAllMatches: 'Replace all matches',
      replaceAll: 'Replace All',
      shortcutHint: 'F3 Next / Shift+F3 Previous',
      lineColTitle: (line: number, col: number) => `Line ${line}, Col ${col}`,
      resultsSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
        `Search Results · Total ${totalMatchesText} / ${totalLinesText} lines · Loaded ${loaded}`,
      filterResultsSummary: (totalLinesText: string, loaded: number) =>
        `Filter Results · Total ${totalLinesText} lines · Loaded ${loaded}`,
      refreshResults: 'Refresh search results',
      refreshFilterResults: 'Refresh filter results',
      resultFilterPlaceholder: 'Search in all results',
      resultFilterSearch: 'Search',
      resultFilterStop: 'Stop',
      resultFilterNoMatches: 'No results match this filter.',
      clearResultFilter: 'Clear result filter',
      minimizeResults: 'Minimize results',
      closeResults: 'Close results',
      resultsEmptyHint: 'Enter a keyword to list all matches here.',
      noMatchesHint: 'No matches found.',
      filterResultsEmptyHint: 'Add rules and run filter to list matching lines here.',
      noFilterMatchesHint: 'No lines matched current filter rules.',
      loadingMore: 'Loading more results...',
      scrollToLoadMore: 'Scroll to bottom to load more',
      loadedAll: (totalMatchesText: string) => `All results loaded (${totalMatchesText})`,
      filterLoadingMore: 'Loading more filtered lines...',
      filterScrollToLoadMore: 'Scroll to bottom to load more filtered lines',
      filterLoadedAll: (totalLinesText: string) => `All filtered lines loaded (${totalLinesText})`,
      minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
        `Results ${totalMatchesText} / ${totalLinesText} lines · Loaded ${loaded}`,
      filterMinimizedSummary: (totalLinesText: string, loaded: number) =>
        `Filtered ${totalLinesText} lines · Loaded ${loaded}`,
      openResults: 'Open search results',
      openFilterResults: 'Open filter results',
    };
  }

  return {
    counting: '统计中…',
    invalidRegex: '正则表达式无效',
    searchFailed: '搜索失败',
    filterFailed: '过滤失败',
    replaceFailed: '替换失败',
    replaceAllFailed: '全部替换失败',
    noReplaceMatches: '没有可替换的匹配项',
    replacedCurrent: '已替换当前匹配项',
    textUnchanged: '文本未发生变化',
    replacedAll: (count: number) => `已全部替换 ${count} 处`,
    statusEnterToSearch: '输入关键词后按 Enter 开始搜索',
    statusSearching: '正在搜索...',
    statusNoMatches: '未找到匹配项',
    statusTotalPending: (current: number) => `匹配总计 统计中… · 当前 ${current}/?`,
    statusTotalReady: (total: number, current: number) => `匹配总计 ${total} 项 · 当前 ${current}/${Math.max(total, 1)}`,
    statusEnterToFilter: '添加规则后按 Enter 开始过滤',
    statusFiltering: '正在过滤...',
    statusFilterNoMatches: '没有行匹配当前过滤规则',
    statusFilterTotalPending: (current: number) => `匹配行总计统计中… · 当前 ${current}/?`,
    statusFilterTotalReady: (total: number, current: number) => `匹配行总计 ${total} 行 · 当前 ${current}/${Math.max(total, 1)}`,
    find: '查找',
    replace: '替换',
    filter: '过滤',
    switchToReplaceMode: '切换到替换模式',
    switchToFilterMode: '切换到过滤模式',
    noFileOpen: '没有打开的文件',
    close: '关闭',
    findPlaceholder: '查找内容',
    filterAddRule: '新增规则',
    filterRuleKeywordPlaceholder: '过滤关键字',
    filterMatchContains: '存在',
    filterMatchRegex: '正则',
    filterMatchWildcard: '通配符',
    filterApplyLine: '整行',
    filterApplyMatch: '仅匹配项',
    filterStyleBold: '粗体',
    filterStyleItalic: '斜体',
    filterBackground: '底色',
    filterNoBackground: '无底色',
    filterTextColor: '字体色',
    filterMoveUp: '上移',
    filterMoveDown: '下移',
    filterDeleteRule: '删除',
    filterPriority: '优先级',
    filterDragPriorityHint: '拖拽可调整优先级',
    filterRuleEmptyHint: '请至少添加一条非空规则。',
    filterRun: '过滤',
    filterRunHint: '点击“过滤”按钮后开始按规则过滤',
    filterGroupNamePlaceholder: '规则组名称',
    filterSaveGroup: '保存规则组',
    filterLoadGroup: '加载规则组',
    filterDeleteGroup: '删除规则组',
    filterGroupSelectPlaceholder: '选择规则组',
    filterGroupsEmptyHint: '暂无已保存规则组。',
    filterImportGroups: '导入规则组',
    filterExportGroups: '导出规则组',
    filterGroupNameRequired: '请输入规则组名称',
    filterGroupRuleRequired: '请至少添加一条非空规则再保存',
    filterGroupSelectRequired: '请先选择规则组',
    filterGroupsExportEmpty: '暂无可导出的规则组',
    filterGroupSaved: (name: string) => `已保存规则组：${name}`,
    filterGroupLoaded: (name: string) => `已加载规则组：${name}`,
    filterGroupDeleted: (name: string) => `已删除规则组：${name}`,
    filterGroupsImported: (count: number) => `已导入 ${count} 个规则组`,
    filterGroupsExported: (count: number) => `已导出 ${count} 个规则组`,
    filterGroupLoadFailed: '加载规则组失败',
    filterGroupSaveFailed: '保存规则组失败',
    filterGroupImportFailed: '导入规则组失败',
    filterGroupExportFailed: '导出规则组失败',
    collapseResults: '收起结果',
    expandResults: '展开结果',
    results: '结果',
    all: '所有',
    collapse: '收起',
    replacePlaceholder: '替换为',
    modeLiteral: '普通',
    modeRegex: '正则',
    modeWildcard: '通配符',
    caseSensitive: '区分大小写',
    reverseSearch: '反向搜索',
    prevMatch: '上一个匹配',
    previous: '上一个',
    nextMatch: '下一个匹配',
    next: '下一个',
    replaceCurrentMatch: '替换当前匹配项',
    replaceAllMatches: '替换全部匹配项',
    replaceAll: '全部替换',
    shortcutHint: 'F3 下一个 / Shift+F3 上一个',
    lineColTitle: (line: number, col: number) => `行 ${line}，列 ${col}`,
    resultsSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
      `搜索结果 · 总计 ${totalMatchesText} 处 / ${totalLinesText} 行 · 已加载 ${loaded} 处`,
    filterResultsSummary: (totalLinesText: string, loaded: number) =>
      `过滤结果 · 总计 ${totalLinesText} 行 · 已加载 ${loaded} 行`,
    refreshResults: '刷新搜索结果',
    refreshFilterResults: '刷新过滤结果',
    resultFilterPlaceholder: '在全部结果中搜索',
    resultFilterSearch: '搜索',
    resultFilterStop: '停止',
    resultFilterNoMatches: '结果中没有匹配该筛选词的项。',
    clearResultFilter: '清空结果筛选',
    minimizeResults: '最小化结果',
    closeResults: '关闭结果',
    resultsEmptyHint: '输入关键词后会在这里列出全部匹配项。',
    noMatchesHint: '没有找到任何匹配项。',
    filterResultsEmptyHint: '添加规则并开始过滤后，这里会列出匹配行。',
    noFilterMatchesHint: '没有行匹配当前过滤规则。',
    loadingMore: '正在加载更多结果...',
    scrollToLoadMore: '滚动到底部自动加载更多结果',
    loadedAll: (totalMatchesText: string) => `已加载全部搜索结果（共 ${totalMatchesText} 处）`,
    filterLoadingMore: '正在加载更多过滤结果...',
    filterScrollToLoadMore: '滚动到底部自动加载更多过滤结果',
    filterLoadedAll: (totalLinesText: string) => `已加载全部过滤结果（共 ${totalLinesText} 行）`,
    minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
      `结果 总计${totalMatchesText}处 / ${totalLinesText}行 · 已加载${loaded}处`,
    filterMinimizedSummary: (totalLinesText: string, loaded: number) =>
      `过滤结果 ${totalLinesText}行 · 已加载${loaded}行`,
    openResults: '展开搜索结果',
    openFilterResults: '展开过滤结果',
  };
}

function getReservedLayoutHeight(selector: string) {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  if (elements.length === 0) {
    return 0;
  }

  return Array.from(elements).reduce((total, element) => {
    return total + element.getBoundingClientRect().height;
  }, 0);
}

function dispatchEditorForceRefresh(tabId: string, lineCount?: number) {
  window.dispatchEvent(
    new CustomEvent('rutar:force-refresh', {
      detail: { tabId, lineCount },
    })
  );
}

function dispatchNavigateToMatch(tabId: string, match: SearchMatch) {
  const matchLength = Math.max(0, match.endChar - match.startChar);

  window.dispatchEvent(
    new CustomEvent('rutar:navigate-to-line', {
      detail: {
        tabId,
        line: match.line,
        column: match.column,
        length: matchLength,
      },
    })
  );
}

function dispatchNavigateToLine(tabId: string, line: number, column: number, length: number) {
  window.dispatchEvent(
    new CustomEvent('rutar:navigate-to-line', {
      detail: {
        tabId,
        line,
        column,
        length,
      },
    })
  );
}

function createDefaultFilterRule(index: number): FilterRule {
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

function normalizeFilterRuleInputPayload(rule: FilterRuleInputPayload): FilterRuleInputPayload | null {
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

function normalizeFilterRuleGroups(groups: FilterRuleGroupPayload[]): FilterRuleGroupPayload[] {
  return groups
    .map((group) => ({
      name: group.name.trim(),
      rules: (group.rules || []).map(normalizeFilterRuleInputPayload).filter((rule): rule is FilterRuleInputPayload => !!rule),
    }))
    .filter((group) => group.name.length > 0 && group.rules.length > 0);
}

function buildFilterRulesFromPayload(rules: FilterRuleInputPayload[]): FilterRule[] {
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

function reorderFilterRules(rules: FilterRule[], draggingRuleId: string, targetRuleId: string): FilterRule[] {
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

function normalizeFilterRules(rules: FilterRule[]) {
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

function buildFilterRulesPayload(rules: FilterRule[]): FilterRuleInputPayload[] {
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

function escapeRegexLiteral(keyword: string) {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegexSource(keyword: string) {
  let regexSource = '';

  for (const char of keyword) {
    if (char === '*') {
      regexSource += '.*';
      continue;
    }

    if (char === '?') {
      regexSource += '.';
      continue;
    }

    regexSource += escapeRegexLiteral(char);
  }

  return regexSource;
}

function buildSearchRegex(keyword: string, mode: SearchMode, caseSensitive: boolean, useGlobal: boolean): SearchRegexResult {
  if (!keyword) {
    return {
      regex: null,
      errorMessage: null,
    };
  }

  const source = mode === 'regex' ? keyword : mode === 'wildcard' ? wildcardToRegexSource(keyword) : escapeRegexLiteral(keyword);
  const flags = `${caseSensitive ? '' : 'i'}${useGlobal ? 'g' : ''}`;

  try {
    return {
      regex: new RegExp(source, flags),
      errorMessage: null,
    };
  } catch (error) {
    return {
      regex: null,
      errorMessage: error instanceof Error ? error.message : null,
    };
  }
}

function getSearchModeValue(mode: SearchMode) {
  return mode;
}

function getUnicodeScalarLength(value: string) {
  return [...value].length;
}

function renderMatchPreview(match: SearchMatch) {
  const lineText = match.lineText || '';
  const start = Math.max(0, Math.min(lineText.length, match.column - 1));
  const length = Math.max(0, match.endChar - match.startChar);
  const end = Math.min(lineText.length, start + length);

  if (end <= start) {
    return <span>{lineText || ' '}</span>;
  }

  return (
    <>
      {lineText.slice(0, start)}
      <mark className="rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70">
        {lineText.slice(start, end)}
      </mark>
      {lineText.slice(end)}
    </>
  );
}

function renderFilterPreview(match: FilterMatch) {
  const lineText = match.lineText || '';
  const style = match.style;
  const textColor = cssColor(style?.textColor, 'inherit');
  const bgColor = cssColor(style?.backgroundColor, 'transparent');
  const isBold = !!style?.bold;
  const isItalic = !!style?.italic;

  if (!style || style.applyTo === 'line') {
    return (
      <span
        style={{
          color: textColor,
          backgroundColor: bgColor,
          fontWeight: isBold ? 700 : 400,
          fontStyle: isItalic ? 'italic' : 'normal',
        }}
      >
        {lineText || ' '}
      </span>
    );
  }

  const ranges = (match.ranges || [])
    .map((range) => ({
      start: Math.max(0, Math.min(lineText.length, range.startChar)),
      end: Math.max(0, Math.min(lineText.length, range.endChar)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);

  if (ranges.length === 0) {
    return <span>{lineText || ' '}</span>;
  }

  const mergedRanges: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (!previous || range.start > previous.end) {
      mergedRanges.push(range);
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  mergedRanges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(<span key={`plain-${index}-${cursor}`}>{lineText.slice(cursor, range.start)}</span>);
    }

    nodes.push(
      <span
        key={`hl-${index}-${range.start}`}
        style={{
          color: textColor,
          backgroundColor: bgColor,
          fontWeight: isBold ? 700 : 400,
          fontStyle: isItalic ? 'italic' : 'normal',
        }}
      >
        {lineText.slice(range.start, range.end)}
      </span>
    );

    cursor = range.end;
  });

  if (cursor < lineText.length) {
    nodes.push(<span key={`tail-${cursor}`}>{lineText.slice(cursor)}</span>);
  }

  return <>{nodes}</>;
}

function matchModeLabel(mode: FilterRuleMatchMode, messages: ReturnType<typeof getSearchMessages>) {
  if (mode === 'contains') {
    return messages.filterMatchContains;
  }

  if (mode === 'regex') {
    return messages.filterMatchRegex;
  }

  return messages.filterMatchWildcard;
}

export function SearchReplacePanel() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const updateTab = useStore((state) => state.updateTab);
  const language = useStore((state) => state.settings.language);
  const fontFamily = useStore((state) => state.settings.fontFamily);
  const fontSize = useStore((state) => state.settings.fontSize);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const messages = useMemo(
    () => getSearchMessages(language === 'en-US' ? 'en-US' : 'zh-CN'),
    [language]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('find');
  const [keyword, setKeyword] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [reverseSearch, setReverseSearch] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([createDefaultFilterRule(0)]);
  const [filterRuleGroups, setFilterRuleGroups] = useState<FilterRuleGroupPayload[]>([]);
  const [selectedFilterGroupName, setSelectedFilterGroupName] = useState('');
  const [filterGroupNameInput, setFilterGroupNameInput] = useState('');
  const [filterRuleDragState, setFilterRuleDragState] = useState<FilterRuleDragState | null>(null);
  const [filterMatches, setFilterMatches] = useState<FilterMatch[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null);
  const [totalMatchedLineCount, setTotalMatchedLineCount] = useState<number | null>(null);
  const [totalFilterMatchedLineCount, setTotalFilterMatchedLineCount] = useState<number | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [currentFilterMatchIndex, setCurrentFilterMatchIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [resultPanelState, setResultPanelState] = useState<SearchResultPanelState>('closed');
  const [isSearching, setIsSearching] = useState(false);
  const [resultFilterKeyword, setResultFilterKeyword] = useState('');
  const [appliedResultFilterKeyword, setAppliedResultFilterKeyword] = useState('');
  const [isResultFilterSearching, setIsResultFilterSearching] = useState(false);
  const [searchSidebarTopOffset, setSearchSidebarTopOffset] = useState('0px');
  const [searchSidebarBottomOffset, setSearchSidebarBottomOffset] = useState('0px');

  const isReplaceMode = panelMode === 'replace';
  const isFilterMode = panelMode === 'filter';
  const effectiveFilterRules = useMemo(() => normalizeFilterRules(filterRules), [filterRules]);
  const filterRulesPayload = useMemo(() => buildFilterRulesPayload(filterRules), [filterRules]);
  const normalizedFilterRuleGroups = useMemo(
    () => normalizeFilterRuleGroups(filterRuleGroups),
    [filterRuleGroups]
  );
  const resultListTextStyle = useMemo(
    () => ({ fontFamily, fontSize: `${Math.max(10, fontSize || 14)}px` }),
    [fontFamily, fontSize]
  );
  const filterRulesKey = useMemo(() => JSON.stringify(filterRulesPayload), [filterRulesPayload]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const runVersionRef = useRef(0);
  const countRunVersionRef = useRef(0);
  const filterRunVersionRef = useRef(0);
  const filterCountRunVersionRef = useRef(0);
  const currentMatchIndexRef = useRef(0);
  const currentFilterMatchIndexRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const loadMoreDebounceRef = useRef<number | null>(null);
  const chunkCursorRef = useRef<number | null>(null);
  const filterLineCursorRef = useRef<number | null>(null);
  const stopResultFilterSearchRef = useRef(false);
  const searchParamsRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    resultFilterKeyword: string;
    documentVersion: number;
  } | null>(null);
  const filterParamsRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
  } | null>(null);
  const cachedSearchRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    resultFilterKeyword: string;
    documentVersion: number;
    matches: SearchMatch[];
    nextOffset: number | null;
  } | null>(null);
  const cachedFilterRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
    matches: FilterMatch[];
    nextLine: number | null;
  } | null>(null);
  const countCacheRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    resultFilterKeyword: string;
    documentVersion: number;
    totalMatches: number;
    matchedLines: number;
  } | null>(null);

  const requestStopResultFilterSearch = useCallback(() => {
    stopResultFilterSearchRef.current = true;
    runVersionRef.current += 1;
    filterRunVersionRef.current += 1;
    countRunVersionRef.current += 1;
    filterCountRunVersionRef.current += 1;
  }, []);
  const filterCountCacheRef = useRef<{
    tabId: string;
    rulesKey: string;
    resultFilterKeyword: string;
    documentVersion: number;
    matchedLines: number;
  } | null>(null);
  const tabSearchPanelStateRef = useRef<Record<string, TabSearchPanelSnapshot>>({});
  const previousActiveTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex]);

  useEffect(() => {
    currentFilterMatchIndexRef.current = currentFilterMatchIndex;
  }, [currentFilterMatchIndex]);

  const resetSearchState = useCallback((clearTotals = true) => {
    setMatches([]);
    setCurrentMatchIndex(0);
    cachedSearchRef.current = null;
    chunkCursorRef.current = null;
    searchParamsRef.current = null;
    countCacheRef.current = null;

    if (clearTotals) {
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
    }
  }, []);

  const resetFilterState = useCallback((clearTotals = true) => {
    setFilterMatches([]);
    setCurrentFilterMatchIndex(0);
    cachedFilterRef.current = null;
    filterLineCursorRef.current = null;
    filterParamsRef.current = null;
    filterCountCacheRef.current = null;

    if (clearTotals) {
      setTotalFilterMatchedLineCount(null);
    }
  }, []);

  const normalizedResultFilterKeyword = appliedResultFilterKeyword.trim().toLowerCase();
  const isResultFilterActive = normalizedResultFilterKeyword.length > 0;

  const backendResultFilterKeyword = useMemo(() => {
    if (!isResultFilterActive) {
      return '';
    }

    return caseSensitive ? appliedResultFilterKeyword.trim() : normalizedResultFilterKeyword;
  }, [appliedResultFilterKeyword, caseSensitive, isResultFilterActive, normalizedResultFilterKeyword]);

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

  const executeCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTab || !keyword || isFilterMode) {
      setTotalMatchCount(keyword ? 0 : null);
      setTotalMatchedLineCount(keyword ? 0 : null);
      return;
    }

    if (!forceRefresh) {
      const cached = countCacheRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.keyword === keyword &&
        cached.searchMode === searchMode &&
        cached.caseSensitive === caseSensitive &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setTotalMatchCount(cached.totalMatches);
            setTotalMatchedLineCount(cached.matchedLines);
            return;
          }
        } catch (error) {
          console.warn('Failed to read document version for count:', error);
        }
      }
    }

    const runId = countRunVersionRef.current + 1;
    countRunVersionRef.current = runId;

    try {
      const result = await invoke<SearchCountBackendResult>('search_count_in_document', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
      });

      if (countRunVersionRef.current !== runId) {
        return;
      }

      setTotalMatchCount(result.totalMatches ?? 0);
      setTotalMatchedLineCount(result.matchedLines ?? 0);

      countCacheRef.current = {
        tabId: activeTab.id,
        keyword,
        searchMode,
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion: result.documentVersion ?? 0,
        totalMatches: result.totalMatches ?? 0,
        matchedLines: result.matchedLines ?? 0,
      };
    } catch (error) {
      if (countRunVersionRef.current !== runId) {
        return;
      }

      console.warn('Count search failed:', error);
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
    }
  }, [activeTab, backendResultFilterKeyword, caseSensitive, isFilterMode, keyword, searchMode]);

  const executeFilterCountSearch = useCallback(async (forceRefresh = false, resultFilterKeywordOverride?: string) => {
    const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTab) {
      setTotalFilterMatchedLineCount(null);
      return;
    }

    if (filterRulesPayload.length === 0) {
      setTotalFilterMatchedLineCount(0);
      return;
    }

    if (!forceRefresh) {
      const cached = filterCountCacheRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.rulesKey === filterRulesKey &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setTotalFilterMatchedLineCount(cached.matchedLines);
            return;
          }
        } catch (error) {
          console.warn('Failed to read document version for filter count:', error);
        }
      }
    }

    const runId = filterCountRunVersionRef.current + 1;
    filterCountRunVersionRef.current = runId;

    try {
      const result = await invoke<FilterCountBackendResult>('filter_count_in_document', {
        id: activeTab.id,
        rules: filterRulesPayload,
        resultFilterKeyword: effectiveResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
      });

      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      setTotalFilterMatchedLineCount(result.matchedLines ?? 0);
      filterCountCacheRef.current = {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion: result.documentVersion ?? 0,
        matchedLines: result.matchedLines ?? 0,
      };
    } catch (error) {
      if (filterCountRunVersionRef.current !== runId) {
        return;
      }

      console.warn('Filter count failed:', error);
      setTotalFilterMatchedLineCount(null);
    }
  }, [activeTab, backendResultFilterKeyword, caseSensitive, filterRulesKey, filterRulesPayload]);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const executeSearch = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<SearchRunResult | null> => {
      const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

    if (!activeTab || isFilterMode) {
      return null;
    }

    if (!keyword) {
      setErrorMessage(null);
      resetSearchState();
      setIsSearching(false);
      return {
        matches: [],
        documentVersion: 0,
        errorMessage: null,
        nextOffset: null,
      };
    }

    void executeCountSearch(forceRefresh, effectiveResultFilterKeyword);

    if (!forceRefresh) {
      const cached = cachedSearchRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.keyword === keyword &&
        cached.searchMode === searchMode &&
        cached.caseSensitive === caseSensitive &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setErrorMessage(null);
            startTransition(() => {
              setMatches(cached.matches);
              setCurrentMatchIndex((previousIndex) => {
                if (cached.matches.length === 0) {
                  return 0;
                }

                return Math.min(previousIndex, cached.matches.length - 1);
              });
            });

            chunkCursorRef.current = cached.nextOffset;
            searchParamsRef.current = {
              tabId: activeTab.id,
              keyword,
              searchMode,
              caseSensitive,
              resultFilterKeyword: effectiveResultFilterKeyword,
              documentVersion: cached.documentVersion,
            };

            return {
              matches: cached.matches,
              documentVersion: cached.documentVersion,
              errorMessage: null,
              nextOffset: cached.nextOffset,
            };
          }
        } catch (error) {
          console.warn('Failed to read document version:', error);
        }
      }
    }

    const runVersion = runVersionRef.current + 1;
    runVersionRef.current = runVersion;
    if (!silent) {
      setIsSearching(true);
    }

    try {
      const backendResult = await invoke<SearchChunkBackendResult>('search_in_document_chunk', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
        startOffset: 0,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const nextMatches = backendResult.matches || [];
      const documentVersion = backendResult.documentVersion ?? 0;
      const nextOffset = backendResult.nextOffset ?? null;

      setErrorMessage(null);
      startTransition(() => {
        setMatches(nextMatches);
        setCurrentMatchIndex((previousIndex) => {
          if (nextMatches.length === 0) {
            return 0;
          }

          return Math.min(previousIndex, nextMatches.length - 1);
        });
      });

      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword,
        searchMode,
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextOffset,
      };

      chunkCursorRef.current = nextOffset;
      searchParamsRef.current = {
        tabId: activeTab.id,
        keyword,
        searchMode,
        caseSensitive,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
      };

      return {
        matches: nextMatches,
        documentVersion,
        errorMessage: null,
        nextOffset,
      };
    } catch (error) {
      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      resetSearchState();

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextOffset: null,
      };
    } finally {
      if (runVersionRef.current === runVersion && !silent) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    executeCountSearch,
    isFilterMode,
    keyword,
    messages.searchFailed,
    resetSearchState,
    searchMode,
  ]);

  const executeFilter = useCallback(
    async (forceRefresh = false, silent = false, resultFilterKeywordOverride?: string): Promise<FilterRunResult | null> => {
  const effectiveResultFilterKeyword = resultFilterKeywordOverride ?? backendResultFilterKeyword;

  if (!activeTab) {
    return null;
  }

    if (filterRulesPayload.length === 0) {
      setErrorMessage(null);
      resetFilterState(false);
      setTotalFilterMatchedLineCount(0);
      setIsSearching(false);
      return {
        matches: [],
        documentVersion: 0,
        errorMessage: null,
        nextLine: null,
      };
    }

    void executeFilterCountSearch(forceRefresh, effectiveResultFilterKeyword);

    if (!forceRefresh) {
      const cached = cachedFilterRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.rulesKey === filterRulesKey &&
        cached.resultFilterKeyword === effectiveResultFilterKeyword
      ) {
        try {
          const currentDocumentVersion = await invoke<number>('get_document_version', {
            id: activeTab.id,
          });

          if (currentDocumentVersion === cached.documentVersion) {
            setErrorMessage(null);
            startTransition(() => {
              setFilterMatches(cached.matches);
              setCurrentFilterMatchIndex((previousIndex) => {
                if (cached.matches.length === 0) {
                  return 0;
                }

                return Math.min(previousIndex, cached.matches.length - 1);
              });
            });

            filterLineCursorRef.current = cached.nextLine;
            filterParamsRef.current = {
              tabId: activeTab.id,
              rulesKey: filterRulesKey,
              resultFilterKeyword: effectiveResultFilterKeyword,
              documentVersion: cached.documentVersion,
            };

            return {
              matches: cached.matches,
              documentVersion: cached.documentVersion,
              errorMessage: null,
              nextLine: cached.nextLine,
            };
          }
        } catch (error) {
          console.warn('Failed to read document version for filter:', error);
        }
      }
    }

    const runVersion = filterRunVersionRef.current + 1;
    filterRunVersionRef.current = runVersion;
    if (!silent) {
      setIsSearching(true);
    }

    try {
      const backendResult = await invoke<FilterChunkBackendResult>('filter_in_document_chunk', {
        id: activeTab.id,
        rules: filterRulesPayload,
        resultFilterKeyword: effectiveResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
        startLine: 0,
        maxResults: FILTER_CHUNK_SIZE,
      });

      if (filterRunVersionRef.current !== runVersion) {
        return null;
      }

      const nextMatches = backendResult.matches || [];
      const documentVersion = backendResult.documentVersion ?? 0;
      const nextLine = backendResult.nextLine ?? null;

      setErrorMessage(null);
      startTransition(() => {
        setFilterMatches(nextMatches);
        setCurrentFilterMatchIndex((previousIndex) => {
          if (nextMatches.length === 0) {
            return 0;
          }

          return Math.min(previousIndex, nextMatches.length - 1);
        });
      });

      cachedFilterRef.current = {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
        matches: nextMatches,
        nextLine,
      };

      filterLineCursorRef.current = nextLine;
      filterParamsRef.current = {
        tabId: activeTab.id,
        rulesKey: filterRulesKey,
        resultFilterKeyword: effectiveResultFilterKeyword,
        documentVersion,
      };

      return {
        matches: nextMatches,
        documentVersion,
        errorMessage: null,
        nextLine,
      };
    } catch (error) {
      if (filterRunVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterFailed}: ${readableError}`);
      resetFilterState();

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextLine: null,
      };
    } finally {
      if (filterRunVersionRef.current === runVersion && !silent) {
        setIsSearching(false);
      }
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    executeFilterCountSearch,
    filterRulesKey,
    filterRulesPayload,
    isFilterMode,
    messages.filterFailed,
    resetFilterState,
  ]);

  const loadMoreMatches = useCallback(async (): Promise<SearchMatch[] | null> => {
    if (loadMoreLockRef.current) {
      return null;
    }

    if (!activeTab || isFilterMode) {
      return null;
    }

    const params = searchParamsRef.current;
    const startOffset = chunkCursorRef.current;
    if (!params || startOffset === null) {
      return null;
    }

    if (
      params.tabId !== activeTab.id ||
      params.keyword !== keyword ||
      params.searchMode !== searchMode ||
      params.caseSensitive !== caseSensitive ||
      params.resultFilterKeyword !== backendResultFilterKeyword
    ) {
      return null;
    }

    loadMoreLockRef.current = true;
    setIsSearching(true);
    try {
      const backendResult = await invoke<SearchChunkBackendResult>('search_in_document_chunk', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        resultFilterKeyword: backendResultFilterKeyword,
        startOffset,
        maxResults: SEARCH_CHUNK_SIZE,
      });

      if (backendResult.documentVersion !== params.documentVersion) {
        cachedSearchRef.current = null;
        chunkCursorRef.current = null;
        searchParamsRef.current = null;
        return null;
      }

      const appendedMatches = backendResult.matches || [];
      const nextOffset = backendResult.nextOffset ?? null;
      chunkCursorRef.current = nextOffset;

      if (appendedMatches.length === 0) {
        if (cachedSearchRef.current) {
          cachedSearchRef.current.nextOffset = nextOffset;
        }
        return [];
      }

      startTransition(() => {
        setMatches((previousMatches) => {
          const mergedMatches = [...previousMatches, ...appendedMatches];

          cachedSearchRef.current = {
            tabId: activeTab.id,
            keyword,
            searchMode,
            caseSensitive,
            resultFilterKeyword: backendResultFilterKeyword,
            documentVersion: params.documentVersion,
            matches: mergedMatches,
            nextOffset,
          };

          return mergedMatches;
        });
      });

      return appendedMatches;
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      setIsSearching(false);
    }
  }, [activeTab, backendResultFilterKeyword, caseSensitive, isFilterMode, keyword, messages.searchFailed, searchMode]);

  const loadMoreFilterMatches = useCallback(async (): Promise<FilterMatch[] | null> => {
    if (loadMoreLockRef.current) {
      return null;
    }

  if (!activeTab) {
    return null;
  }

    const params = filterParamsRef.current;
    const startLine = filterLineCursorRef.current;
    if (!params || startLine === null) {
      return null;
    }

    if (
      params.tabId !== activeTab.id ||
      params.rulesKey !== filterRulesKey ||
      params.resultFilterKeyword !== backendResultFilterKeyword
    ) {
      return null;
    }

    loadMoreLockRef.current = true;
    setIsSearching(true);
    try {
      const backendResult = await invoke<FilterChunkBackendResult>('filter_in_document_chunk', {
        id: activeTab.id,
        rules: filterRulesPayload,
        resultFilterKeyword: backendResultFilterKeyword,
        startLine,
        maxResults: FILTER_CHUNK_SIZE,
      });

      if (backendResult.documentVersion !== params.documentVersion) {
        cachedFilterRef.current = null;
        filterLineCursorRef.current = null;
        filterParamsRef.current = null;
        return null;
      }

      const appendedMatches = backendResult.matches || [];
      const nextLine = backendResult.nextLine ?? null;
      filterLineCursorRef.current = nextLine;

      if (appendedMatches.length === 0) {
        if (cachedFilterRef.current) {
          cachedFilterRef.current.nextLine = nextLine;
        }
        return [];
      }

      startTransition(() => {
        setFilterMatches((previousMatches) => {
          const mergedMatches = [...previousMatches, ...appendedMatches];

          cachedFilterRef.current = {
            tabId: activeTab.id,
            rulesKey: filterRulesKey,
            resultFilterKeyword: backendResultFilterKeyword,
            documentVersion: params.documentVersion,
            matches: mergedMatches,
            nextLine,
          };

          return mergedMatches;
        });
      });

      return appendedMatches;
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      setIsSearching(false);
    }
  }, [activeTab, backendResultFilterKeyword, filterRulesKey, filterRulesPayload, isFilterMode, messages.filterFailed]);

  const executeFirstMatchSearch = useCallback(async (reverse: boolean): Promise<SearchRunResult | null> => {
    if (!activeTab || !keyword || isFilterMode) {
      return null;
    }

    const runVersion = runVersionRef.current + 1;
    runVersionRef.current = runVersion;
    setIsSearching(true);

    try {
      const firstResult = await invoke<SearchFirstBackendResult>('search_first_in_document', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        reverse,
      });

      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const documentVersion = firstResult.documentVersion ?? 0;
      const firstMatch = firstResult.firstMatch;

      if (!firstMatch) {
        setErrorMessage(null);
        resetSearchState(false);

        cachedSearchRef.current = {
          tabId: activeTab.id,
          keyword,
          searchMode,
          caseSensitive,
          resultFilterKeyword: backendResultFilterKeyword,
          documentVersion,
          matches: [],
          nextOffset: null,
        };
        chunkCursorRef.current = null;
        searchParamsRef.current = {
          tabId: activeTab.id,
          keyword,
          searchMode,
          caseSensitive,
          resultFilterKeyword: backendResultFilterKeyword,
          documentVersion,
        };
        setIsSearching(false);

        return {
          matches: [],
          documentVersion,
          errorMessage: null,
          nextOffset: null,
        };
      }

      const immediateMatches = [firstMatch];
      setErrorMessage(null);
      startTransition(() => {
        setMatches(immediateMatches);
        setCurrentMatchIndex(0);
      });

      cachedSearchRef.current = {
        tabId: activeTab.id,
        keyword,
        searchMode,
        caseSensitive,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
        matches: immediateMatches,
        nextOffset: 0,
      };
      chunkCursorRef.current = 0;
      searchParamsRef.current = {
        tabId: activeTab.id,
        keyword,
        searchMode,
        caseSensitive,
        resultFilterKeyword: backendResultFilterKeyword,
        documentVersion,
      };

      void (async () => {
        const chunkResult = await executeSearch(true, false);
        if (!chunkResult) {
          return;
        }
      })();

      return {
        matches: immediateMatches,
        documentVersion,
        errorMessage: null,
        nextOffset: 0,
      };
    } catch (error) {
      if (runVersionRef.current !== runVersion) {
        return null;
      }

      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      resetSearchState();
      setIsSearching(false);

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextOffset: null,
      };
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    executeSearch,
    isFilterMode,
    keyword,
    messages.searchFailed,
    resetSearchState,
    searchMode,
  ]);

  const navigateToMatch = useCallback(
    (targetMatch: SearchMatch) => {
      if (!activeTab) {
        return;
      }

      dispatchNavigateToMatch(activeTab.id, targetMatch);
    },
    [activeTab]
  );

  const navigateToFilterMatch = useCallback(
    (targetMatch: FilterMatch) => {
      if (!activeTab) {
        return;
      }

      dispatchNavigateToLine(
        activeTab.id,
        targetMatch.line,
        Math.max(1, targetMatch.column || 1),
        Math.max(0, targetMatch.length || 0)
      );
    },
    [activeTab]
  );

  const hasMoreMatches = chunkCursorRef.current !== null;
  const hasMoreFilterMatches = filterLineCursorRef.current !== null;

  const handleResultListScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!isOpen || resultPanelState !== 'open') {
        return;
      }

      if (isFilterMode) {
        if (filterRulesPayload.length === 0 || !hasMoreFilterMatches || isSearching || loadMoreLockRef.current) {
          return;
        }
      } else if (!keyword || !hasMoreMatches || isSearching || loadMoreLockRef.current) {
        return;
      }

      const target = event.currentTarget;
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining > 32) {
        return;
      }

      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }

      loadMoreDebounceRef.current = window.setTimeout(() => {
        loadMoreDebounceRef.current = null;
        if (isFilterMode) {
          void loadMoreFilterMatches();
          return;
        }

        void loadMoreMatches();
      }, 40);
    },
    [
      filterRulesPayload.length,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isOpen,
      isSearching,
      keyword,
      loadMoreFilterMatches,
      loadMoreMatches,
      resultPanelState,
    ]
  );

  const navigateByStep = useCallback(
    async (step: number) => {
      if (isFilterMode) {
        if (filterMatches.length > 0 && !isSearching) {
          const boundedCurrentIndex = Math.min(currentFilterMatchIndexRef.current, filterMatches.length - 1);
          const candidateIndex = boundedCurrentIndex + step;

          if (candidateIndex < 0) {
            const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
            setCurrentFilterMatchIndex(nextIndex);
            setFeedbackMessage(null);
            navigateToFilterMatch(filterMatches[nextIndex]);
            return;
          }

          if (candidateIndex >= filterMatches.length) {
            const appended = await loadMoreFilterMatches();
            if (appended && appended.length > 0) {
              const expandedMatches = [...filterMatches, ...appended];
              const nextIndex = candidateIndex;
              setCurrentFilterMatchIndex(nextIndex);
              setFeedbackMessage(null);
              navigateToFilterMatch(expandedMatches[nextIndex]);
              return;
            }
          }

          const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
          setCurrentFilterMatchIndex(nextIndex);
          setFeedbackMessage(null);
          navigateToFilterMatch(filterMatches[nextIndex]);
          return;
        }

        const filterResult = await executeFilter();
        if (!filterResult || filterResult.matches.length === 0) {
          return;
        }

        const boundedCurrentIndex = Math.min(currentFilterMatchIndexRef.current, filterResult.matches.length - 1);
        const nextIndex = (boundedCurrentIndex + step + filterResult.matches.length) % filterResult.matches.length;

        setCurrentFilterMatchIndex(nextIndex);
        setFeedbackMessage(null);
        navigateToFilterMatch(filterResult.matches[nextIndex]);

        return;
      }

      if (keyword && matches.length > 0 && !isSearching) {
        const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, matches.length - 1);
        const candidateIndex = boundedCurrentIndex + step;

        if (candidateIndex < 0) {
          const nextIndex = (candidateIndex + matches.length) % matches.length;
          setCurrentMatchIndex(nextIndex);
          setFeedbackMessage(null);
          navigateToMatch(matches[nextIndex]);
          return;
        }

        if (candidateIndex >= matches.length) {
          const appended = await loadMoreMatches();
          if (appended && appended.length > 0) {
            const expandedMatches = [...matches, ...appended];
            const nextIndex = candidateIndex;
            setCurrentMatchIndex(nextIndex);
            setFeedbackMessage(null);
            navigateToMatch(expandedMatches[nextIndex]);
            return;
          }
        }

        const nextIndex = (candidateIndex + matches.length) % matches.length;

        setCurrentMatchIndex(nextIndex);
        setFeedbackMessage(null);
        navigateToMatch(matches[nextIndex]);
        return;
      }

      const shouldReverse = step < 0;
      const searchResult = await executeFirstMatchSearch(shouldReverse);
      if (!searchResult || searchResult.matches.length === 0) {
        return;
      }

      const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, searchResult.matches.length - 1);
      const nextIndex =
        (boundedCurrentIndex + step + searchResult.matches.length) %
        searchResult.matches.length;

      setCurrentMatchIndex(nextIndex);
      setFeedbackMessage(null);
      navigateToMatch(searchResult.matches[nextIndex]);

    },
    [
      executeFilter,
      executeFirstMatchSearch,
      filterMatches,
      isFilterMode,
      isSearching,
      keyword,
      loadMoreFilterMatches,
      loadMoreMatches,
      matches,
      navigateToFilterMatch,
      navigateToMatch,
    ]
  );

  const handleReplaceCurrent = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    const searchResult = await executeSearch();
    if (!searchResult || searchResult.matches.length === 0) {
      setFeedbackMessage(messages.noReplaceMatches);
      return;
    }

    const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, searchResult.matches.length - 1);
    const targetMatch = searchResult.matches[boundedCurrentIndex];
    let replacementText = replaceValue;

    if (searchMode === 'regex') {
      const regexResult = buildSearchRegex(keyword, searchMode, caseSensitive, false);
      if (!regexResult.regex) {
        setErrorMessage(regexResult.errorMessage || messages.invalidRegex);
        return;
      }

      replacementText = targetMatch.text.replace(regexResult.regex, replaceValue);
    }

    try {
      const newLineCount = await invoke<number>('edit_text', {
        id: activeTab.id,
        startChar: targetMatch.startChar,
        endChar: targetMatch.endChar,
        newText: replacementText,
      });

      const safeLineCount = Math.max(1, newLineCount);
      updateTab(activeTab.id, { lineCount: safeLineCount, isDirty: true });
      dispatchEditorForceRefresh(activeTab.id, safeLineCount);
      setFeedbackMessage(messages.replacedCurrent);

      const nextResult = await executeSearch(true);
      if (nextResult && nextResult.matches.length > 0) {
        const nextIndex = Math.min(boundedCurrentIndex, nextResult.matches.length - 1);
        setCurrentMatchIndex(nextIndex);
        navigateToMatch(nextResult.matches[nextIndex]);
      }
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.replaceFailed}: ${readableError}`);
    }
  }, [
    activeTab,
    caseSensitive,
    executeSearch,
    keyword,
    messages.invalidRegex,
    messages.noReplaceMatches,
    messages.replaceFailed,
    messages.replacedCurrent,
    navigateToMatch,
    replaceValue,
    searchMode,
    updateTab,
  ]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    const searchResult = await executeSearch();
    if (!searchResult || searchResult.matches.length === 0) {
      setFeedbackMessage(messages.noReplaceMatches);
      return;
    }

    try {
      let replacementCount = 0;

      if (searchMode === 'regex') {
        const regexResult = buildSearchRegex(keyword, searchMode, caseSensitive, true);
        if (!regexResult.regex) {
          setErrorMessage(regexResult.errorMessage || messages.invalidRegex);
          return;
        }

        const rawText = await invoke<string>('get_visible_lines', {
          id: activeTab.id,
          startLine: 0,
          endLine: MAX_LINE_RANGE,
        });

        const sourceText = rawText || '';
        const replacementText = sourceText.replace(regexResult.regex, () => {
          replacementCount += 1;
          return replaceValue;
        });

        if (replacementCount === 0) {
          setFeedbackMessage(messages.textUnchanged);
          return;
        }

        const newLineCount = await invoke<number>('replace_line_range', {
          id: activeTab.id,
          startLine: 0,
          endLine: MAX_LINE_RANGE,
          newText: replacementText,
        });

        const safeLineCount = Math.max(1, newLineCount);
        updateTab(activeTab.id, { lineCount: safeLineCount, isDirty: true });
        dispatchEditorForceRefresh(activeTab.id, safeLineCount);
      } else {
        let charDelta = 0;
        const replacementCharCount = getUnicodeScalarLength(replaceValue);
        let finalLineCount = activeTab.lineCount;

        for (const match of searchResult.matches) {
          const adjustedStart = match.startChar + charDelta;
          const adjustedEnd = match.endChar + charDelta;

          const newLineCount = await invoke<number>('edit_text', {
            id: activeTab.id,
            startChar: adjustedStart,
            endChar: adjustedEnd,
            newText: replaceValue,
          });

          finalLineCount = Math.max(1, newLineCount);
          charDelta += replacementCharCount - (match.endChar - match.startChar);
          replacementCount += 1;
        }

        if (replacementCount > 0) {
          updateTab(activeTab.id, { lineCount: finalLineCount, isDirty: true });
          dispatchEditorForceRefresh(activeTab.id, finalLineCount);
        }
      }

      setFeedbackMessage(messages.replacedAll(searchResult.matches.length));
      setCurrentMatchIndex(0);
      await executeSearch(true);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.replaceAllFailed}: ${readableError}`);
    }
  }, [
    activeTab,
    caseSensitive,
    executeSearch,
    keyword,
    messages.invalidRegex,
    messages.noReplaceMatches,
    messages.replaceAllFailed,
    messages.replacedAll,
    messages.textUnchanged,
    replaceValue,
    searchMode,
    updateTab,
  ]);

  const handleKeywordKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isFilterMode) {
          if (!isSearching) {
            void executeFilter(true);
          }
          return;
        }

        const primaryStep = reverseSearch ? -1 : 1;
        const step = event.shiftKey ? -primaryStep : primaryStep;
        void navigateByStep(step);
      }
    },
    [executeFilter, isFilterMode, isSearching, navigateByStep, reverseSearch]
  );

  const handleSelectMatch = useCallback(
    (targetIndex: number) => {
      if (isFilterMode) {
        if (targetIndex < 0 || targetIndex >= filterMatches.length) {
          return;
        }

        setCurrentFilterMatchIndex(targetIndex);
        setFeedbackMessage(null);
        navigateToFilterMatch(filterMatches[targetIndex]);
        return;
      }

      if (targetIndex < 0 || targetIndex >= matches.length) {
        return;
      }

      setCurrentMatchIndex(targetIndex);
      setFeedbackMessage(null);
      navigateToMatch(matches[targetIndex]);
    },
    [filterMatches, isFilterMode, matches, navigateToFilterMatch, navigateToMatch]
  );

  const updateFilterRule = useCallback((id: string, updater: (rule: FilterRule) => FilterRule) => {
    setFilterRules((previousRules) =>
      previousRules.map((rule) => {
        if (rule.id !== id) {
          return rule;
        }

        return updater(rule);
      })
    );
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const addFilterRule = useCallback(() => {
    setFilterRules((previousRules) => [...previousRules, createDefaultFilterRule(previousRules.length)]);
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, []);

  const removeFilterRule = useCallback((id: string) => {
    setFilterRules((previousRules) => {
      const nextRules = previousRules.filter((rule) => rule.id !== id);
      if (nextRules.length > 0) {
        return nextRules;
      }

      return [createDefaultFilterRule(0)];
    });
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

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
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [resetFilterState]);

  const onFilterRuleDragStart = useCallback((event: ReactDragEvent<HTMLElement>, ruleId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ruleId);
    setFilterRuleDragState({
      draggingRuleId: ruleId,
      overRuleId: null,
    });
    setFeedbackMessage(null);
    setErrorMessage(null);
  }, []);

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

      const reordered = reorderFilterRules(previousRules, sourceRuleId, targetRuleId);
      return reordered;
    });

    setFilterRuleDragState(null);
    setFeedbackMessage(null);
    setErrorMessage(null);
    resetFilterState();
  }, [filterRuleDragState?.draggingRuleId, resetFilterState]);

  const onFilterRuleDragEnd = useCallback(() => {
    setFilterRuleDragState(null);
  }, []);

  const persistFilterRuleGroups = useCallback(
    async (groups: FilterRuleGroupPayload[]) => {
      const normalized = normalizeFilterRuleGroups(groups);
      await invoke('save_filter_rule_groups_config', {
        groups: normalized,
      });
      setFilterRuleGroups(normalized);
      return normalized;
    },
    []
  );

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
  ]);

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
  }, [messages, normalizedFilterRuleGroups, resetFilterState, selectedFilterGroupName]);

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
  }, [messages, normalizedFilterRuleGroups, persistFilterRuleGroups]);

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
  }, [messages, normalizedFilterRuleGroups]);

  useEffect(() => {
    const handleSearchOpen = (event: Event) => {
      if (!activeTab) {
        return;
      }

      const customEvent = event as CustomEvent<SearchOpenEventDetail>;
      const openMode = customEvent.detail?.mode;
      const nextMode: PanelMode = openMode === 'replace' ? 'replace' : openMode === 'filter' ? 'filter' : 'find';

      setIsOpen(true);
      setPanelMode(nextMode);
      setResultPanelState('closed');
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      setErrorMessage(null);
      setFeedbackMessage(null);
      focusSearchInput();
    };

    window.addEventListener('rutar:search-open', handleSearchOpen as EventListener);
    return () => {
      window.removeEventListener('rutar:search-open', handleSearchOpen as EventListener);
    };
  }, [activeTab, focusSearchInput]);

  useEffect(() => {
    if (!activeTab) {
      setIsOpen(false);
      setPanelMode('find');
      setResultPanelState('closed');
      setKeyword('');
      setReplaceValue('');
      setSearchMode('literal');
      setCaseSensitive(false);
      setReverseSearch(false);
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      resetSearchState();
      resetFilterState();
      setErrorMessage(null);
      setFeedbackMessage(null);
      previousActiveTabIdRef.current = null;
      return;
    }

    const nextSnapshot = tabSearchPanelStateRef.current[activeTab.id];
    if (nextSnapshot) {
      setIsOpen(nextSnapshot.isOpen);
      setPanelMode(nextSnapshot.panelMode);
      setResultPanelState(nextSnapshot.resultPanelState);
      setKeyword(nextSnapshot.keyword);
      setReplaceValue(nextSnapshot.replaceValue);
      setSearchMode(nextSnapshot.searchMode);
      setCaseSensitive(nextSnapshot.caseSensitive);
      setReverseSearch(nextSnapshot.reverseSearch);
      setResultFilterKeyword(nextSnapshot.resultFilterKeyword);
      setAppliedResultFilterKeyword(nextSnapshot.appliedResultFilterKeyword);
    } else {
      setIsOpen(false);
      setPanelMode('find');
      setResultPanelState('closed');
      setKeyword('');
      setReplaceValue('');
      setSearchMode('literal');
      setCaseSensitive(false);
      setReverseSearch(false);
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
    }

    setIsResultFilterSearching(false);
    stopResultFilterSearchRef.current = true;
    resetSearchState();
    resetFilterState();
    setErrorMessage(null);
    setFeedbackMessage(null);
    previousActiveTabIdRef.current = activeTab.id;
  }, [activeTab?.id, resetFilterState, resetSearchState]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    tabSearchPanelStateRef.current[activeTabId] = {
      isOpen,
      panelMode,
      resultPanelState,
      keyword,
      replaceValue,
      searchMode,
      caseSensitive,
      reverseSearch,
      resultFilterKeyword,
      appliedResultFilterKeyword,
    };
  }, [
    activeTabId,
    appliedResultFilterKeyword,
    caseSensitive,
    isOpen,
    keyword,
    panelMode,
    replaceValue,
    resultFilterKeyword,
    resultPanelState,
    reverseSearch,
    searchMode,
  ]);

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
  }, [messages.filterGroupLoadFailed]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    focusSearchInput();
  }, [focusSearchInput, isOpen]);

  const updateSearchSidebarTopOffset = useCallback(() => {
    const reservedTopHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="titlebar"], [data-layout-region="toolbar"]'))
    );
    const nextOffset = `${reservedTopHeight}px`;

    setSearchSidebarTopOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, []);

  const updateSearchSidebarBottomOffset = useCallback(() => {
    const reservedBottomHeight = Math.max(
      0,
      Math.ceil(getReservedLayoutHeight('[data-layout-region="statusbar"]'))
    );

    let nextOffsetValue = reservedBottomHeight;

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const resultPanelOffset = Math.max(0, Math.ceil(window.innerHeight - rect.top));
        nextOffsetValue = Math.max(nextOffsetValue, resultPanelOffset);
      }
    }

    const nextOffset = `${nextOffsetValue}px`;
    setSearchSidebarBottomOffset((previousOffset) =>
      previousOffset === nextOffset ? previousOffset : nextOffset
    );
  }, [isOpen, resultPanelState]);

  useEffect(() => {
    updateSearchSidebarTopOffset();
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    updateSearchSidebarBottomOffset();
  }, [updateSearchSidebarBottomOffset]);

  useEffect(() => {
    const titleAndToolbarElements = document.querySelectorAll<HTMLElement>(
      '[data-layout-region="titlebar"], [data-layout-region="toolbar"]'
    );
    const observer = new ResizeObserver(() => {
      updateSearchSidebarTopOffset();
    });

    titleAndToolbarElements.forEach((element) => {
      observer.observe(element);
    });

    window.addEventListener('resize', updateSearchSidebarTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarTopOffset);
    };
  }, [updateSearchSidebarTopOffset]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      updateSearchSidebarBottomOffset();
    });

    const statusBarElement = document.querySelector<HTMLElement>('[data-layout-region="statusbar"]');
    if (statusBarElement) {
      observer.observe(statusBarElement);
    }

    if (isOpen && resultPanelState !== 'closed') {
      const targetElement =
        resultPanelState === 'open' ? resultPanelWrapperRef.current : minimizedResultWrapperRef.current;

      if (targetElement) {
        observer.observe(targetElement);
      }
    }

    window.addEventListener('resize', updateSearchSidebarBottomOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSearchSidebarBottomOffset);
    };
  }, [isOpen, resultPanelState, updateSearchSidebarBottomOffset]);

  useEffect(() => {
    stopResultFilterSearchRef.current = true;
    setIsResultFilterSearching(false);
    resetSearchState();
    resetFilterState();
  }, [activeTab?.id, resetFilterState, resetSearchState]);

  useEffect(() => {
    return () => {
      if (loadMoreDebounceRef.current !== null) {
        window.clearTimeout(loadMoreDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resultPanelState !== 'open') {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayload.length === 0 || filterMatches.length === 0 || !hasMoreFilterMatches || isSearching) {
        return;
      }
    } else if (!keyword || matches.length === 0 || !hasMoreMatches || isSearching) {
      return;
    }

    let cancelled = false;

    const fillVisibleResultViewport = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (
          cancelled ||
          isSearching ||
          loadMoreLockRef.current ||
          (isFilterMode ? !hasMoreFilterMatches : !hasMoreMatches)
        ) {
          return;
        }

        const container = resultListRef.current;
        if (!container) {
          return;
        }

        if (container.scrollHeight > container.clientHeight + 1) {
          return;
        }

        const appended = isFilterMode ? await loadMoreFilterMatches() : await loadMoreMatches();
        if (!appended || appended.length === 0) {
          return;
        }
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      void fillVisibleResultViewport();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    filterMatches.length,
    filterRulesPayload.length,
    hasMoreFilterMatches,
    hasMoreMatches,
    isFilterMode,
    isSearching,
    keyword,
    loadMoreFilterMatches,
    loadMoreMatches,
    matches.length,
    resultPanelState,
  ]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const handleFindNextShortcuts = (event: KeyboardEvent) => {
      const key = event.key;
      if (key !== 'F3') {
        return;
      }

      event.preventDefault();

      if (!keyword && !isFilterMode) {
        if (!isOpen) {
          setIsOpen(true);
          focusSearchInput();
        }
        return;
      }

      const primaryStep = isFilterMode ? 1 : reverseSearch ? -1 : 1;
      const step = event.shiftKey ? -primaryStep : primaryStep;
      void navigateByStep(step);
    };

    window.addEventListener('keydown', handleFindNextShortcuts);
    return () => {
      window.removeEventListener('keydown', handleFindNextShortcuts);
    };
  }, [activeTab, focusSearchInput, isFilterMode, isOpen, keyword, navigateByStep, reverseSearch]);

  const handleApplyResultFilter = useCallback(async () => {
    const nextKeyword = resultFilterKeyword.trim();
    const nextResultFilterKeyword = nextKeyword
      ? caseSensitive
        ? nextKeyword
        : nextKeyword.toLowerCase()
      : '';

    if (nextKeyword.length === 0) {
      requestStopResultFilterSearch();
      setAppliedResultFilterKeyword('');
      void executeSearch(true, true, '');
      if (isFilterMode) {
        void executeFilter(true, true, '');
      }
      setIsResultFilterSearching(false);
      return;
    }

    if (isResultFilterSearching) {
      return;
    }

    if (
      nextKeyword === appliedResultFilterKeyword.trim() &&
      true
    ) {
      return;
    }

    stopResultFilterSearchRef.current = false;
    setIsResultFilterSearching(true);
    setAppliedResultFilterKeyword('');

    try {
      if (isFilterMode) {
        await executeFilter(true, true, nextResultFilterKeyword);
      } else if (keyword) {
        await executeSearch(true, true, nextResultFilterKeyword);
      }

      if (!stopResultFilterSearchRef.current) {
        setAppliedResultFilterKeyword(nextKeyword);
      }
    } finally {
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = false;
    }
  }, [
    appliedResultFilterKeyword,
    caseSensitive,
    executeFilter,
    executeSearch,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
  ]);

  const hasPendingResultFilterChange = useMemo(() => {
    const normalizeForCompare = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }

      return caseSensitive ? trimmed : trimmed.toLowerCase();
    };

    return normalizeForCompare(resultFilterKeyword) !== normalizeForCompare(appliedResultFilterKeyword);
  }, [appliedResultFilterKeyword, caseSensitive, resultFilterKeyword]);

  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalFilterMatchedLineCount = totalFilterMatchedLineCount;
  const displayTotalMatchCountText =
    displayTotalMatchCount === null ? messages.counting : `${displayTotalMatchCount}`;
  const displayTotalMatchedLineCountText =
    displayTotalMatchedLineCount === null ? messages.counting : `${displayTotalMatchedLineCount}`;
  const displayTotalFilterMatchedLineCountText =
    displayTotalFilterMatchedLineCount === null ? messages.counting : `${displayTotalFilterMatchedLineCount}`;

  const renderedResultItems = useMemo(() => {
    if (resultPanelState !== 'open') {
      return null;
    }

    if (isFilterMode) {
      if (filterRulesPayload.length === 0 || visibleFilterMatches.length === 0) {
        return null;
      }

      return visibleFilterMatches.map((match, index) => {
        const isActive = index === visibleCurrentFilterMatchIndex;
        const sourceIndex = filterMatches.indexOf(match);

        return (
          <button
            key={`filter-${match.line}-${match.ruleIndex}-${index}`}
            type="button"
            className={cn(
              'flex w-full items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
              isActive ? 'bg-primary/12' : 'hover:bg-muted/50'
            )}
            title={messages.lineColTitle(match.line, Math.max(1, match.column || 1))}
            onClick={() => {
              if (sourceIndex >= 0) {
                handleSelectMatch(sourceIndex);
              }
            }}
          >
            <span
              className="w-16 shrink-0 border-r border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
              style={{ fontFamily }}
            >
              {match.line}
            </span>
            <span
              className="min-w-0 flex-1 pl-2 text-xs text-foreground whitespace-pre overflow-hidden text-ellipsis"
              style={resultListTextStyle}
            >
              {renderFilterPreview(match)}
            </span>
            {isActive ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </button>
        );
      });
    }

    if (!keyword || visibleMatches.length === 0) {
      return null;
    }

    return visibleMatches.map((match, index) => {
      const isActive = index === visibleCurrentMatchIndex;
      const sourceIndex = matches.indexOf(match);

      return (
        <button
          key={`${match.start}-${match.end}-${index}`}
          type="button"
          className={cn(
            'flex w-full items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
            isActive ? 'bg-primary/12' : 'hover:bg-muted/50'
          )}
          title={messages.lineColTitle(match.line, match.column)}
          onClick={() => {
            if (sourceIndex >= 0) {
              handleSelectMatch(sourceIndex);
            }
          }}
        >
          <span
            className="w-16 shrink-0 border-r border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
            style={{ fontFamily }}
          >
            {match.line}
          </span>
          <span
            className="min-w-0 flex-1 pl-2 text-xs text-foreground whitespace-pre overflow-hidden text-ellipsis"
            style={resultListTextStyle}
          >
            {renderMatchPreview(match)}
          </span>
          {isActive ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        </button>
      );
    });
  }, [
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    filterRulesPayload.length,
    handleSelectMatch,
    isFilterMode,
    keyword,
    matches,
    messages,
    resultPanelState,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  ]);

  const statusText = useMemo(() => {
    if (isFilterMode) {
      if (effectiveFilterRules.length === 0) {
        return messages.statusEnterToFilter;
      }

      if (errorMessage) {
        return errorMessage;
      }

      if (isSearching) {
        return messages.statusFiltering;
      }

      if (filterMatches.length === 0) {
        return messages.statusFilterNoMatches;
      }

      if (displayTotalFilterMatchedLineCount === null) {
        return messages.statusFilterTotalPending(Math.min(currentFilterMatchIndex + 1, filterMatches.length));
      }

      return messages.statusFilterTotalReady(
        displayTotalFilterMatchedLineCount,
        Math.min(currentFilterMatchIndex + 1, filterMatches.length)
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

    if (matches.length === 0) {
      return messages.statusNoMatches;
    }

    if (displayTotalMatchCount === null) {
      return messages.statusTotalPending(Math.min(currentMatchIndex + 1, matches.length));
    }

    return messages.statusTotalReady(displayTotalMatchCount, Math.min(currentMatchIndex + 1, matches.length));
  }, [
    currentFilterMatchIndex,
    currentMatchIndex,
    displayTotalFilterMatchedLineCount,
    displayTotalMatchCount,
    effectiveFilterRules.length,
    errorMessage,
    filterMatches.length,
    isFilterMode,
    isSearching,
    keyword,
    matches.length,
    messages,
  ]);

  const canReplace = !!activeTab;
  const isResultPanelOpen = resultPanelState === 'open';
  const isResultPanelMinimized = resultPanelState === 'minimized';
  const resultToggleTitle = isResultPanelOpen ? messages.collapseResults : messages.expandResults;
  const filterToggleLabel = isResultPanelOpen ? messages.collapse : messages.filterRun;

  const toggleResultPanelAndRefresh = useCallback(() => {
    setResultPanelState((previous) => (previous === 'open' ? 'minimized' : 'open'));

    if (isSearching) {
      return;
    }

    if (isFilterMode) {
      if (filterRulesPayload.length > 0) {
        void executeFilter();
      }
      return;
    }

    if (keyword) {
      void executeSearch();
    }
  }, [executeFilter, executeSearch, filterRulesPayload.length, isFilterMode, isSearching, keyword]);

  if (!activeTab) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'fixed right-0 z-40 transform-gpu overflow-x-hidden transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{
          width: SEARCH_SIDEBAR_WIDTH,
          top: searchSidebarTopOffset,
          bottom: searchSidebarBottomOffset,
        }}
      >
        <div
          className={cn(
            'flex h-full flex-col border-l border-border bg-background/95 p-3 shadow-2xl backdrop-blur',
            isOpen ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-md border border-border p-0.5">
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors',
                  panelMode === 'find'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  setPanelMode('find');
                  focusSearchInput();
                }}
              >
                {messages.find}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors disabled:opacity-50',
                  panelMode === 'replace'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  setPanelMode('replace');
                  focusSearchInput();
                }}
                disabled={!canReplace}
                title={canReplace ? messages.switchToReplaceMode : messages.noFileOpen}
              >
                {messages.replace}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors disabled:opacity-50',
                  panelMode === 'filter'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  setPanelMode('filter');
                  focusSearchInput();
                }}
                disabled={!canReplace}
                title={canReplace ? messages.switchToFilterMode : messages.noFileOpen}
              >
                {messages.filter}
              </button>
            </div>

            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setIsOpen(false)}
              title={messages.close}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isFilterMode ? (
            <div className="mt-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setFeedbackMessage(null);
                  setErrorMessage(null);
                  resetSearchState();
                }}
                onKeyDown={handleKeywordKeyDown}
                placeholder={messages.findPlaceholder}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={addFilterRule}
                >
                  <CirclePlus className="h-3.5 w-3.5" />
                  {messages.filterAddRule}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
                  onClick={toggleResultPanelAndRefresh}
                  title={isFilterMode ? messages.filterRunHint : resultToggleTitle}
                >
                  {filterToggleLabel}
                </button>
              </div>

              <div className="rounded-md border border-border/70 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={filterGroupNameInput}
                    onChange={(event) => setFilterGroupNameInput(event.target.value)}
                    placeholder={messages.filterGroupNamePlaceholder}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void handleSaveFilterRuleGroup()}
                  >
                    {messages.filterSaveGroup}
                  </button>
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <select
                    value={selectedFilterGroupName}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setSelectedFilterGroupName(nextName);
                      if (nextName) {
                        setFilterGroupNameInput(nextName);
                      }
                    }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
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
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={handleLoadFilterRuleGroup}
                  >
                    {messages.filterLoadGroup}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
                    onClick={() => void handleDeleteFilterRuleGroup()}
                  >
                    {messages.filterDeleteGroup}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void handleImportFilterRuleGroups()}
                  >
                    {messages.filterImportGroups}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void handleExportFilterRuleGroups()}
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
                <div
                  key={rule.id}
                  className={cn(
                    'rounded-md border border-border/70 p-2 transition-colors',
                    isDropTarget ? 'border-primary bg-primary/5' : undefined
                  )}
                  onDragOver={(event) => onFilterRuleDragOver(event, rule.id)}
                  onDrop={(event) => onFilterRuleDrop(event, rule.id)}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span
                        draggable
                        onDragStart={(event) => onFilterRuleDragStart(event, rule.id)}
                        onDragEnd={onFilterRuleDragEnd}
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
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                        onClick={() => moveFilterRule(rule.id, -1)}
                        disabled={index === 0}
                        title={messages.filterMoveUp}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                        onClick={() => moveFilterRule(rule.id, 1)}
                        disabled={index === filterRules.length - 1}
                        title={messages.filterMoveDown}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        onClick={() => removeFilterRule(rule.id)}
                        title={messages.filterDeleteRule}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <input
                    value={rule.keyword}
                    onChange={(event) => {
                      updateFilterRule(rule.id, (previous) => ({
                        ...previous,
                        keyword: event.target.value,
                      }));
                    }}
                    onKeyDown={handleKeywordKeyDown}
                    placeholder={messages.filterRuleKeywordPlaceholder}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {FILTER_MATCH_MODES.map((modeOption) => {
                      return (
                        <ModeButton
                          key={`${rule.id}-${modeOption}`}
                          active={rule.matchMode === modeOption}
                          label={matchModeLabel(modeOption, messages)}
                          onClick={() => {
                            updateFilterRule(rule.id, (previous) => ({
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
                          updateFilterRule(rule.id, (previous) => ({
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
                          updateFilterRule(rule.id, (previous) => ({
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
                          updateFilterRule(rule.id, (previous) => ({
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
                          updateFilterRule(rule.id, (previous) => ({
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
                          updateFilterRule(rule.id, (previous) => ({
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
                        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                        rule.applyTo === 'line'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                      onClick={() => {
                        updateFilterRule(rule.id, (previous) => ({
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
                        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                        rule.applyTo === 'match'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                      onClick={() => {
                        updateFilterRule(rule.id, (previous) => ({
                          ...previous,
                          applyTo: 'match',
                        }));
                      }}
                    >
                      {messages.filterApplyMatch}
                    </button>
                  </div>
                </div>
              )})}

              {effectiveFilterRules.length === 0 && (
                <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
                  {messages.filterRuleEmptyHint}
                </div>
              )}
            </div>
          )}

          {isReplaceMode && (
            <div className="mt-2 flex items-center gap-2">
              <span className="w-4 text-xs text-muted-foreground">→</span>
              <input
                value={replaceValue}
                onChange={(event) => setReplaceValue(event.target.value)}
                placeholder={messages.replacePlaceholder}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {!isFilterMode && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ModeButton
                  active={searchMode === 'literal'}
                  label={messages.modeLiteral}
                  onClick={() => {
                    setSearchMode('literal');
                    setErrorMessage(null);
                    resetSearchState();
                  }}
                />
                <ModeButton
                  active={searchMode === 'regex'}
                  label={messages.modeRegex}
                  onClick={() => {
                    setSearchMode('regex');
                    setErrorMessage(null);
                    resetSearchState();
                  }}
                />
                <ModeButton
                  active={searchMode === 'wildcard'}
                  label={messages.modeWildcard}
                  onClick={() => {
                    setSearchMode('wildcard');
                    setErrorMessage(null);
                    resetSearchState();
                  }}
                />

                <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(event) => {
                      setCaseSensitive(event.target.checked);
                      setErrorMessage(null);
                      resetSearchState();
                    }}
                  />
                  {messages.caseSensitive}
                </label>

                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={reverseSearch}
                    onChange={(event) => setReverseSearch(event.target.checked)}
                  />
                  {messages.reverseSearch}
                </label>
              </div>

              {isReplaceMode ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => void navigateByStep(-1)}
                    title={messages.prevMatch}
                  >
                    <ArrowUp className="h-3 w-3" />
                    {messages.previous}
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => void navigateByStep(1)}
                    title={messages.nextMatch}
                  >
                    <ArrowDown className="h-3 w-3" />
                    {messages.next}
                  </button>

                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                    onClick={() => void handleReplaceCurrent()}
                    disabled={!canReplace}
                    title={canReplace ? messages.replaceCurrentMatch : messages.noFileOpen}
                  >
                    {messages.replace}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    onClick={() => void handleReplaceAll()}
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
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => void navigateByStep(-1)}
                    title={messages.prevMatch}
                  >
                    <ArrowUp className="h-3 w-3" />
                    {messages.previous}
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => void navigateByStep(1)}
                    title={messages.nextMatch}
                  >
                    <ArrowDown className="h-3 w-3" />
                    {messages.next}
                  </button>

                  <button
                    type="button"
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
                    onClick={toggleResultPanelAndRefresh}
                    title={resultToggleTitle}
                  >
                    {messages.all}
                  </button>
                </div>
              )}
            </>
          )}

          <div
            className={cn(
              'mt-2 text-xs',
              errorMessage ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {feedbackMessage || statusText} · {messages.shortcutHint}
          </div>
        </div>
      </div>

      {resultPanelState !== 'closed' && (
        <div ref={resultPanelWrapperRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-30 px-2 pb-2">
        <div
          className={cn(
            'pointer-events-auto rounded-lg border border-border bg-background/95 shadow-2xl',
            resultPanelState === 'open' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="shrink-0 text-xs font-medium text-foreground">
                {isFilterMode
                  ? messages.filterResultsSummary(displayTotalFilterMatchedLineCountText, visibleFilterMatches.length)
                  : messages.resultsSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, visibleMatches.length)}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-input bg-background px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={resultFilterKeyword}
                  onChange={(event) => setResultFilterKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleApplyResultFilter();
                    }
                  }}
                  placeholder={messages.resultFilterPlaceholder}
                  className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
                <button
                  type="button"
                  className={cn(
                    'rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-40',
                    !isResultFilterSearching && hasPendingResultFilterChange && 'ring-2 ring-amber-400/80 animate-pulse'
                  )}
                  onClick={() => {
                    if (isResultFilterSearching) {
                      requestStopResultFilterSearch();
                      return;
                    }

                    void handleApplyResultFilter();
                  }}
                  disabled={isSearching}
                >
                  <span className="inline-flex items-center gap-1">
                    {isResultFilterSearching ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    {isResultFilterSearching ? messages.resultFilterStop : messages.resultFilterSearch}
                  </span>
                </button>
                {resultFilterKeyword && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setResultFilterKeyword('');
                      setAppliedResultFilterKeyword('');
                    }}
                    title={messages.clearResultFilter}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  if (isFilterMode) {
                    void executeFilter(true);
                    return;
                  }

                  void executeSearch(true);
                }}
                title={isFilterMode ? messages.refreshFilterResults : messages.refreshResults}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setResultPanelState('minimized')}
                title={messages.minimizeResults}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setResultPanelState('closed')}
                title={messages.closeResults}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div ref={resultListRef} className="max-h-56 overflow-y-auto" onScroll={handleResultListScroll}>
            {isFilterMode ? (
              <>
                {filterRulesPayload.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{messages.filterResultsEmptyHint}</div>
                )}

                {filterRulesPayload.length > 0 && filterMatches.length === 0 && !isSearching && !errorMessage && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{messages.noFilterMatchesHint}</div>
                )}

                {filterRulesPayload.length > 0 &&
                  filterMatches.length > 0 &&
                  visibleFilterMatches.length === 0 &&
                  isResultFilterActive && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultFilterNoMatches}</div>
                  )}
              </>
            ) : (
              <>
                {!keyword && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultsEmptyHint}</div>
                )}

                {!!keyword && matches.length === 0 && !isSearching && !errorMessage && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{messages.noMatchesHint}</div>
                )}

                {!!keyword &&
                  matches.length > 0 &&
                  visibleMatches.length === 0 &&
                  isResultFilterActive && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultFilterNoMatches}</div>
                  )}
              </>
            )}

            {renderedResultItems}

            {(isFilterMode ? visibleFilterMatches.length > 0 : !!keyword && visibleMatches.length > 0) && (
              <div className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                {isFilterMode
                  ? isSearching
                    ? messages.filterLoadingMore
                    : hasMoreFilterMatches
                      ? messages.filterScrollToLoadMore
                      : messages.filterLoadedAll(displayTotalFilterMatchedLineCountText)
                  : isSearching
                    ? messages.loadingMore
                    : hasMoreMatches
                      ? messages.scrollToLoadMore
                      : messages.loadedAll(displayTotalMatchCountText)}
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {isResultPanelMinimized && (
        <div ref={minimizedResultWrapperRef} className="pointer-events-none absolute bottom-6 right-2 z-30">
          <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-background/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
            <span className="text-muted-foreground">
              {isFilterMode
                ? messages.filterMinimizedSummary(displayTotalFilterMatchedLineCountText, filterMatches.length)
                : messages.minimizedSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, matches.length)}
            </span>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setResultPanelState('open');

                if (!isSearching) {
                  if (isFilterMode) {
                    if (filterRulesPayload.length > 0) {
                      void executeFilter();
                    }
                  } else if (keyword) {
                    void executeSearch();
                  }
                }
              }}
              title={isFilterMode ? messages.openFilterResults : messages.openResults}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setResultPanelState('closed')}
              title={messages.closeResults}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
