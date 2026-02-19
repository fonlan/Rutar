export const GO_TO_LINE_DIALOG_REQUEST_EVENT = 'rutar:go-to-line-dialog-request';

export interface GoToLineDialogRequest {
  tabId: string;
  maxLineNumber: number;
  initialLineNumber: number;
}

export function dispatchGoToLineDialogRequest(detail: GoToLineDialogRequest) {
  window.dispatchEvent(
    new CustomEvent<GoToLineDialogRequest>(GO_TO_LINE_DIALOG_REQUEST_EVENT, {
      detail,
    })
  );
}
