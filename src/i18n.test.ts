import { describe, expect, it } from 'vitest';
import { getSearchPanelMessages, t } from './i18n';

describe('i18n.t', () => {
  it('returns english translation for known key', () => {
    expect(t('en-US', 'status.ready')).toBe('Rutar Ready');
  });

  it('returns non-key text for zh-CN known key', () => {
    const value = t('zh-CN', 'status.ready');
    expect(typeof value).toBe('string');
    expect(value).not.toBe('status.ready');
  });

  it('falls back to key when dictionary key is unknown', () => {
    expect(t('en-US', '__missing_key__' as never)).toBe('__missing_key__');
  });
});

describe('i18n.getSearchPanelMessages', () => {
  it('builds english messages and formatters', () => {
    const messages = getSearchPanelMessages('en-US');
    expect(messages.invalidRegex).toBe('Invalid regular expression');
    expect(messages.replacedAll(3)).toBe('Replaced all 3 matches');
    expect(messages.lineColTitle(12, 8)).toBe('Line 12, Col 8');
    expect(messages.resultsSummary('7', '5', 3)).toContain('Total 7 / 5 lines');
  });

  it('returns zh-CN messages object with same formatter behavior shape', () => {
    const messages = getSearchPanelMessages('zh-CN');
    expect(typeof messages.find).toBe('string');
    expect(messages.replacedAll(9)).toContain('9');
    expect(messages.filterGroupsImported(2)).toContain('2');
  });
});
