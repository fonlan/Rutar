import type { CSSProperties, MutableRefObject } from 'react';

type EditorContextMenuAction = 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll';
type EditorSubmenuKey = 'edit' | 'sort' | 'convert' | 'bookmark';
type EditorCleanupAction =
  | 'remove_empty_lines'
  | 'remove_duplicate_lines'
  | 'trim_leading_whitespace'
  | 'trim_trailing_whitespace'
  | 'trim_surrounding_whitespace'
  | 'sort_lines_ascending'
  | 'sort_lines_ascending_ignore_case'
  | 'sort_lines_descending'
  | 'sort_lines_descending_ignore_case'
  | 'sort_lines_pinyin_ascending'
  | 'sort_lines_pinyin_descending';
type EditorConvertAction =
  | 'base64_encode'
  | 'base64_decode'
  | 'copy_base64_encode'
  | 'copy_base64_decode';

interface EditorContextMenuState {
  target: 'editor' | 'lineNumber';
  x: number;
  y: number;
  hasSelection: boolean;
  lineNumber: number;
  submenuDirection: 'left' | 'right';
}

interface EditorContextMenuProps {
  editorContextMenu: EditorContextMenuState | null;
  editorContextMenuRef: MutableRefObject<HTMLDivElement | null>;
  submenuPanelRefs: MutableRefObject<Record<EditorSubmenuKey, HTMLDivElement | null>>;
  editSubmenuStyle: CSSProperties | undefined;
  sortSubmenuStyle: CSSProperties | undefined;
  convertSubmenuStyle: CSSProperties | undefined;
  bookmarkSubmenuStyle: CSSProperties | undefined;
  editSubmenuPositionClassName: string;
  sortSubmenuPositionClassName: string;
  convertSubmenuPositionClassName: string;
  bookmarkSubmenuPositionClassName: string;
  cleanupMenuItems: Array<{ action: EditorCleanupAction; label: string }>;
  sortMenuItems: Array<{ action: EditorCleanupAction; label: string }>;
  copyLabel: string;
  cutLabel: string;
  pasteLabel: string;
  deleteLabel: string;
  selectAllLabel: string;
  selectCurrentLineLabel: string;
  addCurrentLineToBookmarkLabel: string;
  editMenuLabel: string;
  sortMenuLabel: string;
  convertMenuLabel: string;
  convertBase64EncodeLabel: string;
  convertBase64DecodeLabel: string;
  copyBase64EncodeResultLabel: string;
  copyBase64DecodeResultLabel: string;
  bookmarkMenuLabel: string;
  addBookmarkLabel: string;
  removeBookmarkLabel: string;
  hasContextBookmark: boolean;
  onSelectCurrentLine: () => void;
  onAddCurrentLineBookmark: () => void;
  onEditorAction: (action: EditorContextMenuAction) => void;
  isEditorActionDisabled: (action: EditorContextMenuAction) => boolean;
  onUpdateSubmenuVerticalAlignment: (submenuKey: EditorSubmenuKey, anchorElement: HTMLDivElement) => void;
  onCleanup: (action: EditorCleanupAction) => Promise<void>;
  onConvert: (action: EditorConvertAction) => Promise<void>;
  onAddBookmark: () => void;
  onRemoveBookmark: () => void;
}

const menuButtonClassName =
  'w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const disabledMenuButtonClassName = `${menuButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`;
const submenuTriggerClassName =
  'flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function EditorContextMenu({
  editorContextMenu,
  editorContextMenuRef,
  submenuPanelRefs,
  editSubmenuStyle,
  sortSubmenuStyle,
  convertSubmenuStyle,
  bookmarkSubmenuStyle,
  editSubmenuPositionClassName,
  sortSubmenuPositionClassName,
  convertSubmenuPositionClassName,
  bookmarkSubmenuPositionClassName,
  cleanupMenuItems,
  sortMenuItems,
  copyLabel,
  cutLabel,
  pasteLabel,
  deleteLabel,
  selectAllLabel,
  selectCurrentLineLabel,
  addCurrentLineToBookmarkLabel,
  editMenuLabel,
  sortMenuLabel,
  convertMenuLabel,
  convertBase64EncodeLabel,
  convertBase64DecodeLabel,
  copyBase64EncodeResultLabel,
  copyBase64DecodeResultLabel,
  bookmarkMenuLabel,
  addBookmarkLabel,
  removeBookmarkLabel,
  hasContextBookmark,
  onSelectCurrentLine,
  onAddCurrentLineBookmark,
  onEditorAction,
  isEditorActionDisabled,
  onUpdateSubmenuVerticalAlignment,
  onCleanup,
  onConvert,
  onAddBookmark,
  onRemoveBookmark,
}: EditorContextMenuProps) {
  if (!editorContextMenu) {
    return null;
  }

  return (
    <div
      ref={editorContextMenuRef}
      className={`fixed z-[90] rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm ${
        editorContextMenu.target === 'lineNumber' ? 'w-44' : 'w-40'
      }`}
      style={{ left: editorContextMenu.x, top: editorContextMenu.y }}
    >
      {editorContextMenu.target === 'lineNumber' ? (
        <>
          <button type="button" className={menuButtonClassName} onClick={onSelectCurrentLine}>
            {selectCurrentLineLabel}
          </button>
          <button type="button" className={menuButtonClassName} onClick={onAddCurrentLineBookmark}>
            {addCurrentLineToBookmarkLabel}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={disabledMenuButtonClassName}
            onClick={() => {
              onEditorAction('copy');
            }}
            disabled={isEditorActionDisabled('copy')}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            className={disabledMenuButtonClassName}
            onClick={() => {
              onEditorAction('cut');
            }}
            disabled={isEditorActionDisabled('cut')}
          >
            {cutLabel}
          </button>
          <button
            type="button"
            className={disabledMenuButtonClassName}
            onClick={() => {
              onEditorAction('paste');
            }}
            disabled={isEditorActionDisabled('paste')}
          >
            {pasteLabel}
          </button>
          <button
            type="button"
            className={disabledMenuButtonClassName}
            onClick={() => {
              onEditorAction('delete');
            }}
            disabled={isEditorActionDisabled('delete')}
          >
            {deleteLabel}
          </button>
          <button
            type="button"
            className={disabledMenuButtonClassName}
            onClick={() => {
              onEditorAction('selectAll');
            }}
            disabled={isEditorActionDisabled('selectAll')}
          >
            {selectAllLabel}
          </button>
          <div className="my-1 h-px bg-border" />
          <div
            className="group/edit relative"
            onMouseEnter={(event) => {
              onUpdateSubmenuVerticalAlignment('edit', event.currentTarget);
            }}
          >
            <button type="button" className={submenuTriggerClassName}>
              <span>{editMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.edit = element;
              }}
              style={editSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${editSubmenuPositionClassName} group-hover/edit:pointer-events-auto group-hover/edit:visible group-hover/edit:opacity-100`}
            >
              {cleanupMenuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onCleanup(item.action);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="group/sort relative"
            onMouseEnter={(event) => {
              onUpdateSubmenuVerticalAlignment('sort', event.currentTarget);
            }}
          >
            <button type="button" className={submenuTriggerClassName}>
              <span>{sortMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.sort = element;
              }}
              style={sortSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${sortSubmenuPositionClassName} group-hover/sort:pointer-events-auto group-hover/sort:visible group-hover/sort:opacity-100`}
            >
              {sortMenuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onCleanup(item.action);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {editorContextMenu.hasSelection && (
            <div
              className="group/convert relative"
              onMouseEnter={(event) => {
                onUpdateSubmenuVerticalAlignment('convert', event.currentTarget);
              }}
            >
              <button type="button" className={submenuTriggerClassName}>
                <span>{convertMenuLabel}</span>
                <span className="text-[10px] text-muted-foreground">▶</span>
              </button>
              <div
                ref={(element) => {
                  submenuPanelRefs.current.convert = element;
                }}
                style={convertSubmenuStyle}
                className={`pointer-events-none invisible absolute z-[95] w-48 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${convertSubmenuPositionClassName} group-hover/convert:pointer-events-auto group-hover/convert:visible group-hover/convert:opacity-100`}
              >
                <button
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onConvert('base64_encode');
                  }}
                >
                  {convertBase64EncodeLabel}
                </button>
                <button
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onConvert('base64_decode');
                  }}
                >
                  {convertBase64DecodeLabel}
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onConvert('copy_base64_encode');
                  }}
                >
                  {copyBase64EncodeResultLabel}
                </button>
                <button
                  type="button"
                  className={menuButtonClassName}
                  onClick={() => {
                    void onConvert('copy_base64_decode');
                  }}
                >
                  {copyBase64DecodeResultLabel}
                </button>
              </div>
            </div>
          )}
          <div className="my-1 h-px bg-border" />
          <div
            className="group/bookmark relative"
            onMouseEnter={(event) => {
              onUpdateSubmenuVerticalAlignment('bookmark', event.currentTarget);
            }}
          >
            <button type="button" className={submenuTriggerClassName}>
              <span>{bookmarkMenuLabel}</span>
              <span className="text-[10px] text-muted-foreground">▶</span>
            </button>
            <div
              ref={(element) => {
                submenuPanelRefs.current.bookmark = element;
              }}
              style={bookmarkSubmenuStyle}
              className={`pointer-events-none invisible absolute z-[95] w-28 rounded-md border border-border bg-background/95 p-1 opacity-0 shadow-xl transition-opacity duration-75 before:absolute before:top-0 before:h-full before:w-2 before:content-[''] ${bookmarkSubmenuPositionClassName} group-hover/bookmark:pointer-events-auto group-hover/bookmark:visible group-hover/bookmark:opacity-100`}
            >
              <button
                type="button"
                className={disabledMenuButtonClassName}
                onClick={onAddBookmark}
                disabled={hasContextBookmark}
              >
                {addBookmarkLabel}
              </button>
              <button
                type="button"
                className={disabledMenuButtonClassName}
                onClick={onRemoveBookmark}
                disabled={!hasContextBookmark}
              >
                {removeBookmarkLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
