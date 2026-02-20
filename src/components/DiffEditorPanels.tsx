import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import type { ActivePanel, DiffLineKind } from './diffEditor.types';
import { DiffPanelView } from './DiffPanelView';
import { getDiffKindStyle } from './diffEditor.utils';

interface DiffEditorPanelsProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  leftWidthPx: number;
  rightWidthPx: number;
  separatorLeftPx: number;
  splitterWidthPx: number;
  activePanel: ActivePanel;
  sourceTabExists: boolean;
  targetTabExists: boolean;
  sourceUnavailableLabel: string;
  targetUnavailableLabel: string;
  handleSourceScrollerRef: (element: HTMLElement | null) => void;
  handleTargetScrollerRef: (element: HTMLElement | null) => void;
  handleScrollerContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  sourceContentWidthPx: number;
  targetContentWidthPx: number;
  sourcePanelHeightPx: number;
  targetPanelHeightPx: number;
  lineNumberColumnWidth: number;
  alignedLineCount: number;
  alignedDiffKindByLine: Map<number, DiffLineKind>;
  sourceLines: string[];
  targetLines: string[];
  sourcePresent: boolean[];
  targetPresent: boolean[];
  sourceLineNumbers: number[];
  targetLineNumbers: number[];
  sourceSearchCurrentRow: number | null;
  targetSearchCurrentRow: number | null;
  sourceTitlePrefix: string;
  targetTitlePrefix: string;
  rowHeightPx: number;
  fontFamily: string;
  fontSize: number;
  handleLineNumberPointerDown: (
    side: ActivePanel,
    rowIndex: number,
    event: ReactPointerEvent<HTMLDivElement>
  ) => void;
  handleLineNumberKeyDown: (
    side: ActivePanel,
    rowIndex: number,
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => void;
  sourceTextareaRef: RefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: RefObject<HTMLTextAreaElement | null>;
  sourcePanelText: string;
  targetPanelText: string;
  handlePanelTextareaChange: (
    side: ActivePanel,
    nextText: string,
    selectionStart: number,
    selectionEnd: number
  ) => void;
  handlePanelTextareaKeyDown: (side: ActivePanel, event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  handlePanelTextareaCopy: (side: ActivePanel, event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  handlePanelContextMenu: (side: ActivePanel, event: ReactMouseEvent<HTMLTextAreaElement>) => void;
  setActivePanel: (side: ActivePanel) => void;
  schedulePairHighlightSyncForSide: (side: ActivePanel, textarea: HTMLTextAreaElement) => void;
  handlePanelInputBlur: () => void;
  clearPairHighlightsForSide: (side: ActivePanel) => void;
  updatePairHighlightsForSide: (
    side: ActivePanel,
    text: string,
    selectionStart: number,
    selectionEnd: number
  ) => Promise<void>;
  sourcePairHighlightRows: Map<number, number[]>;
  targetPairHighlightRows: Map<number, number[]>;
  buildPairHighlightSegments: (
    lineTextLength: number,
    pairColumns: number[]
  ) => Array<{ start: number; end: number; isPair: boolean }>;
  pairHighlightClass: string;
  handleLineNumberContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  shadowTopPercent: number;
  shadowBottomPercent: number;
  handleSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleSplitterContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  resizePanelsAriaLabel: string;
}

export function DiffEditorPanels({
  viewportRef,
  leftWidthPx,
  rightWidthPx,
  separatorLeftPx,
  splitterWidthPx,
  activePanel,
  sourceTabExists,
  targetTabExists,
  sourceUnavailableLabel,
  targetUnavailableLabel,
  handleSourceScrollerRef,
  handleTargetScrollerRef,
  handleScrollerContextMenu,
  sourceContentWidthPx,
  targetContentWidthPx,
  sourcePanelHeightPx,
  targetPanelHeightPx,
  lineNumberColumnWidth,
  alignedLineCount,
  alignedDiffKindByLine,
  sourceLines,
  targetLines,
  sourcePresent,
  targetPresent,
  sourceLineNumbers,
  targetLineNumbers,
  sourceSearchCurrentRow,
  targetSearchCurrentRow,
  sourceTitlePrefix,
  targetTitlePrefix,
  rowHeightPx,
  fontFamily,
  fontSize,
  handleLineNumberPointerDown,
  handleLineNumberKeyDown,
  sourceTextareaRef,
  targetTextareaRef,
  sourcePanelText,
  targetPanelText,
  handlePanelTextareaChange,
  handlePanelTextareaKeyDown,
  handlePanelTextareaCopy,
  handlePanelContextMenu,
  setActivePanel,
  schedulePairHighlightSyncForSide,
  handlePanelInputBlur,
  clearPairHighlightsForSide,
  updatePairHighlightsForSide,
  sourcePairHighlightRows,
  targetPairHighlightRows,
  buildPairHighlightSegments,
  pairHighlightClass,
  handleLineNumberContextMenu,
  shadowTopPercent,
  shadowBottomPercent,
  handleSplitterPointerDown,
  handleSplitterContextMenu,
  resizePanelsAriaLabel,
}: DiffEditorPanelsProps) {
  return (
    <div ref={viewportRef} className="relative h-[calc(100%-2.5rem)] w-full overflow-hidden">
      <div className="absolute inset-0 flex">
        <DiffPanelView
          side="source"
          panelWidthPx={leftWidthPx}
          isActive={activePanel === 'source'}
          hasTab={sourceTabExists}
          unavailableText={sourceUnavailableLabel}
          scrollerRef={handleSourceScrollerRef}
          onScrollerContextMenu={handleScrollerContextMenu}
          contentWidthPx={sourceContentWidthPx}
          panelHeightPx={sourcePanelHeightPx}
          lineNumberColumnWidth={lineNumberColumnWidth}
          alignedLineCount={alignedLineCount}
          alignedDiffKindByLine={alignedDiffKindByLine}
          getDiffKindStyle={getDiffKindStyle}
          lines={sourceLines}
          present={sourcePresent}
          lineNumbers={sourceLineNumbers}
          searchCurrentRow={sourceSearchCurrentRow}
          titlePrefix={sourceTitlePrefix}
          rowHeightPx={rowHeightPx}
          fontFamily={fontFamily}
          fontSize={fontSize}
          onLineNumberPointerDown={handleLineNumberPointerDown}
          onLineNumberKeyDown={handleLineNumberKeyDown}
          textareaRef={sourceTextareaRef}
          panelText={sourcePanelText}
          onTextareaChange={handlePanelTextareaChange}
          onTextareaKeyDown={handlePanelTextareaKeyDown}
          onTextareaCopy={handlePanelTextareaCopy}
          onPanelContextMenu={handlePanelContextMenu}
          setActivePanel={setActivePanel}
          schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
          onPanelInputBlur={handlePanelInputBlur}
          clearPairHighlightsForSide={clearPairHighlightsForSide}
          updatePairHighlightsForSide={updatePairHighlightsForSide}
          pairHighlightRows={sourcePairHighlightRows}
          buildPairHighlightSegments={buildPairHighlightSegments}
          pairHighlightClass={pairHighlightClass}
          onLineNumberContextMenu={handleLineNumberContextMenu}
        />

        <div
          className="border-x border-border/70 bg-muted/30"
          style={{ width: splitterWidthPx }}
          aria-hidden="true"
        />

        <DiffPanelView
          side="target"
          panelWidthPx={rightWidthPx}
          isActive={activePanel === 'target'}
          hasTab={targetTabExists}
          unavailableText={targetUnavailableLabel}
          scrollerRef={handleTargetScrollerRef}
          onScrollerContextMenu={handleScrollerContextMenu}
          contentWidthPx={targetContentWidthPx}
          panelHeightPx={targetPanelHeightPx}
          lineNumberColumnWidth={lineNumberColumnWidth}
          alignedLineCount={alignedLineCount}
          alignedDiffKindByLine={alignedDiffKindByLine}
          getDiffKindStyle={getDiffKindStyle}
          lines={targetLines}
          present={targetPresent}
          lineNumbers={targetLineNumbers}
          searchCurrentRow={targetSearchCurrentRow}
          titlePrefix={targetTitlePrefix}
          rowHeightPx={rowHeightPx}
          fontFamily={fontFamily}
          fontSize={fontSize}
          onLineNumberPointerDown={handleLineNumberPointerDown}
          onLineNumberKeyDown={handleLineNumberKeyDown}
          textareaRef={targetTextareaRef}
          panelText={targetPanelText}
          onTextareaChange={handlePanelTextareaChange}
          onTextareaKeyDown={handlePanelTextareaKeyDown}
          onTextareaCopy={handlePanelTextareaCopy}
          onPanelContextMenu={handlePanelContextMenu}
          setActivePanel={setActivePanel}
          schedulePairHighlightSyncForSide={schedulePairHighlightSyncForSide}
          onPanelInputBlur={handlePanelInputBlur}
          clearPairHighlightsForSide={clearPairHighlightsForSide}
          updatePairHighlightsForSide={updatePairHighlightsForSide}
          pairHighlightRows={targetPairHighlightRows}
          buildPairHighlightSegments={buildPairHighlightSegments}
          pairHighlightClass={pairHighlightClass}
          onLineNumberContextMenu={handleLineNumberContextMenu}
        />
      </div>

      <div
        className="pointer-events-none absolute top-0 bottom-0"
        style={{ left: separatorLeftPx, width: splitterWidthPx }}
        aria-hidden="true"
      >
        <div
          className="absolute left-0 right-0 bg-sky-400/20 dark:bg-sky-300/20"
          style={{
            top: `${shadowTopPercent}%`,
            height: `${Math.max(1, shadowBottomPercent - shadowTopPercent)}%`,
            zIndex: 10,
          }}
        />

        {Array.from(alignedDiffKindByLine.entries()).map(([lineNumber, kind]) => {
          const diffStyle = getDiffKindStyle(kind);
          return (
            <div
              key={`diff-marker-${lineNumber}`}
              className={cn('absolute left-0 right-0 h-[2px]', diffStyle.markerClass)}
              style={{
                top: `${(lineNumber / alignedLineCount) * 100}%`,
                zIndex: 20,
              }}
            />
          );
        })}
      </div>

      <div
        className="absolute top-0 bottom-0 z-30 cursor-col-resize"
        style={{ left: separatorLeftPx, width: splitterWidthPx }}
        onPointerDown={handleSplitterPointerDown}
        onContextMenu={handleSplitterContextMenu}
        role="separator"
        aria-orientation="vertical"
        aria-label={resizePanelsAriaLabel}
      >
        <div className="mx-auto h-full w-px bg-border/90 shadow-[0_0_8px_rgba(0,0,0,0.18)]" />
      </div>
    </div>
  );
}
