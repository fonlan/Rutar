import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';

interface UseEditorHugeEditableLayoutParams {
  isHugeEditableMode: boolean;
  wordWrap: boolean;
  contentViewportWidth: number;
  editableSegmentStartLine: number;
  editableSegmentEndLine: number;
  editableSegmentText: string;
  renderedFontSizePx: number;
  fontFamily: string | undefined;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
}

export function useEditorHugeEditableLayout({
  isHugeEditableMode,
  wordWrap,
  contentViewportWidth,
  editableSegmentStartLine,
  editableSegmentEndLine,
  editableSegmentText,
  renderedFontSizePx,
  fontFamily,
  contentRef,
}: UseEditorHugeEditableLayoutParams) {
  const [hugeScrollableContentWidth, setHugeScrollableContentWidth] = useState(0);

  const editableSegmentLines = useMemo(() => {
    if (!isHugeEditableMode) {
      return [];
    }

    if (editableSegmentEndLine <= editableSegmentStartLine) {
      return [];
    }

    return editableSegmentText.split('\n');
  }, [editableSegmentEndLine, editableSegmentStartLine, editableSegmentText, isHugeEditableMode]);

  const syncHugeScrollableContentWidth = useCallback(() => {
    if (!isHugeEditableMode || wordWrap) {
      setHugeScrollableContentWidth(0);
      return;
    }

    const element = contentRef.current;
    if (!element) {
      return;
    }

    const measuredWidth = Math.max(contentViewportWidth, element.scrollWidth);
    setHugeScrollableContentWidth((prev) => (prev === measuredWidth ? prev : measuredWidth));
  }, [contentRef, contentViewportWidth, isHugeEditableMode, wordWrap]);

  useEffect(() => {
    if (!isHugeEditableMode || wordWrap) {
      setHugeScrollableContentWidth(0);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      syncHugeScrollableContentWidth();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    contentViewportWidth,
    editableSegmentText,
    fontFamily,
    isHugeEditableMode,
    renderedFontSizePx,
    syncHugeScrollableContentWidth,
    wordWrap,
  ]);

  return {
    editableSegmentLines,
    hugeScrollableContentWidth,
    syncHugeScrollableContentWidth,
  };
}
