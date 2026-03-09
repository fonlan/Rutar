import { useCallback } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type {
  EditorCompositionDisplayState,
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

interface TextSelectionHighlightInfo {
  range: HighlightRange | null;
  includeLineBreakHighlight: boolean;
}

interface HighlightClassNames {
  search: string;
  pair: string;
  searchAndPair: string;
  rectangular: string;
  textSelection: string;
  hyperlinkUnderline: string;
  composition: string;
  compositionCommitted: string;
}

interface UseEditorLineHighlightRenderersParams {
  searchHighlight: SearchHighlightState | null;
  isPairHighlightEnabled: boolean;
  pairHighlights: PairHighlightPosition[];
  compositionDisplay: EditorCompositionDisplayState | null;
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
  compositionDisplay,
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

      const start = Math.max(
        0,
        Math.min(lineTextLength, normalizedRectangularSelection.startColumn - 1)
      );
      const end = Math.max(
        start,
        Math.min(lineTextLength, normalizedRectangularSelection.endColumn - 1)
      );

      if (end <= start) {
        return null;
      }

      return { start, end };
    },
    [normalizedRectangularSelection]
  );

  const getCollapsedRectangularMarkerColumnForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (!normalizedRectangularSelection) {
        return null;
      }

      if (
        normalizedRectangularSelection.endColumn !== normalizedRectangularSelection.startColumn ||
        lineNumber < normalizedRectangularSelection.startLine ||
        lineNumber > normalizedRectangularSelection.endLine
      ) {
        return null;
      }

      return Math.max(
        0,
        Math.min(lineTextLength, normalizedRectangularSelection.startColumn - 1)
      );
    },
    [normalizedRectangularSelection]
  );

  const getTextSelectionHighlightInfoForLine = useCallback(
    (lineNumber: number, lineTextLength: number): TextSelectionHighlightInfo => {
      if (!textSelectionHighlight || textSelectionHighlight.end <= textSelectionHighlight.start) {
        return {
          range: null,
          includeLineBreakHighlight: false,
        };
      }

      let sourceText = '';
      let targetLineInSource = lineNumber;

      if (isHugeEditableMode) {
        const segment = editableSegmentRef.current;
        if (lineNumber < segment.startLine + 1 || lineNumber > segment.endLine) {
          return {
            range: null,
            includeLineBreakHighlight: false,
          };
        }

        sourceText = segment.text;
        targetLineInSource = Math.max(1, lineNumber - segment.startLine);
      } else {
        const element = contentRef.current;
        if (!element) {
          return {
            range: null,
            includeLineBreakHighlight: false,
          };
        }

        sourceText = normalizeSegmentText(getEditableText(element));
      }

      const lineStart = getCodeUnitOffsetFromLineColumn(sourceText, targetLineInSource, 1);
      const lineEnd = lineStart + lineTextLength;
      const selectionStart = textSelectionHighlight.start;
      const selectionEnd = textSelectionHighlight.end;

      const start = Math.max(lineStart, selectionStart);
      const end = Math.min(lineEnd, selectionEnd);
      const hasRange = end > start;
      const includeLineBreakHighlight =
        lineEnd < sourceText.length
        && sourceText.charAt(lineEnd) === '\n'
        && selectionStart <= lineEnd
        && selectionEnd > lineEnd;

      return {
        range: hasRange
          ? {
              start: start - lineStart,
              end: end - lineStart,
            }
          : null,
        includeLineBreakHighlight,
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
      collapsedRectangularMarkerColumn: number | null,
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

      if (collapsedRectangularMarkerColumn !== null) {
        boundaries.add(collapsedRectangularMarkerColumn);
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

  const renderCollapsedRectangularMarker = useCallback(
    (lineNumber: number, keySuffix: string) => (
      <mark key={`rectangular-caret-${lineNumber}-${keySuffix}`} className={classNames.rectangular}>
        <span
          aria-hidden="true"
          className="editor-rectangular-selection-marker inline-block h-[1em] w-px align-top"
        />
      </mark>
    ),
    [classNames.rectangular]
  );

  const getCompositionDisplayForLine = useCallback(
    (lineNumber: number, lineTextLength: number) => {
      if (
        !compositionDisplay
        || compositionDisplay.line !== lineNumber
        || !compositionDisplay.text
        || compositionDisplay.text.includes('\n')
      ) {
        return null;
      }

      const start = Math.max(0, Math.min(lineTextLength, compositionDisplay.startColumn));
      const end = Math.max(start, Math.min(lineTextLength, compositionDisplay.endColumn));

      return {
        ...compositionDisplay,
        start,
        end,
      };
    },
    [compositionDisplay]
  );

  const renderCompositionFragment = useCallback(
    (
      lineNumber: number,
      mode: EditorCompositionDisplayState['mode'],
      text: string,
      keySuffix: string
    ) => (
      <span
        key={`composition-${lineNumber}-${keySuffix}`}
        data-editor-composition-state={mode}
        className={mode === 'composing' ? classNames.composition : classNames.compositionCommitted}
      >
        {text}
      </span>
    ),
    [classNames.composition, classNames.compositionCommitted]
  );

  const renderHighlightedPlainLine = useCallback(
   (text: string, lineNumber: number) => {
     const safeText = text || '';
     const composition = getCompositionDisplayForLine(lineNumber, safeText.length);
     const range = getLineHighlightRange(lineNumber, safeText.length);
     const pairColumns = getPairHighlightColumnsForLine(lineNumber, safeText.length);
     const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, safeText.length);
      const collapsedRectangularMarkerColumn = getCollapsedRectangularMarkerColumnForLine(
        lineNumber,
        safeText.length
      );
     const textSelectionInfo = getTextSelectionHighlightInfoForLine(lineNumber, safeText.length);
     const textSelectionRange = textSelectionInfo.range;
     const hyperlinkRanges = getHttpUrlRangesInLine(safeText);

      if (
       !range
       && pairColumns.length === 0
       && !rectangularRange
        && collapsedRectangularMarkerColumn === null
       && !textSelectionRange
       && !textSelectionInfo.includeLineBreakHighlight
       && hyperlinkRanges.length === 0
       && !composition
      ) {
        return renderPlainLine(safeText);
      }

      const segments = buildLineHighlightSegments(
       safeText.length,
       range,
       pairColumns,
       rectangularRange,
        collapsedRectangularMarkerColumn,
       textSelectionRange,
       hyperlinkRanges
     );

     const rendered: ReactNode[] = [];
     let compositionInserted = false;
      let collapsedRectangularMarkerInserted = false;

     const pushComposition = (keySuffix: string) => {
       if (!composition || compositionInserted) {
         return;
       }

       compositionInserted = true;
       rendered.push(renderCompositionFragment(lineNumber, composition.mode, composition.text, keySuffix));
     };

      const pushCollapsedRectangularMarker = (keySuffix: string) => {
        if (collapsedRectangularMarkerColumn === null || collapsedRectangularMarkerInserted) {
          return;
        }

        collapsedRectangularMarkerInserted = true;
        rendered.push(renderCollapsedRectangularMarker(lineNumber, keySuffix));
      };

      const pushPlainSlice = (
        segment: { start: number; end: number; className: string; isHyperlink: boolean },
        sliceStart: number,
        sliceEnd: number,
        keySuffix: string
      ) => {
        if (sliceEnd <= sliceStart) {
          return;
        }

        const part = safeText.slice(sliceStart, sliceEnd);
        const partClassName = segment.isHyperlink ? classNames.hyperlinkUnderline : '';
        if (!segment.className) {
          rendered.push(
            <span key={`plain-segment-${lineNumber}-${keySuffix}`} className={partClassName || undefined}>
              {part}
            </span>
          );
          return;
        }

        rendered.push(
          <mark key={`plain-segment-${lineNumber}-${keySuffix}`} className={segment.className}>
            <span className={partClassName || undefined}>{part}</span>
          </mark>
        );
      };

     segments.forEach((segment, segmentIndex) => {
        if (
          !collapsedRectangularMarkerInserted
          && collapsedRectangularMarkerColumn !== null
          && collapsedRectangularMarkerColumn <= segment.start
        ) {
          pushCollapsedRectangularMarker(`before-${segmentIndex}`);
        }

       if (composition && !compositionInserted && composition.start <= segment.start) {
         pushComposition(`before-${segmentIndex}`);
       }

        const overlapsComposition = !!composition && segment.start < composition.end && segment.end > composition.start;
        if (!overlapsComposition) {
          pushPlainSlice(segment, segment.start, segment.end, `full-${segmentIndex}`);
          return;
        }

        pushPlainSlice(segment, segment.start, Math.max(segment.start, composition.start), `pre-${segmentIndex}`);
        pushComposition(`inline-${segmentIndex}`);
        pushPlainSlice(segment, Math.max(segment.start, composition.end), segment.end, `post-${segmentIndex}`);
      });

     if (composition && !compositionInserted) {
       pushComposition('tail');
     }

      if (!collapsedRectangularMarkerInserted) {
        pushCollapsedRectangularMarker('tail');
      }

      return (
        <span>
          {rendered}
          {textSelectionInfo.includeLineBreakHighlight && (
            <mark key={`linebreak-highlight-${lineNumber}`} className={classNames.textSelection}>
              <span className="editor-selection-linebreak-marker inline-block w-[1ch]">{'\u00A0'}</span>
            </mark>
          )}
        </span>
      );
    },
   [
     buildLineHighlightSegments,
     classNames.hyperlinkUnderline,
      getCollapsedRectangularMarkerColumnForLine,
     getCompositionDisplayForLine,
     getHttpUrlRangesInLine,
     getLineHighlightRange,
     getPairHighlightColumnsForLine,
     getRectangularHighlightRangeForLine,
     getTextSelectionHighlightInfoForLine,
      renderCollapsedRectangularMarker,
     renderCompositionFragment,
     renderPlainLine,
   ]
 );

  const renderHighlightedTokens = useCallback(
   (tokensArr: SyntaxToken[], lineNumber: number) => {
     if (!tokensArr || tokensArr.length === 0) return null;

     const lineText = tokensArr.map((token) => token.text ?? '').join('');
     const composition = getCompositionDisplayForLine(lineNumber, lineText.length);
     const range = getLineHighlightRange(lineNumber, lineText.length);
     const pairColumns = getPairHighlightColumnsForLine(lineNumber, lineText.length);
     const rectangularRange = getRectangularHighlightRangeForLine(lineNumber, lineText.length);
      const collapsedRectangularMarkerColumn = getCollapsedRectangularMarkerColumnForLine(
        lineNumber,
        lineText.length
      );
     const textSelectionInfo = getTextSelectionHighlightInfoForLine(lineNumber, lineText.length);
     const textSelectionRange = textSelectionInfo.range;
     const hyperlinkRanges = getHttpUrlRangesInLine(lineText);

      if (
       !range
       && pairColumns.length === 0
       && !rectangularRange
        && collapsedRectangularMarkerColumn === null
       && !textSelectionRange
       && !textSelectionInfo.includeLineBreakHighlight
       && hyperlinkRanges.length === 0
       && !composition
      ) {
        return renderTokens(tokensArr);
      }

      const segments = buildLineHighlightSegments(
       lineText.length,
       range,
       pairColumns,
       rectangularRange,
        collapsedRectangularMarkerColumn,
       textSelectionRange,
       hyperlinkRanges
     );

     const rendered: ReactNode[] = [];
     let cursor = 0;
     let compositionInserted = false;
      let collapsedRectangularMarkerInserted = false;

     const pushComposition = (keySuffix: string) => {
       if (!composition || compositionInserted) {
         return;
       }

       compositionInserted = true;
       rendered.push(renderCompositionFragment(lineNumber, composition.mode, composition.text, keySuffix));
     };

      const pushCollapsedRectangularMarker = (keySuffix: string) => {
        if (collapsedRectangularMarkerColumn === null || collapsedRectangularMarkerInserted) {
          return;
        }

        collapsedRectangularMarkerInserted = true;
        rendered.push(renderCollapsedRectangularMarker(lineNumber, keySuffix));
      };

      const pushTokenSlice = (
        tokenText: string,
        tokenStart: number,
        sliceStart: number,
        sliceEnd: number,
        typeClass: string,
        keySuffix: string
     ) => {
       if (sliceEnd <= sliceStart) {
         return;
       }

        if (
          !collapsedRectangularMarkerInserted
          && collapsedRectangularMarkerColumn !== null
          && collapsedRectangularMarkerColumn === sliceStart
        ) {
          pushCollapsedRectangularMarker(`slice-${keySuffix}`);
        }

       segments.forEach((segment, segmentIndex) => {
         const partStart = Math.max(sliceStart, segment.start);
         const partEnd = Math.min(sliceEnd, segment.end);
         if (partEnd <= partStart) {
           return;
         }

          if (
            !collapsedRectangularMarkerInserted
            && collapsedRectangularMarkerColumn !== null
            && collapsedRectangularMarkerColumn === partStart
          ) {
            pushCollapsedRectangularMarker(`part-${keySuffix}-${segmentIndex}`);
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
              <span key={`t-part-${lineNumber}-${keySuffix}-${segmentIndex}`} className={partTypeClass}>
                {partText}
              </span>
            );
            return;
          }

          rendered.push(
            <mark key={`t-part-${lineNumber}-${keySuffix}-${segmentIndex}`} className={segment.className}>
              <span className={partTypeClass}>{partText}</span>
            </mark>
          );
        });
      };

      tokensArr.forEach((token, tokenIndex) => {
        if (token.text === undefined || token.text === null) {
          return;
        }

        const tokenText = token.text;
        const tokenLength = tokenText.length;
       const tokenStart = cursor;
       const tokenEnd = tokenStart + tokenLength;
       const typeClass = resolveTokenTypeClass(token);

        if (
          !collapsedRectangularMarkerInserted
          && collapsedRectangularMarkerColumn !== null
          && collapsedRectangularMarkerColumn <= tokenStart
        ) {
          pushCollapsedRectangularMarker(`before-${tokenIndex}`);
        }

       if (composition && !compositionInserted && composition.start <= tokenStart) {
         pushComposition(`before-${tokenIndex}`);
       }

        if (tokenLength === 0) {
          rendered.push(
            <span key={`t-empty-${tokenIndex}`} className={typeClass}>
              {tokenText}
            </span>
          );
          cursor = tokenEnd;
          return;
        }

        const overlapsComposition = !!composition && tokenStart < composition.end && tokenEnd > composition.start;
        if (!overlapsComposition) {
          pushTokenSlice(tokenText, tokenStart, tokenStart, tokenEnd, typeClass, `full-${tokenIndex}`);
        } else {
          pushTokenSlice(
            tokenText,
            tokenStart,
            tokenStart,
            Math.max(tokenStart, composition.start),
            typeClass,
            `pre-${tokenIndex}`
          );
          pushComposition(`inline-${tokenIndex}`);
          pushTokenSlice(
            tokenText,
            tokenStart,
            Math.max(tokenStart, composition.end),
            tokenEnd,
            typeClass,
            `post-${tokenIndex}`
          );
        }

        cursor = tokenEnd;
      });

     if (composition && !compositionInserted) {
       pushComposition('tail');
     }

      if (!collapsedRectangularMarkerInserted) {
        pushCollapsedRectangularMarker('tail');
      }

      if (textSelectionInfo.includeLineBreakHighlight) {
        rendered.push(
          <mark key={`linebreak-highlight-${lineNumber}`} className={classNames.textSelection}>
            <span className="editor-selection-linebreak-marker inline-block w-[1ch]">{'\u00A0'}</span>
          </mark>
        );
      }

      return rendered;
    },
    [
     appendClassName,
     buildLineHighlightSegments,
     classNames.hyperlinkUnderline,
      getCollapsedRectangularMarkerColumnForLine,
     getCompositionDisplayForLine,
     getHttpUrlRangesInLine,
     getLineHighlightRange,
     getPairHighlightColumnsForLine,
     getRectangularHighlightRangeForLine,
     getTextSelectionHighlightInfoForLine,
      renderCollapsedRectangularMarker,
     renderCompositionFragment,
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







