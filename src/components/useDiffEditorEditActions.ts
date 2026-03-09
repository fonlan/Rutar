import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent as ReactCompositionEvent,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { FileTab, SyntaxKey } from "@/store/useStore";
import type { ActivePanel, LineDiffComparisonResult } from "./diffEditor.types";
import type { CaretSnapshot } from "./diffEditor.utils";
import { getLineIndexFromTextOffset } from "./diffEditor.utils";
import { buildAutoPairEdit } from "./autoPairInput";
import {
  buildAutoDedentInsertion,
  buildEnterAutoIndentEdit,
} from "./enterAutoIndent";
import { buildIndentSelectedLinesEdit } from "./indentSelectedLines";

interface ApplyAlignedDiffPanelCopyResult {
  lineDiff: LineDiffComparisonResult;
  changed: boolean;
}

interface UseDiffEditorEditActionsParams {
  sourceTab: FileTab | null;
  targetTab: FileTab | null;
  sourceSyntaxKey: SyntaxKey | null;
  targetSyntaxKey: SyntaxKey | null;
  sourceIndentText: string;
  targetIndentText: string;
  setActivePanel: (side: ActivePanel) => void;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  targetTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  pendingCaretRestoreRef: MutableRefObject<CaretSnapshot | null>;
  lastEditAtRef: MutableRefObject<number>;
  copyLinesRequestSequenceRef: MutableRefObject<number>;
  setLineDiff: Dispatch<SetStateAction<LineDiffComparisonResult>>;
  capturePanelScrollSnapshot: () => void;
  applyDeferredBackendResultIfIdle: () => void;
  schedulePreviewMetadataComputation: (
    alignedSourceLines: string[],
    alignedTargetLines: string[],
    alignedSourcePresent: boolean[],
    alignedTargetPresent: boolean[],
  ) => void;
  scheduleSideCommit: (side: ActivePanel) => void;
  clearSideCommitTimer: (side: ActivePanel) => void;
  compositionStateRef: MutableRefObject<{ source: boolean; target: boolean }>;
  setSideCompositionDraft: (side: ActivePanel, text: string | null) => void;
  invalidatePreviewMetadataComputation: () => void;
  normalizeTextToLines: (text: string) => string[];
  reconcilePresenceAfterTextEdit: (
    oldLines: string[],
    oldPresent: boolean[],
    newLines: string[],
  ) => boolean[];
  buildCopyTextWithoutVirtualRows: (
    text: string,
    selectionStart: number,
    selectionEnd: number,
    present: boolean[],
  ) => string | null;
  getSelectedLineRangeByOffset: (
    text: string,
    selectionStart: number,
    selectionEnd: number,
  ) => { startLine: number; endLine: number };
  normalizeLineDiffResult: (
    input: LineDiffComparisonResult,
  ) => LineDiffComparisonResult;
}

export function useDiffEditorEditActions({
  sourceTab,
  targetTab,
  sourceSyntaxKey,
  targetSyntaxKey,
  sourceIndentText,
  targetIndentText,
  setActivePanel,
  sourceTextareaRef,
  targetTextareaRef,
  lineDiffRef,
  pendingCaretRestoreRef,
  lastEditAtRef,
  copyLinesRequestSequenceRef,
  setLineDiff,
  capturePanelScrollSnapshot,
  applyDeferredBackendResultIfIdle,
  schedulePreviewMetadataComputation,
  scheduleSideCommit,
  clearSideCommitTimer,
  compositionStateRef,
  setSideCompositionDraft,
  invalidatePreviewMetadataComputation,
  normalizeTextToLines,
  reconcilePresenceAfterTextEdit,
  buildCopyTextWithoutVirtualRows,
  getSelectedLineRangeByOffset,
  normalizeLineDiffResult,
}: UseDiffEditorEditActionsParams) {
  const handlePanelInputBlur = useCallback(() => {
    window.requestAnimationFrame(() => {
      applyDeferredBackendResultIfIdle();
    });
  }, [applyDeferredBackendResultIfIdle]);

  const skippedCompositionChangeRef = useRef<{
    source: string | null;
    target: string | null;
  }>({
    source: null,
    target: null,
  });

  const getPanelTextFromSnapshot = useCallback(
    (side: ActivePanel) => {
      const snapshot = lineDiffRef.current;
      const lines =
        side === "source"
          ? snapshot.alignedSourceLines
          : snapshot.alignedTargetLines;

      return lines.join("\n");
    },
    [lineDiffRef],
  );

  const handlePanelTextareaChange = useCallback(
    (
      side: ActivePanel,
      nextText: string,
      selectionStart: number,
      selectionEnd: number,
    ) => {
      const skippedText = skippedCompositionChangeRef.current[side];
      if (skippedText !== null) {
        skippedCompositionChangeRef.current[side] = null;
        if (skippedText === nextText) {
          lastEditAtRef.current = Date.now();
          return false;
        }
      }

      if (compositionStateRef.current[side]) {
        lastEditAtRef.current = Date.now();
        setSideCompositionDraft(side, nextText);
        return false;
      }

      lastEditAtRef.current = Date.now();
      setSideCompositionDraft(side, null);
      capturePanelScrollSnapshot();

      const normalizedLines = normalizeTextToLines(nextText);

      setLineDiff((previous) => {
        const isSourceSide = side === "source";
        const previousActiveLines = isSourceSide
          ? previous.alignedSourceLines
          : previous.alignedTargetLines;
        const previousActivePresent = isSourceSide
          ? previous.alignedSourcePresent
          : previous.alignedTargetPresent;
        const previousOppositeLines = isSourceSide
          ? previous.alignedTargetLines
          : previous.alignedSourceLines;
        const previousOppositePresent = isSourceSide
          ? previous.alignedTargetPresent
          : previous.alignedSourcePresent;

        const reconciledPresent = reconcilePresenceAfterTextEdit(
          previousActiveLines,
          previousActivePresent,
          normalizedLines,
        );

        const nextAlignedCount = Math.max(
          1,
          normalizedLines.length,
          previousOppositeLines.length,
        );
        const nextActiveLines = [...normalizedLines];
        const nextActivePresent = [...reconciledPresent];
        const nextOppositeLines = [...previousOppositeLines];
        const nextOppositePresent = [...previousOppositePresent];

        while (nextActiveLines.length < nextAlignedCount) {
          nextActiveLines.push("");
          nextActivePresent.push(false);
        }

        while (nextOppositeLines.length < nextAlignedCount) {
          nextOppositeLines.push("");
          nextOppositePresent.push(false);
        }

        const nextSourceLines = isSourceSide
          ? nextActiveLines
          : nextOppositeLines;
        const nextSourcePresent = isSourceSide
          ? nextActivePresent
          : nextOppositePresent;
        const nextTargetLines = isSourceSide
          ? nextOppositeLines
          : nextActiveLines;
        const nextTargetPresent = isSourceSide
          ? nextOppositePresent
          : nextActivePresent;
        const caretRowIndex = getLineIndexFromTextOffset(
          nextText,
          selectionStart,
        );
        pendingCaretRestoreRef.current = {
          side,
          rowIndex: Math.max(0, Math.min(caretRowIndex, nextAlignedCount - 1)),
          lineNumber: 0,
          selectionStart,
          selectionEnd,
        };

        const nextState = {
          ...previous,
          alignedSourceLines: nextSourceLines,
          alignedTargetLines: nextTargetLines,
          alignedSourcePresent: nextSourcePresent,
          alignedTargetPresent: nextTargetPresent,
          alignedLineCount: nextAlignedCount,
        };
        lineDiffRef.current = nextState;
        schedulePreviewMetadataComputation(
          nextSourceLines,
          nextTargetLines,
          nextSourcePresent,
          nextTargetPresent,
        );
        return nextState;
      });

      scheduleSideCommit(side);
      return true;
    },
    [
      capturePanelScrollSnapshot,
      compositionStateRef,
      getLineIndexFromTextOffset,
      lastEditAtRef,
      lineDiffRef,
      normalizeTextToLines,
      pendingCaretRestoreRef,
      reconcilePresenceAfterTextEdit,
      schedulePreviewMetadataComputation,
      scheduleSideCommit,
      setLineDiff,
      setSideCompositionDraft,
    ],
  );

  const handlePanelPasteText = useCallback(
    (side: ActivePanel, pastedText: string) => {
      const textarea =
        side === "source"
          ? sourceTextareaRef.current
          : targetTextareaRef.current;
      if (!textarea) {
        return;
      }

      const value = textarea.value ?? "";
      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const safeStart = Math.max(0, Math.min(selectionStart, value.length));
      const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length));
      const nextValue = `${value.slice(0, safeStart)}${pastedText}${value.slice(safeEnd)}`;
      const nextCaret = safeStart + pastedText.length;
      setActivePanel(side);
      textarea.focus({ preventScroll: true });
      handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
    },
    [
      handlePanelTextareaChange,
      setActivePanel,
      sourceTextareaRef,
      targetTextareaRef,
    ],
  );

  const handlePanelTextareaCompositionStart = useCallback(
    (side: ActivePanel, event: ReactCompositionEvent<HTMLTextAreaElement>) => {
      compositionStateRef.current[side] = true;
      skippedCompositionChangeRef.current[side] = null;
      clearSideCommitTimer(side);
      lastEditAtRef.current = Date.now();
      setSideCompositionDraft(side, event.currentTarget.value ?? "");
    },
    [
      clearSideCommitTimer,
      compositionStateRef,
      lastEditAtRef,
      setSideCompositionDraft,
    ],
  );

  const handlePanelTextareaCompositionUpdate = useCallback(
    (side: ActivePanel, event: ReactCompositionEvent<HTMLTextAreaElement>) => {
      if (!compositionStateRef.current[side]) {
        return;
      }

      lastEditAtRef.current = Date.now();
      setSideCompositionDraft(side, event.currentTarget.value ?? "");
    },
    [compositionStateRef, lastEditAtRef, setSideCompositionDraft],
  );

  const handlePanelTextareaCompositionEnd = useCallback(
    (side: ActivePanel, event: ReactCompositionEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const nextText = target.value ?? "";
      const selectionStart = target.selectionStart ?? nextText.length;
      const selectionEnd = target.selectionEnd ?? nextText.length;

      compositionStateRef.current[side] = false;
      lastEditAtRef.current = Date.now();
      setSideCompositionDraft(side, null);

      const currentText = getPanelTextFromSnapshot(side);
      const applied = currentText === nextText
        ? false
        : handlePanelTextareaChange(side, nextText, selectionStart, selectionEnd);

      skippedCompositionChangeRef.current[side] = nextText;
      return applied;
    },
    [
      compositionStateRef,
      getPanelTextFromSnapshot,
      handlePanelTextareaChange,
      lastEditAtRef,
      setSideCompositionDraft,
    ],
  );

  const handlePanelTextareaKeyDown = useCallback(
    (side: ActivePanel, event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const value = target.value;
      const start = target.selectionStart ?? value.length;
      const end = target.selectionEnd ?? start;
      const safeStart = Math.max(0, Math.min(start, value.length));
      const safeEnd = Math.max(safeStart, Math.min(end, value.length));
      const indentText =
        side === "source" ? sourceIndentText : targetIndentText;
      const syntaxKey = side === "source" ? sourceSyntaxKey : targetSyntaxKey;
      const isComposing =
        compositionStateRef.current[side] || event.nativeEvent.isComposing;

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isComposing
      ) {
        if (!event.shiftKey && safeStart === safeEnd) {
          const autoDedentReplacement = buildAutoDedentInsertion({
            text: value,
            offset: safeStart,
            syntaxKey,
            indentText,
            key: event.key,
          });
          if (autoDedentReplacement) {
            event.preventDefault();
            const nextValue = `${value.slice(0, autoDedentReplacement.start)}${autoDedentReplacement.newText}${value.slice(autoDedentReplacement.end)}`;
            const nextCaret =
              autoDedentReplacement.start +
              autoDedentReplacement.newText.length;
            handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
            return;
          }
        }

        const autoPairReplacement = buildAutoPairEdit({
          text: value,
          start: safeStart,
          end: safeEnd,
          key: event.key,
        });
        if (autoPairReplacement) {
          event.preventDefault();
          const nextValue = `${value.slice(0, autoPairReplacement.start)}${autoPairReplacement.newText}${value.slice(autoPairReplacement.end)}`;
          const nextCaret =
            autoPairReplacement.start + autoPairReplacement.caretOffset;
          handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
          return;
        }
      }

      if (
        event.key === "Enter" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isComposing
      ) {
        event.preventDefault();
        const enterEdit = buildEnterAutoIndentEdit({
          text: value,
          offset: safeStart,
          syntaxKey,
          indentText,
        });
        const nextValue = `${value.slice(0, safeStart)}${enterEdit.text}${value.slice(safeEnd)}`;
        const nextCaret = safeStart + enterEdit.caretOffset;
        handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
        return;
      }

      if (
        event.key === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isComposing
      ) {
        event.preventDefault();
        const indentEdit = buildIndentSelectedLinesEdit({
          text: value,
          selectionStart: safeStart,
          selectionEnd: safeEnd,
          indentText,
        });
        if (indentEdit) {
          const nextValue = `${value.slice(0, indentEdit.start)}${indentEdit.newText}${value.slice(indentEdit.end)}`;
          handlePanelTextareaChange(
            side,
            nextValue,
            indentEdit.selectionStart,
            indentEdit.selectionEnd,
          );
          return;
        }

        const nextValue = `${value.slice(0, safeStart)}${indentText}${value.slice(safeEnd)}`;
        const nextCaret = safeStart + indentText.length;
        handlePanelTextareaChange(side, nextValue, nextCaret, nextCaret);
      }
    },
    [
      compositionStateRef,
      handlePanelTextareaChange,
      sourceIndentText,
      sourceSyntaxKey,
      targetIndentText,
      targetSyntaxKey,
    ],
  );

  const handlePanelTextareaCopy = useCallback(
    (side: ActivePanel, event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const value = target.value ?? "";
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      const snapshot = lineDiffRef.current;
      const present =
        side === "source"
          ? snapshot.alignedSourcePresent
          : snapshot.alignedTargetPresent;
      const copiedText = buildCopyTextWithoutVirtualRows(
        value,
        selectionStart,
        selectionEnd,
        present,
      );

      if (copiedText === null) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", copiedText);
    },
    [buildCopyTextWithoutVirtualRows, lineDiffRef],
  );

  const handleCopyLinesToPanel = useCallback(
    async (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return;
      }

      const destinationTab = targetSide === "source" ? sourceTab : targetTab;
      if (!destinationTab) {
        return;
      }

      const sourceTextarea =
        fromSide === "source"
          ? sourceTextareaRef.current
          : targetTextareaRef.current;
      if (!sourceTextarea) {
        return;
      }

      const sourceText = sourceTextarea.value ?? "";
      const selectionStart = sourceTextarea.selectionStart ?? 0;
      const selectionEnd = sourceTextarea.selectionEnd ?? selectionStart;
      const { startLine, endLine } = getSelectedLineRangeByOffset(
        sourceText,
        selectionStart,
        selectionEnd,
      );
      const snapshot = lineDiffRef.current;
      const requestSequence = copyLinesRequestSequenceRef.current + 1;
      copyLinesRequestSequenceRef.current = requestSequence;

      try {
        const result = await invoke<ApplyAlignedDiffPanelCopyResult>(
          "apply_aligned_diff_panel_copy",
          {
            fromSide,
            toSide: targetSide,
            startRowIndex: Math.max(0, Math.floor(startLine)),
            endRowIndex: Math.max(0, Math.floor(endLine)),
            alignedSourceLines: snapshot.alignedSourceLines,
            alignedTargetLines: snapshot.alignedTargetLines,
            alignedSourcePresent: snapshot.alignedSourcePresent,
            alignedTargetPresent: snapshot.alignedTargetPresent,
          },
        );

        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }

        if (!result?.changed) {
          return;
        }

        lastEditAtRef.current = Date.now();
        capturePanelScrollSnapshot();
        invalidatePreviewMetadataComputation();
        const normalized = normalizeLineDiffResult(result.lineDiff);
        lineDiffRef.current = normalized;
        setLineDiff(normalized);
        scheduleSideCommit(targetSide);
      } catch (error) {
        if (copyLinesRequestSequenceRef.current !== requestSequence) {
          return;
        }
        console.error("Failed to copy diff lines to panel:", error);
      }
    },
    [
      capturePanelScrollSnapshot,
      copyLinesRequestSequenceRef,
      getSelectedLineRangeByOffset,
      invalidatePreviewMetadataComputation,
      lastEditAtRef,
      lineDiffRef,
      normalizeLineDiffResult,
      scheduleSideCommit,
      setLineDiff,
      sourceTab,
      sourceTextareaRef,
      targetTab,
      targetTextareaRef,
    ],
  );

  const isCopyLinesToPanelDisabled = useCallback(
    (fromSide: ActivePanel, targetSide: ActivePanel) => {
      if (fromSide === targetSide) {
        return true;
      }

      const destinationTab = targetSide === "source" ? sourceTab : targetTab;
      if (!destinationTab) {
        return true;
      }

      const textarea =
        fromSide === "source"
          ? sourceTextareaRef.current
          : targetTextareaRef.current;
      if (!textarea) {
        return true;
      }

      const snapshot = lineDiffRef.current;
      const sourceLines =
        fromSide === "source"
          ? snapshot.alignedSourceLines
          : snapshot.alignedTargetLines;
      const destinationLines =
        targetSide === "source"
          ? snapshot.alignedSourceLines
          : snapshot.alignedTargetLines;

      const maxIndex =
        Math.min(sourceLines.length, destinationLines.length) - 1;
      if (maxIndex < 0) {
        return true;
      }

      return false;
    },
    [lineDiffRef, sourceTab, sourceTextareaRef, targetTab, targetTextareaRef],
  );

  return {
    handlePanelInputBlur,
    handlePanelTextareaChange,
    handlePanelTextareaCompositionStart,
    handlePanelTextareaCompositionUpdate,
    handlePanelTextareaCompositionEnd,
    handlePanelPasteText,
    handlePanelTextareaKeyDown,
    handlePanelTextareaCopy,
    handleCopyLinesToPanel,
    isCopyLinesToPanelDisabled,
  };
}
