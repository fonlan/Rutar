import { useCallback } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type {
  EditorInputElement,
  EditorSegmentState,
  PairHighlightPosition,
  SearchHighlightState,
  SyntaxToken,
  TextSelectionState,
} from './Editor.types';

interface NormalizedRectangularSelection {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

interface HighlightRange {
  start: number;
  end: number;
}

interface HighlightClassNames {
  search: string;
  pair: string;
  searchAndPair: string;
  rectangular: string;
  textSelection: string;
  hyperlinkUnderline: string;
}

interface UseEditorLineHighlightRenderersParams {
  searchHighlight: SearchHighlightState | null;
  isPairHighlightEnabled: boolean;
  pairHighlights: PairHighlightPosition[];
  normalizedRectangularSelection: NormalizedRectangularSelection | null;
  textSelectionHighlight: TextSelectionState | null;
  isHugeEditableMode: boolean;
  editableSegmentRef: MutableRefObject<EditorSegmentState>;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  normalizeSegmentText: (value: string) => string;
  getEditableText: (element: EditorInputElement) => string;
  getCodeUnitOffsetFromLineColumn: (text: string, line: number, column: number) => number;
  getHttpUrlRangesInLine: (lineText: string) => Array<{ start: number; end: number }>;
  appendClassName: (baseClassName: string, extraClassName: string) => string;
  resolveTokenTypeClass: (token: SyntaxToken) => string;
  classNames: HighlightClassNames;
}

export function useEditorLineHighlightRenderers({
  searchHighlight,
  isPairHighlightEnabled,
  pairHighlights,
  normalizedRectangularSelection,
  textSelectionHighlight,
  isHugeEditableMode,
  editableSegmentRef,
  contentRef,
  normalizeSegmentText,
  getEditableText,
  getCodeUnitOffsetFromLineColumn,
  getHttpUrlRangesInLine,
  appendClassName,
  resolveTokenTypeClass,
  classNames,
}: UseEditorLineHighlightRenderersParams) {
  const renderTokens = useCallback((tokensArr: SyntaxToken[]) => {
    if (!tokensArr || tokensArr.length === 0) return null;

    return tokensArr.map((token, i) => {
      const key = `t-${i}`;
      if (token.text === undefined || token.text === null) return null;
      const typeClass = resolveTokenTypeClass(token);

      return (
        <span key={key} className={typeClass}>
          {token.text}
        </span>
      );
    });
  }, [resolveTokenTypeClass]);

  const renderPlainLine = useCallback((text: string) => {
    if (!text) {
      return null;
    }

    return <span>{text}</span>;
  }, []);

  const getLineHighlightRange = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!searchHighlight || searchHighlight.length <= 0 || searchHighlight.line !== lineNumber) {
        return null;
      }

      const start = Math.max(0, searchHighlight.column - 1);
      const end = Math.min(lineTextLength, start + searchHighlight.length);

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [searchHighlight]
  );

  const getPairHighlightColumnsForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!isPairHighlightEnabled || pairHighlights.length === 0) {
        return [];
      }

      return pairHighlights
        .filter((position) => position.line === lineNumber)
        .map((position) => position.column - 1)
        .filter((columnIndex) => columnIndex >= 0 && columnIndex < lineTextLength);
    },
    [isPairHighlightEnabled, pairHighlights]
  );

  const getRectangularHighlightRangeForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!normalizedRectangularSelection) {
        return null;
      }

      if (
        lineNumber < normalizedRectangularSelection.startLine ||
        lineNumber > normalizedRectangularSelection.endLine
      ) {
        return null;
      }

      const start = Math.max(0, Math.min(lineTextLength, normalizedRectangularSelection.startColumn - 1));
      const end = Math.max(start, Math.min(lineTextLength, normalizedRectangularSelection.endColumn - 1));

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [normalizedRectangularSelection]
  );

  const getTextSelectionHighlightRangeForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!textSelectionHighlight || textSelectionHighlight.end <= textSelectionHighlight.start) {
        return null;
      }

      let sourceText = '';
      let targetLineInSource = lineNumber;

      if (isHugeEditableMode) {
        const segment = editableSegmentRef.current;
        if (lineNumber < segment.startLine + 1 || lineNumber > segment.endLine) {
          return null;
        }

        sourceText = segment.text;
        targetLineInSource = Math.max(1, lineNumber - segment.startLine);
      } else {
        const element = contentRef.current;
        if (!element) {
          return null;
        }

        sourceText = normalizeSegmentText(getEditableText(element));
      }

      const lineStart = getCodeUnitOffsetFromLineColumn(sourceText, targetLineInSource, 1);
      const lineEnd = lineStart + lineTextLength;
      const selectionStart = textSelectionHighlight.start;
      const selectionEnd = textSelectionHighlight.end;

      const start = Math.max(lineStart, selectionStart);
      const end = Math.min(lineEnd, selectionEnd);
      if (end <= start) {
        return null;
      }

      return {
        start: start - lineStart,
        end: end - lineStart,
      };
    },
    [
      contentRef,
      editableSegmentRef,
      getCodeUnitOffsetFromLineColumn,
      getEditableText,
      isHugeEditableMode,
      normalizeSegmentText,
      textSelectionHighlight,
    ]
  );

  const getInlineHighlightClass = useCallback((isSearchMatch: boolean, isPairMatch: boolean) => {
    if (isSearchMatch && isPairMatch) {
      return classNames.searchAndPair;
    }

    if (isSearchMatch) {
      return classNames.search;
    }

    if (isPairMatch) {
      return classNames.pair;
    }

    return '';
  }, [classNames.pair, classNames.search, classNames.searchAndPair]);

  const buildLineHighlightSegments = useCallback(
    (
      lineTextLength: number,
      searchRange: HighlightRange | null,
      pairColumns: number[],
      rectangularRange: HighlightRange | null,
      textSelectionRange: HighlightRange | null,
      hyperlinkRanges: Array<{ start: number; end: number }>
    ) => {
      const boundaries = new Set<number>([0, lineTextLength]);

      if (searchRange) {
        boundaries.add(searchRange.start);
        boundaries.add(searchRange.end);
      }

      pairColumns.forEach((column) => {
        boundaries.add(column);
        boundaries.add(Math.min(lineTextLength, column + 1));
      });

      if (rectangularRange) {
        boundaries.add(rectangularRange.start);
        boundaries.add(rectangularRange.end);
      }

      if (textSelectionRange) {
        boundaries.add(textSelectionRange.start);
        boundaries.add(textSelectionRange.end);
      }

      hyperlinkRanges.forEach((range) => {
        boundaries.add(range.start);
        boundaries.add(range.end);
      });

      const sorted = Array.from(boundaries).sort((left, right) => left - right);
      const segments: Array<{ start: number; end: number; className: string; isHyperlink: boolean }> = [];

      for (let i = 0; i < sorted.length - 1; i += 1) {
        const start = sorted[i];
        const end = sorted[i + 1];

        if (end <= start) {
          continue;
        }

        const isSearchMatch = !!searchRange && start >= searchRange.start && end <= searchRange.end;
        const isPairMatch = pairColumns.some((column) => start >= column && end <= column + 1);
        const isRectangularMatch =
          !!rectangularRange && start >= rectangularRange.start && end <= rectangularRange.end;
        const isTextSelectionMatch =
          !!textSelectionRange && start >= textSelectionRange.start && end <= textSelectionRange.end;
        const isHyperlink = hyperlinkRanges.some((range) => start >= range.start && end <= range.end);

        let className = getInlineHighlightClass(isSearchMatch, isPairMatch);
        if (isRectangularMatch) {
          className = className
            ? `${className} ${classNames.rectangular}`
            : classNames.rectangular;
        }

        if (isTextSelectionMatch) {
          className = className
            ? `${className} ${classNames.textSelection}`
            : classNames.textSelection;
        }

        segments.push({
          start,
          end,
          className,
          isHyperlink,
        });
      }

      return segments;
    },
    [classNames.rectangular, classNames.textSelection, getInlineHighlightClass]
  );

  const renderHighlightedPlainLine = useCallback(
    (text: string, lineNumber: number) => {
      const safeText = text || '';
      const range = getLineHighlightRange(lineNumber, safeText.length);
      const pairColumns = getPairHighlightColumnsForLine(lineNumber, safeText.length);
      const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, safeText.length);
      const textSelectionRange = getTextSelectionHighlightRangeForLine(lineNumber, safeText.length);
      const hyperlinkRanges = getHttpUrlRangesInLine(safeText);

      if (!range && pairColumns.length === 0 && !rectangularRange && !textSelectionRange && hyperlinkRanges.length === 0) {
        return renderPlainLine(safeText);
      }

      const segments = buildLineHighlightSegments(
        safeText.length,
        range,
        pairColumns,
        rectangularRange,
        textSelectionRange,
        hyperlinkRanges
      );

      return (
        <span>
          {segments.map((segment, segmentIndex) => {
            const part = safeText.slice(segment.start, segment.end);
            const partClassName = segment.isHyperlink ? classNames.hyperlinkUnderline : '';
            if (!segment.className) {
              return (
                <span
                  key={`plain-segment-${lineNumber}-${segmentIndex}`}
                  className={partClassName || undefined}
                >
                  {part}
                </span>
              );
            }

            return (
              <mark key={`plain-segment-${lineNumber}-${segmentIndex}`} className={segment.className}>
                <span className={partClassName || undefined}>{part}</span>
              </mark>
            );
          })}
        </span>
      );
    },
    [
      buildLineHighlightSegments,
      classNames.hyperlinkUnderline,
      getHttpUrlRangesInLine,
      getLineHighlightRange,
      getPairHighlightColumnsForLine,
      getRectangularHighlightRangeForLine,
      getTextSelectionHighlightRangeForLine,
      renderPlainLine,
    ]
  );

  const renderHighlightedTokens = useCallback(
    (tokensArr: SyntaxToken[], lineNumber: number) => {
      if (!tokensArr || tokensArr.length === 0) return null;

      const lineText = tokensArr.map((token) => token.text ?? '').join('');
      const range = getLineHighlightRange(lineNumber, lineText.length);
      const pairColumns = getPairHighlightColumnsForLine(lineNumber, lineText.length);
      const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, lineText.length);
      const textSelectionRange = getTextSelectionHighlightRangeForLine(lineNumber, lineText.length);
      const hyperlinkRanges = getHttpUrlRangesInLine(lineText);

      if (!range && pairColumns.length === 0 && !rectangularRange && !textSelectionRange && hyperlinkRanges.length === 0) {
        return renderTokens(tokensArr);
      }

      const segments = buildLineHighlightSegments(
        lineText.length,
        range,
        pairColumns,
        rectangularRange,
        textSelectionRange,
        hyperlinkRanges
      );

      let cursor = 0;
      let segmentIndex = 0;
      const rendered: ReactNode[] = [];

      tokensArr.forEach((token, tokenIndex) => {
        if (token.text === undefined || token.text === null) {
          return;
        }

        const tokenText = token.text;
        const tokenLength = tokenText.length;
        const tokenStart = cursor;
        const tokenEnd = tokenStart + tokenLength;
        const typeClass = resolveTokenTypeClass(token);

        if (tokenLength === 0) {
          rendered.push(
            <span key={`t-empty-${tokenIndex}`} className={typeClass}>
              {tokenText}
            </span>
          );
          return;
        }

        while (segmentIndex < segments.length && segments[segmentIndex].end <= tokenStart) {
          segmentIndex += 1;
        }

        let localCursor = tokenStart;
        let localPartIndex = 0;

        while (localCursor < tokenEnd && segmentIndex < segments.length) {
          const segment = segments[segmentIndex];

          if (segment.start >= tokenEnd) {
            break;
          }

          const partStart = Math.max(localCursor, segment.start);
          const partEnd = Math.min(tokenEnd, segment.end);

          if (partEnd <= partStart) {
            segmentIndex += 1;
            continue;
          }

          const tokenSliceStart = partStart - tokenStart;
          const tokenSliceEnd = partEnd - tokenStart;
          const partText = tokenText.slice(tokenSliceStart, tokenSliceEnd);
          const partTypeClass = appendClassName(
            typeClass,
            segment.isHyperlink ? classNames.hyperlinkUnderline : ''
          );

          if (!segment.className) {
            rendered.push(
              <span key={`t-part-${tokenIndex}-${localPartIndex}`} className={partTypeClass}>
                {partText}
              </span>
            );
          } else {
            rendered.push(
              <mark key={`t-part-${tokenIndex}-${localPartIndex}`} className={segment.className}>
                <span className={partTypeClass}>{partText}</span>
              </mark>
            );
          }

          localCursor = partEnd;
          localPartIndex += 1;

          if (segment.end <= localCursor) {
            segmentIndex += 1;
          }
        }

        if (localCursor < tokenEnd) {
          rendered.push(
            <span key={`t-tail-${tokenIndex}`} className={typeClass}>
              {tokenText.slice(localCursor - tokenStart)}
            </span>
          );
        }

        cursor = tokenEnd;
      });

      return rendered;
    },
    [
      appendClassName,
      buildLineHighlightSegments,
      classNames.hyperlinkUnderline,
      getHttpUrlRangesInLine,
      getLineHighlightRange,
      getPairHighlightColumnsForLine,
      getRectangularHighlightRangeForLine,
      getTextSelectionHighlightRangeForLine,
      renderTokens,
      resolveTokenTypeClass,
    ]
  );

  return {
    renderTokens,
    renderPlainLine,
    renderHighlightedPlainLine,
    renderHighlightedTokens,
  };
}
