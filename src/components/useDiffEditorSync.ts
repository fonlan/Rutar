import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { type DiffTabPayload, type FileTab, useStore } from '@/store/useStore';

type ActivePanel = 'source' | 'target';

interface LineDiffComparisonResult {
  alignedSourceLines: string[];
  alignedTargetLines: string[];
  alignedSourcePresent: boolean[];
  alignedTargetPresent: boolean[];
  diffLineNumbers: number[];
  sourceDiffLineNumbers: number[];
  targetDiffLineNumbers: number[];
  alignedDiffKinds?: Array<'insert' | 'delete' | 'modify' | null>;
  sourceLineNumbersByAlignedRow?: number[];
  targetLineNumbersByAlignedRow?: number[];
  diffRowIndexes?: number[];
  sourceLineCount: number;
  targetLineCount: number;
  alignedLineCount: number;
}

interface ApplyAlignedDiffEditResult {
  lineDiff: LineDiffComparisonResult;
  sourceIsDirty: boolean;
  targetIsDirty: boolean;
}

interface PanelScrollSnapshot {
  sourceTop: number;
  sourceLeft: number;
  targetTop: number;
  targetLeft: number;
}

interface CaretSnapshot {
  side: ActivePanel;
  rowIndex: number;
  lineNumber: number;
  selectionStart: number;
  selectionEnd: number;
}

interface UseDiffEditorSyncParams {
  tabId: string;
  diffPayload: DiffTabPayload;
  sourceTab: FileTab | null;
  targetTab: FileTab | null;
  sourceScroller: HTMLElement | null;
  targetScroller: HTMLElement | null;
  lineDiff: LineDiffComparisonResult;
  setLineDiff: Dispatch<SetStateAction<LineDiffComparisonResult>>;
  lineDiffRef: MutableRefObject<LineDiffComparisonResult>;
  pendingScrollRestoreRef: MutableRefObject<PanelScrollSnapshot | null>;
  pendingCaretRestoreRef: MutableRefObject<CaretSnapshot | null>;
  lastEditAtRef: MutableRefObject<number>;
  updateTab: (id: string, updates: Partial<FileTab>) => void;
  capturePanelScrollSnapshot: () => void;
  captureFocusedCaretSnapshot: () => CaretSnapshot | null;
  normalizeLineDiffResult: (input: LineDiffComparisonResult) => LineDiffComparisonResult;
  extractActualLines: (alignedLines: string[], present: boolean[]) => string[];
  inferTrailingNewlineFromLines: (lineCount: number, actualLines: string[]) => boolean;
  serializeLines: (actualLines: string[], trailingNewline: boolean) => string;
  findAlignedRowIndexByLineNumber: (present: boolean[], lineNumber: number) => number;
  buildInitialDiff: (payload: DiffTabPayload) => LineDiffComparisonResult;
  dispatchDocumentUpdated: (tabId: string) => void;
}

const REFRESH_DEBOUNCE_MS = 120;
const EDIT_DEBOUNCE_MS = 90;
const PREVIEW_METADATA_DEBOUNCE_MS = 70;
const INPUT_ACTIVE_HOLD_MS = 450;

export function useDiffEditorSync({
  tabId,
  diffPayload,
  sourceTab,
  targetTab,
  sourceScroller,
  targetScroller,
  lineDiff,
  setLineDiff,
  lineDiffRef,
  pendingScrollRestoreRef,
  pendingCaretRestoreRef,
  lastEditAtRef,
  updateTab,
  capturePanelScrollSnapshot,
  captureFocusedCaretSnapshot,
  normalizeLineDiffResult,
  extractActualLines,
  inferTrailingNewlineFromLines,
  serializeLines,
  findAlignedRowIndexByLineNumber,
  buildInitialDiff,
  dispatchDocumentUpdated,
}: UseDiffEditorSyncParams) {
  const refreshTimerRef = useRef<number | null>(null);
  const refreshSequenceRef = useRef(0);
  const sourceCommittedTextRef = useRef('');
  const targetCommittedTextRef = useRef('');
  const sourceTrailingNewlineRef = useRef(false);
  const targetTrailingNewlineRef = useRef(false);
  const sideCommitTimerRef = useRef<{ source: number | null; target: number | null }>({
    source: null,
    target: null,
  });
  const sideCommitInFlightRef = useRef<{ source: boolean; target: boolean }>({
    source: false,
    target: false,
  });
  const sideCommitPendingRef = useRef<{ source: boolean; target: boolean }>({
    source: false,
    target: false,
  });
  const deferredBackendDiffRef = useRef<LineDiffComparisonResult | null>(null);
  const deferredBackendApplyTimerRef = useRef<number | null>(null);
  const previewMetadataTimerRef = useRef<number | null>(null);
  const previewMetadataSequenceRef = useRef(0);

  const isInputEditingActive = useCallback(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return false;
    }

    const panel = activeElement.dataset.diffPanel;
    if (panel !== 'source' && panel !== 'target') {
      return false;
    }

    return Date.now() - lastEditAtRef.current < INPUT_ACTIVE_HOLD_MS;
  }, [lastEditAtRef]);

  const clearPreviewMetadataTimer = useCallback(() => {
    if (previewMetadataTimerRef.current !== null) {
      window.clearTimeout(previewMetadataTimerRef.current);
      previewMetadataTimerRef.current = null;
    }
  }, []);

  const applyPreviewMetadataResult = useCallback((result: LineDiffComparisonResult) => {
    const normalized = normalizeLineDiffResult(result);
    setLineDiff((previous) => {
      const nextState = {
        ...previous,
        diffLineNumbers: normalized.diffLineNumbers,
        sourceDiffLineNumbers: normalized.sourceDiffLineNumbers,
        targetDiffLineNumbers: normalized.targetDiffLineNumbers,
        alignedDiffKinds: normalized.alignedDiffKinds,
        sourceLineNumbersByAlignedRow: normalized.sourceLineNumbersByAlignedRow,
        targetLineNumbersByAlignedRow: normalized.targetLineNumbersByAlignedRow,
        diffRowIndexes: normalized.diffRowIndexes,
        sourceLineCount: normalized.sourceLineCount,
        targetLineCount: normalized.targetLineCount,
        alignedLineCount: normalized.alignedLineCount,
      };
      lineDiffRef.current = nextState;
      return nextState;
    });
  }, [lineDiffRef, normalizeLineDiffResult, setLineDiff]);

  const schedulePreviewMetadataComputation = useCallback(
    (
      alignedSourceLines: string[],
      alignedTargetLines: string[],
      alignedSourcePresent: boolean[],
      alignedTargetPresent: boolean[]
    ) => {
      const sequence = previewMetadataSequenceRef.current + 1;
      previewMetadataSequenceRef.current = sequence;
      clearPreviewMetadataTimer();
      previewMetadataTimerRef.current = window.setTimeout(() => {
        previewMetadataTimerRef.current = null;
        void invoke<LineDiffComparisonResult>('preview_aligned_diff_state', {
          alignedSourceLines,
          alignedTargetLines,
          alignedSourcePresent,
          alignedTargetPresent,
        })
          .then((result) => {
            if (previewMetadataSequenceRef.current !== sequence) {
              return;
            }
            applyPreviewMetadataResult(result);
          })
          .catch((error) => {
            if (previewMetadataSequenceRef.current !== sequence) {
              return;
            }
            console.error('Failed to preview aligned diff metadata:', error);
          });
      }, PREVIEW_METADATA_DEBOUNCE_MS);
    },
    [applyPreviewMetadataResult, clearPreviewMetadataTimer]
  );

  const invalidatePreviewMetadataComputation = useCallback(() => {
    previewMetadataSequenceRef.current = previewMetadataSequenceRef.current + 1;
    clearPreviewMetadataTimer();
  }, [clearPreviewMetadataTimer]);

  const applyBackendDiffResult = useCallback(
    (result: LineDiffComparisonResult) => {
      invalidatePreviewMetadataComputation();
      capturePanelScrollSnapshot();
      const focusedCaret = captureFocusedCaretSnapshot();
      const normalized = normalizeLineDiffResult(result);
      const sourceActualLines = extractActualLines(
        normalized.alignedSourceLines,
        normalized.alignedSourcePresent
      );
      const targetActualLines = extractActualLines(
        normalized.alignedTargetLines,
        normalized.alignedTargetPresent
      );
      const sourceTrailing = inferTrailingNewlineFromLines(normalized.sourceLineCount, sourceActualLines);
      const targetTrailing = inferTrailingNewlineFromLines(normalized.targetLineCount, targetActualLines);

      sourceTrailingNewlineRef.current = sourceTrailing;
      targetTrailingNewlineRef.current = targetTrailing;
      sourceCommittedTextRef.current = serializeLines(sourceActualLines, sourceTrailing);
      targetCommittedTextRef.current = serializeLines(targetActualLines, targetTrailing);

      lineDiffRef.current = normalized;
      if (focusedCaret) {
        const present = focusedCaret.side === 'source'
          ? normalized.alignedSourcePresent
          : normalized.alignedTargetPresent;
        const mappedRowIndex = findAlignedRowIndexByLineNumber(present, focusedCaret.lineNumber);
        const nextRowIndex = mappedRowIndex >= 0 ? mappedRowIndex : focusedCaret.rowIndex;
        pendingCaretRestoreRef.current = {
          ...focusedCaret,
          rowIndex: Math.max(0, Math.min(nextRowIndex, Math.max(0, present.length - 1))),
        };
      }
      setLineDiff(normalized);
      const nextLineCount = Math.max(1, normalized.alignedLineCount);
      const currentDiffTab = useStore.getState().tabs.find((item) => item.id === tabId);
      if ((currentDiffTab?.lineCount ?? 0) !== nextLineCount) {
        updateTab(tabId, {
          lineCount: nextLineCount,
        });
      }
    },
    [
      captureFocusedCaretSnapshot,
      capturePanelScrollSnapshot,
      extractActualLines,
      findAlignedRowIndexByLineNumber,
      inferTrailingNewlineFromLines,
      invalidatePreviewMetadataComputation,
      normalizeLineDiffResult,
      pendingCaretRestoreRef,
      serializeLines,
      setLineDiff,
      tabId,
      updateTab,
      lineDiffRef,
    ]
  );

  const scheduleDeferredBackendApply = useCallback(() => {
    if (deferredBackendApplyTimerRef.current !== null) {
      window.clearTimeout(deferredBackendApplyTimerRef.current);
    }

    deferredBackendApplyTimerRef.current = window.setTimeout(() => {
      deferredBackendApplyTimerRef.current = null;
      const pendingResult = deferredBackendDiffRef.current;
      if (!pendingResult) {
        return;
      }

      if (isInputEditingActive()) {
        scheduleDeferredBackendApply();
        return;
      }

      deferredBackendDiffRef.current = null;
      applyBackendDiffResult(pendingResult);
    }, INPUT_ACTIVE_HOLD_MS);
  }, [applyBackendDiffResult, isInputEditingActive]);

  const runDiffRefresh = useCallback(async () => {
    if (!sourceTab || !targetTab) {
      return;
    }

    const currentSequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = currentSequence;

    try {
      const result = await invoke<LineDiffComparisonResult>('compare_documents_by_line', {
        sourceId: sourceTab.id,
        targetId: targetTab.id,
      });

      if (refreshSequenceRef.current !== currentSequence) {
        return;
      }

      if (isInputEditingActive()) {
        deferredBackendDiffRef.current = result;
        scheduleDeferredBackendApply();
        return;
      }

      applyBackendDiffResult(result);
    } catch (error) {
      if (refreshSequenceRef.current === currentSequence) {
        console.error('Failed to refresh diff result:', error);
      }
    }
  }, [applyBackendDiffResult, isInputEditingActive, scheduleDeferredBackendApply, sourceTab, targetTab]);

  const scheduleDiffRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void runDiffRefresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [runDiffRefresh]);

  const flushSideCommit = useCallback(
    async (side: ActivePanel) => {
      const panelTab = side === 'source' ? sourceTab : targetTab;
      if (!panelTab || !sourceTab || !targetTab) {
        return;
      }

      if (sideCommitInFlightRef.current[side]) {
        sideCommitPendingRef.current[side] = true;
        return;
      }

      const snapshot = lineDiffRef.current;
      const alignedLines = side === 'source'
        ? snapshot.alignedSourceLines
        : snapshot.alignedTargetLines;
      const present = side === 'source'
        ? snapshot.alignedSourcePresent
        : snapshot.alignedTargetPresent;
      const actualLines = extractActualLines(alignedLines, present);
      const trailingNewline = side === 'source'
        ? sourceTrailingNewlineRef.current
        : targetTrailingNewlineRef.current;
      const previousText = side === 'source'
        ? sourceCommittedTextRef.current
        : targetCommittedTextRef.current;
      const nextText = serializeLines(actualLines, trailingNewline);

      if (previousText === nextText) {
        return;
      }

      sideCommitInFlightRef.current[side] = true;

      try {
        const result = await invoke<ApplyAlignedDiffEditResult>('apply_aligned_diff_edit', {
          sourceId: sourceTab.id,
          targetId: targetTab.id,
          editedSide: side,
          alignedSourceLines: snapshot.alignedSourceLines,
          alignedTargetLines: snapshot.alignedTargetLines,
          alignedSourcePresent: snapshot.alignedSourcePresent,
          alignedTargetPresent: snapshot.alignedTargetPresent,
          editedTrailingNewline: trailingNewline,
        });

        if (side === 'source') {
          sourceCommittedTextRef.current = nextText;
          sourceTrailingNewlineRef.current = trailingNewline;
        } else {
          targetCommittedTextRef.current = nextText;
          targetTrailingNewlineRef.current = trailingNewline;
        }

        updateTab(sourceTab.id, {
          lineCount: Math.max(1, result.lineDiff.sourceLineCount),
          isDirty: result.sourceIsDirty,
        });
        updateTab(targetTab.id, {
          lineCount: Math.max(1, result.lineDiff.targetLineCount),
          isDirty: result.targetIsDirty,
        });

        if (isInputEditingActive()) {
          deferredBackendDiffRef.current = result.lineDiff;
          scheduleDeferredBackendApply();
        } else {
          applyBackendDiffResult(result.lineDiff);
        }

        dispatchDocumentUpdated(panelTab.id);
      } catch (error) {
        console.error('Failed to write aligned diff edit:', error);
      } finally {
        sideCommitInFlightRef.current[side] = false;
        if (sideCommitPendingRef.current[side]) {
          sideCommitPendingRef.current[side] = false;
          void flushSideCommit(side);
        }
      }
    },
    [
      applyBackendDiffResult,
      dispatchDocumentUpdated,
      extractActualLines,
      isInputEditingActive,
      lineDiffRef,
      scheduleDeferredBackendApply,
      serializeLines,
      sourceTab,
      targetTab,
      updateTab,
    ]
  );

  const scheduleSideCommit = useCallback(
    (side: ActivePanel) => {
      const timer = sideCommitTimerRef.current[side];
      if (timer !== null) {
        window.clearTimeout(timer);
      }

      sideCommitTimerRef.current[side] = window.setTimeout(() => {
        sideCommitTimerRef.current[side] = null;
        void flushSideCommit(side);
      }, EDIT_DEBOUNCE_MS);
    },
    [flushSideCommit]
  );

  const clearSideCommitTimer = useCallback((side: ActivePanel) => {
    const timer = sideCommitTimerRef.current[side];
    if (timer === null) {
      return;
    }

    window.clearTimeout(timer);
    sideCommitTimerRef.current[side] = null;
  }, []);

  const applyDeferredBackendResultIfIdle = useCallback(() => {
    const pendingResult = deferredBackendDiffRef.current;
    if (!pendingResult || isInputEditingActive()) {
      return;
    }

    deferredBackendDiffRef.current = null;
    applyBackendDiffResult(pendingResult);
  }, [applyBackendDiffResult, isInputEditingActive]);

  useEffect(() => {
    applyBackendDiffResult(buildInitialDiff(diffPayload));
  }, [applyBackendDiffResult, buildInitialDiff, diffPayload]);

  useEffect(() => {
    lineDiffRef.current = lineDiff;
  }, [lineDiff, lineDiffRef]);

  useEffect(() => {
    const snapshot = pendingCaretRestoreRef.current;
    if (!snapshot) {
      return;
    }

    pendingCaretRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      const textareaSelector = `textarea[data-diff-panel="${snapshot.side}"]`;
      const textarea = document.querySelector(textareaSelector) as HTMLTextAreaElement | null;
      if (!textarea) {
        return;
      }

      textarea.focus({ preventScroll: true });
      const valueLength = textarea.value.length;
      const start = Math.max(0, Math.min(snapshot.selectionStart, valueLength));
      const end = Math.max(0, Math.min(snapshot.selectionEnd, valueLength));
      textarea.setSelectionRange(start, end);
    });
  }, [lineDiff, pendingCaretRestoreRef]);

  useEffect(() => {
    const snapshot = pendingScrollRestoreRef.current;
    if (!snapshot || !sourceScroller || !targetScroller) {
      return;
    }

    pendingScrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      if (sourceScroller) {
        sourceScroller.scrollTop = snapshot.sourceTop;
        sourceScroller.scrollLeft = snapshot.sourceLeft;
      }

      if (targetScroller) {
        targetScroller.scrollTop = snapshot.targetTop;
        targetScroller.scrollLeft = snapshot.targetLeft;
      }
    });
  }, [lineDiff, pendingScrollRestoreRef, sourceScroller, targetScroller]);

  useEffect(() => {
    void runDiffRefresh();
  }, [runDiffRefresh]);

  useEffect(() => {
    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const changedId = customEvent.detail?.tabId;
      if (!changedId) {
        return;
      }

      if (changedId !== sourceTab?.id && changedId !== targetTab?.id) {
        return;
      }

      scheduleDiffRefresh();
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    return () => {
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [scheduleDiffRefresh, sourceTab?.id, targetTab?.id]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      if (deferredBackendApplyTimerRef.current !== null) {
        window.clearTimeout(deferredBackendApplyTimerRef.current);
      }

      if (previewMetadataTimerRef.current !== null) {
        window.clearTimeout(previewMetadataTimerRef.current);
      }

      if (sideCommitTimerRef.current.source !== null) {
        window.clearTimeout(sideCommitTimerRef.current.source);
      }

      if (sideCommitTimerRef.current.target !== null) {
        window.clearTimeout(sideCommitTimerRef.current.target);
      }
    };
  }, []);

  return {
    isInputEditingActive,
    schedulePreviewMetadataComputation,
    applyBackendDiffResult,
    invalidatePreviewMetadataComputation,
    scheduleDiffRefresh,
    flushSideCommit,
    scheduleSideCommit,
    clearSideCommitTimer,
    applyDeferredBackendResultIfIdle,
  };
}
