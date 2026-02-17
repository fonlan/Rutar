import { describe, expect, it, vi } from 'vitest';
import type { DiffTabPayload } from '@/store/useStore';
import { diffEditorTestUtils } from './DiffEditor';

function createDiffPayload(overrides: Partial<DiffTabPayload> = {}): DiffTabPayload {
  return {
    sourceTabId: 'source-tab',
    targetTabId: 'target-tab',
    sourceName: 'source.ts',
    targetName: 'target.ts',
    sourcePath: 'C:\\repo\\source.ts',
    targetPath: 'C:\\repo\\target.ts',
    alignedSourceLines: [],
    alignedTargetLines: [],
    alignedSourcePresent: [],
    alignedTargetPresent: [],
    diffLineNumbers: [],
    sourceDiffLineNumbers: [],
    targetDiffLineNumbers: [],
    sourceLineCount: 1,
    targetLineCount: 1,
    alignedLineCount: 1,
    ...overrides,
  };
}

describe('diffEditorTestUtils.getParentDirectoryPath', () => {
  it('returns parent directory for normal file paths', () => {
    expect(diffEditorTestUtils.getParentDirectoryPath(' C:\\repo\\src\\main.ts ')).toBe('C:\\repo\\src');
    expect(diffEditorTestUtils.getParentDirectoryPath('/usr/local/bin/node')).toBe('/usr/local/bin');
  });

  it('handles roots and invalid values', () => {
    expect(diffEditorTestUtils.getParentDirectoryPath('C:\\file.txt')).toBe('C:\\');
    expect(diffEditorTestUtils.getParentDirectoryPath('/a')).toBe('/');
    expect(diffEditorTestUtils.getParentDirectoryPath('README.md')).toBeNull();
    expect(diffEditorTestUtils.getParentDirectoryPath('')).toBeNull();
  });
});

describe('diffEditorTestUtils.pathBaseName', () => {
  it('extracts basename and trims trailing separators', () => {
    expect(diffEditorTestUtils.pathBaseName(' C:\\repo\\src\\main.ts ')).toBe('main.ts');
    expect(diffEditorTestUtils.pathBaseName('/usr/local/bin/')).toBe('bin');
    expect(diffEditorTestUtils.pathBaseName('single-name')).toBe('single-name');
  });
});

describe('diffEditorTestUtils.resolveAlignedDiffKind', () => {
  it('returns insert/delete/modify/null based on aligned rows', () => {
    expect(
      diffEditorTestUtils.resolveAlignedDiffKind(0, [''], ['hello'], [false], [true])
    ).toBe('insert');
    expect(
      diffEditorTestUtils.resolveAlignedDiffKind(0, ['hello'], [''], [true], [false])
    ).toBe('delete');
    expect(
      diffEditorTestUtils.resolveAlignedDiffKind(0, ['left'], ['right'], [true], [true])
    ).toBe('modify');
    expect(
      diffEditorTestUtils.resolveAlignedDiffKind(0, ['same'], ['same'], [true], [true])
    ).toBeNull();
  });
});

describe('diffEditorTestUtils.getDiffKindStyle', () => {
  it('returns style buckets by diff kind', () => {
    expect(diffEditorTestUtils.getDiffKindStyle('insert').lineNumberClass).toContain('emerald');
    expect(diffEditorTestUtils.getDiffKindStyle('delete').lineNumberClass).toContain('red');
    expect(diffEditorTestUtils.getDiffKindStyle('modify').lineNumberClass).toContain('amber');
  });
});

describe('diffEditorTestUtils clamp helpers', () => {
  it('clamps split ratio and percentage values to safe ranges', () => {
    expect(diffEditorTestUtils.clampRatio(0.1)).toBe(0.2);
    expect(diffEditorTestUtils.clampRatio(0.5)).toBe(0.5);
    expect(diffEditorTestUtils.clampRatio(0.9)).toBe(0.8);

    expect(diffEditorTestUtils.clampPercent(-10)).toBe(0);
    expect(diffEditorTestUtils.clampPercent(33.3)).toBe(33.3);
    expect(diffEditorTestUtils.clampPercent(110)).toBe(100);
  });
});

describe('diffEditorTestUtils.normalizeTextToLines', () => {
  it('normalizes CRLF and CR to LF', () => {
    expect(diffEditorTestUtils.normalizeTextToLines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
  });
});

describe('diffEditorTestUtils.buildFallbackDiffLineNumbers', () => {
  it('returns all line numbers with content differences', () => {
    expect(
      diffEditorTestUtils.buildFallbackDiffLineNumbers(['a', 'b'], ['a', 'x', 'y'])
    ).toEqual([2, 3]);
  });
});

describe('diffEditorTestUtils.ensureBooleanArray', () => {
  it('builds fallback arrays and normalizes values to strict true', () => {
    expect(diffEditorTestUtils.ensureBooleanArray(null, 3, true)).toEqual([true, true, true]);
    expect(diffEditorTestUtils.ensureBooleanArray([true, false, 'true'], 3, false)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('diffEditorTestUtils.normalizeLineDiffResult', () => {
  it('pads line arrays and keeps metadata in safe defaults', () => {
    const result = diffEditorTestUtils.normalizeLineDiffResult({
      alignedSourceLines: ['a'],
      alignedTargetLines: ['a', 'b'],
      alignedSourcePresent: [true],
      alignedTargetPresent: [true, false],
      diffLineNumbers: [2],
      sourceDiffLineNumbers: [2],
      targetDiffLineNumbers: [2],
      sourceLineCount: 0,
      targetLineCount: 0,
      alignedLineCount: 0,
    });

    expect(result.alignedSourceLines).toEqual(['a', '']);
    expect(result.alignedTargetLines).toEqual(['a', 'b']);
    expect(result.alignedSourcePresent).toEqual([true, false]);
    expect(result.sourceLineCount).toBe(1);
    expect(result.targetLineCount).toBe(1);
    expect(result.alignedLineCount).toBe(2);
  });

  it('pads target lines when alignedLineCount is larger than payload lengths', () => {
    const result = diffEditorTestUtils.normalizeLineDiffResult({
      alignedSourceLines: ['a'],
      alignedTargetLines: ['b'],
      alignedSourcePresent: [true],
      alignedTargetPresent: [true],
      diffLineNumbers: undefined as unknown as number[],
      sourceDiffLineNumbers: undefined as unknown as number[],
      targetDiffLineNumbers: undefined as unknown as number[],
      sourceLineCount: 1,
      targetLineCount: 1,
      alignedLineCount: 3,
    });

    expect(result.alignedSourceLines).toEqual(['a', '', '']);
    expect(result.alignedTargetLines).toEqual(['b', '', '']);
    expect(result.diffLineNumbers).toEqual([]);
    expect(result.sourceDiffLineNumbers).toEqual([]);
    expect(result.targetDiffLineNumbers).toEqual([]);
    expect(result.alignedLineCount).toBe(3);
  });
});

describe('diffEditorTestUtils.buildInitialDiff', () => {
  it('uses aligned payload when available', () => {
    const payload = createDiffPayload({
      alignedSourceLines: ['a'],
      alignedTargetLines: ['b'],
      alignedSourcePresent: [true],
      alignedTargetPresent: [true],
      diffLineNumbers: [1],
      sourceDiffLineNumbers: [1],
      targetDiffLineNumbers: [1],
      sourceLineCount: 1,
      targetLineCount: 1,
      alignedLineCount: 1,
    });

    const result = diffEditorTestUtils.buildInitialDiff(payload);
    expect(result.alignedSourceLines).toEqual(['a']);
    expect(result.alignedTargetLines).toEqual(['b']);
    expect(result.diffLineNumbers).toEqual([1]);
  });

  it('falls back to source/target content for old payload shape', () => {
    const payload = createDiffPayload({
      sourceContent: 'line1\r\nline2',
      targetContent: 'line1\nlineX\nline3',
      alignedSourceLines: [],
      alignedTargetLines: [],
      diffLineNumbers: [],
    });

    const result = diffEditorTestUtils.buildInitialDiff(payload);
    expect(result.alignedSourceLines).toEqual(['line1', 'line2', '']);
    expect(result.alignedTargetLines).toEqual(['line1', 'lineX', 'line3']);
    expect(result.diffLineNumbers).toEqual([2, 3]);
    expect(result.sourceDiffLineNumbers).toEqual([2]);
    expect(result.targetDiffLineNumbers).toEqual([2, 3]);
  });
});

describe('diffEditorTestUtils.buildLineNumberByAlignedRow', () => {
  it('maps aligned rows to concrete line numbers', () => {
    expect(diffEditorTestUtils.buildLineNumberByAlignedRow([true, false, true])).toEqual([1, 0, 2]);
  });
});

describe('diffEditorTestUtils.extractActualLines', () => {
  it('filters out virtual empty rows and keeps concrete text', () => {
    expect(diffEditorTestUtils.extractActualLines(['a', '', 'b'], [true, false, false])).toEqual([
      'a',
      'b',
    ]);
    expect(diffEditorTestUtils.extractActualLines(['', ''], [false, false])).toEqual(['']);
  });
});

describe('diffEditorTestUtils.buildAlignedDiffMetadata', () => {
  it('builds per-side diff line metadata and concrete counts', () => {
    const result = diffEditorTestUtils.buildAlignedDiffMetadata(
      ['', 'same'],
      ['target-only', 'same'],
      [false, true],
      [true, true]
    );

    expect(result.diffLineNumbers).toEqual([1]);
    expect(result.sourceDiffLineNumbers).toEqual([]);
    expect(result.targetDiffLineNumbers).toEqual([1]);
    expect(result.sourceLineCount).toBe(1);
    expect(result.targetLineCount).toBe(2);
    expect(result.alignedLineCount).toBe(2);
  });

  it('includes source-side diff lines when source row is concrete and target row is virtual', () => {
    const result = diffEditorTestUtils.buildAlignedDiffMetadata(
      ['source-only'],
      [''],
      [true],
      [false]
    );

    expect(result.diffLineNumbers).toEqual([1]);
    expect(result.sourceDiffLineNumbers).toEqual([1]);
    expect(result.targetDiffLineNumbers).toEqual([]);
  });
});

describe('diffEditorTestUtils.findAlignedRowIndexByLineNumber', () => {
  it('finds aligned row index by concrete line number', () => {
    expect(diffEditorTestUtils.findAlignedRowIndexByLineNumber([true, false, true], 1)).toBe(0);
    expect(diffEditorTestUtils.findAlignedRowIndexByLineNumber([true, false, true], 2)).toBe(2);
    expect(diffEditorTestUtils.findAlignedRowIndexByLineNumber([true, false, true], 3)).toBe(-1);
    expect(diffEditorTestUtils.findAlignedRowIndexByLineNumber([true, false, true], 0)).toBe(-1);
  });
});

describe('diffEditorTestUtils offset helpers', () => {
  it('maps offsets to line indices', () => {
    const text = 'aa\nbbb\nc';
    expect(diffEditorTestUtils.getLineIndexFromTextOffset(text, 0)).toBe(0);
    expect(diffEditorTestUtils.getLineIndexFromTextOffset(text, 3)).toBe(1);
    expect(diffEditorTestUtils.getLineIndexFromTextOffset(text, text.length)).toBe(2);
  });

  it('computes selected line ranges with collapsed and expanded selections', () => {
    const text = 'aa\nbbb\nc';
    expect(diffEditorTestUtils.getSelectedLineRangeByOffset(text, 4, 4)).toEqual({
      startLine: 1,
      endLine: 1,
    });
    expect(diffEditorTestUtils.getSelectedLineRangeByOffset(text, 1, 7)).toEqual({
      startLine: 0,
      endLine: 1,
    });
  });
});

describe('diffEditorTestUtils.buildCopyTextWithoutVirtualRows', () => {
  it('skips virtual rows while keeping selected concrete content', () => {
    const text = 'aa\nbb\ncc';
    expect(diffEditorTestUtils.buildCopyTextWithoutVirtualRows(text, 0, text.length, [true, false, true])).toBe(
      'aa\ncc'
    );
    expect(diffEditorTestUtils.buildCopyTextWithoutVirtualRows(text, 2, 2, [true, false, true])).toBeNull();
  });
});

describe('diffEditorTestUtils.getLineSelectionRange', () => {
  it('returns line-range offsets for a given row', () => {
    expect(diffEditorTestUtils.getLineSelectionRange(['ab', 'c', ''], 1)).toEqual({
      start: 3,
      end: 4,
    });
  });
});

describe('diffEditorTestUtils.getNextMatchedRow', () => {
  it('navigates and wraps for next/previous lookup', () => {
    const matchedRows = [2, 5, 8];
    expect(diffEditorTestUtils.getNextMatchedRow(matchedRows, null, 'next')).toBe(2);
    expect(diffEditorTestUtils.getNextMatchedRow(matchedRows, null, 'prev')).toBe(8);
    expect(diffEditorTestUtils.getNextMatchedRow(matchedRows, 5, 'next')).toBe(8);
    expect(diffEditorTestUtils.getNextMatchedRow(matchedRows, 5, 'prev')).toBe(2);
    expect(diffEditorTestUtils.getNextMatchedRow(matchedRows, 3, 'prev')).toBe(8);
  });

  it('returns null when no matched rows are available', () => {
    expect(diffEditorTestUtils.getNextMatchedRow([], null, 'next')).toBeNull();
  });
});

describe('diffEditorTestUtils.reconcilePresenceAfterTextEdit', () => {
  it('keeps prefix/suffix presence and marks edited span as concrete', () => {
    const result = diffEditorTestUtils.reconcilePresenceAfterTextEdit(
      ['A', 'B', 'C', 'D'],
      [true, false, true, false],
      ['A', 'X', 'C', 'D']
    );
    expect(result).toEqual([true, true, true, false]);
  });
});

describe('diffEditorTestUtils trailing-newline and serialization helpers', () => {
  it('infers trailing newline only for multiline with empty last line', () => {
    expect(diffEditorTestUtils.inferTrailingNewlineFromLines(1, [''])).toBe(false);
    expect(diffEditorTestUtils.inferTrailingNewlineFromLines(2, ['hello', ''])).toBe(true);
    expect(diffEditorTestUtils.inferTrailingNewlineFromLines(2, [])).toBe(false);
  });

  it('serializes lines with optional trailing newline', () => {
    expect(diffEditorTestUtils.serializeLines([], false)).toBe('');
    expect(diffEditorTestUtils.serializeLines(['a', 'b'], true)).toBe('a\nb\n');
  });
});

describe('diffEditorTestUtils.computeTextPatch', () => {
  it('returns minimal changed span for replacements and inserts', () => {
    expect(diffEditorTestUtils.computeTextPatch('abc123xyz', 'abcZZxyz')).toEqual({
      startChar: 3,
      endChar: 6,
      newText: 'ZZ',
    });
    expect(diffEditorTestUtils.computeTextPatch('abc', 'abXc')).toEqual({
      startChar: 2,
      endChar: 2,
      newText: 'X',
    });
  });
});

describe('diffEditorTestUtils.bindScrollerViewport', () => {
  it('returns default viewport when scroller is null', () => {
    const snapshots: Array<{ topPercent: number; heightPercent: number }> = [];
    const cleanup = diffEditorTestUtils.bindScrollerViewport(null, (value) => {
      snapshots.push(value);
    });

    expect(snapshots).toEqual([{ topPercent: 0, heightPercent: 100 }]);
    expect(typeof cleanup).toBe('function');
    expect(cleanup()).toBeUndefined();
  });

  it('updates viewport on scroll and stops after cleanup', () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const disconnectMock = vi.fn();
    let resizeObserverCallback: ResizeObserverCallback | null = null;

    class ResizeObserverMock {
      observe = vi.fn();
      disconnect = disconnectMock;
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });

    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 0 });

    const snapshots: Array<{ topPercent: number; heightPercent: number }> = [];
    const cleanup = diffEditorTestUtils.bindScrollerViewport(scroller, (value) => {
      snapshots.push(value);
    });

    expect(snapshots[snapshots.length - 1]).toEqual({ topPercent: 0, heightPercent: 20 });

    scroller.scrollTop = 400;
    scroller.dispatchEvent(new Event('scroll'));
    const latestSnapshot = snapshots[snapshots.length - 1];
    expect(latestSnapshot?.topPercent).toBeCloseTo(40, 3);
    expect(latestSnapshot?.heightPercent).toBe(20);

    scroller.scrollTop = 600;
    resizeObserverCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
    const resizeSnapshot = snapshots[snapshots.length - 1];
    expect(resizeSnapshot?.topPercent).toBeCloseTo(60, 3);
    expect(resizeSnapshot?.heightPercent).toBe(20);

    const snapshotCountBeforeCleanup = snapshots.length;
    cleanup();
    expect(disconnectMock).toHaveBeenCalledTimes(1);

    scroller.scrollTop = 500;
    scroller.dispatchEvent(new Event('scroll'));
    expect(snapshots.length).toBe(snapshotCountBeforeCleanup);

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: originalResizeObserver,
    });
  });
});
