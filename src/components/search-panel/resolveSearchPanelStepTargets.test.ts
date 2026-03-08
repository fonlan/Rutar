import { describe, expect, it } from 'vitest';
import { resolveFilterStepTarget, resolveSearchPanelResultFilterStepSelection, resolveSearchStepTarget } from './resolveSearchPanelStepTargets';
import type { FilterMatch, FilterRuleStyle, SearchMatch } from './types';

const filterStyle: FilterRuleStyle = {
  applyTo: 'line',
  backgroundColor: '#000000',
  bold: false,
  italic: false,
  textColor: '#ffffff',
};

function createSearchMatch(start: number, line: number, lineText: string): SearchMatch {
  return {
    start,
    end: start + 4,
    startChar: start,
    endChar: start + 4,
    text: 'todo',
    line,
    column: 1,
    lineText,
  };
}

function createFilterMatch(line: number, column: number, ruleIndex: number, lineText: string): FilterMatch {
  return {
    line,
    column,
    length: lineText.length,
    lineText,
    ruleIndex,
    style: filterStyle,
    ranges: [],
  };
}

describe('resolveSearchPanelStepTargets', () => {
  it('keeps previously loaded search results when step navigation returns a new batch', () => {
    const firstMatch = createSearchMatch(0, 1, 'todo item');
    const nextMatch = createSearchMatch(100, 20, 'todo target');

    const selection = resolveSearchPanelResultFilterStepSelection({
      batchMatches: [nextMatch],
      matches: [firstMatch],
      targetIndexInBatch: 0,
      targetMatch: nextMatch,
      resolveTarget: resolveSearchStepTarget,
    });

    expect(selection).toEqual({
      kind: 'resolved',
      nextMatches: [firstMatch, nextMatch],
      targetIndex: 1,
    });
  });

  it('merges filter step batches back into the existing ordered result list', () => {
    const laterMatch = createFilterMatch(20, 1, 0, 'later result');
    const earlierMatch = createFilterMatch(10, 1, 0, 'earlier result');

    const resolved = resolveFilterStepTarget({
      batchMatches: [earlierMatch],
      matches: [laterMatch],
      targetIndexInBatch: 0,
      targetMatch: earlierMatch,
    });

    expect(resolved).toEqual({
      nextMatches: [earlierMatch, laterMatch],
      targetIndex: 0,
    });
  });
});