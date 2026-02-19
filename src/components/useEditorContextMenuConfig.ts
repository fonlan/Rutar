import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { EditorCleanupAction, EditorSubmenuKey } from './EditorContextMenu';
import type { EditorSubmenuVerticalAlign } from './Editor.types';

interface UseEditorContextMenuConfigParams {
  tr: (key: string) => string;
  submenuDirection: 'left' | 'right' | undefined;
  submenuVerticalAlignments: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>;
  submenuMaxHeights: Record<EditorSubmenuKey, number | null>;
}

interface ContextMenuItem {
  action: EditorCleanupAction;
  label: string;
}

function buildSubmenuStyle(maxHeight: number | null): CSSProperties | undefined {
  if (maxHeight === null) {
    return undefined;
  }

  return {
    maxHeight: `${maxHeight}px`,
    overflowY: 'auto',
  };
}

export function useEditorContextMenuConfig({
  tr,
  submenuDirection,
  submenuVerticalAlignments,
  submenuMaxHeights,
}: UseEditorContextMenuConfigParams) {
  const deleteLabel = tr('editor.context.delete');
  const selectAllLabel = tr('editor.context.selectAll');
  const copyLabel = tr('toolbar.copy');
  const cutLabel = tr('toolbar.cut');
  const pasteLabel = tr('toolbar.paste');
  const selectCurrentLineLabel = tr('editor.context.selectCurrentLine');
  const addCurrentLineToBookmarkLabel = tr('editor.context.addCurrentLineToBookmark');
  const editMenuLabel = tr('editor.context.edit');
  const sortMenuLabel = tr('editor.context.sort');
  const convertMenuLabel = tr('editor.context.convert');
  const convertBase64EncodeLabel = tr('editor.context.convert.base64Encode');
  const convertBase64DecodeLabel = tr('editor.context.convert.base64Decode');
  const copyBase64EncodeResultLabel = tr('editor.context.convert.copyBase64EncodeResult');
  const copyBase64DecodeResultLabel = tr('editor.context.convert.copyBase64DecodeResult');
  const base64DecodeFailedToastLabel = tr('editor.context.convert.base64DecodeFailed');
  const bookmarkMenuLabel = tr('bookmark.menu.title');
  const addBookmarkLabel = tr('bookmark.add');
  const removeBookmarkLabel = tr('bookmark.remove');

  const submenuHorizontalPositionClassName =
    submenuDirection === 'left' ? 'right-full mr-1 before:-right-2' : 'left-full ml-1 before:-left-2';
  const editSubmenuPositionClassName =
    submenuVerticalAlignments.edit === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const sortSubmenuPositionClassName =
    submenuVerticalAlignments.sort === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const convertSubmenuPositionClassName =
    submenuVerticalAlignments.convert === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;
  const bookmarkSubmenuPositionClassName =
    submenuVerticalAlignments.bookmark === 'bottom'
      ? `${submenuHorizontalPositionClassName} bottom-0`
      : `${submenuHorizontalPositionClassName} top-0`;

  const editSubmenuStyle = buildSubmenuStyle(submenuMaxHeights.edit);
  const sortSubmenuStyle = buildSubmenuStyle(submenuMaxHeights.sort);
  const convertSubmenuStyle = buildSubmenuStyle(submenuMaxHeights.convert);
  const bookmarkSubmenuStyle = buildSubmenuStyle(submenuMaxHeights.bookmark);

  const cleanupMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        action: 'remove_empty_lines',
        label: tr('editor.context.cleanup.removeEmptyLines'),
      },
      {
        action: 'remove_duplicate_lines',
        label: tr('editor.context.cleanup.removeDuplicateLines'),
      },
      {
        action: 'trim_leading_whitespace',
        label: tr('editor.context.cleanup.trimLeadingWhitespace'),
      },
      {
        action: 'trim_trailing_whitespace',
        label: tr('editor.context.cleanup.trimTrailingWhitespace'),
      },
      {
        action: 'trim_surrounding_whitespace',
        label: tr('editor.context.cleanup.trimSurroundingWhitespace'),
      },
    ],
    [tr]
  );

  const sortMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        action: 'sort_lines_ascending',
        label: tr('editor.context.sort.ascending'),
      },
      {
        action: 'sort_lines_ascending_ignore_case',
        label: tr('editor.context.sort.ascendingIgnoreCase'),
      },
      {
        action: 'sort_lines_descending',
        label: tr('editor.context.sort.descending'),
      },
      {
        action: 'sort_lines_descending_ignore_case',
        label: tr('editor.context.sort.descendingIgnoreCase'),
      },
      {
        action: 'sort_lines_pinyin_ascending',
        label: tr('editor.context.sort.pinyinAscending'),
      },
      {
        action: 'sort_lines_pinyin_descending',
        label: tr('editor.context.sort.pinyinDescending'),
      },
    ],
    [tr]
  );

  return {
    deleteLabel,
    selectAllLabel,
    copyLabel,
    cutLabel,
    pasteLabel,
    selectCurrentLineLabel,
    addCurrentLineToBookmarkLabel,
    editMenuLabel,
    sortMenuLabel,
    convertMenuLabel,
    convertBase64EncodeLabel,
    convertBase64DecodeLabel,
    copyBase64EncodeResultLabel,
    copyBase64DecodeResultLabel,
    base64DecodeFailedToastLabel,
    bookmarkMenuLabel,
    addBookmarkLabel,
    removeBookmarkLabel,
    editSubmenuPositionClassName,
    sortSubmenuPositionClassName,
    convertSubmenuPositionClassName,
    bookmarkSubmenuPositionClassName,
    editSubmenuStyle,
    sortSubmenuStyle,
    convertSubmenuStyle,
    bookmarkSubmenuStyle,
    cleanupMenuItems,
    sortMenuItems,
  };
}
