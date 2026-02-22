import { useMemo } from 'react';
import { editorTestUtils } from './editorUtils';

const { alignToDevicePixel, alignScrollOffset } = editorTestUtils;

interface UseEditorLayoutConfigParams {
  settings: {
    fontSize?: number;
    tabWidth?: number;
    wordWrap?: boolean;
    showLineNumbers?: boolean;
    highlightCurrentLine?: boolean;
  };
  width: number;
  tabLineCount: number;
  tabLargeFileMode: boolean;
  editableSegmentStartLine: number;
  editableSegmentEndLine: number;
  largeFilePlainRenderLineThreshold: number;
  isPlainTextMode: boolean;
}

export function useEditorLayoutConfig({
  settings,
  width,
  tabLineCount,
  tabLargeFileMode,
  editableSegmentStartLine,
  editableSegmentEndLine,
  largeFilePlainRenderLineThreshold,
  isPlainTextMode,
}: UseEditorLayoutConfigParams) {
  const fontSize = settings.fontSize || 14;
  const tabWidth = settings.tabWidth;
  const tabSize =
    typeof tabWidth === 'number' && Number.isFinite(tabWidth)
      ? Math.min(8, Math.max(1, Math.floor(tabWidth)))
      : 4;
  const wordWrap = !!settings.wordWrap;
  const showLineNumbers = settings.showLineNumbers !== false;
  const highlightCurrentLine = settings.highlightCurrentLine !== false;
  const renderedFontSizePx = useMemo(() => alignToDevicePixel(fontSize), [fontSize]);
  const lineNumberFontSizePx = useMemo(
    () => alignToDevicePixel(Math.max(10, renderedFontSizePx - 2)),
    [renderedFontSizePx]
  );
  const lineHeightPx = useMemo(() => Math.max(1, Math.round(renderedFontSizePx * 1.5)), [renderedFontSizePx]);
  const itemSize = lineHeightPx;
  const lineNumberColumnWidthPx = showLineNumbers ? 72 : 0;
  const contentViewportLeftPx = lineNumberColumnWidthPx;
  const contentViewportWidth = Math.max(0, width - contentViewportLeftPx);
  const contentTextPaddingPx = 6;
  const editorScrollbarSafetyPaddingPx = 14;
  const lineNumberBottomSpacerHeightPx = editorScrollbarSafetyPaddingPx;
  const contentTextPadding = `${contentTextPaddingPx}px`;
  const contentTextRightPadding = `${contentTextPaddingPx + editorScrollbarSafetyPaddingPx}px`;
  const contentBottomSafetyPadding = `${editorScrollbarSafetyPaddingPx}px`;
  const horizontalOverflowMode = wordWrap ? 'hidden' : 'auto';
  const usePlainLineRendering = tabLargeFileMode || tabLineCount >= largeFilePlainRenderLineThreshold;
  const isHugeEditableMode = tabLineCount >= largeFilePlainRenderLineThreshold;
  const isPairHighlightEnabled = !usePlainLineRendering && !isPlainTextMode;
  const hugeEditablePaddingTop = `${alignScrollOffset(Math.max(0, editableSegmentStartLine) * itemSize)}px`;
  const hugeEditableSegmentHeightPx = `${alignScrollOffset(
    Math.max(1, editableSegmentEndLine - editableSegmentStartLine) * itemSize
  )}px`;
  const lineNumberVirtualItemCount = tabLineCount + 1;

  return {
    fontSize,
    tabSize,
    wordWrap,
    showLineNumbers,
    highlightCurrentLine,
    renderedFontSizePx,
    lineNumberFontSizePx,
    lineHeightPx,
    itemSize,
    lineNumberColumnWidthPx,
    contentViewportLeftPx,
    contentViewportWidth,
    lineNumberBottomSpacerHeightPx,
    contentTextPadding,
    contentTextRightPadding,
    contentBottomSafetyPadding,
    horizontalOverflowMode,
    usePlainLineRendering,
    isHugeEditableMode,
    isPairHighlightEnabled,
    hugeEditablePaddingTop,
    hugeEditableSegmentHeightPx,
    lineNumberVirtualItemCount,
  };
}
