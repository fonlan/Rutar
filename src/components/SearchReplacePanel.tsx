import { invoke } from '@tauri-apps/api/core';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

const MAX_LINE_RANGE = 2147483647;

type SearchMode = 'literal' | 'regex' | 'wildcard';
type SearchOpenMode = 'find' | 'replace';
type SearchResultPanelState = 'closed' | 'minimized' | 'open';

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

interface SearchChunkBackendResult {
  matches: SearchMatch[];
  documentVersion: number;
  nextOffset: number | null;
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

const SEARCH_CHUNK_SIZE = 300;
const SEARCH_SIDEBAR_WIDTH = 'min(90vw, 360px)';

function getSearchMessages(language: 'zh-CN' | 'en-US') {
  if (language === 'en-US') {
    return {
      counting: 'Counting…',
      invalidRegex: 'Invalid regular expression',
      searchFailed: 'Search failed',
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
      find: 'Find',
      replace: 'Replace',
      switchToReplaceMode: 'Switch to replace mode',
      noFileOpen: 'No file opened',
      close: 'Close',
      findPlaceholder: 'Find text',
      collapseResults: 'Collapse search results',
      expandResults: 'Expand search results',
      results: 'Results',
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
      refreshResults: 'Refresh search results',
      minimizeResults: 'Minimize search results',
      closeResults: 'Close search results',
      resultsEmptyHint: 'Enter a keyword to list all matches here.',
      noMatchesHint: 'No matches found.',
      loadingMore: 'Loading more results...',
      scrollToLoadMore: 'Scroll to bottom to load more',
      loadedAll: (totalMatchesText: string) => `All results loaded (${totalMatchesText})`,
      minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
        `Results ${totalMatchesText} / ${totalLinesText} lines · Loaded ${loaded}`,
      openResults: 'Open search results',
    };
  }

  return {
    counting: '统计中…',
    invalidRegex: '正则表达式无效',
    searchFailed: '搜索失败',
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
    find: '查找',
    replace: '替换',
    switchToReplaceMode: '切换到替换模式',
    noFileOpen: '没有打开的文件',
    close: '关闭',
    findPlaceholder: '查找内容',
    collapseResults: '收起搜索结果',
    expandResults: '展开搜索结果',
    results: '结果',
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
    refreshResults: '刷新搜索结果',
    minimizeResults: '最小化搜索结果',
    closeResults: '关闭搜索结果',
    resultsEmptyHint: '输入关键词后会在这里列出全部匹配项。',
    noMatchesHint: '没有找到任何匹配项。',
    loadingMore: '正在加载更多结果...',
    scrollToLoadMore: '滚动到底部自动加载更多结果',
    loadedAll: (totalMatchesText: string) => `已加载全部搜索结果（共 ${totalMatchesText} 处）`,
    minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
      `结果 总计${totalMatchesText}处 / ${totalLinesText}行 · 已加载${loaded}处`,
    openResults: '展开搜索结果',
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

export function SearchReplacePanel() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const updateTab = useStore((state) => state.updateTab);
  const language = useStore((state) => state.settings.language);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const messages = useMemo(
    () => getSearchMessages(language === 'en-US' ? 'en-US' : 'zh-CN'),
    [language]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [reverseSearch, setReverseSearch] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null);
  const [totalMatchedLineCount, setTotalMatchedLineCount] = useState<number | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [resultPanelState, setResultPanelState] = useState<SearchResultPanelState>('closed');
  const [isSearching, setIsSearching] = useState(false);
  const [searchSidebarTopOffset, setSearchSidebarTopOffset] = useState('0px');
  const [searchSidebarBottomOffset, setSearchSidebarBottomOffset] = useState('0px');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);
  const resultPanelWrapperRef = useRef<HTMLDivElement>(null);
  const minimizedResultWrapperRef = useRef<HTMLDivElement>(null);
  const runVersionRef = useRef(0);
  const countRunVersionRef = useRef(0);
  const currentMatchIndexRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const loadMoreDebounceRef = useRef<number | null>(null);
  const chunkCursorRef = useRef<number | null>(null);
  const searchParamsRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    documentVersion: number;
  } | null>(null);
  const cachedSearchRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    documentVersion: number;
    matches: SearchMatch[];
    nextOffset: number | null;
  } | null>(null);
  const countCacheRef = useRef<{
    tabId: string;
    keyword: string;
    searchMode: SearchMode;
    caseSensitive: boolean;
    documentVersion: number;
    totalMatches: number;
    matchedLines: number;
  } | null>(null);

  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex]);

  const executeCountSearch = useCallback(async (forceRefresh = false) => {
    if (!activeTab || !keyword) {
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
        cached.caseSensitive === caseSensitive
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
  }, [activeTab, caseSensitive, keyword, searchMode]);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const executeSearch = useCallback(async (forceRefresh = false, silent = false): Promise<SearchRunResult | null> => {
    if (!activeTab) {
      return null;
    }

    if (!keyword) {
      setErrorMessage(null);
      setMatches([]);
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
      setCurrentMatchIndex(0);
      setIsSearching(false);
      cachedSearchRef.current = null;
      chunkCursorRef.current = null;
      searchParamsRef.current = null;
      countCacheRef.current = null;
      return {
        matches: [],
        documentVersion: 0,
        errorMessage: null,
        nextOffset: null,
      };
    }

    void executeCountSearch(forceRefresh);

    if (!forceRefresh) {
      const cached = cachedSearchRef.current;
      if (
        cached &&
        cached.tabId === activeTab.id &&
        cached.keyword === keyword &&
        cached.searchMode === searchMode &&
        cached.caseSensitive === caseSensitive
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
      setMatches([]);
      setCurrentMatchIndex(0);
      cachedSearchRef.current = null;
      chunkCursorRef.current = null;
      searchParamsRef.current = null;
      countCacheRef.current = null;
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);

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
  }, [activeTab, caseSensitive, executeCountSearch, keyword, messages.searchFailed, searchMode]);

  const loadMoreMatches = useCallback(async (): Promise<SearchMatch[] | null> => {
    if (loadMoreLockRef.current) {
      return null;
    }

    if (!activeTab) {
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
      params.caseSensitive !== caseSensitive
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
  }, [activeTab, caseSensitive, keyword, messages.searchFailed, searchMode]);

  const ensureAllMatchesLoaded = useCallback(async (): Promise<SearchMatch[]> => {
    let previousCursor = chunkCursorRef.current;
    while (chunkCursorRef.current !== null) {
      const appended = await loadMoreMatches();
      if (appended === null) {
        break;
      }

      if (chunkCursorRef.current === previousCursor) {
        break;
      }

      previousCursor = chunkCursorRef.current;
    }

    return cachedSearchRef.current?.matches ?? [];
  }, [loadMoreMatches]);

  const executeFirstMatchSearch = useCallback(async (reverse: boolean): Promise<SearchRunResult | null> => {
    if (!activeTab || !keyword) {
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
        startTransition(() => {
          setMatches([]);
          setCurrentMatchIndex(0);
        });

        cachedSearchRef.current = {
          tabId: activeTab.id,
          keyword,
          searchMode,
          caseSensitive,
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
        documentVersion,
      };

      void (async () => {
        const chunkResult = await executeSearch(true, false);
        if (!chunkResult) {
          return;
        }
        await ensureAllMatchesLoaded();
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
      setMatches([]);
      setCurrentMatchIndex(0);
      cachedSearchRef.current = null;
      chunkCursorRef.current = null;
      searchParamsRef.current = null;
      countCacheRef.current = null;
      setTotalMatchCount(null);
      setTotalMatchedLineCount(null);
      setIsSearching(false);

      return {
        matches: [],
        documentVersion: 0,
        errorMessage: readableError,
        nextOffset: null,
      };
    }
  }, [activeTab, caseSensitive, ensureAllMatchesLoaded, executeSearch, keyword, messages.searchFailed, searchMode]);

  const navigateToMatch = useCallback(
    (targetMatch: SearchMatch) => {
      if (!activeTab) {
        return;
      }

      dispatchNavigateToMatch(activeTab.id, targetMatch);
    },
    [activeTab]
  );

  const hasMoreMatches = chunkCursorRef.current !== null;

  const handleResultListScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!isOpen || resultPanelState !== 'open') {
        return;
      }

      if (!keyword || !hasMoreMatches || isSearching || loadMoreLockRef.current) {
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
        void loadMoreMatches();
      }, 40);
    },
    [hasMoreMatches, isOpen, isSearching, keyword, loadMoreMatches, resultPanelState]
  );

  const navigateByStep = useCallback(
    async (step: number) => {
      if (keyword && matches.length > 0 && !isSearching) {
        const boundedCurrentIndex = Math.min(currentMatchIndexRef.current, matches.length - 1);
        const candidateIndex = boundedCurrentIndex + step;

        if (candidateIndex < 0 && chunkCursorRef.current !== null) {
          const allMatches = await ensureAllMatchesLoaded();
          if (allMatches.length > 0) {
            const lastIndex = allMatches.length - 1;
            setCurrentMatchIndex(lastIndex);
            setFeedbackMessage(null);
            navigateToMatch(allMatches[lastIndex]);
            return;
          }
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

      if (step < 0 && searchResult.nextOffset !== null) {
        const allMatches = await ensureAllMatchesLoaded();
        if (allMatches.length > 0) {
          const lastIndex = allMatches.length - 1;
          setCurrentMatchIndex(lastIndex);
          navigateToMatch(allMatches[lastIndex]);
        }
      }
    },
    [ensureAllMatchesLoaded, executeFirstMatchSearch, isSearching, keyword, loadMoreMatches, matches, navigateToMatch]
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
        const primaryStep = reverseSearch ? -1 : 1;
        const step = event.shiftKey ? -primaryStep : primaryStep;
        void navigateByStep(step);
      }
    },
    [navigateByStep, reverseSearch]
  );

  const handleSelectMatch = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= matches.length) {
        return;
      }

      setCurrentMatchIndex(targetIndex);
      setFeedbackMessage(null);
      navigateToMatch(matches[targetIndex]);
    },
    [matches, navigateToMatch]
  );

  useEffect(() => {
    if (!activeTab) {
      setIsOpen(false);
      setMatches([]);
      setCurrentMatchIndex(0);
      setErrorMessage(null);
      return;
    }

    const handleSearchOpen = (event: Event) => {
      const customEvent = event as CustomEvent<SearchOpenEventDetail>;
      const openMode = customEvent.detail?.mode;
      const shouldOpenReplace = openMode === 'replace';

      setIsOpen(true);
      setIsReplaceMode(shouldOpenReplace);
      setResultPanelState('closed');
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
    cachedSearchRef.current = null;
    countCacheRef.current = null;
    chunkCursorRef.current = null;
    searchParamsRef.current = null;
    setTotalMatchCount(null);
    setTotalMatchedLineCount(null);
  }, [activeTab?.id]);

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

    if (!keyword || matches.length === 0 || !hasMoreMatches || isSearching) {
      return;
    }

    let cancelled = false;

    const fillVisibleResultViewport = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (cancelled || !hasMoreMatches || isSearching || loadMoreLockRef.current) {
          return;
        }

        const container = resultListRef.current;
        if (!container) {
          return;
        }

        if (container.scrollHeight > container.clientHeight + 1) {
          return;
        }

        const appended = await loadMoreMatches();
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
  }, [hasMoreMatches, isSearching, keyword, loadMoreMatches, matches.length, resultPanelState]);

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

      if (!keyword) {
        if (!isOpen) {
          setIsOpen(true);
          focusSearchInput();
        }
        return;
      }

      const primaryStep = reverseSearch ? -1 : 1;
      const step = event.shiftKey ? -primaryStep : primaryStep;
      void navigateByStep(step);
    };

    window.addEventListener('keydown', handleFindNextShortcuts);
    return () => {
      window.removeEventListener('keydown', handleFindNextShortcuts);
    };
  }, [activeTab, focusSearchInput, isOpen, keyword, navigateByStep, reverseSearch]);

  const displayTotalMatchCount = totalMatchCount;
  const displayTotalMatchedLineCount = totalMatchedLineCount;
  const displayTotalMatchCountText =
    displayTotalMatchCount === null ? messages.counting : `${displayTotalMatchCount}`;
  const displayTotalMatchedLineCountText =
    displayTotalMatchedLineCount === null ? messages.counting : `${displayTotalMatchedLineCount}`;

  const renderedResultItems = useMemo(() => {
    if (resultPanelState !== 'open' || !keyword || matches.length === 0) {
      return null;
    }

    return matches.map((match, index) => {
      const isActive = index === Math.min(currentMatchIndex, matches.length - 1);

      return (
        <button
          key={`${match.start}-${match.end}-${index}`}
          type="button"
          className={cn(
            'flex w-full items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
            isActive ? 'bg-primary/12' : 'hover:bg-muted/50'
          )}
          title={messages.lineColTitle(match.line, match.column)}
          onClick={() => handleSelectMatch(index)}
        >
          <span className="w-16 shrink-0 border-r border-border/70 pr-2 text-right font-mono text-[11px] text-muted-foreground">
            {match.line}
          </span>
          <span className="min-w-0 flex-1 pl-2 font-mono text-xs text-foreground whitespace-pre overflow-hidden text-ellipsis">
            {renderMatchPreview(match)}
          </span>
          {isActive ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        </button>
      );
    });
  }, [currentMatchIndex, handleSelectMatch, keyword, matches, resultPanelState]);

  const statusText = useMemo(() => {
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
  }, [currentMatchIndex, displayTotalMatchCount, errorMessage, isSearching, keyword, matches.length, messages]);

  const canReplace = !!activeTab;
  const isResultPanelOpen = resultPanelState === 'open';
  const isResultPanelMinimized = resultPanelState === 'minimized';

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
                  !isReplaceMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  setIsReplaceMode(false);
                  focusSearchInput();
                }}
              >
                {messages.find}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors disabled:opacity-50',
                  isReplaceMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => {
                  setIsReplaceMode(true);
                  focusSearchInput();
                }}
                disabled={!canReplace}
                title={canReplace ? messages.switchToReplaceMode : messages.noFileOpen}
              >
                {messages.replace}
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

          <div className="mt-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setFeedbackMessage(null);
                setErrorMessage(null);
                setMatches([]);
                setTotalMatchCount(null);
                setTotalMatchedLineCount(null);
                setCurrentMatchIndex(0);
                cachedSearchRef.current = null;
                countCacheRef.current = null;
                chunkCursorRef.current = null;
                searchParamsRef.current = null;
              }}
              onKeyDown={handleKeywordKeyDown}
              placeholder={messages.findPlaceholder}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition-colors',
                resultPanelState !== 'closed'
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
              onClick={() => {
                setResultPanelState((previous) => {
                  if (previous === 'open') {
                    return 'minimized';
                  }
                  return 'open';
                });

                if (keyword && !isSearching) {
                  void executeSearch();
                }
              }}
              title={isResultPanelOpen ? messages.collapseResults : messages.expandResults}
            >
              {isResultPanelOpen ? messages.collapse : messages.results}
            </button>
          </div>

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

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModeButton
              active={searchMode === 'literal'}
              label={messages.modeLiteral}
              onClick={() => {
                setSearchMode('literal');
                setErrorMessage(null);
                setMatches([]);
                setTotalMatchCount(null);
                setTotalMatchedLineCount(null);
                setCurrentMatchIndex(0);
                cachedSearchRef.current = null;
                countCacheRef.current = null;
                chunkCursorRef.current = null;
                searchParamsRef.current = null;
              }}
            />
            <ModeButton
              active={searchMode === 'regex'}
              label={messages.modeRegex}
              onClick={() => {
                setSearchMode('regex');
                setErrorMessage(null);
                setMatches([]);
                setTotalMatchCount(null);
                setTotalMatchedLineCount(null);
                setCurrentMatchIndex(0);
                cachedSearchRef.current = null;
                countCacheRef.current = null;
                chunkCursorRef.current = null;
                searchParamsRef.current = null;
              }}
            />
            <ModeButton
              active={searchMode === 'wildcard'}
              label={messages.modeWildcard}
              onClick={() => {
                setSearchMode('wildcard');
                setErrorMessage(null);
                setMatches([]);
                setTotalMatchCount(null);
                setTotalMatchedLineCount(null);
                setCurrentMatchIndex(0);
                cachedSearchRef.current = null;
                countCacheRef.current = null;
                chunkCursorRef.current = null;
                searchParamsRef.current = null;
              }}
            />

            <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(event) => {
                  setCaseSensitive(event.target.checked);
                  setErrorMessage(null);
                  setMatches([]);
                  setTotalMatchCount(null);
                  setTotalMatchedLineCount(null);
                  setCurrentMatchIndex(0);
                  cachedSearchRef.current = null;
                  countCacheRef.current = null;
                  chunkCursorRef.current = null;
                  searchParamsRef.current = null;
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

            <button
              type="button"
              className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
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

            {isReplaceMode && (
              <>
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
              </>
            )}
          </div>

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
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-xs font-medium text-foreground">
              {messages.resultsSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, matches.length)}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => void executeSearch(true)}
                title={messages.refreshResults}
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
            {!keyword && (
              <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultsEmptyHint}</div>
            )}

            {!!keyword && matches.length === 0 && !isSearching && !errorMessage && (
              <div className="px-3 py-4 text-xs text-muted-foreground">{messages.noMatchesHint}</div>
            )}

            {renderedResultItems}

            {!!keyword && matches.length > 0 && (
              <div className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                {isSearching
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
            <span className="text-muted-foreground">{messages.minimizedSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, matches.length)}</span>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setResultPanelState('open');

                if (keyword && !isSearching) {
                  void executeSearch();
                }
              }}
              title={messages.openResults}
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
