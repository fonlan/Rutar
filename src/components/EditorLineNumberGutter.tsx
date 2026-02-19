import type { MutableRefObject, MouseEvent, WheelEvent } from 'react';
import { VariableSizeList as List } from 'react-window';

interface EditorLineNumberGutterProps {
  visible: boolean;
  width: number;
  height: number;
  tabLineCount: number;
  lineNumberColumnWidthPx: number;
  lineNumberVirtualItemCount: number;
  itemSize: number;
  lineHeightPx: number;
  lineNumberFontSizePx: number;
  fontFamily: string;
  lineNumberListRef: MutableRefObject<any>;
  diffHighlightLineSet: Set<number>;
  bookmarks: number[];
  lineNumberMultiSelectionSet: Set<number>;
  getLineNumberListItemSize: (index: number) => number;
  getLineNumberFromGutterElement: (element: HTMLDivElement, lineNumber: number) => number;
  onLineNumberWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onLineNumberDoubleClick: (lineNumber: number) => void;
  onLineNumberClick: (lineNumber: number, shiftKey: boolean, multiSelect: boolean) => void;
  onLineNumberContextMenu: (event: MouseEvent<HTMLDivElement>, lineNumber: number) => void;
}

export function EditorLineNumberGutter({
  visible,
  width,
  height,
  tabLineCount,
  lineNumberColumnWidthPx,
  lineNumberVirtualItemCount,
  itemSize,
  lineHeightPx,
  lineNumberFontSizePx,
  fontFamily,
  lineNumberListRef,
  diffHighlightLineSet,
  bookmarks,
  lineNumberMultiSelectionSet,
  getLineNumberListItemSize,
  getLineNumberFromGutterElement,
  onLineNumberWheel,
  onLineNumberDoubleClick,
  onLineNumberClick,
  onLineNumberContextMenu,
}: EditorLineNumberGutterProps) {
  if (!visible || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-30 border-r border-border/50 bg-background"
      style={{ width: `${lineNumberColumnWidthPx}px` }}
      onWheel={onLineNumberWheel}
    >
      <List
        ref={lineNumberListRef}
        height={height}
        width={lineNumberColumnWidthPx}
        itemCount={lineNumberVirtualItemCount}
        itemSize={getLineNumberListItemSize}
        estimatedItemSize={itemSize}
        overscanCount={20}
        style={{
          overflowX: 'hidden',
          overflowY: 'hidden',
        }}
      >
        {({ index, style }) => {
          if (index >= tabLineCount) {
            return (
              <div
                data-testid="line-number-bottom-spacer"
                aria-hidden
                style={style}
                className="pointer-events-none select-none"
              />
            );
          }

          return (
            <div
              style={{
                ...style,
                fontFamily,
                fontSize: `${lineNumberFontSizePx}px`,
                lineHeight: `${lineHeightPx}px`,
              }}
              className={`flex h-full items-start justify-end px-2 text-right transition-colors ${
                diffHighlightLineSet.has(index + 1)
                  ? 'text-red-600 dark:text-red-300 font-semibold'
                  : bookmarks.includes(index + 1)
                  ? 'text-amber-500/90 font-semibold'
                  : lineNumberMultiSelectionSet.has(index + 1)
                  ? 'text-blue-600 dark:text-blue-300 font-semibold'
                  : 'text-muted-foreground/45'
              } pointer-events-auto cursor-pointer select-none`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);

                if (event.detail === 2) {
                  onLineNumberDoubleClick(lineNumber);
                  return;
                }

                onLineNumberClick(lineNumber, event.shiftKey, event.ctrlKey || event.metaKey);
              }}
              onContextMenu={(event) => {
                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);
                onLineNumberContextMenu(event, lineNumber);
              }}
            >
              {index + 1}
            </div>
          );
        }}
      </List>
    </div>
  );
}
