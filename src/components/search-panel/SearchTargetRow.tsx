import { File, FolderOpen, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

interface SearchTargetRowProps {
  value: string;
  placeholder: string;
  pickTitle: string;
  pickFileLabel: string;
  pickFolderLabel: string;
  clearLabel: string;
  onChange: (value: string) => void;
  onPickFile: () => void;
  onPickFolder: () => void;
  showIncludeSubdirectories?: boolean;
  includeSubdirectories?: boolean;
  includeSubdirectoriesLabel?: string;
  includeSubdirectoriesHint?: string;
  includeSubdirectoriesDisabled?: boolean;
  includeSubdirectoriesDisabledHint?: string;
  onIncludeSubdirectoriesChange?: (checked: boolean) => void;
}

export function SearchTargetRow({
  value,
  placeholder,
  pickTitle,
  pickFileLabel,
  pickFolderLabel,
  clearLabel,
  onChange,
  onPickFile,
  onPickFolder,
  showIncludeSubdirectories = false,
  includeSubdirectories = false,
  includeSubdirectoriesLabel,
  includeSubdirectoriesHint,
  includeSubdirectoriesDisabled = false,
  includeSubdirectoriesDisabledHint,
  onIncludeSubdirectoriesChange,
}: SearchTargetRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  const togglePickMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handlePickFile = useCallback(() => {
    setMenuOpen(false);
    onPickFile();
  }, [onPickFile]);

  const handlePickFolder = useCallback(() => {
    setMenuOpen(false);
    onPickFolder();
  }, [onPickFolder]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || wrapperRef.current?.contains(event.target)) {
        return;
      }
      setMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [menuOpen]);

  const showSubdirToggle =
    showIncludeSubdirectories &&
    typeof onIncludeSubdirectoriesChange === 'function' &&
    !!includeSubdirectoriesLabel;

  const subdirHintText = includeSubdirectoriesDisabled
    ? (includeSubdirectoriesDisabledHint ?? includeSubdirectoriesHint)
    : includeSubdirectoriesHint;

  return (
    <div ref={wrapperRef} className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              menuOpen && 'bg-muted text-foreground',
            )}
            title={pickTitle}
            aria-label={pickTitle}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={togglePickMenu}
          >
            <FolderOpen className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-9 z-30 min-w-[140px] rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={handlePickFile}
              >
                <File className="h-3.5 w-3.5 text-muted-foreground" />
                {pickFileLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={handlePickFolder}
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                {pickFolderLabel}
              </button>
            </div>
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            aria-label={placeholder}
            name="search-target"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring',
              value.length > 0 && 'pr-8',
            )}
            title={value || placeholder}
          />
          {value.length > 0 && (
            <button
              type="button"
              className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              title={clearLabel}
              aria-label={clearLabel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {showSubdirToggle && (
        <label
          className={cn(
            'flex items-center gap-1.5 pl-10 text-xs text-muted-foreground',
            includeSubdirectoriesDisabled && 'opacity-60',
          )}
          title={subdirHintText}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5"
            checked={includeSubdirectories}
            disabled={includeSubdirectoriesDisabled}
            onChange={(event) => onIncludeSubdirectoriesChange?.(event.target.checked)}
            aria-label={includeSubdirectoriesLabel}
          />
          <span className="select-none">{includeSubdirectoriesLabel}</span>
        </label>
      )}
    </div>
  );
}
