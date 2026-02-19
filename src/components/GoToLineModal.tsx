import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { useStore } from '@/store/useStore';
import {
  GO_TO_LINE_DIALOG_REQUEST_EVENT,
  GoToLineDialogRequest,
} from '@/lib/goToLineDialog';

interface DialogState {
  tabId: string;
  maxLineNumber: number;
}

function resolveTargetLine(rawInput: string, dialog: DialogState | null): number | null {
  if (!dialog) {
    return null;
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(1, Math.min(dialog.maxLineNumber, Math.floor(parsed)));
}

function normalizeDialogRequest(detail: GoToLineDialogRequest | null | undefined): {
  dialog: DialogState;
  initialLineNumber: number;
} | null {
  if (!detail || typeof detail.tabId !== 'string' || !detail.tabId) {
    return null;
  }

  const maxLineNumber = Number.isFinite(detail.maxLineNumber)
    ? Math.max(1, Math.floor(detail.maxLineNumber))
    : 1;
  const initialLineNumber = Number.isFinite(detail.initialLineNumber)
    ? Math.max(1, Math.min(maxLineNumber, Math.floor(detail.initialLineNumber)))
    : 1;

  return {
    dialog: {
      tabId: detail.tabId,
      maxLineNumber,
    },
    initialLineNumber,
  };
}

export function GoToLineModal() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [lineInput, setLineInput] = useState('');
  const language = useStore((state) => state.settings.language);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const customEvent = event as CustomEvent<GoToLineDialogRequest>;
      const normalized = normalizeDialogRequest(customEvent.detail);
      if (!normalized) {
        return;
      }

      setDialog(normalized.dialog);
      setLineInput(String(normalized.initialLineNumber));
    };

    window.addEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, handleRequest as EventListener);
    return () => {
      window.removeEventListener(GO_TO_LINE_DIALOG_REQUEST_EVENT, handleRequest as EventListener);
    };
  }, []);

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const resolvedTargetLine = useMemo(() => {
    return resolveTargetLine(lineInput, dialog);
  }, [dialog, lineInput]);

  const submit = useCallback((rawInput?: string) => {
    if (!dialog) {
      return;
    }

    const targetLine = resolveTargetLine(rawInput ?? lineInput, dialog);
    if (targetLine === null) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('rutar:navigate-to-line', {
        detail: {
          tabId: dialog.tabId,
          line: targetLine,
          column: 1,
          source: 'shortcut',
        },
      })
    );
    closeDialog();
  }, [closeDialog, dialog, lineInput]);

  useEffect(() => {
    if (!dialog) {
      return;
    }

    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusRequestId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstFocusable || !panel.contains(activeElement)) {
          event.preventDefault();
          lastFocusable.focus();
        }
        return;
      }

      if (!activeElement || activeElement === lastFocusable || !panel.contains(activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusRequestId);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusedElementRef.current?.focus();
    };
  }, [closeDialog, dialog]);

  if (!dialog) {
    return null;
  }

  const title = t(language, 'editor.gotoLine.title');
  const description = t(language, 'editor.gotoLine.description').replace(
    '{maxLineNumber}',
    String(dialog.maxLineNumber)
  );
  const inputLabel = t(language, 'editor.gotoLine.inputLabel');
  const cancelLabel = t(language, 'tabCloseConfirm.cancel');
  const confirmLabel = t(language, 'editor.gotoLine.confirm');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-[min(94vw,520px)] rounded-lg border border-border bg-background p-4 shadow-2xl"
      >
        <p id={titleId} className="text-sm font-medium text-foreground">{title}</p>
        <p id={descriptionId} className="mt-2 text-xs text-muted-foreground">{description}</p>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isComposingRef.current) {
              return;
            }
            submit(inputRef.current?.value ?? lineInput);
          }}
        >
          <label htmlFor={inputId} className="text-xs text-muted-foreground">{inputLabel}</label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="numeric"
            value={lineInput}
            onChange={(event) => setLineInput(event.target.value)}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              setLineInput(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.code !== 'NumpadEnter') {
                return;
              }

              if (event.nativeEvent.isComposing || isComposingRef.current) {
                return;
              }

              event.preventDefault();
              submit(event.currentTarget.value);
            }}
            className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={inputLabel}
            name="goto-line-input"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              ref={cancelButtonRef}
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={closeDialog}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={resolvedTargetLine === null}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
