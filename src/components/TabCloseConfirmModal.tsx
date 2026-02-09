import { useEffect, useMemo, useState } from 'react';
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

  const submit = (action: TabCloseConfirmAction) => {
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
  };

  if (!dialog) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35">
      <div className="w-[min(94vw,520px)] rounded-lg border border-border bg-background p-4 shadow-2xl">
        <p className="text-sm font-medium text-foreground">{text.title}</p>
        <p className="mt-2 text-xs text-muted-foreground">{text.message(dialog.tabName)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
            onClick={() => submit('cancel')}
          >
            {text.cancel}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
            onClick={() => submit('discard')}
          >
            {text.discard}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
            onClick={() => submit('save')}
          >
            {text.save}
          </button>
          {dialog.allowAllActions ? (
            <>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={() => submit('discard_all')}
              >
                {text.discardAll}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
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
