import { useCallback, useEffect, useRef } from 'react';
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
  unsavedChangeLineSet: Set<number>;
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
  unsavedChangeLineSet,
  bookmarks,
  lineNumberMultiSelectionSet,
  getLineNumberListItemSize,
  getLineNumberFromGutterElement,
  onLineNumberWheel,
  onLineNumberDoubleClick,
  onLineNumberClick,
  onLineNumberContextMenu,
}: EditorLineNumberGutterProps) {
  const dragAnchorLineRef = useRef<number | null>(null);
  const dragLastLineRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  const endLineNumberDrag = useCallback(() => {
    dragAnchorLineRef.current = null;
    dragLastLineRef.current = null;
  }, []);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      endLineNumberDrag();
    };
    const handleWindowBlur = () => {
      endLineNumberDrag();
      suppressNextClickRef.current = false;
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [endLineNumberDrag]);

  const beginLineNumberDrag = useCallback(
    (lineNumber: number) => {
      dragAnchorLineRef.current = lineNumber;
      dragLastLineRef.current = lineNumber;
      suppressNextClickRef.current = false;
      onLineNumberClick(lineNumber, false, false);
    },
    [onLineNumberClick]
  );

  const updateLineNumberDrag = useCallback(
    (lineNumber: number) => {
      const anchorLine = dragAnchorLineRef.current;
      if (anchorLine === null) {
        return;
      }

      if (dragLastLineRef.current === lineNumber) {
        return;
      }

      dragLastLineRef.current = lineNumber;

      if (lineNumber !== anchorLine) {
        suppressNextClickRef.current = true;
      }

      onLineNumberClick(lineNumber, true, false);
    },
    [onLineNumberClick]
  );

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
              className={`relative flex h-full items-start justify-end px-2 pr-3 text-right transition-colors ${
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

                if (event.button !== 0) {
                  return;
                }

                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);
                beginLineNumberDrag(lineNumber);
              }}
              onMouseOver={(event) => {
                if (!dragAnchorLineRef.current) {
                  return;
                }

                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);
                updateLineNumberDrag(lineNumber);
              }}
              onMouseUp={(event) => {
                if (event.button !== 0 || dragAnchorLineRef.current === null) {
                  return;
                }

                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);
                updateLineNumberDrag(lineNumber);
                endLineNumberDrag();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);

                if (event.detail === 2) {
                  suppressNextClickRef.current = false;
                  onLineNumberDoubleClick(lineNumber);
                  return;
                }

                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }

                onLineNumberClick(lineNumber, event.shiftKey, event.ctrlKey || event.metaKey);
              }}
              onContextMenu={(event) => {
                const lineNumber = getLineNumberFromGutterElement(event.currentTarget, index + 1);
                onLineNumberContextMenu(event, lineNumber);
              }}
            >
              {unsavedChangeLineSet.has(index + 1) ? (
                <span
                  data-testid={`line-number-unsaved-marker-${index + 1}`}
                  aria-hidden
                  className="pointer-events-none absolute right-1 top-0 bottom-0 w-[3px] bg-orange-500/95"
                />
              ) : null}
              {index + 1}
            </div>
          );
        }}
      </List>
    </div>
  );
}
