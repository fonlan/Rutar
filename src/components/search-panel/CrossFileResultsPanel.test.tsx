import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getSearchPanelMessages } from '@/i18n';
import { CrossFileResultsPanel, splitLineTextByByteRange } from './CrossFileResultsPanel';
import type { PathSearchMatch } from './types';

const messages = getSearchPanelMessages('en');

const baseProps = {
  matches: [] as PathSearchMatch[],
  totalFiles: 0,
  scannedFiles: 0,
  completed: true,
  isSearching: false,
  isLoadingMore: false,
  errorMessage: null as string | null,
  fileErrors: [],
  hasRunOnce: false,
  keyword: 'foo',
  resultListTextStyle: {},
  messages,
  onLoadMore: vi.fn(),
  onSelectMatch: vi.fn(),
};

describe('splitLineTextByByteRange', () => {
  it('returns full text when range is empty', () => {
    expect(splitLineTextByByteRange('hello world', 0, 0)).toEqual({
      before: 'hello world',
      highlight: '',
      after: '',
    });
  });

  it('splits ASCII at byte offsets', () => {
    expect(splitLineTextByByteRange('hello world', 6, 11)).toEqual({
      before: 'hello ',
      highlight: 'world',
      after: '',
    });
  });

  it('splits multibyte text at byte offsets', () => {
    expect(splitLineTextByByteRange('a你好b', 1, 7)).toEqual({
      before: 'a',
      highlight: '你好',
      after: 'b',
    });
  });

  it('clamps out-of-range indices', () => {
    expect(splitLineTextByByteRange('abc', 1, 100)).toEqual({
      before: 'a',
      highlight: 'bc',
      after: '',
    });
  });
});

describe('CrossFileResultsPanel', () => {
  it('renders nothing before any run', () => {
    const { container } = render(<CrossFileResultsPanel {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders empty state after a run with no matches', () => {
    render(<CrossFileResultsPanel {...baseProps} hasRunOnce />);
    expect(screen.getByText(messages.crossFileNoMatches)).toBeInTheDocument();
  });

  it('renders error message', () => {
    render(<CrossFileResultsPanel {...baseProps} hasRunOnce errorMessage="boom" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders matches grouped by file and calls onSelectMatch on click', () => {
    const onSelectMatch = vi.fn();
    const matches: PathSearchMatch[] = [
      {
        filePath: 'C:/dir/file1.txt',
        line: 3,
        column: 5,
        matchStart: 4,
        matchEnd: 7,
        lineText: 'abc foo bar',
      },
      {
        filePath: 'C:/dir/file2.txt',
        line: 1,
        column: 1,
        matchStart: 0,
        matchEnd: 3,
        lineText: 'foo bar',
      },
    ];
    render(
      <CrossFileResultsPanel
        {...baseProps}
        hasRunOnce
        matches={matches}
        totalFiles={2}
        scannedFiles={2}
        onSelectMatch={onSelectMatch}
      />,
    );
    const targetButton = screen.getByTitle('C:/dir/file1.txt:3:5');
    fireEvent.click(targetButton);
    expect(onSelectMatch).toHaveBeenCalledWith(matches[0]);
  });

  it('shows file errors collapsible', () => {
    render(
      <CrossFileResultsPanel
        {...baseProps}
        hasRunOnce
        fileErrors={[{ filePath: '/foo/bad.bin', error: 'binary content' }]}
      />,
    );
    expect(screen.getByText(messages.crossFileFileErrorsTitle(1))).toBeInTheDocument();
  });
});
