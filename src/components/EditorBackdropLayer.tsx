import type { MutableRefObject, ReactNode } from 'react';
import { VariableSizeList as List } from 'react-window';
import type { SyntaxToken } from './Editor.types';

interface EditorBackdropLayerProps {
  visible: boolean;
  width: number;
  height: number;
  contentViewportLeftPx: number;
  contentViewportWidth: number;
  contentBottomSafetyPadding: string;
  tabLineCount: number;
  itemSize: number;
  listRef: MutableRefObject<any>;
  getListItemSize: (index: number) => number;
  onItemsRendered: (props: any) => void;
  isHugeEditableMode: boolean;
  editableSegmentStartLine: number;
  usePlainLineRendering: boolean;
  plainStartLine: number;
  startLine: number;
  tokenFallbackPlainLines: string[];
  tokenFallbackPlainStartLine: number;
  lineTokens: SyntaxToken[][];
  editableSegmentLines: string[];
  plainLines: string[];
  measureRenderedLineHeight: (index: number, element: HTMLDivElement | null) => void;
  wordWrap: boolean;
  contentTextPadding: string;
  contentTextRightPadding: string;
  fontFamily: string;
  renderedFontSizePx: number;
  lineHeightPx: number;
  hugeScrollableContentWidth: number;
  diffHighlightLineSet: Set<number>;
  outlineFlashLine: number | null;
  lineNumberMultiSelectionSet: Set<number>;
  highlightCurrentLine: boolean;
  activeLineNumber: number;
  tabSize: number;
  renderHighlightedPlainLine: (lineText: string, lineNumber: number) => ReactNode;
  renderHighlightedTokens: (tokens: SyntaxToken[], lineNumber: number) => ReactNode;
}

export function EditorBackdropLayer({
  visible,
  width,
  height,
  contentViewportLeftPx,
  contentViewportWidth,
  contentBottomSafetyPadding,
  tabLineCount,
  itemSize,
  listRef,
  getListItemSize,
  onItemsRendered,
  isHugeEditableMode,
  editableSegmentStartLine,
  usePlainLineRendering,
  plainStartLine,
  startLine,
  tokenFallbackPlainLines,
  tokenFallbackPlainStartLine,
  lineTokens,
  editableSegmentLines,
  plainLines,
  measureRenderedLineHeight,
  wordWrap,
  contentTextPadding,
  contentTextRightPadding,
  fontFamily,
  renderedFontSizePx,
  lineHeightPx,
  hugeScrollableContentWidth,
  diffHighlightLineSet,
  outlineFlashLine,
  lineNumberMultiSelectionSet,
  highlightCurrentLine,
  activeLineNumber,
  tabSize,
  renderHighlightedPlainLine,
  renderHighlightedTokens,
}: EditorBackdropLayerProps) {
  if (!visible || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <div
      className="absolute top-0 bottom-0 right-0 z-10 overflow-hidden pointer-events-none"
      style={{
        left: `${contentViewportLeftPx}px`,
        width: `${contentViewportWidth}px`,
      }}
    >
      <List
        ref={listRef}
        height={height}
        width={contentViewportWidth}
        itemCount={tabLineCount}
        itemSize={getListItemSize}
        estimatedItemSize={itemSize}
        onItemsRendered={onItemsRendered}
        overscanCount={20}
        style={{
          overflowX: 'hidden',
          overflowY: 'hidden',
          paddingBottom: contentBottomSafetyPadding,
        }}
      >
        {({ index, style }) => {
          const isCurrentLineHighlighted = highlightCurrentLine && activeLineNumber === index + 1;
          const relativeIndex = isHugeEditableMode
            ? index - editableSegmentStartLine
            : usePlainLineRendering
            ? index - plainStartLine
            : index - startLine;
          const plainRelativeIndex = index - plainStartLine;
          const tokenFallbackRelativeIndex = index - tokenFallbackPlainStartLine;
          const lineTokensArr =
            !usePlainLineRendering && relativeIndex >= 0 && relativeIndex < lineTokens.length
              ? lineTokens[relativeIndex]
              : [];
          const hasTokenFallbackLine =
            !usePlainLineRendering
            && tokenFallbackRelativeIndex >= 0
            && tokenFallbackRelativeIndex < tokenFallbackPlainLines.length;
          const tokenFallbackPlainLine = hasTokenFallbackLine
            ? tokenFallbackPlainLines[tokenFallbackRelativeIndex]
            : '';
          const plainLine =
            isHugeEditableMode && relativeIndex >= 0 && relativeIndex < editableSegmentLines.length
              ? editableSegmentLines[relativeIndex]
              : usePlainLineRendering && plainRelativeIndex >= 0 && plainRelativeIndex < plainLines.length
              ? plainLines[plainRelativeIndex]
              : '';

          return (
            <div
              ref={(element) => measureRenderedLineHeight(index, element)}
              style={{
                ...style,
                width: wordWrap ? '100%' : 'max-content',
                minWidth:
                  !wordWrap && isHugeEditableMode
                    ? `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`
                    : '100%',
                paddingLeft: contentTextPadding,
                paddingRight: contentTextRightPadding,
                fontFamily,
                fontSize: `${renderedFontSizePx}px`,
                lineHeight: `${lineHeightPx}px`,
                ...(isCurrentLineHighlighted
                  ? {
                      backgroundClip: 'content-box',
                    }
                  : null),
              }}
              className={`hover:bg-muted/5 text-foreground group editor-line flex items-start ${
                diffHighlightLineSet.has(index + 1) ? 'bg-red-500/10 dark:bg-red-500/14' : ''
              } ${
                outlineFlashLine === index + 1
                  ? 'bg-primary/15 dark:bg-primary/20'
                  : lineNumberMultiSelectionSet.has(index + 1)
                  ? 'bg-blue-500/25 dark:bg-blue-500/20'
                  : isCurrentLineHighlighted
                  ? 'bg-violet-300/35 dark:bg-violet-500/25'
                  : ''
              }`}
            >
              <div
                className={wordWrap ? 'min-w-0 flex-1' : 'shrink-0'}
                style={{
                  whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                  tabSize,
                }}
              >
                {usePlainLineRendering
                  ? renderHighlightedPlainLine(plainLine, index + 1)
                  : lineTokensArr.length > 0
                  ? renderHighlightedTokens(lineTokensArr, index + 1)
                  : hasTokenFallbackLine
                  ? renderHighlightedPlainLine(tokenFallbackPlainLine, index + 1)
                  : <span className="opacity-10 italic">...</span>}
              </div>
            </div>
          );
        }}
      </List>
    </div>
  );
}
