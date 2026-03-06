import {
  MAX_RECENT_TEXT_HISTORY_ITEMS,
  appendRecentTextHistoryEntry,
  sanitizeRecentTextHistory,
} from './recentTextHistory';

describe('recentTextHistory', () => {
  it('moves the latest entry to the front and caps the list at ten items', () => {
    const base = Array.from({ length: MAX_RECENT_TEXT_HISTORY_ITEMS }, (_, index) => `value-${index}`);

    expect(appendRecentTextHistoryEntry(base, 'value-3')).toEqual([
      'value-3',
      'value-0',
      'value-1',
      'value-2',
      'value-4',
      'value-5',
      'value-6',
      'value-7',
      'value-8',
      'value-9',
    ]);
    expect(appendRecentTextHistoryEntry(base, 'value-10')).toEqual([
      'value-10',
      'value-0',
      'value-1',
      'value-2',
      'value-3',
      'value-4',
      'value-5',
      'value-6',
      'value-7',
      'value-8',
    ]);
  });

  it('returns the original array when the top entry is unchanged', () => {
    const base = ['keep', 'other'];

    expect(appendRecentTextHistoryEntry(base, 'keep')).toBe(base);
  });

  it('keeps exact text values, including blanks, while deduping and limiting input', () => {
    const source = ['', '  ', '', 'alpha', 'alpha', 'beta', 12, null];

    expect(sanitizeRecentTextHistory(source)).toEqual(['', '  ', 'alpha', 'beta']);
  });
});
