import { useCallback, useRef } from 'react';

interface UseEditorTextMeasurementParams {
  renderedFontSizePx: number;
  fontFamily: string | undefined;
  lineHeightPx: number;
  wordWrap: boolean;
  getEditableText: (element: HTMLTextAreaElement) => string;
}

export function useEditorTextMeasurement({
  renderedFontSizePx,
  fontFamily,
  lineHeightPx,
  wordWrap,
  getEditableText,
}: UseEditorTextMeasurementParams) {
  const textDragMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getTextDragMeasureContext = useCallback(() => {
    if (!textDragMeasureCanvasRef.current) {
      textDragMeasureCanvasRef.current = document.createElement('canvas');
    }

    return textDragMeasureCanvasRef.current.getContext('2d');
  }, []);

  const measureTextWidthByEditorStyle = useCallback(
    (element: HTMLTextAreaElement, text: string) => {
      if (!text) {
        return 0;
      }

      const context = getTextDragMeasureContext();
      if (!context) {
        return 0;
      }

      const style = window.getComputedStyle(element);
      const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
      const fontVariant = style.fontVariant && style.fontVariant !== 'normal' ? `${style.fontVariant} ` : '';
      const fontWeight = style.fontWeight && style.fontWeight !== 'normal' ? `${style.fontWeight} ` : '';
      const fontSize = style.fontSize || `${renderedFontSizePx}px`;
      const resolvedFontFamily = style.fontFamily || fontFamily;
      context.font = `${fontStyle}${fontVariant}${fontWeight}${fontSize} ${resolvedFontFamily}`;
      return context.measureText(text).width;
    },
    [fontFamily, getTextDragMeasureContext, renderedFontSizePx]
  );

  const estimateDropOffsetForTextareaPoint = useCallback(
    (element: HTMLTextAreaElement, text: string, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;
      const scrollLeft = element.scrollLeft;
      const scrollTop = element.scrollTop;
      const availableWidth = Math.max(16, element.clientWidth - paddingLeft - paddingRight);

      const relativeY = Math.max(0, clientY - rect.top + scrollTop);
      const lineIndex = Math.max(0, Math.floor(relativeY / lineHeightPx));

      const lineStarts = [0];
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '\n') {
          lineStarts.push(index + 1);
        }
      }

      const clampedLineIndex = Math.min(lineStarts.length - 1, lineIndex);
      const lineStart = lineStarts[clampedLineIndex] ?? 0;
      const lineEnd = clampedLineIndex + 1 < lineStarts.length ? lineStarts[clampedLineIndex + 1] - 1 : text.length;
      const lineText = text.slice(lineStart, lineEnd);

      const context = getTextDragMeasureContext();
      if (!context) {
        return lineStart;
      }

      const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
      const fontVariant = style.fontVariant && style.fontVariant !== 'normal' ? `${style.fontVariant} ` : '';
      const fontWeight = style.fontWeight && style.fontWeight !== 'normal' ? `${style.fontWeight} ` : '';
      const fontSize = style.fontSize || `${renderedFontSizePx}px`;
      const resolvedFontFamily = style.fontFamily || fontFamily;
      context.font = `${fontStyle}${fontVariant}${fontWeight}${fontSize} ${resolvedFontFamily}`;

      const pointerX = Math.max(0, clientX - rect.left + scrollLeft - paddingLeft);
      const wrappedLines = wordWrap ? Math.max(1, Math.floor(pointerX / availableWidth)) : 0;

      if (!wordWrap || wrappedLines === 0) {
        let currentWidth = 0;
        for (let index = 0; index < lineText.length; index += 1) {
          const charWidth = context.measureText(lineText[index] ?? '').width;
          if (pointerX <= currentWidth + charWidth / 2) {
            return lineStart + index;
          }
          currentWidth += charWidth;
        }
        return lineEnd;
      }

      let wrappedStart = 0;
      let wrappedRow = 0;
      while (wrappedStart < lineText.length) {
        let wrappedEnd = wrappedStart;
        let wrappedWidth = 0;
        while (wrappedEnd < lineText.length) {
          const charWidth = context.measureText(lineText[wrappedEnd] ?? '').width;
          if (wrappedWidth > 0 && wrappedWidth + charWidth > availableWidth) {
            break;
          }
          wrappedWidth += charWidth;
          wrappedEnd += 1;
        }

        if (wrappedEnd === wrappedStart) {
          wrappedEnd = wrappedStart + 1;
        }

        if (wrappedRow === wrappedLines || wrappedEnd >= lineText.length) {
          let currentWidth = 0;
          for (let index = wrappedStart; index < wrappedEnd; index += 1) {
            const charWidth = context.measureText(lineText[index] ?? '').width;
            if (pointerX <= currentWidth + charWidth / 2 + wrappedRow * availableWidth) {
              return lineStart + index;
            }
            currentWidth += charWidth;
          }

          return lineStart + wrappedEnd;
        }

        wrappedStart = wrappedEnd;
        wrappedRow += 1;
      }

      return lineEnd;
    },
    [fontFamily, getTextDragMeasureContext, lineHeightPx, renderedFontSizePx, wordWrap]
  );

  const resolveDropOffsetFromPointer = useCallback(
    (element: HTMLTextAreaElement, clientX: number, clientY: number) => {
      const text = getEditableText(element);
      const estimated = estimateDropOffsetForTextareaPoint(element, text, clientX, clientY);
      return Math.max(0, Math.min(text.length, estimated));
    },
    [estimateDropOffsetForTextareaPoint, getEditableText]
  );

  return {
    measureTextWidthByEditorStyle,
    resolveDropOffsetFromPointer,
  };
}
