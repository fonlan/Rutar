import { describe, expect, it, vi } from 'vitest';
import { editorTestUtils } from './Editor';

const EMPTY_LINE_PLACEHOLDER = '\u200B';

function restoreProperty(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

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

  it('rejects toggle-line-comment when composing or missing primary modifier', () => {
    expect(
      editorTestUtils.isToggleLineCommentShortcut({
        key: '/',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: true,
      })
    ).toBe(false);
    expect(
      editorTestUtils.isToggleLineCommentShortcut({
        key: '/',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
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

  it('rejects vertical selection when key is unsupported or composing', () => {
    expect(
      editorTestUtils.isVerticalSelectionShortcut({
        key: 'A',
        altKey: true,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBe(false);
    expect(
      editorTestUtils.isVerticalSelectionShortcut({
        key: 'ArrowDown',
        altKey: true,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        isComposing: true,
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
        key: 'x',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(true);
    expect(
      editorTestUtils.isLargeModeEditIntent({
        key: 'V',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        isComposing: false,
      } as never)
    ).toBe(true);
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
    expect(editorTestUtils.toInputLayerText(`ab${EMPTY_LINE_PLACEHOLDER}\n`)).toBe(
      `ab\n${EMPTY_LINE_PLACEHOLDER}`
    );
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
    expect(
      editorTestUtils.mapLogicalOffsetToInputLayerOffset(`a${EMPTY_LINE_PLACEHOLDER}b`, 99)
    ).toBe(2);
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
    expect(editorTestUtils.codeUnitOffsetToLineColumn(text, -3)).toEqual({ line: 1, column: 0 });
    expect(editorTestUtils.codeUnitOffsetToLineColumn(text, 99)).toEqual({ line: 2, column: 3 });
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

  it('returns null offsets when DOM selection is outside current element', () => {
    const target = document.createElement('div');
    target.textContent = 'target';
    const outside = document.createElement('div');
    outside.textContent = 'outside';
    document.body.append(target, outside);

    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Selection API unavailable in test environment');
    }

    const outsideTextNode = outside.firstChild as Text;
    const range = document.createRange();
    range.setStart(outsideTextNode, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(editorTestUtils.getCaretLineInElement(target as never)).toBeNull();
    expect(editorTestUtils.getSelectionOffsetsInElement(target as never)).toBeNull();
    expect(editorTestUtils.getSelectionAnchorFocusOffsetsInElement(target as never)).toBeNull();

    selection.removeAllRanges();
    target.remove();
    outside.remove();
  });

  it('sets caret and selection by code-unit offsets for textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'ab\ncd';

    editorTestUtils.setCaretToCodeUnitOffset(textarea, 99);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);

    editorTestUtils.setSelectionToCodeUnitOffsets(textarea, 4, 1);
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(4);

    editorTestUtils.setCaretToLineColumn(textarea, 2, 2);
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(4);
  });

  it('sets caret and selection by code-unit offsets for div text nodes', () => {
    const div = document.createElement('div');
    div.textContent = 'abcd';
    document.body.appendChild(div);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Selection API unavailable in test environment');
    }

    editorTestUtils.setCaretToCodeUnitOffset(div as never, 2);
    expect(selection.anchorOffset).toBe(2);
    expect(selection.focusOffset).toBe(2);

    editorTestUtils.setSelectionToCodeUnitOffsets(div as never, 3, 1);
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toEqual({
      start: 1,
      end: 3,
      isCollapsed: false,
    });

    editorTestUtils.setCaretToLineColumn(div as never, 1, 3);
    expect(selection.anchorOffset).toBe(2);

    selection.removeAllRanges();
    div.remove();
  });

  it('normalizes non-text first child before setting caret and selection', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'abcd';
    div.appendChild(span);
    document.body.appendChild(div);

    editorTestUtils.setCaretToCodeUnitOffset(div as never, 2);
    expect(div.firstChild?.nodeType).toBe(Node.TEXT_NODE);

    editorTestUtils.setSelectionToCodeUnitOffsets(div as never, 4, 1);
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toEqual({
      start: 1,
      end: 4,
      isCollapsed: false,
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    div.remove();
  });

  it('rebuilds text node in setCaretToLineColumn when input layer has element children', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'ab\ncd';
    div.appendChild(span);
    document.body.appendChild(div);

    editorTestUtils.setCaretToLineColumn(div as never, 2, 2);
    expect(div.firstChild?.nodeType).toBe(Node.TEXT_NODE);

    const selection = window.getSelection();
    expect(selection?.anchorOffset).toBe(4);
    expect(selection?.focusOffset).toBe(4);

    selection?.removeAllRanges();
    div.remove();
  });

  it('dispatches editor input event and normalizes contenteditable DOM structure', () => {
    const div = document.createElement('div');
    const left = document.createElement('span');
    left.textContent = 'ab';
    const right = document.createElement('span');
    right.textContent = 'cd';
    div.append(left, right);
    document.body.appendChild(div);

    const textStart = left.firstChild as Text;
    const textEnd = right.firstChild as Text;
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Selection API unavailable in test environment');
    }

    const range = document.createRange();
    range.setStart(textStart, 1);
    range.setEnd(textEnd, 1);
    selection.removeAllRanges();
    selection.addRange(range);

    const onInput = vi.fn();
    div.addEventListener('input', onInput);
    editorTestUtils.dispatchEditorInputEvent(div as never);
    expect(onInput).toHaveBeenCalledTimes(1);

    editorTestUtils.normalizeInputLayerDom(div as never);
    expect(div.childNodes.length).toBe(1);
    expect(div.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(div.textContent).toBe('abcd');
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toEqual({
      start: 1,
      end: 3,
      isCollapsed: false,
    });

    selection.removeAllRanges();
    div.remove();
  });

  it('keeps textarea and single-text-node div unchanged during input-layer normalization', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'abc';
    editorTestUtils.normalizeInputLayerDom(textarea);
    expect(textarea.value).toBe('abc');

    const div = document.createElement('div');
    div.textContent = 'single-node';
    const before = div.textContent;
    editorTestUtils.normalizeInputLayerDom(div as never);
    expect(div.textContent).toBe(before);
    expect(div.childNodes.length).toBe(1);
  });

  it('normalizes DOM without selection and keeps cursor unset', () => {
    const div = document.createElement('div');
    const left = document.createElement('span');
    left.textContent = 'a';
    const right = document.createElement('span');
    right.textContent = 'b';
    div.append(left, right);
    document.body.appendChild(div);

    window.getSelection()?.removeAllRanges();
    editorTestUtils.normalizeInputLayerDom(div as never);
    expect(div.childNodes.length).toBe(1);
    expect(div.textContent).toBe('ab');
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toBeNull();

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
    expect(
      editorTestUtils.arePairHighlightPositionsEqual(
        [{ line: 1, column: 2 }],
        [
          { line: 1, column: 2 },
          { line: 2, column: 2 },
        ]
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
    expect(editorTestUtils.buildCodeUnitDiff('abc', 'abXYc')).toEqual({
      start: 2,
      end: 2,
      newText: 'XY',
    });
    expect(editorTestUtils.buildCodeUnitDiff('abXYc', 'abc')).toEqual({
      start: 2,
      end: 4,
      newText: '',
    });
  });
});

describe('editorTestUtils pointer, clipboard and replace helpers', () => {
  it('resolves logical offset from DOM point and ignores textarea', () => {
    const textarea = document.createElement('textarea');
    expect(
      editorTestUtils.getLogicalOffsetFromDomPoint(textarea, document.body, 0)
    ).toBeNull();

    const div = document.createElement('div');
    div.textContent = `a${EMPTY_LINE_PLACEHOLDER}b`;
    const textNode = div.firstChild as Text;
    expect(
      editorTestUtils.getLogicalOffsetFromDomPoint(
        div as never,
        textNode,
        textNode.textContent?.length ?? 0
      )
    ).toBe(2);
  });

  it('resolves logical offset from point for textarea selection focus', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'abcd';
    textarea.setSelectionRange(1, 3, 'backward');

    expect(editorTestUtils.getLogicalOffsetFromPoint(textarea, 0, 0)).toBe(1);
  });

  it('resolves logical offset from point via caretPositionFromPoint and caretRangeFromPoint', () => {
    const originalCaretPosition = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
    const originalCaretRange = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
    const div = document.createElement('div');
    div.textContent = 'ab\ncd';
    const textNode = div.firstChild as Text;
    document.body.appendChild(div);

    try {
      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: vi.fn(() => ({ offsetNode: textNode, offset: 4 })),
      });
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: undefined,
      });
      expect(editorTestUtils.getLogicalOffsetFromPoint(div as never, 10, 10)).toBe(4);

      const outsideNode = document.createTextNode('x');
      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: vi.fn(() => ({ offsetNode: outsideNode, offset: 1 })),
      });
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: vi.fn(() => {
          const range = document.createRange();
          range.setStart(textNode, 2);
          range.collapse(true);
          return range;
        }),
      });
      expect(editorTestUtils.getLogicalOffsetFromPoint(div as never, 10, 10)).toBe(2);

      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: undefined,
      });
      expect(editorTestUtils.getLogicalOffsetFromPoint(div as never, 10, 10)).toBeNull();
    } finally {
      restoreProperty(document, 'caretPositionFromPoint', originalCaretPosition);
      restoreProperty(document, 'caretRangeFromPoint', originalCaretRange);
      div.remove();
    }
  });

  it('writes plain text to clipboard via navigator.clipboard when available', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      await editorTestUtils.writePlainTextToClipboard('hello');
      expect(writeText).toHaveBeenCalledWith('hello');
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('falls back to execCommand when Clipboard API is unavailable', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const beforeCount = document.body.querySelectorAll('textarea').length;
    const execCommand = vi.fn(() => true);

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      await editorTestUtils.writePlainTextToClipboard('fallback');
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(document.body.querySelectorAll('textarea').length).toBe(beforeCount);
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
      restoreProperty(document, 'execCommand', originalExecCommand);
    }
  });

  it('throws when fallback copy is not supported', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      });

      await expect(editorTestUtils.writePlainTextToClipboard('fail')).rejects.toThrow(
        'Clipboard copy not supported'
      );
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
      restoreProperty(document, 'execCommand', originalExecCommand);
    }
  });

  it('replaces selected text and normalizes CRLF input', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'abcd';
    textarea.setSelectionRange(1, 3);

    const replaced = editorTestUtils.replaceSelectionWithText(textarea, 'X\r\nY');
    expect(replaced).toBe(true);
    expect(textarea.value).toBe('aX\nYd');
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(4);
  });

  it('replaces text after deriving collapsed selection in contenteditable-like input', () => {
    const div = document.createElement('div');
    div.textContent = 'ab';
    document.body.appendChild(div);
    window.getSelection()?.removeAllRanges();

    const replaced = editorTestUtils.replaceSelectionWithText(div as never, 'Z');
    expect(replaced).toBe(true);
    expect(div.textContent).toBe('abZ');
    expect(editorTestUtils.getSelectionOffsetsInElement(div as never)).toEqual({
      start: 3,
      end: 3,
      isCollapsed: true,
    });

    window.getSelection()?.removeAllRanges();
    div.remove();
  });

  it('returns false when selection cannot be resolved', () => {
    const div = document.createElement('div');
    div.textContent = 'ab';
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(null);

    try {
      expect(editorTestUtils.replaceSelectionWithText(div as never, 'Z')).toBe(false);
    } finally {
      getSelectionSpy.mockRestore();
    }
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
    expect(editorTestUtils.alignScrollOffset(-1.6)).toBe(-2);
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

  it('uses fallback hit area for overlay scrollbars and returns false when not scrollable', () => {
    const overlayElement = document.createElement('div');
    Object.defineProperties(overlayElement, {
      offsetWidth: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      offsetHeight: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 200 },
    });
    overlayElement.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 10,
        right: 110,
        bottom: 110,
      }) as DOMRect;

    expect(editorTestUtils.isPointerOnScrollbar(overlayElement, 104, 40)).toBe(true);
    expect(editorTestUtils.isPointerOnScrollbar(overlayElement, 40, 104)).toBe(true);

    const nonScrollable = document.createElement('div');
    Object.defineProperties(nonScrollable, {
      offsetWidth: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      offsetHeight: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 100 },
    });
    nonScrollable.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 10,
        right: 110,
        bottom: 110,
      }) as DOMRect;

    expect(editorTestUtils.isPointerOnScrollbar(nonScrollable, 104, 104)).toBe(false);
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
