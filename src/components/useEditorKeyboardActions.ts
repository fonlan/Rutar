import { useCallback } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { dispatchGoToLineDialogRequest } from "@/lib/goToLineDialog";
import type { SyntaxKey } from "@/store/useStore";
import { buildAutoPairEdit } from "./autoPairInput";
import {
  buildAutoDedentInsertion,
  buildEnterAutoIndentEdit,
} from "./enterAutoIndent";
import { buildIndentSelectedLinesEdit } from "./indentSelectedLines";

interface UseEditorKeyboardActionsParams {
  tabId: string;
  tabLineCount: number;
  activeLineNumber: number;
  activeSyntaxKey: SyntaxKey | null;
  tabWidth: number;
  tabIndentMode: "tabs" | "spaces";
  contentRef: MutableRefObject<any>;
  rectangularSelectionRef: MutableRefObject<unknown>;
  lineNumberMultiSelection: number[];
  normalizedRectangularSelection: unknown;
  replaceRectangularSelection: (insertText: string) => Promise<boolean>;
  isVerticalSelectionShortcut: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => boolean;
  beginRectangularSelectionFromCaret: () => void;
  nudgeRectangularSelectionByKey: (
    direction: "up" | "down" | "left" | "right",
  ) => Promise<unknown>;
  clearVerticalSelectionState: () => void;
  isToggleLineCommentShortcut: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => boolean;
  toggleSelectedLinesComment: (
    event: KeyboardEvent<HTMLDivElement>,
  ) => Promise<void>;
  applyLineNumberMultiSelectionEdit: (
    mode: "cut" | "delete",
  ) => Promise<boolean>;
  buildLineNumberSelectionRangeText: (
    text: string,
    selectedLines: number[],
  ) => string;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: any) => string;
  getSelectionOffsetsInElement: (
    element: any,
  ) => { start: number; end: number; isCollapsed: boolean } | null;
  isTextareaInputElement: (element: unknown) => element is HTMLTextAreaElement;
  setInputLayerText: (element: any, text: string) => void;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: any, offset: number) => void;
  setSelectionToCodeUnitOffsets: (
    element: any,
    startOffset: number,
    endOffset: number,
  ) => void;
  clearRectangularSelection: () => void;
  clearLineNumberMultiSelection: () => void;
  handleInput: () => void;
  capturePendingEditBeforeCursor: () => void;
}

export function useEditorKeyboardActions({
  tabId,
  tabLineCount,
  activeLineNumber,
  activeSyntaxKey,
  tabWidth,
  tabIndentMode,
  contentRef,
  rectangularSelectionRef,
  lineNumberMultiSelection,
  normalizedRectangularSelection,
  replaceRectangularSelection,
  isVerticalSelectionShortcut,
  beginRectangularSelectionFromCaret,
  nudgeRectangularSelectionByKey,
  clearVerticalSelectionState,
  isToggleLineCommentShortcut,
  toggleSelectedLinesComment,
  applyLineNumberMultiSelectionEdit,
  buildLineNumberSelectionRangeText,
  normalizeSegmentText,
  getEditableText,
  getSelectionOffsetsInElement,
  isTextareaInputElement,
  setInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  setSelectionToCodeUnitOffsets,
  clearRectangularSelection,
  clearLineNumberMultiSelection,
  handleInput,
  capturePendingEditBeforeCursor,
}: UseEditorKeyboardActionsParams) {
  const normalizedTabWidth = Number.isFinite(tabWidth)
    ? Math.min(8, Math.max(1, Math.floor(tabWidth)))
    : 4;
  const indentText =
    tabIndentMode === "spaces" ? " ".repeat(normalizedTabWidth) : "\t";

  const handleRectangularSelectionInputByKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!normalizedRectangularSelection || event.nativeEvent.isComposing) {
        return false;
      }

      const key = event.key;
      const lower = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === "c" || lower === "x" || lower === "v") {
          return false;
        }

        if (lower === "a") {
          event.preventDefault();
          event.stopPropagation();
          clearRectangularSelection();
          return true;
        }

        return false;
      }

      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clearRectangularSelection();
        return true;
      }

      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection("");
        return true;
      }

      if (key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection(indentText);
        return true;
      }

      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        key.length === 1
      ) {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection(key);
        return true;
      }

      return false;
    },
    [
      clearRectangularSelection,
      indentText,
      normalizedRectangularSelection,
      replaceRectangularSelection,
    ],
  );

  const replaceTextRange = useCallback(
    (start: number, end: number, text: string, caretOffset?: number) => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const safeStart = Math.max(0, Math.min(start, end));
      const safeEnd = Math.max(safeStart, end);

      if (isTextareaInputElement(element)) {
        const nextText = `${element.value.slice(0, safeStart)}${text}${element.value.slice(safeEnd)}`;
        element.setRangeText(text, safeStart, safeEnd, "end");
        if (element.value !== nextText) {
          element.value = nextText;
        }
        if (typeof caretOffset === "number") {
          const nextCaret = safeStart + Math.max(0, caretOffset);
          element.setSelectionRange(nextCaret, nextCaret);
        }
        return true;
      }

      const currentText = getEditableText(element);
      const nextText = `${currentText.slice(0, safeStart)}${text}${currentText.slice(safeEnd)}`;
      setInputLayerText(element, nextText);
      const logicalNextOffset =
        safeStart +
        (typeof caretOffset === "number"
          ? Math.max(0, caretOffset)
          : text.length);
      const layerNextOffset = mapLogicalOffsetToInputLayerOffset(
        nextText,
        logicalNextOffset,
      );
      setCaretToCodeUnitOffset(element, layerNextOffset);
      return true;
    },
    [
      contentRef,
      getEditableText,
      isTextareaInputElement,
      mapLogicalOffsetToInputLayerOffset,
      setCaretToCodeUnitOffset,
      setInputLayerText,
    ],
  );

  const insertTextAtSelection = useCallback(
    (text: string) => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets) {
        return false;
      }

      return replaceTextRange(
        selectionOffsets.start,
        selectionOffsets.end,
        text,
      );
    },
    [contentRef, getSelectionOffsetsInElement, replaceTextRange],
  );

  const indentSelectedLinesAtSelection = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets || selectionOffsets.isCollapsed) {
      return false;
    }

    const text = getEditableText(element);
    const edit = buildIndentSelectedLinesEdit({
      text,
      selectionStart: selectionOffsets.start,
      selectionEnd: selectionOffsets.end,
      indentText,
    });
    if (!edit) {
      return false;
    }

    const safeStart = Math.max(0, Math.min(edit.start, edit.end));
    const safeEnd = Math.max(safeStart, edit.end);

    if (isTextareaInputElement(element)) {
      const nextText = `${element.value.slice(0, safeStart)}${edit.newText}${element.value.slice(safeEnd)}`;
      element.setRangeText(edit.newText, safeStart, safeEnd, "end");
      if (element.value !== nextText) {
        element.value = nextText;
      }
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      return true;
    }

    const currentText = getEditableText(element);
    const nextText = `${currentText.slice(0, safeStart)}${edit.newText}${currentText.slice(safeEnd)}`;
    setInputLayerText(element, nextText);
    setSelectionToCodeUnitOffsets(
      element,
      edit.selectionStart,
      edit.selectionEnd,
    );
    return true;
  }, [
    contentRef,
    getEditableText,
    getSelectionOffsetsInElement,
    indentText,
    isTextareaInputElement,
    setInputLayerText,
    setSelectionToCodeUnitOffsets,
  ]);

  const buildEnterInsertEdit = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return { text: "\n", caretOffset: 1 };
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets) {
      return { text: "\n", caretOffset: 1 };
    }

    const text = getEditableText(element);
    return buildEnterAutoIndentEdit({
      text,
      offset: selectionOffsets.start,
      syntaxKey: activeSyntaxKey,
      indentText,
    });
  }, [
    activeSyntaxKey,
    contentRef,
    getEditableText,
    getSelectionOffsetsInElement,
    indentText,
  ]);

  const buildAutoPairReplacement = useCallback(
    (key: string) => {
      const element = contentRef.current;
      if (!element) {
        return null;
      }

      const selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets) {
        return null;
      }

      const text = getEditableText(element);
      return buildAutoPairEdit({
        text,
        start: selectionOffsets.start,
        end: selectionOffsets.end,
        key,
      });
    },
    [contentRef, getEditableText, getSelectionOffsetsInElement],
  );

  const buildAutoDedentReplacement = useCallback(
    (key: string) => {
      const element = contentRef.current;
      if (!element) {
        return null;
      }

      const selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets?.isCollapsed) {
        return null;
      }

      const text = getEditableText(element);
      return buildAutoDedentInsertion({
        text,
        offset: selectionOffsets.start,
        syntaxKey: activeSyntaxKey,
        indentText,
        key,
      });
    },
    [
      activeSyntaxKey,
      contentRef,
      getEditableText,
      getSelectionOffsetsInElement,
      indentText,
    ],
  );

  const handleEditableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (handleRectangularSelectionInputByKey(event)) {
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        event.stopPropagation();
        const maxLineNumber = Math.max(1, Math.floor(tabLineCount));
        const defaultLineNumber = String(
          Math.min(maxLineNumber, Math.max(1, Math.floor(activeLineNumber))),
        );
        const defaultLine = Number(defaultLineNumber);
        dispatchGoToLineDialogRequest({
          tabId,
          maxLineNumber,
          initialLineNumber: Number.isFinite(defaultLine) ? defaultLine : 1,
        });
        return;
      }

      if (isVerticalSelectionShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        const direction =
          event.key === "ArrowUp"
            ? "up"
            : event.key === "ArrowDown"
              ? "down"
              : event.key === "ArrowLeft"
                ? "left"
                : "right";

        if (!rectangularSelectionRef.current) {
          beginRectangularSelectionFromCaret();
        }

        void nudgeRectangularSelectionByKey(
          direction as "up" | "down" | "left" | "right",
        );
        return;
      }

      if (isToggleLineCommentShortcut(event)) {
        clearVerticalSelectionState();
        void toggleSelectedLinesComment(event);
        return;
      }

      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.nativeEvent.isComposing
      ) {
        if (!event.shiftKey) {
          const autoDedentReplacement = buildAutoDedentReplacement(event.key);
          if (autoDedentReplacement) {
            clearVerticalSelectionState();
            clearRectangularSelection();
            clearLineNumberMultiSelection();
          event.preventDefault();
          event.stopPropagation();
          capturePendingEditBeforeCursor();
          if (
            replaceTextRange(
              autoDedentReplacement.start,
                autoDedentReplacement.end,
                autoDedentReplacement.newText,
              )
            ) {
              handleInput();
            }
            return;
          }
        }

        const autoPairReplacement = buildAutoPairReplacement(event.key);
        if (autoPairReplacement) {
          clearVerticalSelectionState();
          clearRectangularSelection();
          clearLineNumberMultiSelection();
          event.preventDefault();
          event.stopPropagation();
          capturePendingEditBeforeCursor();
          if (
            replaceTextRange(
              autoPairReplacement.start,
              autoPairReplacement.end,
              autoPairReplacement.newText,
              autoPairReplacement.caretOffset,
            )
          ) {
            handleInput();
          }
          return;
        }
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.nativeEvent.isComposing
      ) {
        clearVerticalSelectionState();
        clearRectangularSelection();
        clearLineNumberMultiSelection();
        event.preventDefault();
        event.stopPropagation();
        capturePendingEditBeforeCursor();
        if (indentSelectedLinesAtSelection() || insertTextAtSelection(indentText)) {
          handleInput();
        }
        return;
      }

      if (event.key !== "Enter" || event.nativeEvent.isComposing) {
        if (event.key === "Delete" && lineNumberMultiSelection.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit("delete");
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "x" &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit("cut");
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "c" &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          const element = contentRef.current;
          if (element) {
            const text = normalizeSegmentText(getEditableText(element));
            const selected = buildLineNumberSelectionRangeText(
              text,
              lineNumberMultiSelection,
            );
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn("Failed to write line selection to clipboard.");
              });
            }
          }
          return;
        }

        if (
          normalizedRectangularSelection &&
          (event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight")
        ) {
          clearRectangularSelection();
        }
        if (
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.key !== "Shift"
        ) {
          clearLineNumberMultiSelection();
        }
        if (!event.shiftKey || event.key !== "Shift") {
          clearVerticalSelectionState();
        }
        return;
      }

      clearVerticalSelectionState();
      clearRectangularSelection();
      clearLineNumberMultiSelection();
      event.preventDefault();
      event.stopPropagation();
      capturePendingEditBeforeCursor();
      const element = contentRef.current;
      const selectionOffsets = element
        ? getSelectionOffsetsInElement(element)
        : null;
      const enterEdit = buildEnterInsertEdit();
      if (
        selectionOffsets &&
        replaceTextRange(
          selectionOffsets.start,
          selectionOffsets.end,
          enterEdit.text,
          enterEdit.caretOffset,
        )
      ) {
        handleInput();
      }
    },
    [
      activeLineNumber,
      applyLineNumberMultiSelectionEdit,
      beginRectangularSelectionFromCaret,
      buildAutoDedentReplacement,
      buildAutoPairReplacement,
      buildEnterInsertEdit,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      clearVerticalSelectionState,
      contentRef,
      getEditableText,
      getSelectionOffsetsInElement,
      handleInput,
      handleRectangularSelectionInputByKey,
      indentSelectedLinesAtSelection,
      insertTextAtSelection,
      isToggleLineCommentShortcut,
      isVerticalSelectionShortcut,
      lineNumberMultiSelection,
      indentText,
      normalizedRectangularSelection,
      normalizeSegmentText,
      nudgeRectangularSelectionByKey,
      rectangularSelectionRef,
      replaceTextRange,
      tabId,
      tabLineCount,
      toggleSelectedLinesComment,
      capturePendingEditBeforeCursor,
    ],
  );

  return {
    handleEditableKeyDown,
  };
}
