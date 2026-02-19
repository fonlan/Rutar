import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { ActivePanel, DiffLineKind } from './diffEditor.types';
import { cn } from '@/lib/utils';

interface DiffKindStyle {
  lineNumberClass: string;
  rowBackgroundClass: string;
  markerClass: string;
}

interface PairHighlightSegment {
  start: number;
  end: number;
  isPair: boolean;
}

interface DiffPanelViewProps {
  side: ActivePanel;
  panelWidthPx: number;
  isActive: boolean;
  hasTab: boolean;
  unavailableText: string;
  scrollerRef: (element: HTMLElement | null) => void;
  onScrollerContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  contentWidthPx: number;
  panelHeightPx: number;
  lineNumberColumnWidth: number;
  alignedLineCount: number;
  alignedDiffKindByLine: Map<number, DiffLineKind>;
  getDiffKindStyle: (kind: DiffLineKind) => DiffKindStyle;
  lines: string[];
  present: boolean[];
  lineNumbers: number[];
  searchCurrentRow: number | null;
  titlePrefix: string;
  rowHeightPx: number;
  fontFamily: string;
  fontSize: number;
  onLineNumberPointerDown: (
    side: ActivePanel,
    rowIndex: number,
    event: ReactPointerEvent<HTMLDivElement>
  ) => void;
  onLineNumberKeyDown: (
    side: ActivePanel,
    rowIndex: number,
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  panelText: string;
  onTextareaChange: (side: ActivePanel, nextText: string, selectionStart: number, selectionEnd: number) => void;
  onTextareaKeyDown: (side: ActivePanel, event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaCopy: (side: ActivePanel, event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  onPanelContextMenu: (side: ActivePanel, event: ReactMouseEvent<HTMLTextAreaElement>) => void;
  setActivePanel: (side: ActivePanel) => void;
  schedulePairHighlightSyncForSide: (side: ActivePanel, textarea: HTMLTextAreaElement) => void;
  onPanelInputBlur: () => void;
  clearPairHighlightsForSide: (side: ActivePanel) => void;
  updatePairHighlightsForSide: (side: ActivePanel, text: string, selectionStart: number, selectionEnd: number) => Promise<void>;
  pairHighlightRows: Map<number, number[]>;
  buildPairHighlightSegments: (lineTextLength: number, pairColumns: number[]) => PairHighlightSegment[];
  pairHighlightClass: string;
  onLineNumberContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function DiffPanelView({
  side,
  panelWidthPx,
  isActive,
  hasTab,
  unavailableText,
  scrollerRef,
  onScrollerContextMenu,
  contentWidthPx,
  panelHeightPx,
  lineNumberColumnWidth,
  alignedLineCount,
  alignedDiffKindByLine,
  getDiffKindStyle,
  lines,
  present,
  lineNumbers,
  searchCurrentRow,
  titlePrefix,
  rowHeightPx,
  fontFamily,
  fontSize,
  onLineNumberPointerDown,
  onLineNumberKeyDown,
  textareaRef,
  panelText,
  onTextareaChange,
  onTextareaKeyDown,
  onTextareaCopy,
  onPanelContextMenu,
  setActivePanel,
  schedulePairHighlightSyncForSide,
  onPanelInputBlur,
  clearPairHighlightsForSide,
  updatePairHighlightsForSide,
  pairHighlightRows,
  buildPairHighlightSegments,
  pairHighlightClass,
  onLineNumberContextMenu,
}: DiffPanelViewProps) {
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden',
        isActive && 'ring-1 ring-inset ring-blue-500/30'
      )}
      style={{ width: panelWidthPx }}
    >
      {hasTab ? (
        <div
          ref={scrollerRef}
          className="editor-scroll-stable h-full overflow-auto"
          onContextMenu={onScrollerContextMenu}
        >
          <div
            className="relative flex"
            style={{
              minWidth: `${contentWidthPx}px`,
              height: `${panelHeightPx}px`,
            }}
          >
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-border/40 bg-background"
              style={{ width: `${lineNumberColumnWidth}px` }}
              onContextMenu={onLineNumberContextMenu}
            >
              {Array.from({ length: alignedLineCount }).map((_, index) => {
                const diffKind = alignedDiffKindByLine.get(index + 1);
                const isDiffLine = Boolean(diffKind);
                const diffStyle = diffKind ? getDiffKindStyle(diffKind) : null;
                const linePresent = present[index] === true;
                const lineNumber = lineNumbers[index] ?? 0;
                const lineText = lines[index] ?? '';
                return (
                  <div
                    key={`${side}-ln-${index}`}
                    className={cn(
                      'border-b border-border/35 px-2 text-right text-xs text-muted-foreground select-none',
                      linePresent
                        && 'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      isDiffLine && diffStyle?.lineNumberClass,
                      searchCurrentRow === index
                        && 'bg-sky-400/22 text-sky-700 dark:bg-sky-300/20 dark:text-sky-200'
                    )}
                    onPointerDown={(event) => {
                      onLineNumberPointerDown(side, index, event);
                    }}
                    onKeyDown={(event) => {
                      onLineNumberKeyDown(side, index, event);
                    }}
                    role={linePresent ? 'button' : undefined}
                    tabIndex={linePresent ? 0 : -1}
                    aria-label={linePresent ? `${titlePrefix} ${lineNumber}` : undefined}
                    style={{
                      height: `${rowHeightPx}px`,
                      lineHeight: `${rowHeightPx}px`,
                      fontFamily,
                      fontSize: `${Math.max(10, fontSize - 2)}px`,
                    }}
                  >
                    {linePresent ? lineNumber : lineText.length > 0 ? '+' : ''}
                  </div>
                );
              })}
            </div>

            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-0 z-0">
                {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
                  const diffStyle = getDiffKindStyle(kind);
                  return (
                    <div
                      key={`${side}-diff-bg-${lineNumber}`}
                      className={cn('absolute left-0 right-0', diffStyle.rowBackgroundClass)}
                      style={{
                        top: `${(lineNumber - 1) * rowHeightPx}px`,
                        height: `${rowHeightPx}px`,
                      }}
                    />
                  );
                })}
                {searchCurrentRow !== null && (
                  <div
                    key={`${side}-search-current-bg-${searchCurrentRow}`}
                    className="absolute left-0 right-0 bg-sky-400/22 dark:bg-sky-300/20"
                    style={{
                      top: `${searchCurrentRow * rowHeightPx}px`,
                      height: `${rowHeightPx}px`,
                    }}
                  />
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={panelText}
                onChange={(event) => {
                  const target = event.currentTarget;
                  const selectionStart = target.selectionStart ?? target.value.length;
                  const selectionEnd = target.selectionEnd ?? target.value.length;
                  onTextareaChange(side, target.value, selectionStart, selectionEnd);
                  void updatePairHighlightsForSide(side, target.value, selectionStart, selectionEnd);
                }}
                onKeyDown={(event) => {
                  onTextareaKeyDown(side, event);
                }}
                onSelect={(event) => {
                  const target = event.currentTarget;
                  schedulePairHighlightSyncForSide(side, target);
                }}
                onCopy={(event) => {
                  onTextareaCopy(side, event);
                }}
                onContextMenu={(event) => {
                  onPanelContextMenu(side, event);
                }}
                onFocus={(event) => {
                  setActivePanel(side);
                  const target = event.currentTarget;
                  schedulePairHighlightSyncForSide(side, target);
                }}
                onBlur={() => {
                  onPanelInputBlur();
                  clearPairHighlightsForSide(side);
                }}
                data-diff-panel={side}
                className="relative z-10 block w-full resize-none border-0 bg-transparent px-2 outline-none"
                style={{
                  height: `${panelHeightPx}px`,
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: `${rowHeightPx}px`,
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                  tabSize: 4,
                }}
                spellCheck={false}
                wrap="off"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />

              {pairHighlightRows.size > 0 && (
                <div className="pointer-events-none absolute inset-0 z-[5]">
                  {Array.from(pairHighlightRows.entries()).map(([rowIndex, pairColumns]) => {
                    const lineText = lines[rowIndex] ?? '';
                    const segments = buildPairHighlightSegments(lineText.length, pairColumns);
                    if (segments.length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={`${side}-pair-highlight-row-${rowIndex}`}
                        className="absolute left-0 right-0 whitespace-pre px-2"
                        style={{
                          top: `${rowIndex * rowHeightPx}px`,
                          height: `${rowHeightPx}px`,
                          lineHeight: `${rowHeightPx}px`,
                          fontFamily,
                          fontSize: `${fontSize}px`,
                          color: 'transparent',
                        }}
                      >
                        {segments.map((segment, segmentIndex) => {
                          const part = lineText.slice(segment.start, segment.end);
                          if (!segment.isPair) {
                            return (
                              <span key={`${side}-pair-highlight-segment-${rowIndex}-${segmentIndex}`}>
                                {part}
                              </span>
                            );
                          }

                          return (
                            <mark
                              key={`${side}-pair-highlight-segment-${rowIndex}-${segmentIndex}`}
                              data-diff-pair-highlight={side}
                              className={`${pairHighlightClass} text-transparent`}
                            >
                              {part}
                            </mark>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-muted/10 text-xs text-muted-foreground">
          {unavailableText}
        </div>
      )}
    </div>
  );
}
