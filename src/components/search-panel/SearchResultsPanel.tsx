import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import type { SearchResultPanelState } from './types';

interface SearchResultsPanelProps {
  displayTotalFilterMatchedLineCountText: string;
  displayTotalMatchCountText: string;
  displayTotalMatchedLineCountText: string;
  errorMessage: string | null;
  filterMatchCount: number;
  filterRulesPayloadLength: number;
  hasAppliedResultFilterKeyword: boolean;
  hasMoreFilterMatches: boolean;
  hasMoreMatches: boolean;
  isFilterMode: boolean;
  isResultFilterActive: boolean;
  isResultFilterSearching: boolean;
  isSearching: boolean;
  keyword: string;
  matchCount: number;
  messages: ReturnType<typeof getSearchPanelMessages>;
  minimizedResultWrapperRef: RefObject<HTMLDivElement | null>;
  plainTextResultEntryCount: number;
  renderedResultItems: ReactNode;
  resultFilterKeyword: string;
  resultFilterStepLoadingDirection: 'prev' | 'next' | null;
  resultListRef: RefObject<HTMLDivElement | null>;
  resultPanelHeight: number;
  resultPanelState: SearchResultPanelState;
  resultPanelWrapperRef: RefObject<HTMLDivElement | null>;
  visibleFilterMatchCount: number;
  visibleMatchCount: number;
  onApplyResultFilter: () => void;
  onCancelPendingBatchLoad: () => void;
  onClearResultFilter: () => void;
  onClose: () => void;
  onCopy: () => void;
  onMinimize: () => void;
  onNavigateResultFilterNext: () => void;
  onNavigateResultFilterPrev: () => void;
  onOpenMinimized: () => void;
  onRefresh: () => void;
  onRequestStopResultFilterSearch: () => void;
  onResizeMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onResultFilterKeywordChange: (value: string) => void;
  onScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
}

export function SearchResultsPanel({
  displayTotalFilterMatchedLineCountText,
  displayTotalMatchCountText,
  displayTotalMatchedLineCountText,
  errorMessage,
  filterMatchCount,
  filterRulesPayloadLength,
  hasAppliedResultFilterKeyword,
  hasMoreFilterMatches,
  hasMoreMatches,
  isFilterMode,
  isResultFilterActive,
  isResultFilterSearching,
  isSearching,
  keyword,
  matchCount,
  messages,
  minimizedResultWrapperRef,
  plainTextResultEntryCount,
  renderedResultItems,
  resultFilterKeyword,
  resultFilterStepLoadingDirection,
  resultListRef,
  resultPanelHeight,
  resultPanelState,
  resultPanelWrapperRef,
  visibleFilterMatchCount,
  visibleMatchCount,
  onApplyResultFilter,
  onCancelPendingBatchLoad,
  onClearResultFilter,
  onClose,
  onCopy,
  onMinimize,
  onNavigateResultFilterNext,
  onNavigateResultFilterPrev,
  onOpenMinimized,
  onRefresh,
  onRequestStopResultFilterSearch,
  onResizeMouseDown,
  onResultFilterKeywordChange,
  onScroll,
}: SearchResultsPanelProps) {
  const isResultPanelMinimized = resultPanelState === 'minimized';

  return (
    <>
      {resultPanelState !== 'closed' && (
        <div ref={resultPanelWrapperRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-[35] px-2 pb-2">
          <div
            className={cn(
              'pointer-events-auto rounded-lg border border-border shadow-2xl transition-colors',
              'bg-background',
              resultPanelState === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <button
              type="button"
              className="flex h-2 w-full cursor-row-resize items-center justify-center rounded-t-lg text-muted-foreground/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onMouseDown={onResizeMouseDown}
              title="Resize results panel"
              aria-label="Resize results panel"
            >
              <span className="h-0.5 w-10 rounded-full bg-border" />
            </button>
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="shrink-0 text-xs font-medium text-foreground">
                  {isFilterMode
                    ? messages.filterResultsSummary(displayTotalFilterMatchedLineCountText, visibleFilterMatchCount)
                    : messages.resultsSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, visibleMatchCount)}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-input bg-background px-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={resultFilterKeyword}
                    onChange={(event) => onResultFilterKeywordChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onApplyResultFilter();
                      }
                    }}
                    placeholder={messages.resultFilterPlaceholder}
                    aria-label={messages.resultFilterPlaceholder}
                    name="result-filter-keyword"
                    autoComplete="off"
                    className="h-7 min-w-0 flex-1 bg-transparent pr-6 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  {resultFilterKeyword && (
                    <button
                      type="button"
                      className="-ml-5 mr-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={onClearResultFilter}
                      title={messages.clearResultFilter}
                      aria-label={messages.clearResultFilter}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-md border border-border px-1.5 py-1 text-[11px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
                    onClick={onNavigateResultFilterPrev}
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
                    className="rounded-md border border-border px-1.5 py-1 text-[11px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
                    onClick={onNavigateResultFilterNext}
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
                    className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
                    onClick={() => {
                      if (isResultFilterSearching) {
                        onRequestStopResultFilterSearch();
                        return;
                      }

                      onApplyResultFilter();
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
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={onRefresh}
                  title={isFilterMode ? messages.refreshFilterResults : messages.refreshResults}
                  aria-label={isFilterMode ? messages.refreshFilterResults : messages.refreshResults}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onClick={onCopy}
                  title={messages.copyResults}
                  aria-label={messages.copyResults}
                  disabled={plainTextResultEntryCount === 0}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={onMinimize}
                  title={messages.minimizeResults}
                  aria-label={messages.minimizeResults}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={onClose}
                  title={messages.closeResults}
                  aria-label={messages.closeResults}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div
              ref={resultListRef}
              className="overflow-auto"
              style={{ maxHeight: `${resultPanelHeight}px` }}
              onScroll={onScroll}
            >
              {isFilterMode ? (
                <>
                  {filterRulesPayloadLength === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.filterResultsEmptyHint}</div>
                  )}

                  {filterRulesPayloadLength > 0 && filterMatchCount === 0 && !isSearching && !errorMessage && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.noFilterMatchesHint}</div>
                  )}

                  {filterRulesPayloadLength > 0 &&
                    filterMatchCount > 0 &&
                    visibleFilterMatchCount === 0 &&
                    isResultFilterActive && (
                      <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultFilterNoMatches}</div>
                    )}
                </>
              ) : (
                <>
                  {!keyword && <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultsEmptyHint}</div>}

                  {!!keyword && matchCount === 0 && !isSearching && !errorMessage && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.noMatchesHint}</div>
                  )}

                  {!!keyword && matchCount > 0 && visibleMatchCount === 0 && isResultFilterActive && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">{messages.resultFilterNoMatches}</div>
                  )}
                </>
              )}

              {renderedResultItems}

              {(isFilterMode ? visibleFilterMatchCount > 0 : !!keyword && visibleMatchCount > 0) && (
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
          <div className={cn('pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-lg transition-colors')}>
            <span className="text-muted-foreground">
              {isFilterMode
                ? messages.filterMinimizedSummary(displayTotalFilterMatchedLineCountText, filterMatchCount)
                : messages.minimizedSummary(displayTotalMatchCountText, displayTotalMatchedLineCountText, matchCount)}
            </span>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={onOpenMinimized}
              title={isFilterMode ? messages.openFilterResults : messages.openResults}
              aria-label={isFilterMode ? messages.openFilterResults : messages.openResults}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => {
                onCancelPendingBatchLoad();
                onClose();
              }}
              title={messages.closeResults}
              aria-label={messages.closeResults}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
