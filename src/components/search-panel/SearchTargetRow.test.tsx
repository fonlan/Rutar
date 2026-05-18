import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchTargetRow } from './SearchTargetRow';

const baseProps = {
  placeholder: 'Target path',
  pickTitle: 'Choose target',
  pickFileLabel: 'Choose file',
  pickFolderLabel: 'Choose folder',
  clearLabel: 'Clear target',
};

describe('SearchTargetRow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the target value and opens picker menu when clicking the folder button', () => {
    const onPickFile = vi.fn();
    const onPickFolder = vi.fn();
    const initial = 'C:/dir/file.txt';
    render(
      <SearchTargetRow
        {...baseProps}
        value={initial}
        onChange={vi.fn()}
        onPickFile={onPickFile}
        onPickFolder={onPickFolder}
      />,
    );

    const input = screen.getByPlaceholderText('Target path') as HTMLInputElement;
    expect(input.value).toBe(initial);

    const triggerButton = screen.getByRole('button', { name: 'Choose target' });
    fireEvent.click(triggerButton);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose file' }));
    expect(onPickFile).toHaveBeenCalledTimes(1);
  });

  it('invokes onChange with the new value when typing', () => {
    const onChange = vi.fn();
    render(
      <SearchTargetRow
        {...baseProps}
        value=""
        onChange={onChange}
        onPickFile={vi.fn()}
        onPickFolder={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Target path');
    const next = 'C:/new/path.txt';
    fireEvent.change(input, { target: { value: next } });
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it('clears the value via the clear button when value is non-empty', () => {
    const onChange = vi.fn();
    render(
      <SearchTargetRow
        {...baseProps}
        value="C:/some/file"
        onChange={onChange}
        onPickFile={vi.fn()}
        onPickFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear target' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clicking the folder option triggers the folder picker handler', () => {
    const onPickFolder = vi.fn();
    render(
      <SearchTargetRow
        {...baseProps}
        value=""
        onChange={vi.fn()}
        onPickFile={vi.fn()}
        onPickFolder={onPickFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose target' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose folder' }));

    expect(onPickFolder).toHaveBeenCalledTimes(1);
  });
});
