import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  ArrowDown,
  Check,
  ArrowUp,
  CirclePlus,
  ChevronDown,
  ChevronUp,
  Copy,
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
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { getSearchPanelMessages } from '@/i18n';
import { useStore } from '@/store/useStore';
import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';

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

interface PreviewSegment {
  text: string;
  isPrimaryMatch?: boolean;
  isSecondaryMatch?: boolean;
  isRuleMatch?: boolean;
}

interface FilterMatch {
  line: number;
  column: number;
  length: number;
  lineText: string;
  ruleIndex: number;
  style: FilterRuleStyle;
  ranges: FilterMatchRange[];
  previewSegments?: PreviewSegment[];
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
  previewSegments?: PreviewSegment[];
}

interface SearchOpenEventDetail {
  mode?: SearchOpenMode;
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

interface ReplaceAllBackendResult {
  replacedCount: number;
  lineCount: number;
  documentVersion: number;
}

interface ReplaceCurrentBackendResult {
  replaced: boolean;
  lineCount: number;
  documentVersion: number;
}

interface SearchResultFilterStepBackendResult {
  targetMatch: SearchMatch | null;
  documentVersion: number;
  batchStartOffset: number;
  targetIndexInBatch: number | null;
  totalMatches: number;
  totalMatchedLines: number;
}

interface FilterResultFilterStepBackendResult {
  targetMatch: FilterMatch | null;
  documentVersion: number;
  batchStartLine: number;
  targetIndexInBatch: number | null;
  totalMatchedLines: number;
}

interface TabSearchPanelSnapshot {
  isOpen: boolean;
  panelMode: PanelMode;
  resultPanelState: SearchResultPanelState;
  resultPanelHeight: number;
  searchSidebarWidth: number;
  keyword: string;
  replaceValue: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  reverseSearch: boolean;
  resultFilterKeyword: string;
  appliedResultFilterKeyword: string;
  matches: SearchMatch[];
  filterMatches: FilterMatch[];
  currentMatchIndex: number;
  currentFilterMatchIndex: number;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
  totalFilterMatchedLineCount: number | null;
  searchNextOffset: number | null;
  filterNextLine: number | null;
  searchDocumentVersion: number | null;
  filterDocumentVersion: number | null;
  filterRulesKey: string;
}

const SEARCH_CHUNK_SIZE = 300;
const FILTER_CHUNK_SIZE = 300;
const RESULT_PANEL_DEFAULT_HEIGHT = 224;
const RESULT_PANEL_MIN_HEIGHT = 140;
const RESULT_PANEL_MAX_HEIGHT = 640;
const SEARCH_SIDEBAR_DEFAULT_WIDTH = 325;
const SEARCH_SIDEBAR_MIN_WIDTH = 280;
const SEARCH_SIDEBAR_MAX_WIDTH = 900;
const SEARCH_SIDEBAR_RIGHT_OFFSET = 12;
const DEFAULT_FILTER_RULE_BACKGROUND = '#fff7a8';
const DEFAULT_FILTER_RULE_TEXT = '#1f2937';

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

function dispatchSearchClose(tabId: string) {
  window.dispatchEvent(
    new CustomEvent('rutar:search-close', {
      detail: {
        tabId,
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

function getSearchModeValue(mode: SearchMode) {
  return mode;
}
function renderMatchPreview(match: SearchMatch) {
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

function renderFilterPreview(match: FilterMatch) {
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

function matchModeLabel(mode: FilterRuleMatchMode, messages: ReturnType<typeof getSearchPanelMessages>) {
  if (mode === 'contains') {
    return messages.filterMatchContains;
  }

  if (mode === 'regex') {
    return messages.filterMatchRegex;
  }

  return messages.filterMatchWildcard;
}

async function writePlainTextToClipboard(text: string) {
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

export function SearchReplacePanel() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const updateTab = useStore((state) => state.updateTab);
  const language = useStore((state) => state.settings.language);
  const fontFamily = useStore((state) => state.settings.fontFamily);
  const fontSize = useStore((state) => state.settings.fontSize);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const messages = useMemo(
    () => getSearchPanelMessages(language),
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
  const [resultFilterStepLoadingDirection, setResultFilterStepLoadingDirection] = useState<'prev' | 'next' | null>(null);
  const [resultPanelHeight, setResultPanelHeight] = useState(RESULT_PANEL_DEFAULT_HEIGHT);
  const [searchSidebarWidth, setSearchSidebarWidth] = useState(SEARCH_SIDEBAR_DEFAULT_WIDTH);
  const [searchSidebarTopOffset, setSearchSidebarTopOffset] = useState('0px');
  const [searchSidebarBottomOffset, setSearchSidebarBottomOffset] = useState('0px');
  const [isSearchUiFocused, setIsSearchUiFocused] = useState(false);
  const [isSearchUiPointerActive, setIsSearchUiPointerActive] = useState(false);
  const [isSearchUiPinnedActive, setIsSearchUiPinnedActive] = useState(false);

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
  const {
    containerRef: searchSidebarContainerRef,
    isResizing: isSearchSidebarResizing,
    startResize: startSearchSidebarResize,
  } = useResizableSidebarWidth({
    width: searchSidebarWidth,
    minWidth: SEARCH_SIDEBAR_MIN_WIDTH,
    maxWidth: SEARCH_SIDEBAR_MAX_WIDTH,
    onWidthChange: setSearchSidebarWidth,
    resizeEdge: 'left',
  });
  const isSearchUiActive = isSearchUiFocused || isSearchUiPointerActive || isSearchUiPinnedActive;
  const filterRulesKey = useMemo(() => JSON.stringify(filterRulesPayload), [filterRulesPayload]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const resizeDragStateRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
  const runVersionRef = useRef(0);
  const countRunVersionRef = useRef(0);
  const filterRunVersionRef = useRef(0);
  const filterCountRunVersionRef = useRef(0);
  const currentMatchIndexRef = useRef(0);
  const currentFilterMatchIndexRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const loadMoreDebounceRef = useRef<number | null>(null);
  const loadMoreSessionRef = useRef(0);
  const chunkCursorRef = useRef<number | null>(null);
  const filterLineCursorRef = useRef<number | null>(null);
  const stopResultFilterSearchRef = useRef(false);
  const pendingNavigateDispatchRafRef = useRef<number | null>(null);
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
  const cancelPendingBatchLoad = useCallback(() => {
    loadMoreSessionRef.current += 1;
    if (loadMoreDebounceRef.current !== null) {
      window.clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }
    setResultFilterStepLoadingDirection(null);
    if (loadMoreLockRef.current) {
      setIsSearching(false);
    }
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
  const previousIsOpenRef = useRef(false);
  const blurUpdateTimerRef = useRef<number | null>(null);

  const isTargetInsideSearchSidebar = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      return false;
    }

    return !!searchSidebarContainerRef.current?.contains(target);
  }, []);

  const syncSearchSidebarFocusFromDom = useCallback(() => {
    setIsSearchUiFocused(isTargetInsideSearchSidebar(document.activeElement));
  }, [isTargetInsideSearchSidebar]);

  const handleSearchUiPointerDownCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiPointerActive(true);
    setIsSearchUiPinnedActive(true);
    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiFocusCapture = useCallback(() => {
    if (blurUpdateTimerRef.current !== null) {
      window.clearTimeout(blurUpdateTimerRef.current);
      blurUpdateTimerRef.current = null;
    }

    setIsSearchUiFocused(true);
  }, []);

  const handleSearchUiBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      if (isTargetInsideSearchSidebar(event.relatedTarget)) {
        return;
      }

      if (isSearchUiPointerActive) {
        return;
      }

      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
      }

      blurUpdateTimerRef.current = window.setTimeout(() => {
        if (!isSearchUiPointerActive) {
          syncSearchSidebarFocusFromDom();
        }
        blurUpdateTimerRef.current = null;
      }, 40);
    },
    [isSearchUiPointerActive, isTargetInsideSearchSidebar, syncSearchSidebarFocusFromDom]
  );

  useEffect(() => {
    if (!isSearchUiPointerActive) {
      return;
    }

    const handlePointerEnd = () => {
      setIsSearchUiPointerActive(false);
      window.requestAnimationFrame(() => {
        syncSearchSidebarFocusFromDom();
      });
    };

    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    return () => {
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [isSearchUiPointerActive, syncSearchSidebarFocusFromDom]);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      if (isTargetInsideSearchSidebar(event.target)) {
        return;
      }

      setIsSearchUiPinnedActive(false);
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    };
  }, [isTargetInsideSearchSidebar]);

  useEffect(() => {
    return () => {
      if (blurUpdateTimerRef.current !== null) {
        window.clearTimeout(blurUpdateTimerRef.current);
        blurUpdateTimerRef.current = null;
      }
    };
  }, []);

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
      cancelPendingBatchLoad();

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
    cancelPendingBatchLoad,
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
  cancelPendingBatchLoad();

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
    cancelPendingBatchLoad,
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

    const sessionId = loadMoreSessionRef.current;
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

      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }

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
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      if (sessionId === loadMoreSessionRef.current) {
        setIsSearching(false);
      }
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

    const sessionId = loadMoreSessionRef.current;
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

      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }

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
      if (sessionId !== loadMoreSessionRef.current) {
        return null;
      }
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.filterFailed}: ${readableError}`);
      return null;
    } finally {
      loadMoreLockRef.current = false;
      if (sessionId === loadMoreSessionRef.current) {
        setIsSearching(false);
      }
    }
  }, [activeTab, backendResultFilterKeyword, filterRulesKey, filterRulesPayload, isFilterMode, messages.filterFailed]);

  const executeFirstMatchSearch = useCallback(async (reverse: boolean): Promise<SearchRunResult | null> => {
    cancelPendingBatchLoad();
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
    cancelPendingBatchLoad,
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

      if (pendingNavigateDispatchRafRef.current !== null) {
        window.cancelAnimationFrame(pendingNavigateDispatchRafRef.current);
        pendingNavigateDispatchRafRef.current = null;
      }

      dispatchNavigateToMatch(activeTab.id, targetMatch);
      pendingNavigateDispatchRafRef.current = window.requestAnimationFrame(() => {
        dispatchNavigateToMatch(activeTab.id, targetMatch);
        pendingNavigateDispatchRafRef.current = null;
      });
    },
    [activeTab]
  );

  const navigateToFilterMatch = useCallback(
    (targetMatch: FilterMatch) => {
      if (!activeTab) {
        return;
      }

      if (pendingNavigateDispatchRafRef.current !== null) {
        window.cancelAnimationFrame(pendingNavigateDispatchRafRef.current);
        pendingNavigateDispatchRafRef.current = null;
      }

      dispatchNavigateToLine(
        activeTab.id,
        targetMatch.line,
        Math.max(1, targetMatch.column || 1),
        Math.max(0, targetMatch.length || 0)
      );
      pendingNavigateDispatchRafRef.current = window.requestAnimationFrame(() => {
        dispatchNavigateToLine(
          activeTab.id,
          targetMatch.line,
          Math.max(1, targetMatch.column || 1),
          Math.max(0, targetMatch.length || 0)
        );
        pendingNavigateDispatchRafRef.current = null;
      });
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
        if (filterMatches.length > 0) {
          const boundedCurrentIndex = Math.min(currentFilterMatchIndexRef.current, filterMatches.length - 1);
          const candidateIndex = boundedCurrentIndex + step;

          if (candidateIndex < 0) {
            const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
            currentFilterMatchIndexRef.current = nextIndex;
            setCurrentFilterMatchIndex(nextIndex);
            setFeedbackMessage(null);
            navigateToFilterMatch(filterMatches[nextIndex]);
            return;
          }

          if (candidateIndex >= filterMatches.length && !loadMoreLockRef.current) {
            const appended = await loadMoreFilterMatches();
            if (appended && appended.length > 0) {
              const expandedMatches = [...filterMatches, ...appended];
              const nextIndex = candidateIndex;
              currentFilterMatchIndexRef.current = nextIndex;
              setCurrentFilterMatchIndex(nextIndex);
              setFeedbackMessage(null);
              navigateToFilterMatch(expandedMatches[nextIndex]);
              return;
            }
          }

          const nextIndex = (candidateIndex + filterMatches.length) % filterMatches.length;
          currentFilterMatchIndexRef.current = nextIndex;
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

        currentFilterMatchIndexRef.current = nextIndex;
        setCurrentFilterMatchIndex(nextIndex);
        setFeedbackMessage(null);
        navigateToFilterMatch(filterResult.matches[nextIndex]);

        return;
      }

      if (keyword && matches.length > 0) {
        const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, matches.length - 1);
        const candidateIndex = boundedCurrentIndex + step;

        if (candidateIndex < 0) {
          const nextIndex = (candidateIndex + matches.length) % matches.length;
          currentMatchIndexRef.current = nextIndex;
          setCurrentMatchIndex(nextIndex);
          setFeedbackMessage(null);
          navigateToMatch(matches[nextIndex]);
          return;
        }

        if (candidateIndex >= matches.length && !loadMoreLockRef.current) {
          const appended = await loadMoreMatches();
          if (appended && appended.length > 0) {
            const expandedMatches = [...matches, ...appended];
            const nextIndex = candidateIndex;
            currentMatchIndexRef.current = nextIndex;
            setCurrentMatchIndex(nextIndex);
            setFeedbackMessage(null);
            navigateToMatch(expandedMatches[nextIndex]);
            return;
          }
        }

        const nextIndex = (candidateIndex + matches.length) % matches.length;

        currentMatchIndexRef.current = nextIndex;
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

      currentMatchIndexRef.current = nextIndex;
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

    try {
      const result = await invoke<ReplaceCurrentBackendResult>('replace_current_in_document', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        replaceValue,
        targetStart: targetMatch.start,
        targetEnd: targetMatch.end,
      });

      if (!result.replaced) {
        setFeedbackMessage(messages.noReplaceMatches);
        return;
      }

      const safeLineCount = Math.max(1, result.lineCount ?? activeTab.lineCount);
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
      const result = await invoke<ReplaceAllBackendResult>('replace_all_in_document', {
        id: activeTab.id,
        keyword,
        mode: getSearchModeValue(searchMode),
        caseSensitive,
        replaceValue,
        resultFilterKeyword: backendResultFilterKeyword,
        resultFilterCaseSensitive: caseSensitive,
      });

      const replacedCount = result.replacedCount ?? 0;
      const safeLineCount = Math.max(1, result.lineCount ?? activeTab.lineCount);

      if (replacedCount === 0) {
        setFeedbackMessage(messages.noReplaceMatches);
        return;
      }

      updateTab(activeTab.id, { lineCount: safeLineCount, isDirty: true });
      dispatchEditorForceRefresh(activeTab.id, safeLineCount);

      setFeedbackMessage(messages.replacedAll(replacedCount));
      setCurrentMatchIndex(0);
      await executeSearch(true);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : String(error);
      setErrorMessage(`${messages.replaceAllFailed}: ${readableError}`);
    }
  }, [
    activeTab,
    backendResultFilterKeyword,
    caseSensitive,
    executeSearch,
    keyword,
    messages.noReplaceMatches,
    messages.replaceAllFailed,
    messages.replacedAll,
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

        if (event.currentTarget === searchInputRef.current) {
          setResultPanelState('open');
          if (!isSearching) {
            void executeSearch(true);
          }
          return;
        }

        const primaryStep = reverseSearch ? -1 : 1;
        const step = event.shiftKey ? -primaryStep : primaryStep;
        void navigateByStep(step);
      }
    },
    [executeFilter, executeSearch, isFilterMode, isSearching, navigateByStep, reverseSearch]
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
      setResultPanelHeight(RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(SEARCH_SIDEBAR_DEFAULT_WIDTH);
      setKeyword('');
      setReplaceValue('');
      setSearchMode('literal');
      setCaseSensitive(false);
      setReverseSearch(false);
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setMatches([]);
      setFilterMatches([]);
      setCurrentMatchIndex(0);
      setCurrentFilterMatchIndex(0);
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
      setTotalFilterMatchedLineCount(null);
      setIsResultFilterSearching(false);
      stopResultFilterSearchRef.current = true;
      resetSearchState();
      resetFilterState();
      cachedSearchRef.current = null;
      cachedFilterRef.current = null;
      countCacheRef.current = null;
      filterCountCacheRef.current = null;
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
      setResultPanelHeight(nextSnapshot.resultPanelHeight ?? RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(nextSnapshot.searchSidebarWidth ?? SEARCH_SIDEBAR_DEFAULT_WIDTH);
      setKeyword(nextSnapshot.keyword);
      setReplaceValue(nextSnapshot.replaceValue);
      setSearchMode(nextSnapshot.searchMode);
      setCaseSensitive(nextSnapshot.caseSensitive);
      setReverseSearch(nextSnapshot.reverseSearch);
      setResultFilterKeyword(nextSnapshot.resultFilterKeyword);
      setAppliedResultFilterKeyword(nextSnapshot.appliedResultFilterKeyword);

      const restoredMatches = nextSnapshot.matches || [];
      const restoredFilterMatches = nextSnapshot.filterMatches || [];

      setMatches(restoredMatches);
      setFilterMatches(restoredFilterMatches);
      setCurrentMatchIndex(() => {
        if (restoredMatches.length === 0) {
          return 0;
        }

        return Math.min(nextSnapshot.currentMatchIndex, restoredMatches.length - 1);
      });
      setCurrentFilterMatchIndex(() => {
        if (restoredFilterMatches.length === 0) {
          return 0;
        }

        return Math.min(nextSnapshot.currentFilterMatchIndex, restoredFilterMatches.length - 1);
      });

      setTotalMatchCount(nextSnapshot.totalMatchCount);
      setTotalMatchedLineCount(nextSnapshot.totalMatchedLineCount);
      setTotalFilterMatchedLineCount(nextSnapshot.totalFilterMatchedLineCount);

      chunkCursorRef.current = nextSnapshot.searchNextOffset;
      filterLineCursorRef.current = nextSnapshot.filterNextLine;

      const restoredNormalizedResultFilterKeyword = nextSnapshot.appliedResultFilterKeyword.trim().toLowerCase();
      const restoredResultFilterKeyword = restoredNormalizedResultFilterKeyword.length
        ? nextSnapshot.caseSensitive
          ? nextSnapshot.appliedResultFilterKeyword.trim()
          : restoredNormalizedResultFilterKeyword
        : '';

      if (nextSnapshot.searchDocumentVersion !== null && nextSnapshot.keyword) {
        const restoredSearchParams = {
          tabId: activeTab.id,
          keyword: nextSnapshot.keyword,
          searchMode: nextSnapshot.searchMode,
          caseSensitive: nextSnapshot.caseSensitive,
          resultFilterKeyword: restoredResultFilterKeyword,
          documentVersion: nextSnapshot.searchDocumentVersion,
        };

        searchParamsRef.current = restoredSearchParams;
        cachedSearchRef.current = {
          ...restoredSearchParams,
          matches: restoredMatches,
          nextOffset: nextSnapshot.searchNextOffset,
        };

        if (nextSnapshot.totalMatchCount !== null && nextSnapshot.totalMatchedLineCount !== null) {
          countCacheRef.current = {
            tabId: activeTab.id,
            keyword: nextSnapshot.keyword,
            searchMode: nextSnapshot.searchMode,
            caseSensitive: nextSnapshot.caseSensitive,
            resultFilterKeyword: restoredResultFilterKeyword,
            documentVersion: nextSnapshot.searchDocumentVersion,
            totalMatches: nextSnapshot.totalMatchCount,
            matchedLines: nextSnapshot.totalMatchedLineCount,
          };
        } else {
          countCacheRef.current = null;
        }
      } else {
        searchParamsRef.current = null;
        cachedSearchRef.current = null;
        countCacheRef.current = null;
      }

      if (nextSnapshot.filterDocumentVersion !== null && nextSnapshot.filterRulesKey) {
        const restoredFilterParams = {
          tabId: activeTab.id,
          rulesKey: nextSnapshot.filterRulesKey,
          resultFilterKeyword: restoredResultFilterKeyword,
          documentVersion: nextSnapshot.filterDocumentVersion,
        };

        filterParamsRef.current = restoredFilterParams;
        cachedFilterRef.current = {
          ...restoredFilterParams,
          matches: restoredFilterMatches,
          nextLine: nextSnapshot.filterNextLine,
        };

        if (nextSnapshot.totalFilterMatchedLineCount !== null) {
          filterCountCacheRef.current = {
            tabId: activeTab.id,
            rulesKey: nextSnapshot.filterRulesKey,
            resultFilterKeyword: restoredResultFilterKeyword,
            documentVersion: nextSnapshot.filterDocumentVersion,
            matchedLines: nextSnapshot.totalFilterMatchedLineCount,
          };
        } else {
          filterCountCacheRef.current = null;
        }
      } else {
        filterParamsRef.current = null;
        cachedFilterRef.current = null;
        filterCountCacheRef.current = null;
      }
    } else {
      setIsOpen(false);
      setPanelMode('find');
      setResultPanelState('closed');
      setResultPanelHeight(RESULT_PANEL_DEFAULT_HEIGHT);
      setSearchSidebarWidth(SEARCH_SIDEBAR_DEFAULT_WIDTH);
      setKeyword('');
      setReplaceValue('');
      setSearchMode('literal');
      setCaseSensitive(false);
      setReverseSearch(false);
      setResultFilterKeyword('');
      setAppliedResultFilterKeyword('');
      setMatches([]);
      setFilterMatches([]);
      setCurrentMatchIndex(0);
      setCurrentFilterMatchIndex(0);
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
      setTotalFilterMatchedLineCount(null);
      chunkCursorRef.current = null;
      filterLineCursorRef.current = null;
      searchParamsRef.current = null;
      filterParamsRef.current = null;
      cachedSearchRef.current = null;
      cachedFilterRef.current = null;
      countCacheRef.current = null;
      filterCountCacheRef.current = null;
    }

    setIsResultFilterSearching(false);
    stopResultFilterSearchRef.current = true;
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
      resultPanelHeight,
      searchSidebarWidth,
      keyword,
      replaceValue,
      searchMode,
      caseSensitive,
      reverseSearch,
      resultFilterKeyword,
      appliedResultFilterKeyword,
      matches,
      filterMatches,
      currentMatchIndex,
      currentFilterMatchIndex,
      totalMatchCount,
      totalMatchedLineCount,
      totalFilterMatchedLineCount,
      searchNextOffset: chunkCursorRef.current,
      filterNextLine: filterLineCursorRef.current,
      searchDocumentVersion:
        searchParamsRef.current?.documentVersion ?? cachedSearchRef.current?.documentVersion ?? null,
      filterDocumentVersion:
        filterParamsRef.current?.documentVersion ?? cachedFilterRef.current?.documentVersion ?? null,
      filterRulesKey: filterParamsRef.current?.rulesKey ?? filterRulesKey,
    };
  }, [
    activeTabId,
    appliedResultFilterKeyword,
    caseSensitive,
    currentFilterMatchIndex,
    currentMatchIndex,
    filterMatches,
    filterRulesKey,
    isOpen,
    keyword,
    matches,
    panelMode,
    replaceValue,
    resultFilterKeyword,
    resultPanelState,
    resultPanelHeight,
    searchSidebarWidth,
    reverseSearch,
    searchMode,
    totalFilterMatchedLineCount,
    totalMatchCount,
    totalMatchedLineCount,
  ]);

  useEffect(() => {
    if (previousIsOpenRef.current && !isOpen) {
      const targetTabId = activeTabId ?? previousActiveTabIdRef.current;
      if (targetTabId) {
        dispatchSearchClose(targetTabId);
      }
    }

    previousIsOpenRef.current = isOpen;
  }, [activeTabId, isOpen]);

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
    cancelPendingBatchLoad();
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
    cancelPendingBatchLoad,
    caseSensitive,
    executeFilter,
    executeSearch,
    isFilterMode,
    isResultFilterSearching,
    keyword,
    requestStopResultFilterSearch,
    resultFilterKeyword,
  ]);

  const hasAppliedResultFilterKeyword = resultFilterKeyword.trim().length > 0;

  const scrollResultItemIntoView = useCallback((itemIndex: number) => {
    const container = resultListRef.current;
    if (!container || itemIndex < 0) {
      return;
    }

    const itemElements = container.querySelectorAll<HTMLButtonElement>('button[data-result-item="true"]');
    const targetElement = itemElements.item(itemIndex);
    if (!targetElement) {
      return;
    }

    const targetTop = targetElement.offsetTop;
    const targetBottom = targetTop + targetElement.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const verticalPadding = Math.max(8, Math.floor(container.clientHeight * 0.2));

    if (targetTop < viewTop) {
      container.scrollTop = Math.max(0, targetTop - verticalPadding);
      return;
    }

    if (targetBottom > viewBottom) {
      container.scrollTop = Math.max(0, targetTop - verticalPadding);
    }
  }, []);

  const navigateResultFilterByStep = useCallback(
    async (step: number) => {
      if (!activeTab || isSearching || isResultFilterSearching) {
        return;
      }

      const keywordForJump = resultFilterKeyword.trim();
      if (!keywordForJump) {
        return;
      }

      const normalizedStep = step < 0 ? -1 : 1;

      try {
        if (isFilterMode) {
          const currentFilterMatch =
            currentFilterMatchIndexRef.current >= 0 &&
            currentFilterMatchIndexRef.current < filterMatches.length
              ? filterMatches[currentFilterMatchIndexRef.current]
              : null;

          const stepResult = await invoke<FilterResultFilterStepBackendResult>(
            'step_result_filter_search_in_filter_document',
            {
              id: activeTab.id,
              rules: filterRulesPayload,
              resultFilterKeyword: keywordForJump,
              resultFilterCaseSensitive: caseSensitive,
              currentLine: currentFilterMatch?.line ?? null,
              currentColumn: currentFilterMatch?.column ?? null,
              step: normalizedStep,
              maxResults: FILTER_CHUNK_SIZE,
            }
          );

          const targetMatch = stepResult.targetMatch;
          if (!targetMatch) {
            return;
          }

          let expandedMatches = filterMatches;
          let targetIndex = expandedMatches.findIndex(
            (item) =>
              item.line === targetMatch.line &&
              item.column === targetMatch.column &&
              item.ruleIndex === targetMatch.ruleIndex
          );

          if (targetIndex < 0 && hasMoreFilterMatches) {
            setResultFilterStepLoadingDirection(normalizedStep > 0 ? 'next' : 'prev');
          }

          while (targetIndex < 0 && hasMoreFilterMatches) {
            const appended = await loadMoreFilterMatches();
            if (!appended || appended.length === 0) {
              break;
            }

            expandedMatches = [...expandedMatches, ...appended];
            targetIndex = expandedMatches.findIndex(
              (item) =>
                item.line === targetMatch.line &&
                item.column === targetMatch.column &&
                item.ruleIndex === targetMatch.ruleIndex
            );
          }

          setResultFilterStepLoadingDirection(null);

          if (targetIndex >= 0) {
            currentFilterMatchIndexRef.current = targetIndex;
            setCurrentFilterMatchIndex(targetIndex);
            setErrorMessage(null);
            setFeedbackMessage(null);
            window.requestAnimationFrame(() => {
              scrollResultItemIntoView(targetIndex);
            });
            return;
          }

          setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
          return;
        }

        if (!keyword) {
          return;
        }

        const currentSearchMatch =
          currentMatchIndexRef.current >= 0 && currentMatchIndexRef.current < matches.length
            ? matches[currentMatchIndexRef.current]
            : null;

        const stepResult = await invoke<SearchResultFilterStepBackendResult>(
          'step_result_filter_search_in_document',
          {
            id: activeTab.id,
            keyword,
            mode: getSearchModeValue(searchMode),
            caseSensitive,
            resultFilterKeyword: keywordForJump,
            resultFilterCaseSensitive: caseSensitive,
            currentStart: currentSearchMatch?.start ?? null,
            currentEnd: currentSearchMatch?.end ?? null,
            step: normalizedStep,
            maxResults: SEARCH_CHUNK_SIZE,
          }
        );

        const targetMatch = stepResult.targetMatch;
        if (!targetMatch) {
          return;
        }

        let expandedMatches = matches;
        let targetIndex = expandedMatches.findIndex(
          (item) => item.start === targetMatch.start && item.end === targetMatch.end
        );

        if (targetIndex < 0 && hasMoreMatches) {
          setResultFilterStepLoadingDirection(normalizedStep > 0 ? 'next' : 'prev');
        }

        while (targetIndex < 0 && hasMoreMatches) {
          const appended = await loadMoreMatches();
          if (!appended || appended.length === 0) {
            break;
          }

          expandedMatches = [...expandedMatches, ...appended];
          targetIndex = expandedMatches.findIndex(
            (item) => item.start === targetMatch.start && item.end === targetMatch.end
          );
        }

        setResultFilterStepLoadingDirection(null);

        if (targetIndex >= 0) {
          currentMatchIndexRef.current = targetIndex;
          setCurrentMatchIndex(targetIndex);
          setErrorMessage(null);
          setFeedbackMessage(null);
          window.requestAnimationFrame(() => {
            scrollResultItemIntoView(targetIndex);
          });
          return;
        }

        setFeedbackMessage(messages.resultFilterStepNoMatch(keywordForJump));
      } catch (error) {
        setResultFilterStepLoadingDirection(null);
        const readableError = error instanceof Error ? error.message : String(error);
        setErrorMessage(`${messages.searchFailed}: ${readableError}`);
      }
    },
    [
      activeTab,
      caseSensitive,
      cancelPendingBatchLoad,
      filterMatches,
      filterRulesPayload,
      hasMoreFilterMatches,
      hasMoreMatches,
      isFilterMode,
      isResultFilterSearching,
      isSearching,
      keyword,
      loadMoreFilterMatches,
      loadMoreMatches,
      matches,
      messages.searchFailed,
      messages.resultFilterStepNoMatch,
      resultFilterKeyword,
      scrollResultItemIntoView,
      searchMode,
    ]
  );

  useEffect(() => {
    if (resultPanelState === 'closed') {
      cancelPendingBatchLoad();
    }
  }, [cancelPendingBatchLoad, resultPanelState]);

  useEffect(() => {
    return () => {
      const teardown = () => {
        resizeDragStateRef.current = null;
        document.body.style.userSelect = '';
      };

      teardown();
    };
  }, []);

  const handleResultPanelResizeMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    resizeDragStateRef.current = {
      startY: event.clientY,
      startHeight: resultPanelHeight,
    };

    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dragState = resizeDragStateRef.current;
      if (!dragState) {
        return;
      }

      const delta = dragState.startY - moveEvent.clientY;
      const nextHeight = Math.max(
        RESULT_PANEL_MIN_HEIGHT,
        Math.min(RESULT_PANEL_MAX_HEIGHT, dragState.startHeight + delta)
      );
      setResultPanelHeight(nextHeight);
    };

    const onMouseUp = () => {
      resizeDragStateRef.current = null;
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [resultPanelHeight]);

  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalFilterMatchedLineCount = totalFilterMatchedLineCount;
  const displayTotalMatchCountText =
    displayTotalMatchCount === null ? messages.counting : `${displayTotalMatchCount}`;
  const displayTotalMatchedLineCountText =
    displayTotalMatchedLineCount === null ? messages.counting : `${displayTotalMatchedLineCount}`;
  const displayTotalFilterMatchedLineCountText =
    displayTotalFilterMatchedLineCount === null ? messages.counting : `${displayTotalFilterMatchedLineCount}`;

  const plainTextResultEntries = useMemo(() => {
    if (isFilterMode) {
      if (filterRulesPayload.length === 0 || visibleFilterMatches.length === 0) {
        return [] as string[];
      }

      return visibleFilterMatches.map((match) => match.lineText || '');
    }

    if (!keyword || visibleMatches.length === 0) {
      return [] as string[];
    }

    return visibleMatches.map((match) => match.lineText || '');
  }, [filterRulesPayload.length, isFilterMode, keyword, visibleFilterMatches, visibleMatches]);

  const copyPlainTextResults = useCallback(async () => {
    if (plainTextResultEntries.length === 0) {
      setFeedbackMessage(messages.copyResultsEmpty);
      setErrorMessage(null);
      return;
    }

    try {
      await writePlainTextToClipboard(plainTextResultEntries.join('\n'));
      setFeedbackMessage(messages.copyResultsSuccess(plainTextResultEntries.length));
      setErrorMessage(null);
    } catch (error) {
      const readableError = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`${messages.copyResultsFailed}: ${readableError}`);
    }
  }, [messages, plainTextResultEntries]);

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
            data-result-item="true"
            className={cn(
              'flex min-w-full w-max items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
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
              className="pl-2 text-xs text-foreground whitespace-pre"
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
          data-result-item="true"
          className={cn(
            'flex min-w-full w-max items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
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
            className="pl-2 text-xs text-foreground whitespace-pre"
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
        ref={searchSidebarContainerRef}
        className={cn(
          'fixed z-40 transform-gpu overflow-hidden transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{
          width: `${searchSidebarWidth}px`,
          right: `${SEARCH_SIDEBAR_RIGHT_OFFSET}px`,
          top: searchSidebarTopOffset,
          bottom: searchSidebarBottomOffset,
        }}
      >
        <div
          className={cn(
            'flex h-full flex-col overflow-y-auto border-l border-border p-3 shadow-2xl transition-colors',
            isSearchUiActive ? 'bg-background/95 backdrop-blur' : 'bg-background/65',
            isOpen ? 'pointer-events-auto' : 'pointer-events-none'
          )}
          onPointerDownCapture={handleSearchUiPointerDownCapture}
          onFocusCapture={handleSearchUiFocusCapture}
          onBlurCapture={handleSearchUiBlurCapture}
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
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize search sidebar"
          onPointerDown={startSearchSidebarResize}
          className={cn(
            'absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none transition-colors',
            !isOpen && 'pointer-events-none opacity-0',
            isSearchSidebarResizing ? 'bg-primary/40' : 'hover:bg-primary/25'
          )}
        />
      </div>

      {resultPanelState !== 'closed' && (
        <div ref={resultPanelWrapperRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-[35] px-2 pb-2">
        <div
          className={cn(
            'pointer-events-auto rounded-lg border border-border shadow-2xl transition-colors',
            'bg-background',
            resultPanelState === 'open' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <button
            type="button"
            className="flex h-2 w-full cursor-row-resize items-center justify-center rounded-t-lg text-muted-foreground/60 hover:bg-muted/40"
            onMouseDown={handleResultPanelResizeMouseDown}
            title="Resize results panel"
            aria-label="Resize results panel"
          >
            <span className="h-0.5 w-10 rounded-full bg-border" />
          </button>
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
                  className="rounded-md border border-border px-1.5 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-40"
                  onClick={() => {
                    if (resultFilterStepLoadingDirection === 'prev') {
                      cancelPendingBatchLoad();
                      return;
                    }

                    void navigateResultFilterByStep(-1);
                  }}
                  title={messages.prevMatch}
                  disabled={
                    !hasAppliedResultFilterKeyword ||
                    isResultFilterSearching ||
                    (isSearching && resultFilterStepLoadingDirection !== 'prev')
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {resultFilterStepLoadingDirection === 'prev' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )}
                    {messages.previous}
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-1.5 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-40"
                  onClick={() => {
                    if (resultFilterStepLoadingDirection === 'next') {
                      cancelPendingBatchLoad();
                      return;
                    }

                    void navigateResultFilterByStep(1);
                  }}
                  title={messages.nextMatch}
                  disabled={
                    !hasAppliedResultFilterKeyword ||
                    isResultFilterSearching ||
                    (isSearching && resultFilterStepLoadingDirection !== 'next')
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {resultFilterStepLoadingDirection === 'next' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {messages.next}
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-40"
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
                  cancelPendingBatchLoad();
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
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                onClick={() => {
                  void copyPlainTextResults();
                }}
                title={messages.copyResults}
                disabled={plainTextResultEntries.length === 0}
              >
                <Copy className="h-3.5 w-3.5" />
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
                onClick={() => {
                  cancelPendingBatchLoad();
                  setResultPanelState('closed');
                }}
                title={messages.closeResults}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={resultListRef}
            className="overflow-auto"
            style={{ maxHeight: `${resultPanelHeight}px` }}
            onScroll={handleResultListScroll}
          >
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
        <div ref={minimizedResultWrapperRef} className="pointer-events-none absolute bottom-6 right-2 z-[35]">
          <div
            className={cn(
              'pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-lg transition-colors'
            )}
          >
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
              onClick={() => {
                cancelPendingBatchLoad();
                setResultPanelState('closed');
              }}
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
