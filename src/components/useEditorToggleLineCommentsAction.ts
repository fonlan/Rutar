import { invoke } from '@tauri-apps/api/core';
import { getLineCommentPrefixForSyntaxKey } from '@/lib/syntax';
import { useCallback } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import type { SyntaxKey } from '@/store/useStore';
import type { ToggleLineCommentsBackendResult } from './Editor.types';

interface UseEditorToggleLineCommentsActionParams {
  activeSyntaxKey: SyntaxKey;
  tabId: string;
  tabLineCount: number;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  updateTab: (tabId: string, patch: Record<string, unknown>) => void;
  dispatchDocumentUpdated: (tabId: string) => void;
  loadTextFromBackend: () => Promise<void>;
  syncVisibleTokens: (lineCount: number, visibleRange?: { start: number; stop: number }) => Promise<void>;
  syncSelectionAfterInteraction: () => void;
  getSelectionOffsetsInElement: (
    element: HTMLTextAreaElement
  ) => { start: number; end: number; isCollapsed: boolean } | null;
  normalizeSegmentText: (text: string) => string;
  getEditableText: (element: HTMLTextAreaElement) => string;
  mapLogicalOffsetToInputLayerOffset: (text: string, offset: number) => number;
  setCaretToCodeUnitOffset: (element: HTMLTextAreaElement, offset: number) => void;
  codeUnitOffsetToUnicodeScalarIndex: (text: string, offset: number) => number;
  setSelectionToCodeUnitOffsets: (element: HTMLTextAreaElement, startOffset: number, endOffset: number) => void;
}

export function useEditorToggleLineCommentsAction({
  activeSyntaxKey,
  tabId,
  tabLineCount,
  contentRef,
  updateTab,
  dispatchDocumentUpdated,
  loadTextFromBackend,
  syncVisibleTokens,
  syncSelectionAfterInteraction,
  getSelectionOffsetsInElement,
  normalizeSegmentText,
  getEditableText,
  mapLogicalOffsetToInputLayerOffset,
  setCaretToCodeUnitOffset,
  codeUnitOffsetToUnicodeScalarIndex,
  setSelectionToCodeUnitOffsets,
}: UseEditorToggleLineCommentsActionParams) {
  const toggleSelectedLinesComment = useCallback(
    async (event: KeyboardEvent<HTMLDivElement>) => {
      const element = contentRef.current;
      if (!element) {
        return;
      }

      let selectionOffsets = getSelectionOffsetsInElement(element);
      if (!selectionOffsets) {
        const text = normalizeSegmentText(getEditableText(element));
        const layerEndOffset = mapLogicalOffsetToInputLayerOffset(text, text.length);
        setCaretToCodeUnitOffset(element, layerEndOffset);
        selectionOffsets = getSelectionOffsetsInElement(element);
      }

      if (!selectionOffsets) {
        return;
      }
      const prefix = getLineCommentPrefixForSyntaxKey(activeSyntaxKey);

      try {
        const baseText = normalizeSegmentText(getEditableText(element));
        const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, selectionOffsets.start);
        const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, selectionOffsets.end);

        const result = await invoke<ToggleLineCommentsBackendResult>('toggle_line_comments', {
          id: tabId,
          startChar,
          endChar,
          isCollapsed: selectionOffsets.isCollapsed,
          prefix,
        });

        if (!result.changed) {
          return;
        }

        const safeLineCount = Math.max(1, result.lineCount ?? tabLineCount);
        updateTab(tabId, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        dispatchDocumentUpdated(tabId);

        await loadTextFromBackend();
        await syncVisibleTokens(safeLineCount);

        const refreshedElement = contentRef.current;
        if (refreshedElement) {
          const refreshedText = normalizeSegmentText(getEditableText(refreshedElement));

          const selectionStartLogical =
            Math.max(0, Math.min(refreshedText.length, result.selectionStartChar ?? 0));
          const selectionEndLogical =
            Math.max(0, Math.min(refreshedText.length, result.selectionEndChar ?? selectionStartLogical));

          const selectionStartLayer = mapLogicalOffsetToInputLayerOffset(refreshedText, selectionStartLogical);
          const selectionEndLayer = mapLogicalOffsetToInputLayerOffset(refreshedText, selectionEndLogical);

          if (selectionOffsets.isCollapsed) {
            setCaretToCodeUnitOffset(refreshedElement, selectionEndLayer);
          } else {
            setSelectionToCodeUnitOffsets(refreshedElement, selectionStartLayer, selectionEndLayer);
          }

          syncSelectionAfterInteraction();
        }

        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        console.error('Failed to toggle line comments:', error);
      }
    },
    [
      activeSyntaxKey,
      codeUnitOffsetToUnicodeScalarIndex,
      contentRef,
      dispatchDocumentUpdated,
      getEditableText,
      getSelectionOffsetsInElement,
      loadTextFromBackend,
      mapLogicalOffsetToInputLayerOffset,
      normalizeSegmentText,
      setCaretToCodeUnitOffset,
      setSelectionToCodeUnitOffsets,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tabId,
      tabLineCount,
      updateTab,
    ]
  );

  return {
    toggleSelectedLinesComment,
  };
}
