import { useEffect, useMemo, useState } from 'react';
import {
  TAB_CLOSE_CONFIRM_REQUEST_EVENT,
  TAB_CLOSE_CONFIRM_RESPONSE_EVENT,
  TabCloseConfirmAction,
  TabCloseConfirmRequest,
} from '@/lib/closeConfirm';

interface DialogState extends TabCloseConfirmRequest {}

const labels = {
  'zh-CN': {
    title: '未保存更改',
    message: (tabName: string) => `标签页“${tabName}”有未保存修改，是否保存后关闭？`,
    save: '是',
    discard: '否',
    cancel: '取消',
    saveAll: '是（全部）',
    discardAll: '否（全部）',
  },
  'en-US': {
    title: 'Unsaved Changes',
    message: (tabName: string) => `Tab "${tabName}" has unsaved changes. Close with saving?`,
    save: 'Yes',
    discard: 'No',
    cancel: 'Cancel',
    saveAll: 'Yes (All)',
    discardAll: 'No (All)',
  },
} as const;

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
    if (!dialog) {
      return labels['zh-CN'];
    }

    return dialog.language === 'en-US' ? labels['en-US'] : labels['zh-CN'];
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

