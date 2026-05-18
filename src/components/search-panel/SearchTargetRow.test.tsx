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

  it('does not render the include-subdirectories toggle by default', () => {
    render(
      <SearchTargetRow
        {...baseProps}
        value="C:/dir"
        onChange={vi.fn()}
        onPickFile={vi.fn()}
        onPickFolder={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Include subdirectories')).toBeNull();
  });

  it('renders the include-subdirectories toggle and forwards changes when enabled', () => {
    const onIncludeSubdirectoriesChange = vi.fn();
    render(
      <SearchTargetRow
        {...baseProps}
        value="C:/dir"
        onChange={vi.fn()}
        onPickFile={vi.fn()}
        onPickFolder={vi.fn()}
        showIncludeSubdirectories
        includeSubdirectories={false}
        includeSubdirectoriesLabel="Include subdirectories"
        includeSubdirectoriesHint="Walk into nested folders too"
        onIncludeSubdirectoriesChange={onIncludeSubdirectoriesChange}
      />,
    );

    const checkbox = screen.getByLabelText('Include subdirectories') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);

    fireEvent.click(checkbox);
    expect(onIncludeSubdirectoriesChange).toHaveBeenCalledWith(true);
  });

  it('disables the include-subdirectories toggle and exposes the glob hint', () => {
    render(
      <SearchTargetRow
        {...baseProps}
        value="C:/dir/**/*.txt"
        onChange={vi.fn()}
        onPickFile={vi.fn()}
        onPickFolder={vi.fn()}
        showIncludeSubdirectories
        includeSubdirectories={false}
        includeSubdirectoriesDisabled
        includeSubdirectoriesLabel="Include subdirectories"
        includeSubdirectoriesDisabledHint="Glob already controls recursion"
        onIncludeSubdirectoriesChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByLabelText('Include subdirectories') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    const label = checkbox.closest('label');
    expect(label?.getAttribute('title')).toBe('Glob already controls recursion');
    expect(label?.className).toContain('opacity-60');
  });
});
