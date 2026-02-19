import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  TAB_CLOSE_CONFIRM_REQUEST_EVENT,
  TAB_CLOSE_CONFIRM_RESPONSE_EVENT,
  TabCloseConfirmAction,
  TabCloseConfirmRequest,
} from '@/lib/closeConfirm';
import { t } from '@/i18n';

interface DialogState extends TabCloseConfirmRequest {}

export function TabCloseConfirmModal() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const customEvent = event as CustomEvent<TabCloseConfirmRequest>;
      if (!customEvent.detail) {
        return;
      }

      setDialog(customEvent.detail);
    };

    window.addEventListener(TAB_CLOSE_CONFIRM_REQUEST_EVENT, handleRequest as EventListener);
    return () => {
      window.removeEventListener(TAB_CLOSE_CONFIRM_REQUEST_EVENT, handleRequest as EventListener);
    };
  }, []);

  const text = useMemo(() => {
    const language = dialog?.language ?? 'zh-CN';
    const messageTemplate = t(language, 'tabCloseConfirm.message');

    return {
      title: t(language, 'tabCloseConfirm.title'),
      message: (tabName: string) => messageTemplate.replace('{tabName}', tabName),
      save: t(language, 'tabCloseConfirm.save'),
      discard: t(language, 'tabCloseConfirm.discard'),
      cancel: t(language, 'tabCloseConfirm.cancel'),
      saveAll: t(language, 'tabCloseConfirm.saveAll'),
      discardAll: t(language, 'tabCloseConfirm.discardAll'),
    };
  }, [dialog]);

  const submit = useCallback((action: TabCloseConfirmAction) => {
    if (!dialog) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, {
        detail: {
          id: dialog.id,
          action,
        },
      })
    );

    setDialog(null);
  }, [dialog]);

  useEffect(() => {
    if (!dialog) {
      return;
    }

    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusRequestId = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        submit('cancel');
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = dialogPanelRef.current;
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
  }, [dialog, submit]);

  if (!dialog) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35">
      <div
        ref={dialogPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-[min(94vw,520px)] rounded-lg border border-border bg-background p-4 shadow-2xl"
      >
        <p id={titleId} className="text-sm font-medium text-foreground">{text.title}</p>
        <p id={descriptionId} className="mt-2 text-xs text-muted-foreground">{text.message(dialog.tabName)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => submit('cancel')}
          >
            {text.cancel}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => submit('discard')}
          >
            {text.discard}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => submit('save')}
          >
            {text.save}
          </button>
          {dialog.allowAllActions ? (
            <>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => submit('discard_all')}
              >
                {text.discardAll}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => submit('save_all')}
              >
                {text.saveAll}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
