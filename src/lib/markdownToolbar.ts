import type { TabIndentMode } from '@/store/useStore';

export const MARKDOWN_TOOLBAR_ACTION_EVENT = 'rutar:markdown-toolbar-action';

export type MarkdownHeadingLevel = 'body' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export type MarkdownToolbarAction =
  | { type: 'set_heading'; level: MarkdownHeadingLevel }
  | { type: 'toggle_ordered_list' }
  | { type: 'toggle_unordered_list' }
  | { type: 'toggle_task_list' }
  | { type: 'toggle_quote' }
  | { type: 'indent' }
  | { type: 'outdent' }
  | { type: 'insert_code_block' }
  | { type: 'insert_table' }
  | { type: 'insert_horizontal_rule' }
  | { type: 'toggle_bold' }
  | { type: 'toggle_italic' }
  | { type: 'toggle_underline' }
  | { type: 'toggle_strikethrough' }
  | { type: 'toggle_superscript' }
  | { type: 'toggle_subscript' }
  | { type: 'toggle_inline_code' }
  | { type: 'apply_text_color'; color: string }
  | { type: 'apply_background_color'; color: string }
  | { type: 'insert_link' }
  | { type: 'insert_image_url' }
  | { type: 'insert_image_file'; src: string; alt?: string }
  | { type: 'insert_image_base64'; src: string; alt?: string };

export interface MarkdownToolbarTransformInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  action: MarkdownToolbarAction;
  indentationUnit: string;
}

export interface MarkdownToolbarTransformResult {
  replaceStart: number;
  replaceEnd: number;
  insertText: string;
  selectionStart: number;
  selectionEnd: number;
}

const HEADING_PREFIX_BY_LEVEL: Record<Exclude<MarkdownHeadingLevel, 'body'>, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
};

const ORDERED_LIST_PATTERN = /^(\s*)\d+\.\s+/;
const UNORDERED_LIST_PATTERN = /^(\s*)[-*+]\s+/;
const TASK_LIST_PATTERN = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;
const QUOTE_PATTERN = /^(\s*)>\s?/;
const HEADING_PATTERN = /^(\s*)#{1,6}\s+/;
const KNOWN_BLOCK_PREFIX_PATTERN = /^(\s*)(?:>\s?|[-*+]\s+\[[ xX]\]\s+|\d+\.\s+|[-*+]\s+)/;

interface ExpandedLineSelection {
  replaceStart: number;
  replaceEnd: number;
  lineText: string;
}

function clampOffset(value: number, textLength: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(textLength, Math.floor(value)));
}

function getSelectedText(text: string, start: number, end: number) {
  return text.slice(Math.min(start, end), Math.max(start, end));
}

function expandSelectionToLines(text: string, selectionStart: number, selectionEnd: number): ExpandedLineSelection {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const replaceStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start && text.charAt(end - 1) === '\n' ? end - 1 : end;
  const lineBreakIndex = text.indexOf('\n', effectiveEnd);
  const replaceEnd = lineBreakIndex === -1 ? text.length : lineBreakIndex;
  return {
    replaceStart,
    replaceEnd,
    lineText: text.slice(replaceStart, replaceEnd),
  };
}

function replaceWithSelection(
  replaceStart: number,
  replaceEnd: number,
  insertText: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownToolbarTransformResult {
  return {
    replaceStart,
    replaceEnd,
    insertText,
    selectionStart,
    selectionEnd,
  };
}

function buildInlineWrapResult(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownToolbarTransformResult {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selectedText = text.slice(start, end);
  const innerText = selectedText || placeholder;
  const insertText = `${prefix}${innerText}${suffix}`;
  const nextSelectionStart = start + prefix.length;
  const nextSelectionEnd = nextSelectionStart + innerText.length;
  return replaceWithSelection(start, end, insertText, nextSelectionStart, nextSelectionEnd);
}

function buildStandaloneInsertionResult(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  blockText: string,
  selectionWithinBlock?: { start: number; end: number },
): MarkdownToolbarTransformResult {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const beforeText = text.slice(0, start);
  const afterText = text.slice(end);
  const prefix = start === 0
    ? ''
    : beforeText.endsWith('\n\n')
      ? ''
      : beforeText.endsWith('\n')
        ? '\n'
        : '\n\n';
  const suffix = end === text.length
    ? ''
    : afterText.startsWith('\n\n')
      ? ''
      : afterText.startsWith('\n')
        ? '\n'
        : '\n\n';
  const insertText = `${prefix}${blockText}${suffix}`;
  const blockStart = start + prefix.length;
  const fallbackSelectionStart = blockStart + blockText.length;
  const nextSelectionStart = selectionWithinBlock
    ? blockStart + selectionWithinBlock.start
    : fallbackSelectionStart;
  const nextSelectionEnd = selectionWithinBlock
    ? blockStart + selectionWithinBlock.end
    : fallbackSelectionStart;
  return replaceWithSelection(start, end, insertText, nextSelectionStart, nextSelectionEnd);
}

function stripKnownBlockPrefix(line: string) {
  return line.replace(KNOWN_BLOCK_PREFIX_PATTERN, '$1');
}

function toggleSimpleLinePrefix(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  isActive: (line: string) => boolean,
  addPrefix: (line: string, index: number) => string,
  removePrefix: (line: string) => string,
): MarkdownToolbarTransformResult | null {
  const expanded = expandSelectionToLines(text, selectionStart, selectionEnd);
  const lines = expanded.lineText.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return null;
  }
  const shouldRemove = nonEmptyLines.every(isActive);
  let appliedLineIndex = 0;
  const nextLines = lines.map((line) => {
    if (line.trim().length === 0) {
      return line;
    }
    const nextLine = shouldRemove
      ? removePrefix(line)
      : addPrefix(line, appliedLineIndex);
    appliedLineIndex += 1;
    return nextLine;
  });
  const insertText = nextLines.join('\n');
  if (insertText === expanded.lineText) {
    return null;
  }
  return replaceWithSelection(
    expanded.replaceStart,
    expanded.replaceEnd,
    insertText,
    expanded.replaceStart,
    expanded.replaceStart + insertText.length,
  );
}

function applyHeadingTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  level: MarkdownHeadingLevel,
): MarkdownToolbarTransformResult | null {
  const expanded = expandSelectionToLines(text, selectionStart, selectionEnd);
  const lines = expanded.lineText.split('\n');
  const insertText = lines
    .map((line) => {
      const match = line.match(/^(\s*)/);
      const indent = match?.[1] ?? '';
      const content = line.slice(indent.length).replace(HEADING_PATTERN, '');
      if (level === 'body') {
        return `${indent}${content}`;
      }
      const prefix = HEADING_PREFIX_BY_LEVEL[level];
      return `${indent}${prefix}${content}`;
    })
    .join('\n');
  if (insertText === expanded.lineText) {
    return null;
  }
  return replaceWithSelection(
    expanded.replaceStart,
    expanded.replaceEnd,
    insertText,
    expanded.replaceStart,
    expanded.replaceStart + insertText.length,
  );
}

function applyIndentTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  indentationUnit: string,
  direction: 'indent' | 'outdent',
): MarkdownToolbarTransformResult | null {
  if (!indentationUnit) {
    return null;
  }
  const expanded = expandSelectionToLines(text, selectionStart, selectionEnd);
  const lines = expanded.lineText.split('\n');
  const insertText = lines
    .map((line) => {
      if (direction === 'indent') {
        return `${indentationUnit}${line}`;
      }
      if (line.startsWith(indentationUnit)) {
        return line.slice(indentationUnit.length);
      }
      return line;
    })
    .join('\n');
  if (insertText === expanded.lineText) {
    return null;
  }
  return replaceWithSelection(
    expanded.replaceStart,
    expanded.replaceEnd,
    insertText,
    expanded.replaceStart,
    expanded.replaceStart + insertText.length,
  );
}

function applyLinkTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  source: 'link' | 'image_url' | 'image_file' | 'image_base64',
  explicitSrc?: string,
  explicitAlt?: string,
): MarkdownToolbarTransformResult {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selectedText = getSelectedText(text, start, end);
  const isImage = source !== 'link';
  const label = isImage ? (selectedText || explicitAlt || 'alt text') : (selectedText || 'link text');
  const defaultSrc = source === 'link'
    ? 'https://example.com'
    : source === 'image_url'
      ? 'https://example.com/image.png'
      : explicitSrc ?? '';
  const insertText = isImage ? `![${label}](${defaultSrc})` : `[${label}](${defaultSrc})`;
  const srcStart = start + insertText.lastIndexOf(`(${defaultSrc}`) + 1;
  const srcEnd = srcStart + defaultSrc.length;
  const selectionFallback = start + insertText.length;
  return replaceWithSelection(
    start,
    end,
    insertText,
    defaultSrc ? srcStart : selectionFallback,
    defaultSrc ? srcEnd : selectionFallback,
  );
}

function applyCodeBlockTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownToolbarTransformResult {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selectedText = getSelectedText(text, start, end);
  if (selectedText) {
    const blockText = `\`\`\`text\n${selectedText}\n\`\`\``;
    return buildStandaloneInsertionResult(text, start, end, blockText);
  }
  const placeholder = 'code';
  const blockText = `\`\`\`text\n${placeholder}\n\`\`\``;
  return buildStandaloneInsertionResult(text, start, end, blockText, {
    start: '```text\n'.length,
    end: '```text\n'.length + placeholder.length,
  });
}

function applyTableTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownToolbarTransformResult {
  const header = '| Column 1 | Column 2 | Column 3 |';
  const blockText = `${header}\n| --- | --- | --- |\n| Value 1 | Value 2 | Value 3 |`;
  return buildStandaloneInsertionResult(text, selectionStart, selectionEnd, blockText, {
    start: 2,
    end: 10,
  });
}

function applyHorizontalRuleTransform(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownToolbarTransformResult {
  return buildStandaloneInsertionResult(text, selectionStart, selectionEnd, '---');
}

export function buildIndentationUnit(tabIndentMode: TabIndentMode, tabWidth: number) {
  if (tabIndentMode === 'tabs') {
    return '\t';
  }
  return ' '.repeat(Math.max(1, Math.floor(tabWidth)));
}

export function dispatchMarkdownToolbarAction(tabId: string, action: MarkdownToolbarAction) {
  window.dispatchEvent(
    new CustomEvent(MARKDOWN_TOOLBAR_ACTION_EVENT, {
      detail: { tabId, action },
    }),
  );
}

export function applyMarkdownToolbarAction({
  text,
  selectionStart,
  selectionEnd,
  action,
  indentationUnit,
}: MarkdownToolbarTransformInput): MarkdownToolbarTransformResult | null {
  const safeStart = clampOffset(selectionStart, text.length);
  const safeEnd = clampOffset(selectionEnd, text.length);
  switch (action.type) {
    case 'set_heading':
      return applyHeadingTransform(text, safeStart, safeEnd, action.level);
    case 'toggle_ordered_list':
      return toggleSimpleLinePrefix(
        text,
        safeStart,
        safeEnd,
        (line) => ORDERED_LIST_PATTERN.test(line),
        (line, index) => {
          const normalized = stripKnownBlockPrefix(line);
          const indent = normalized.match(/^(\s*)/)?.[1] ?? '';
          return `${indent}${index + 1}. ${normalized.slice(indent.length)}`;
        },
        (line) => line.replace(ORDERED_LIST_PATTERN, '$1'),
      );
    case 'toggle_unordered_list':
      return toggleSimpleLinePrefix(
        text,
        safeStart,
        safeEnd,
        (line) => UNORDERED_LIST_PATTERN.test(line) && !TASK_LIST_PATTERN.test(line),
        (line) => {
          const normalized = stripKnownBlockPrefix(line);
          const indent = normalized.match(/^(\s*)/)?.[1] ?? '';
          return `${indent}- ${normalized.slice(indent.length)}`;
        },
        (line) => line.replace(UNORDERED_LIST_PATTERN, '$1'),
      );
    case 'toggle_task_list':
      return toggleSimpleLinePrefix(
        text,
        safeStart,
        safeEnd,
        (line) => TASK_LIST_PATTERN.test(line),
        (line) => {
          const normalized = stripKnownBlockPrefix(line);
          const indent = normalized.match(/^(\s*)/)?.[1] ?? '';
          return `${indent}- [ ] ${normalized.slice(indent.length)}`;
        },
        (line) => line.replace(TASK_LIST_PATTERN, '$1'),
      );
    case 'toggle_quote':
      return toggleSimpleLinePrefix(
        text,
        safeStart,
        safeEnd,
        (line) => QUOTE_PATTERN.test(line),
        (line) => {
          const normalized = stripKnownBlockPrefix(line);
          const indent = normalized.match(/^(\s*)/)?.[1] ?? '';
          return `${indent}> ${normalized.slice(indent.length)}`;
        },
        (line) => line.replace(QUOTE_PATTERN, '$1'),
      );
    case 'indent':
      return applyIndentTransform(text, safeStart, safeEnd, indentationUnit, 'indent');
    case 'outdent':
      return applyIndentTransform(text, safeStart, safeEnd, indentationUnit, 'outdent');
    case 'insert_code_block':
      return applyCodeBlockTransform(text, safeStart, safeEnd);
    case 'insert_table':
      return applyTableTransform(text, safeStart, safeEnd);
    case 'insert_horizontal_rule':
      return applyHorizontalRuleTransform(text, safeStart, safeEnd);
    case 'toggle_bold':
      return buildInlineWrapResult(text, safeStart, safeEnd, '**', '**', 'bold text');
    case 'toggle_italic':
      return buildInlineWrapResult(text, safeStart, safeEnd, '*', '*', 'italic text');
    case 'toggle_underline':
      return buildInlineWrapResult(text, safeStart, safeEnd, '<u>', '</u>', 'underlined text');
    case 'toggle_strikethrough':
      return buildInlineWrapResult(text, safeStart, safeEnd, '~~', '~~', 'strikethrough text');
    case 'toggle_superscript':
      return buildInlineWrapResult(text, safeStart, safeEnd, '<sup>', '</sup>', 'superscript');
    case 'toggle_subscript':
      return buildInlineWrapResult(text, safeStart, safeEnd, '<sub>', '</sub>', 'subscript');
    case 'toggle_inline_code':
      return buildInlineWrapResult(text, safeStart, safeEnd, '`', '`', 'code');
    case 'apply_text_color':
      return buildInlineWrapResult(
        text,
        safeStart,
        safeEnd,
        `<font color="${action.color}">`,
        '</font>',
        'colored text',
      );
    case 'apply_background_color':
      return buildInlineWrapResult(
        text,
        safeStart,
        safeEnd,
        `<span style="background-color: ${action.color};">`,
        '</span>',
        'highlighted text',
      );
    case 'insert_link':
      return applyLinkTransform(text, safeStart, safeEnd, 'link');
    case 'insert_image_url':
      return applyLinkTransform(text, safeStart, safeEnd, 'image_url');
    case 'insert_image_file':
      return applyLinkTransform(text, safeStart, safeEnd, 'image_file', action.src, action.alt);
    case 'insert_image_base64':
      return applyLinkTransform(text, safeStart, safeEnd, 'image_base64', action.src, action.alt);
    default:
      return null;
  }
}
