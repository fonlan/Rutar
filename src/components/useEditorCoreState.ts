import { useRef, useState } from 'react';
import type { EditorContextMenuState, EditorSubmenuKey } from './EditorContextMenu';
import type {
  EditorSegmentState,
  EditorSubmenuVerticalAlign,
  PairHighlightPosition,
  RectangularSelectionState,
  SearchHighlightState,
  SyntaxToken,
  TextDragMoveState,
  TextSelectionState,
  VerticalSelectionState,
} from './Editor.types';

interface UseEditorCoreStateParams {
  defaultSubmenuVerticalAlignments: Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>;
  defaultSubmenuMaxHeights: Record<EditorSubmenuKey, number | null>;
}

export function useEditorCoreState({
  defaultSubmenuVerticalAlignments,
  defaultSubmenuMaxHeights,
}: UseEditorCoreStateParams) {
  const [lineTokens, setLineTokens] = useState<SyntaxToken[][]>([]);
  const [startLine, setStartLine] = useState(0);
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [plainStartLine, setPlainStartLine] = useState(0);
  const [editableSegment, setEditableSegment] = useState<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });
  const [activeLineNumber, setActiveLineNumber] = useState(1);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlightState | null>(null);
  const [textSelectionHighlight, setTextSelectionHighlight] = useState<TextSelectionState | null>(null);
  const [pairHighlights, setPairHighlights] = useState<PairHighlightPosition[]>([]);
  const [rectangularSelection, setRectangularSelection] = useState<RectangularSelectionState | null>(null);
  const [lineNumberMultiSelection, setLineNumberMultiSelection] = useState<number[]>([]);
  const [outlineFlashLine, setOutlineFlashLine] = useState<number | null>(null);
  const [showBase64DecodeErrorToast, setShowBase64DecodeErrorToast] = useState(false);
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState | null>(null);
  const [submenuVerticalAlignments, setSubmenuVerticalAlignments] = useState<
    Record<EditorSubmenuKey, EditorSubmenuVerticalAlign>
  >(() => ({ ...defaultSubmenuVerticalAlignments }));
  const [submenuMaxHeights, setSubmenuMaxHeights] = useState<
    Record<EditorSubmenuKey, number | null>
  >(() => ({ ...defaultSubmenuMaxHeights }));

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);
  const lineNumberListRef = useRef<any>(null);
  const requestTimeout = useRef<any>(null);
  const editTimeout = useRef<any>(null);
  const isScrollbarDragRef = useRef(false);
  const editorContextMenuRef = useRef<HTMLDivElement>(null);
  const submenuPanelRefs = useRef<Record<EditorSubmenuKey, HTMLDivElement | null>>({
    edit: null,
    sort: null,
    convert: null,
    bookmark: null,
  });
  const currentRequestVersion = useRef(0);
  const isComposingRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initializedRef = useRef(false);
  const suppressExternalReloadRef = useRef(false);
  const pendingSyncRequestedRef = useRef(false);
  const hugeWindowLockedRef = useRef(false);
  const hugeWindowFollowScrollOnUnlockRef = useRef(false);
  const hugeWindowUnlockTimerRef = useRef<any>(null);
  const outlineFlashTimerRef = useRef<any>(null);
  const base64DecodeErrorToastTimerRef = useRef<number | null>(null);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const verticalSelectionRef = useRef<VerticalSelectionState | null>(null);
  const rectangularSelectionPointerActiveRef = useRef(false);
  const rectangularSelectionRef = useRef<RectangularSelectionState | null>(null);
  const rectangularSelectionLastClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const rectangularSelectionAutoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const rectangularSelectionAutoScrollRafRef = useRef<number | null>(null);
  const textDragMoveStateRef = useRef<TextDragMoveState | null>(null);
  const textDragCursorAppliedRef = useRef(false);
  const pointerSelectionActiveRef = useRef(false);
  const lineNumberSelectionAnchorLineRef = useRef<number | null>(null);
  const lineNumberContextLineRef = useRef<number | null>(null);
  const selectionChangeRafRef = useRef<number | null>(null);
  const editableSegmentRef = useRef<EditorSegmentState>({
    startLine: 0,
    endLine: 0,
    text: '',
  });
  const syncedTextRef = useRef('');
  const lastKnownContentScrollTopRef = useRef(0);
  const lastKnownContentScrollLeftRef = useRef(0);
  const lastKnownContainerScrollTopRef = useRef(0);
  const lastKnownContainerScrollLeftRef = useRef(0);

  return {
    lineTokens,
    setLineTokens,
    startLine,
    setStartLine,
    plainLines,
    setPlainLines,
    plainStartLine,
    setPlainStartLine,
    editableSegment,
    setEditableSegment,
    activeLineNumber,
    setActiveLineNumber,
    searchHighlight,
    setSearchHighlight,
    textSelectionHighlight,
    setTextSelectionHighlight,
    pairHighlights,
    setPairHighlights,
    rectangularSelection,
    setRectangularSelection,
    lineNumberMultiSelection,
    setLineNumberMultiSelection,
    outlineFlashLine,
    setOutlineFlashLine,
    showBase64DecodeErrorToast,
    setShowBase64DecodeErrorToast,
    editorContextMenu,
    setEditorContextMenu,
    submenuVerticalAlignments,
    setSubmenuVerticalAlignments,
    submenuMaxHeights,
    setSubmenuMaxHeights,
    contentRef,
    scrollContainerRef,
    listRef,
    lineNumberListRef,
    requestTimeout,
    editTimeout,
    isScrollbarDragRef,
    editorContextMenuRef,
    submenuPanelRefs,
    currentRequestVersion,
    isComposingRef,
    syncInFlightRef,
    initializedRef,
    suppressExternalReloadRef,
    pendingSyncRequestedRef,
    hugeWindowLockedRef,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowUnlockTimerRef,
    outlineFlashTimerRef,
    base64DecodeErrorToastTimerRef,
    pendingRestoreScrollTopRef,
    verticalSelectionRef,
    rectangularSelectionPointerActiveRef,
    rectangularSelectionRef,
    rectangularSelectionLastClientPointRef,
    rectangularSelectionAutoScrollDirectionRef,
    rectangularSelectionAutoScrollRafRef,
    textDragMoveStateRef,
    textDragCursorAppliedRef,
    pointerSelectionActiveRef,
    lineNumberSelectionAnchorLineRef,
    lineNumberContextLineRef,
    selectionChangeRafRef,
    editableSegmentRef,
    syncedTextRef,
    lastKnownContentScrollTopRef,
    lastKnownContentScrollLeftRef,
    lastKnownContainerScrollTopRef,
    lastKnownContainerScrollLeftRef,
  };
}
