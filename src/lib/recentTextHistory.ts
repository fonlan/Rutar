export const MAX_RECENT_TEXT_HISTORY_ITEMS = 10;

export function appendRecentTextHistoryEntry(entries: string[], entry: string): string[] {
  const nextEntries = [
    entry,
    ...entries.filter((item) => item !== entry),
  ].slice(0, MAX_RECENT_TEXT_HISTORY_ITEMS);

  if (nextEntries.length === entries.length && nextEntries.every((item, index) => item === entries[index])) {
    return entries;
  }

  return nextEntries;
}

export function sanitizeRecentTextHistory(entries: unknown): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const uniqueEntries: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== 'string' || uniqueEntries.includes(entry)) {
      continue;
    }

    uniqueEntries.push(entry);

    if (uniqueEntries.length >= MAX_RECENT_TEXT_HISTORY_ITEMS) {
      break;
    }
  }

  return uniqueEntries;
}
