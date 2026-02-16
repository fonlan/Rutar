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

  it('detects large-file edit intent keys', () => {
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'a',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(true);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'Enter',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(true);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'v',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(true);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(false);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'x',
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        isComposing: false,
      } as never)
    ).toBe(false);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'a',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: true,
      } as never)
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

  it('reads and writes input-layer text for textarea and contenteditable-like nodes', () => {
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');

    expect(editorTestUtils.isTextareaInputElement(textarea)).toBe(true);
    expect(editorTestUtils.isTextareaInputElement(div as never)).toBe(false);
    expect(editorTestUtils.isTextareaInputElement(null)).toBe(false);

    editorTestUtils.setInputLayerText(textarea, `a${EMPTY_LINE_PLACEHOLDER}\r\nb`);
    expect(textarea.value).toBe('a\nb');
    expect(editorTestUtils.getEditableText(textarea)).toBe('a\nb');

    editorTestUtils.setInputLayerText(div as never, 'x\n');
    expect(div.textContent).toBe(`x\n${EMPTY_LINE_PLACEHOLDER}`);
    expect(editorTestUtils.getEditableText(div as never)).toBe('x\n');
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

  it('handles caret line and selection offsets in textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'a\nb\nc';
    textarea.setSelectionRange(4, 4);
    expect(editorTestUtils.getCaretLineInElement(textarea)).toBe(3);

    textarea.setSelectionRange(2, 4, 'backward');
    expect(editorTestUtils.getSelectionOffsetsInElement(textarea)).toEqual({
      start: 2,
      end: 4,
      isCollapsed: false,
    });

    textarea.setSelectionRange(2, 4, 'forward');
    expect(editorTestUtils.getSelectionAnchorFocusOffsetsInElement(textarea)).toEqual({
      anchor: 2,
      focus: 4,
    });

    textarea.setSelectionRange(2, 4, 'backward');
    expect(editorTestUtils.getSelectionAnchorFocusOffsetsInElement(textarea)).toEqual({
      anchor: 4,
      focus: 2,
    });
  });

  it('handles caret line and selection offsets in div text nodes', () => {
    const div = document.createElement('div');
    div.textContent = 'ab\ncd\nef';
    document.body.appendChild(div);
    const textNode = div.firstChild as Text;
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Selection API unavailable in test environment');
    }

    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(textNode, 4);
    range.collapse(true);
    selection.addRange(range);
    expect(editorTestUtils.getCaretLineInElement(div as never)).toBe(2);

    const selectRange = document.createRange();
    selectRange.setStart(textNode, 1);
    selectRange.setEnd(textNode, 6);
    selection.removeAllRanges();
    selection.addRange(selectRange);
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toEqual({
      start: 1,
      end: 6,
      isCollapsed: false,
    });
    expect(editorTestUtils.getSelectionAnchorFocusOffsetsInElement(div as never)).toEqual({
      anchor: 1,
      focus: 6,
    });

    selection.removeAllRanges();
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toBeNull();
    expect(editorTestUtils.getSelectionAnchorFocusOffsetsInElement(div as never)).toBeNull();
    expect(editorTestUtils.getCaretLineInElement(div as never)).toBeNull();

    div.remove();
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
