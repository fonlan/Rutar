import type { SyntaxToken } from './Editor.types';

const KEYWORD_TOKEN_TYPES = [
  'fn',
  'let',
  'pub',
  'use',
  'mod',
  'struct',
  'enum',
  'impl',
  'trait',
  'where',
  'type',
  'match',
  'if',
  'else',
  'for',
  'while',
  'loop',
  'return',
  'break',
  'continue',
  'as',
  'move',
  'ref',
  'mut',
  'static',
  'unsafe',
  'extern',
  'crate',
  'self',
  'super',
  'const',
  'var',
  'function',
  'async',
  'await',
  'yield',
  'class',
  'extends',
  'implements',
  'interface',
  'namespace',
  'module',
  'package',
  'import',
  'export',
  'from',
  'default',
  'switch',
  'case',
  'do',
  'try',
  'catch',
  'finally',
  'throw',
  'throws',
  'new',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'this',
  'def',
  'lambda',
  'pass',
  'raise',
  'except',
  'elif',
  'global',
  'nonlocal',
  'del',
  'assert',
  'is',
  'in',
  'not',
  'and',
  'or',
  'typedef',
];

const BUILTIN_TYPE_TOKEN_TYPES = [
  'usize',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'i8',
  'i16',
  'i32',
  'i64',
  'i128',
  'f32',
  'f64',
  'bool',
  'char',
  'str',
  'string',
  'option',
  'result',
  'vec',
  'box',
];

const PREPROCESSOR_TOKEN_TYPES = [
  'define',
  'ifdef',
  'ifndef',
  'if',
  'elif',
  'else',
  'endif',
  'include',
  'pragma',
  'line',
  'error',
];

const BOOLEAN_AND_CONSTANT_TOKEN_TYPES = [
  'true',
  'false',
  'null',
  'nullptr',
  'none',
  'nil',
  'undefined',
  'yes',
  'no',
];

const TAG_TOKEN_TYPES = ['stag', 'etag', 'emptyelemtag', 'doctype'];

export function resolveTokenTypeClass(token: SyntaxToken) {
  let typeClass = '';
  if (token.type) {
    const cleanType = token.type.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const text = (token.text || '').trim();
    const cleanText = text.toLowerCase();
    const trimmedType = cleanType.replace(/^_+/, '');
    const normalizedType = trimmedType.replace(/_+/g, '_');
    typeClass = `token-${cleanType}`;

    if (cleanType.includes('string')) typeClass += ' token-string';
    if (
      cleanType.includes('keyword') ||
      normalizedType.includes('keyword') ||
      KEYWORD_TOKEN_TYPES.includes(cleanType) ||
      KEYWORD_TOKEN_TYPES.includes(normalizedType)
    ) {
      typeClass += ' token-keyword';
    }
    if (cleanType.includes('comment')) typeClass += ' token-comment';
    if (
      cleanType.includes('number') ||
      cleanType.includes('integer') ||
      cleanType.includes('float') ||
      cleanType.includes('decimal') ||
      cleanType.includes('hex') ||
      cleanType.includes('octal') ||
      cleanType.includes('binary')
    ) {
      typeClass += ' token-number';
    }

    if (cleanType.includes('literal') || normalizedType.includes('literal')) {
      if (/^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)) {
        typeClass += ' token-number';
      } else if (cleanText.length > 0) {
        typeClass += ' token-constant';
      }
    }

    if (cleanType.includes('scalar') || normalizedType.includes('scalar')) {
      if (cleanType.includes('boolean') || ['true', 'false', 'yes', 'no'].includes(cleanText)) {
        typeClass += ' token-boolean token-constant';
      } else if (
        cleanType.includes('int') ||
        cleanType.includes('float') ||
        /^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)
      ) {
        typeClass += ' token-number';
      } else {
        typeClass += ' token-string';
      }
    }

    if (normalizedType === 'setting_value') {
      if (['true', 'false', 'yes', 'no', 'on', 'off'].includes(cleanText)) {
        typeClass += ' token-boolean token-constant';
      } else if (/^-?(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?)$/i.test(cleanText)) {
        typeClass += ' token-number';
      } else if (cleanText.length > 0) {
        typeClass += ' token-string';
      }
    }

    if (normalizedType === 'section_name_text' || normalizedType === 'section_name') {
      typeClass += ' token-type';
    }

    if (
      (cleanType.includes('identifier') && !cleanType.includes('property')) ||
      cleanType === 'name' ||
      cleanType.endsWith('_name') ||
      normalizedType === 'name' ||
      normalizedType.endsWith('_name')
    ) {
      typeClass += ' token-identifier';
    }
    if (
      cleanType.includes('type') ||
      cleanType.includes('class') ||
      cleanType.includes('interface') ||
      cleanType.includes('enum') ||
      cleanType.includes('struct') ||
      cleanType.includes('trait') ||
      cleanType.includes('module') ||
      cleanType.includes('namespace') ||
      normalizedType.includes('class') ||
      normalizedType.includes('interface') ||
      normalizedType.includes('enum') ||
      normalizedType.includes('struct') ||
      normalizedType.includes('trait') ||
      normalizedType.includes('module') ||
      normalizedType.includes('namespace') ||
      BUILTIN_TYPE_TOKEN_TYPES.includes(cleanType)
    ) {
      typeClass += ' token-type';
    }

    if (
      (cleanType.includes('key') && !cleanType.includes('keyword')) ||
      cleanType.includes('property') ||
      cleanType.includes('field') ||
      cleanType.includes('member') ||
      normalizedType.includes('key') ||
      normalizedType.includes('property') ||
      normalizedType.includes('field') ||
      normalizedType.includes('member')
    ) {
      typeClass += ' token-property';
    }

    if (cleanType.includes('date') || cleanType.includes('time')) {
      typeClass += ' token-string';
    }

    if (
      cleanType.includes('function') ||
      cleanType.includes('method') ||
      cleanType.includes('call') ||
      cleanType.includes('constructor') ||
      normalizedType.includes('function') ||
      normalizedType.includes('method') ||
      normalizedType.includes('call') ||
      normalizedType.includes('constructor')
    ) {
      typeClass += ' token-function';
    }

    if (cleanType.includes('regex') || normalizedType.includes('regex')) {
      typeClass += ' token-regex';
    }

    if (cleanType.includes('escape') || normalizedType.includes('escape')) {
      typeClass += ' token-escape';
    }

    if (
      cleanType.includes('annotation') ||
      cleanType.includes('decorator') ||
      cleanType.includes('attribute') ||
      normalizedType.includes('annotation') ||
      normalizedType.includes('decorator') ||
      normalizedType.includes('attribute')
    ) {
      typeClass += ' token-attribute_item';
    }

    if (
      cleanType.includes('tag') ||
      normalizedType.includes('tag') ||
      TAG_TOKEN_TYPES.includes(cleanType) ||
      TAG_TOKEN_TYPES.includes(normalizedType)
    ) {
      typeClass += ' token-tag';
    }

    if (
      cleanType.includes('directive') ||
      cleanType.includes('preproc') ||
      normalizedType.includes('directive') ||
      normalizedType.includes('preproc') ||
      PREPROCESSOR_TOKEN_TYPES.includes(normalizedType) ||
      cleanText.startsWith('#')
    ) {
      typeClass += ' token-preprocessor';
    }

    if (cleanType.includes('error') || normalizedType.includes('error')) {
      typeClass += ' token-error';
    }

    if (
      cleanType.includes('constant') ||
      normalizedType.includes('constant') ||
      cleanType.includes('boolean') ||
      BOOLEAN_AND_CONSTANT_TOKEN_TYPES.includes(cleanType) ||
      BOOLEAN_AND_CONSTANT_TOKEN_TYPES.includes(normalizedType) ||
      BOOLEAN_AND_CONSTANT_TOKEN_TYPES.includes(cleanText)
    ) {
      typeClass += ' token-boolean token-constant';
    }

    if (
      cleanType.includes('charref') ||
      cleanType.includes('entityref') ||
      normalizedType.includes('charref') ||
      normalizedType.includes('entityref')
    ) {
      typeClass += ' token-constant';
    }

    if (
      cleanType.includes('punctuation') ||
      cleanType.includes('delimiter') ||
      cleanType.includes('bracket') ||
      normalizedType.includes('punctuation') ||
      normalizedType.includes('delimiter') ||
      normalizedType.includes('bracket')
    ) {
      typeClass += ' token-punctuation';
    }

    if (cleanType.includes('operator') || normalizedType.includes('operator')) {
      typeClass += ' token-operator';
    }

    if (
      /^(if|ifdef|ifndef|elif|else|endif|define|include|pragma|line|error)$/i.test(normalizedType)
    ) {
      typeClass += ' token-preprocessor';
    }

    if (/^_+$/.test(cleanType) && text.length > 0) {
      if (
        /^(=|==|===|!=|!==|<=|>=|<|>|\||\|\||\+|\+\+|\*|\?|,|\.|:|-|--|\/|%|!|&|&&|\^|~|->|=>)$/.test(
          text
        )
      ) {
        typeClass += ' token-operator';
      } else {
        typeClass += ' token-punctuation';
      }

      if (text === ':') {
        typeClass += ' token-pair_separator';
      }
    }

    if (/^_+[a-z]+$/.test(cleanType) && text.length > 0 && !typeClass.includes('token-preprocessor')) {
      if (/^#/.test(text)) {
        typeClass += ' token-preprocessor';
      }
    }

    if (/^key_+$/.test(normalizedType) && /^['"]$/.test(text)) {
      typeClass += ' token-key_quote token-punctuation';
    }
  }

  return typeClass;
}
