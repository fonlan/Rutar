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
    expect(messages.statusTotalPending(4)).toContain('Current 4/?');
    expect(messages.statusTotalReady(9, 3)).toContain('Current 3/9');
    expect(messages.statusFilterTotalPending(2)).toContain('Current 2/?');
    expect(messages.statusFilterTotalReady(6, 5)).toContain('Current 5/6');
    expect(messages.loadedAll('10')).toContain('(10)');
    expect(messages.filterLoadedAll('8')).toContain('(8)');
    expect(messages.minimizedSummary('10', '6', 2)).toContain('Loaded 2');
    expect(messages.filterMinimizedSummary('3', 1)).toContain('Loaded 1');
    expect(messages.clearInput).toBe('Clear input');
  });

  it('returns zh-CN messages object with same formatter behavior shape', () => {
    const messages = getSearchPanelMessages('zh-CN');
    expect(typeof messages.find).toBe('string');
    expect(messages.replacedAll(9)).toContain('9');
    expect(messages.filterGroupsImported(2)).toContain('2');
    expect(messages.statusTotalPending(7)).toContain('7');
    expect(messages.statusTotalReady(12, 5)).toContain('12');
    expect(messages.statusFilterTotalPending(4)).toContain('4');
    expect(messages.statusFilterTotalReady(11, 3)).toContain('11');
    expect(messages.filterGroupSaved('rules-a')).toContain('rules-a');
    expect(messages.filterGroupLoaded('rules-b')).toContain('rules-b');
    expect(messages.filterGroupDeleted('rules-c')).toContain('rules-c');
    expect(messages.filterGroupsExported(5)).toContain('5');
    expect(messages.resultFilterStepNoMatch('abc')).toContain('abc');
    expect(messages.copyResultsSuccess(6)).toContain('6');
    expect(messages.loadedAll('14')).toContain('14');
    expect(messages.filterLoadedAll('2')).toContain('2');
    expect(messages.minimizedSummary('4', '2', 1)).toContain('4');
    expect(messages.filterMinimizedSummary('2', 1)).toContain('2');
    expect(messages.clearInput).toBe('清空输入');
  });
});
