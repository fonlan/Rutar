import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';

interface HistoryDropdownInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  ariaLabel: string;
  name: string;
  history: string[];
  historyLabel: string;
  clearLabel: string;
  emptyValueLabel: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClear?: () => void;
  className?: string;
}

export function HistoryDropdownInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  ariaLabel,
  name,
  history,
  historyLabel,
  clearLabel,
  emptyValueLabel,
  inputRef,
  onClear,
  className,
}: HistoryDropdownInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const hasHistory = history.length > 0;
  const listboxId = `${name}-history-listbox`;

  const focusInput = useCallback(() => {
    const inputElement = inputRef?.current ?? internalInputRef.current;
    inputElement?.focus();
  }, [inputRef]);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    if (hasHistory) {
      setIsHistoryOpen(true);
    }
  }, [hasHistory, onChange]);

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && isHistoryOpen) {
      event.preventDefault();
      setIsHistoryOpen(false);
      return;
    }

    onKeyDown?.(event);
  }, [isHistoryOpen, onKeyDown]);

  const handleInputFocus = useCallback(() => {
    if (hasHistory) {
      setIsHistoryOpen(true);
    }
  }, [hasHistory]);

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  }, [onChange, onClear]);

  const handleToggleHistory = useCallback(() => {
    if (!hasHistory) {
      return;
    }

    setIsHistoryOpen((previous) => !previous);
    focusInput();
  }, [focusInput, hasHistory]);

  const handleSelectHistory = useCallback((entry: string) => {
    onChange(entry);
    setIsHistoryOpen(false);

    window.requestAnimationFrame(() => {
      const inputElement = inputRef?.current ?? internalInputRef.current;
      inputElement?.focus();
      inputElement?.setSelectionRange(entry.length, entry.length);
    });
  }, [inputRef, onChange]);

  useEffect(() => {
    if (!hasHistory && isHistoryOpen) {
      setIsHistoryOpen(false);
    }
  }, [hasHistory, isHistoryOpen]);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || containerRef.current?.contains(event.target)) {
        return;
      }

      setIsHistoryOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isHistoryOpen]);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef ?? internalInputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        name={name}
        autoComplete="off"
        className={cn(
          'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring',
          hasHistory ? 'pr-14' : 'pr-8',
          className,
        )}
      />

      {value.length > 0 && (
        <button
          type="button"
          className={cn(
            'absolute top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            hasHistory ? 'right-7' : 'right-1',
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
          title={clearLabel}
          aria-label={clearLabel}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {hasHistory && (
        <button
          type="button"
          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleHistory}
          title={historyLabel}
          aria-label={historyLabel}
          aria-expanded={isHistoryOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
        >
          {isHistoryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}

      {hasHistory && isHistoryOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={historyLabel}
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {history.map((entry, index) => {
            const shouldUsePlaceholder = entry.length === 0 || entry.trim().length === 0;

            return (
              <button
                key={`${name}-history-${index}-${entry.length}`}
                type="button"
                role="option"
                aria-selected={value === entry}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelectHistory(entry)}
              >
                <span className={cn('truncate', shouldUsePlaceholder && 'italic text-muted-foreground')}>
                  {shouldUsePlaceholder ? emptyValueLabel : entry}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
