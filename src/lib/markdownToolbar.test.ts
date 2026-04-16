import { describe, expect, it } from 'vitest';
import { applyMarkdownToolbarAction, buildIndentationUnit, type MarkdownToolbarTransformResult } from './markdownToolbar';

function applyResultToText(source: string, result: MarkdownToolbarTransformResult | null) {
  if (!result) {
    return null;
  }
  const nextText = source.slice(0, result.replaceStart) + result.insertText + source.slice(result.replaceEnd);
  return {
    nextText,
    selectedText: nextText.slice(result.selectionStart, result.selectionEnd),
  };
}

describe('markdownToolbar', () => {
  it('sets and clears heading prefixes across the current line', () => {
    const headingResult = applyMarkdownToolbarAction({
      text: 'Title',
      selectionStart: 0,
      selectionEnd: 0,
      action: { type: 'set_heading', level: 'h2' },
      indentationUnit: '  ',
    });
    const headingApplied = applyResultToText('Title', headingResult);
    expect(headingApplied?.nextText).toBe('## Title');

    const bodyResult = applyMarkdownToolbarAction({
      text: '## Title',
      selectionStart: 0,
      selectionEnd: 0,
      action: { type: 'set_heading', level: 'body' },
      indentationUnit: '  ',
    });
    const bodyApplied = applyResultToText('## Title', bodyResult);
    expect(bodyApplied?.nextText).toBe('Title');
  });

  it('toggles ordered list markers on selected lines', () => {
    const source = 'alpha\nbeta';
    const addResult = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'toggle_ordered_list' },
      indentationUnit: '  ',
    });
    const added = applyResultToText(source, addResult);
    expect(added?.nextText).toBe('1. alpha\n2. beta');

    const removeResult = applyMarkdownToolbarAction({
      text: added?.nextText ?? '',
      selectionStart: 0,
      selectionEnd: (added?.nextText ?? '').length,
      action: { type: 'toggle_ordered_list' },
      indentationUnit: '  ',
    });
    const removed = applyResultToText(added?.nextText ?? '', removeResult);
    expect(removed?.nextText).toBe(source);
  });

  it('numbers ordered list items sequentially across non-empty selected lines', () => {
    const source = 'alpha\n\nbeta';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'toggle_ordered_list' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('1. alpha\n\n2. beta');
  });

  it('toggles task list markers on non-empty lines', () => {
    const source = 'first\n\nsecond';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'toggle_task_list' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('- [ ] first\n\n- [ ] second');
  });

  it('indents and outdents selected lines with the configured indentation unit', () => {
    const source = 'alpha\nbeta';
    const indentationUnit = buildIndentationUnit('spaces', 2);
    const indentResult = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'indent' },
      indentationUnit,
    });
    const indented = applyResultToText(source, indentResult);
    expect(indented?.nextText).toBe('  alpha\n  beta');

    const outdentResult = applyMarkdownToolbarAction({
      text: indented?.nextText ?? '',
      selectionStart: 0,
      selectionEnd: (indented?.nextText ?? '').length,
      action: { type: 'outdent' },
      indentationUnit,
    });
    const outdented = applyResultToText(indented?.nextText ?? '', outdentResult);
    expect(outdented?.nextText).toBe(source);
  });

  it('wraps selected text in a fenced code block', () => {
    const source = 'alpha';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'insert_code_block' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('```text\nalpha\n```');
  });

  it('inserts a table template and selects the first header cell', () => {
    const result = applyMarkdownToolbarAction({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      action: { type: 'insert_table' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText('', result);
    expect(applied?.nextText).toContain('| Column 1 | Column 2 | Column 3 |');
    expect(applied?.selectedText).toBe('Column 1');
  });

  it('inserts a standalone horizontal rule between paragraphs', () => {
    const source = 'alpha';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: source.length,
      selectionEnd: source.length,
      action: { type: 'insert_horizontal_rule' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('alpha\n\n---');
  });

  it('inserts inline placeholders when no text is selected', () => {
    const result = applyMarkdownToolbarAction({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      action: { type: 'toggle_bold' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText('', result);
    expect(applied?.nextText).toBe('**bold text**');
    expect(applied?.selectedText).toBe('bold text');
  });

  it('wraps selected text as a link and selects the URL placeholder', () => {
    const source = 'Docs';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'insert_link' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('[Docs](https://example.com)');
    expect(applied?.selectedText).toBe('https://example.com');
  });

  it('wraps text with HTML color markup and selects the placeholder when empty', () => {
    const result = applyMarkdownToolbarAction({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      action: { type: 'apply_background_color', color: '#fff7a8' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText('', result);
    expect(applied?.nextText).toBe('<span style="background-color: #fff7a8;">highlighted text</span>');
    expect(applied?.selectedText).toBe('highlighted text');
  });

  it('inserts local image markdown with the resolved source path', () => {
    const source = 'Diagram';
    const result = applyMarkdownToolbarAction({
      text: source,
      selectionStart: 0,
      selectionEnd: source.length,
      action: { type: 'insert_image_file', src: 'file:///C:/repo/image.png' },
      indentationUnit: '  ',
    });
    const applied = applyResultToText(source, result);
    expect(applied?.nextText).toBe('![Diagram](file:///C:/repo/image.png)');
    expect(applied?.selectedText).toBe('file:///C:/repo/image.png');
  });
});
