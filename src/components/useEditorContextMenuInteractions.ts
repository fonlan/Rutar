import { useCallback } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import type { EditorContextMenuState, EditorSubmenuKey } from './EditorContextMenu';
import type { EditorInputElement, EditorSubmenuVerticalAlign } from './Editor.types';

interface UseEditorContextMenuInteractionsParams {
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  submenuPanelRefs: MutableRefObject<Record<EditorSubmenuKey, HTMLDivElement | null>>;
  lineNumberContextLineRef: MutableRefObject<number | null>;
  activeLineNumber: number;
  normalizedRectangularSelection: { width: number } | null;
  hasSelectionInsideEditor: () => boolean;
  defaultSubmenuVerticalAlignments: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>;
  defaultSubmenuMaxHeights: Record<EditorSubmenuKey, number | null>;
  setSubmenuVerticalAlignments: (
    updater:
      | Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>
      | ((current: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>) => Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>)
  ) => void;
  setSubmenuMaxHeights: (
    updater:
      | Record<EditorSubmenuKey, number | null>
      | ((current: Record<EditorSubmenuKey, number | null>) => Record<EditorSubmenuKey, number | null>)
  ) => void;
  setEditorContextMenu: (value: EditorContextMenuState | null) => void;
}

export function useEditorContextMenuInteractions({
  contentRef,
  submenuPanelRefs,
  lineNumberContextLineRef,
  activeLineNumber,
  normalizedRectangularSelection,
  hasSelectionInsideEditor,
  defaultSubmenuVerticalAlignments,
  defaultSubmenuMaxHeights,
  setSubmenuVerticalAlignments,
  setSubmenuMaxHeights,
  setEditorContextMenu,
}: UseEditorContextMenuInteractionsParams) {
  const updateSubmenuVerticalAlignment = useCallback(
    (submenuKey: EditorSubmenuKey, anchorElement: HTMLDivElement) => {
      const submenuElement = submenuPanelRefs.current[submenuKey];
      if (!submenuElement) {
        return;
      }

      const viewportPadding = 8;
      const submenuHeight = submenuElement.scrollHeight;
      if (submenuHeight <= 0) {
        return;
      }

      const anchorRect = anchorElement.getBoundingClientRect();
      const availableBelow = Math.max(0, Math.floor(window.innerHeight - viewportPadding - anchorRect.top));
      const availableAbove = Math.max(0, Math.floor(anchorRect.bottom - viewportPadding));
      const topAlignedBottom = anchorRect.top + submenuHeight;
      const bottomAlignedTop = anchorRect.bottom - submenuHeight;
      let nextAlign: EditorSubmenuVerticalAlign = 'top';

      if (topAlignedBottom > window.innerHeight - viewportPadding) {
        if (bottomAlignedTop >= viewportPadding) {
          nextAlign = 'bottom';
        } else {
          nextAlign = availableAbove > availableBelow ? 'bottom' : 'top';
        }
      }

      const availableForCurrentAlign = nextAlign === 'bottom' ? availableAbove : availableBelow;
      const nextMaxHeight =
        submenuHeight > availableForCurrentAlign && availableForCurrentAlign > 0
          ? availableForCurrentAlign
          : null;

      setSubmenuVerticalAlignments((current) =>
        current[submenuKey] === nextAlign
          ? current
          : {
              ...current,
              [submenuKey]: nextAlign,
            }
      );
      setSubmenuMaxHeights((current) =>
        current[submenuKey] === nextMaxHeight
          ? current
          : {
              ...current,
              [submenuKey]: nextMaxHeight,
            }
      );
    },
    [setSubmenuMaxHeights, setSubmenuVerticalAlignments, submenuPanelRefs]
  );

  const handleEditorContextMenu = useCallback(
    (event: MouseEvent<EditorInputElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!contentRef.current) {
        return;
      }

      contentRef.current.focus();

      const menuWidth = 160;
      const menuHeight = 360;
      const submenuWidth = 192;
      const submenuGap = 4;
      const viewportPadding = 8;

      const boundedX = Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding);
      const boundedY = Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding);
      const safeX = Math.max(viewportPadding, boundedX);
      const canOpenSubmenuRight =
        safeX + menuWidth + submenuGap + submenuWidth + viewportPadding <= window.innerWidth;

      setSubmenuVerticalAlignments({ ...defaultSubmenuVerticalAlignments });
      setSubmenuMaxHeights({ ...defaultSubmenuMaxHeights });

      setEditorContextMenu({
        target: 'editor',
        x: safeX,
        y: Math.max(viewportPadding, boundedY),
        hasSelection:
          hasSelectionInsideEditor() ||
          ((normalizedRectangularSelection?.width ?? 0) > 0 && normalizedRectangularSelection !== null),
        lineNumber: activeLineNumber,
        submenuDirection: canOpenSubmenuRight ? 'right' : 'left',
      });
    },
    [
      activeLineNumber,
      contentRef,
      defaultSubmenuMaxHeights,
      defaultSubmenuVerticalAlignments,
      hasSelectionInsideEditor,
      normalizedRectangularSelection,
      setEditorContextMenu,
      setSubmenuMaxHeights,
      setSubmenuVerticalAlignments,
    ]
  );

  const handleLineNumberContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>, line: number) => {
      event.preventDefault();
      event.stopPropagation();

      const menuWidth = 176;
      const menuHeight = 96;
      const viewportPadding = 8;
      const parsedLine = Number.parseInt((event.currentTarget.textContent || '').trim(), 10);
      const safeLine = Number.isFinite(parsedLine)
        ? Math.max(1, parsedLine)
        : Math.max(1, Math.floor(line));

      const boundedX = Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding);
      const boundedY = Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding);

      lineNumberContextLineRef.current = safeLine;
      setEditorContextMenu({
        target: 'lineNumber',
        x: Math.max(viewportPadding, boundedX),
        y: Math.max(viewportPadding, boundedY),
        hasSelection: false,
        lineNumber: safeLine,
        submenuDirection: 'right',
      });
    },
    [lineNumberContextLineRef, setEditorContextMenu]
  );

  return {
    updateSubmenuVerticalAlignment,
    handleEditorContextMenu,
    handleLineNumberContextMenu,
  };
}
