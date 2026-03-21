export const EDITOR_FIND_OPEN_EVENT = 'rutar:editor-find-open';

export interface EditorFindOpenEventDetail {
  tabId?: string;
}

export function dispatchEditorFindOpen(detail: EditorFindOpenEventDetail) {
  window.dispatchEvent(
    new CustomEvent<EditorFindOpenEventDetail>(EDITOR_FIND_OPEN_EVENT, {
      detail,
    })
  );
}
