import { describe, expect, it } from 'vitest';
import { editorTestUtils } from './Editor';

const EMPTY_LINE_PLACEHOLDER = '\u200B';

describe('editorTestUtils shortcut helpers', () => {
  it('matches toggle-line-comment shortcuts', () => {
    expect(
      editorTestUtils.isToggleLineCommentShortcut({
        key: '/',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      })
    ).toBe(true);
    expect(
      editorTestUtils.isToggleLineCommentShortcut({
        key: '',
        code: 'NumpadDivide',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
      })
    ).toBe(true);
    expect(
      editorTestUtils.isToggleLineCommentShortcut({
        key: '/',
        ctrlKey: true,
        metaKey: false,
        altKey: true,
      })
    ).toBe(false);
  });

  it('matches vertical selection shortcuts', () => {
    expect(
      editorTestUtils.isVerticalSelectionShortcut({
        key: 'ArrowUp',
        altKey: true,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBe(true);
    expect(
      editorTestUtils.isVerticalSelectionShortcut({
        key: 'ArrowUp',
        altKey: true,
        shiftKey: true,
        ctrlKey: true,
        metaKey: false,
      })
    ).toBe(false);
  });
});

describe('editorTestUtils text normalization helpers', () => {
  it('normalizes editor and line text', () => {
    expect(editorTestUtils.normalizeEditorText('a\r\nb')).toBe('a\nb');
    expect(editorTestUtils.normalizeEditorText('\n')).toBe('');
    expect(editorTestUtils.normalizeLineText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('normalizes editable and segment text by stripping placeholder', () => {
    const input = `a${EMPTY_LINE_PLACEHOLDER}\r\nb`;
    expect(editorTestUtils.normalizeEditableLineText(input)).toBe('a\nb');
    expect(editorTestUtils.normalizeSegmentText(`x${EMPTY_LINE_PLACEHOLDER}\r\ny`)).toBe('x\ny');
  });

  it('builds input-layer text with trailing placeholder for final newline', () => {
    expect(editorTestUtils.toInputLayerText('abc')).toBe('abc');
    expect(editorTestUtils.toInputLayerText('abc\n')).toBe(`abc\n${EMPTY_LINE_PLACEHOLDER}`);
  });
});

describe('editorTestUtils offset and coordinate helpers', () => {
  it('maps logical offset into safe input-layer offset', () => {
    expect(editorTestUtils.mapLogicalOffsetToInputLayerOffset('abc', -1)).toBe(0);
    expect(editorTestUtils.mapLogicalOffsetToInputLayerOffset('abc', 1.9)).toBe(1);
    expect(editorTestUtils.mapLogicalOffsetToInputLayerOffset('abc', 99)).toBe(3);
  });

  it('converts line/column to code-unit offset', () => {
    const text = 'ab\ncde\nf';
    expect(editorTestUtils.getCodeUnitOffsetFromLineColumn(text, 1, 1)).toBe(0);
    expect(editorTestUtils.getCodeUnitOffsetFromLineColumn(text, 2, 2)).toBe(4);
    expect(editorTestUtils.getCodeUnitOffsetFromLineColumn(text, 99, 1)).toBe(text.length);
  });

  it('converts offset back to line and zero-based column', () => {
    const text = 'ab\ncde';
    expect(editorTestUtils.codeUnitOffsetToLineColumn(text, 0)).toEqual({ line: 1, column: 0 });
    expect(editorTestUtils.codeUnitOffsetToLineColumn(text, 4)).toEqual({ line: 2, column: 1 });
  });

  it('maps code-unit offset to unicode-scalar index', () => {
    const text = 'A😀B';
    expect(editorTestUtils.codeUnitOffsetToUnicodeScalarIndex(text, 0)).toBe(0);
    expect(editorTestUtils.codeUnitOffsetToUnicodeScalarIndex(text, 1)).toBe(1);
    expect(editorTestUtils.codeUnitOffsetToUnicodeScalarIndex(text, 2)).toBe(1);
    expect(editorTestUtils.codeUnitOffsetToUnicodeScalarIndex(text, 3)).toBe(2);
    expect(editorTestUtils.codeUnitOffsetToUnicodeScalarIndex(text, 4)).toBe(3);
  });
});

describe('editorTestUtils diff and compare helpers', () => {
  it('checks pair-highlight positions with stable ordering', () => {
    expect(
      editorTestUtils.arePairHighlightPositionsEqual(
        [
          { line: 1, column: 2 },
          { line: 3, column: 4 },
        ],
        [
          { line: 1, column: 2 },
          { line: 3, column: 4 },
        ]
      )
    ).toBe(true);
    expect(
      editorTestUtils.arePairHighlightPositionsEqual(
        [{ line: 1, column: 2 }],
        [{ line: 2, column: 2 }]
      )
    ).toBe(false);
  });

  it('builds minimal code-unit diff and handles no-op', () => {
    expect(editorTestUtils.buildCodeUnitDiff('abc', 'abc')).toBeNull();
    expect(editorTestUtils.buildCodeUnitDiff('abc123xyz', 'abcZZxyz')).toEqual({
      start: 3,
      end: 6,
      newText: 'ZZ',
    });
  });
});

describe('editorTestUtils geometry and scroll helpers', () => {
  it('aligns to device pixel and rounds scroll offsets', () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });

    expect(editorTestUtils.alignToDevicePixel(1.26)).toBe(1.5);
    expect(editorTestUtils.alignScrollOffset(12.6)).toBe(13);
    expect(editorTestUtils.alignScrollOffset(Number.NaN)).toBe(0);

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalDpr,
    });
  });

  it('detects scrollbar hit on vertical and horizontal rails', () => {
    const element = document.createElement('div');
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 120 },
      clientWidth: { configurable: true, value: 100 },
      offsetHeight: { configurable: true, value: 120 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 200 },
    });
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 10,
        right: 130,
        bottom: 130,
      }) as DOMRect;

    expect(editorTestUtils.isPointerOnScrollbar(element, 125, 30)).toBe(true);
    expect(editorTestUtils.isPointerOnScrollbar(element, 30, 125)).toBe(true);
    expect(editorTestUtils.isPointerOnScrollbar(element, 30, 30)).toBe(false);
  });
});

describe('editorTestUtils rectangular/line range helpers', () => {
  it('normalizes rectangular selection bounds', () => {
    expect(editorTestUtils.normalizeRectangularSelection(null)).toBeNull();
    expect(
      editorTestUtils.normalizeRectangularSelection({
        anchorLine: 4,
        anchorColumn: 10,
        focusLine: 2,
        focusColumn: 3,
      })
    ).toEqual({
      startLine: 2,
      endLine: 4,
      startColumn: 3,
      endColumn: 10,
      lineCount: 3,
      width: 7,
    });
  });

  it('builds line-start offsets and resolves line bounds', () => {
    const text = 'ab\nc\n';
    const starts = editorTestUtils.buildLineStartOffsets(text);
    expect(starts).toEqual([0, 3, 5]);
    expect(editorTestUtils.getLineBoundsByLineNumber(text, starts, 2)).toEqual({
      start: 3,
      end: 4,
    });
    expect(editorTestUtils.getLineBoundsByLineNumber(text, starts, 99)).toBeNull();
  });

  it('maps column into line range offset', () => {
    expect(editorTestUtils.getOffsetForColumnInLine(10, 15, 1)).toBe(10);
    expect(editorTestUtils.getOffsetForColumnInLine(10, 15, 99)).toBe(15);
  });
});

describe('editorTestUtils.dispatchDocumentUpdated', () => {
  it('dispatches document-updated event with tab id', () => {
    let detail: { tabId: string } | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail as { tabId: string };
    };

    window.addEventListener('rutar:document-updated', listener as EventListener);
    editorTestUtils.dispatchDocumentUpdated('tab-editor');
    window.removeEventListener('rutar:document-updated', listener as EventListener);

    expect(detail).toEqual({ tabId: 'tab-editor' });
  });
});
