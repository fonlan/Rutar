export const QUICK_FIND_OPEN_EVENT = 'rutar:quick-find-open';

export interface QuickFindOpenEventDetail {
  tabId?: string;
}

export function dispatchQuickFindOpen(detail: QuickFindOpenEventDetail) {
  window.dispatchEvent(
    new CustomEvent<QuickFindOpenEventDetail>(QUICK_FIND_OPEN_EVENT, {
      detail,
    })
  );
}
