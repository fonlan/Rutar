import { AppLanguage } from '@/store/useStore';

export type TabCloseConfirmAction =
  | 'save'
  | 'discard'
  | 'cancel'
  | 'save_all'
  | 'discard_all';

export interface TabCloseConfirmRequest {
  id: string;
  language: AppLanguage;
  tabName: string;
  allowAllActions: boolean;
}

interface TabCloseConfirmResponse {
  id: string;
  action: TabCloseConfirmAction;
}

export const TAB_CLOSE_CONFIRM_REQUEST_EVENT = 'rutar:tab-close-confirm-request';
export const TAB_CLOSE_CONFIRM_RESPONSE_EVENT = 'rutar:tab-close-confirm-response';

function buildRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function requestTabCloseConfirm(options: {
  language: AppLanguage;
  tabName: string;
  allowAllActions: boolean;
}): Promise<TabCloseConfirmAction> {
  if (typeof window === 'undefined') {
    return Promise.resolve('cancel');
  }

  const id = buildRequestId();

  return new Promise((resolve) => {
    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent<TabCloseConfirmResponse>;
      if (customEvent.detail?.id !== id) {
        return;
      }

      window.removeEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, handleResponse as EventListener);
      resolve(customEvent.detail.action);
    };

    window.addEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, handleResponse as EventListener);

    window.dispatchEvent(
      new CustomEvent<TabCloseConfirmRequest>(TAB_CLOSE_CONFIRM_REQUEST_EVENT, {
        detail: {
          id,
          language: options.language,
          tabName: options.tabName,
          allowAllActions: options.allowAllActions,
        },
      })
    );
  });
}

