// @ts-nocheck
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { t } from '@/i18n';
import { EditorView } from './EditorView';
import {
  DEFAULT_SUBMENU_MAX_HEIGHTS,
  DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS,
} from './Editor.types';
import { resolveTokenTypeClass } from './editorTokenClass';
import { editorTestUtils } from './editorUtils';
import { useEditorClipboardSelectionEffects } from './useEditorClipboardSelectionEffects';
import { useEditorBookmarkActions } from './useEditorBookmarkActions';
import { useEditorContentSync } from './useEditorContentSync';
import { useEditorContextCleanupAction } from './useEditorContextCleanupAction';
import { useEditorContextConvertActions } from './useEditorContextConvertActions';
import { useEditorContextMenuInteractions } from './useEditorContextMenuInteractions';
import { useEditorContextMenuActions } from './useEditorContextMenuActions';
import { useEditorContextMenuConfig } from './useEditorContextMenuConfig';
import { useEditorCoreState } from './useEditorCoreState';
import { useEditorDerivedState } from './useEditorDerivedState';
import { useEditorDocumentLoadEffects } from './useEditorDocumentLoadEffects';
import { useEditorFlushPendingSync } from './useEditorFlushPendingSync';
import { useEditorGlobalPointerEffects } from './useEditorGlobalPointerEffects';
import { useEditorHugeEditableLayout } from './useEditorHugeEditableLayout';
import { useEditorInputSyncActions } from './useEditorInputSyncActions';
import { useEditorKeyboardActions } from './useEditorKeyboardActions';
import { useEditorLayoutConfig } from './useEditorLayoutConfig';
import { useEditorLineNumberInteractions } from './useEditorLineNumberInteractions';
import { useEditorLineNumberContextActions } from './useEditorLineNumberContextActions';
import { useEditorLineNumberMultiSelection } from './useEditorLineNumberMultiSelection';
import { useEditorLineNumberWheel } from './useEditorLineNumberWheel';
import { useEditorLineHighlightRenderers } from './useEditorLineHighlightRenderers';
import { useEditorLocalLifecycleEffects } from './useEditorLocalLifecycleEffects';
import { useEditorNavigationAndRefreshEffects } from './useEditorNavigationAndRefreshEffects';
import { useEditorPointerFinalizeEffects } from './useEditorPointerFinalizeEffects';
import { useEditorPointerInteractions } from './useEditorPointerInteractions';
import { useEditorPointerSelectionGuards } from './useEditorPointerSelectionGuards';
import { useEditorRectangularSelectionActions } from './useEditorRectangularSelectionActions';
import { useEditorRowMeasurement } from './useEditorRowMeasurement';
import { useEditorSearchHorizontalNavigation } from './useEditorSearchHorizontalNavigation';
import { useEditorSelectedTextReader } from './useEditorSelectedTextReader';
import { useEditorSelectionPresence } from './useEditorSelectionPresence';
import { useEditorSelectionInteractionActions } from './useEditorSelectionInteractionActions';
import { useEditorSelectionStateSync } from './useEditorSelectionStateSync';
import { useEditorScrollSyncEffects } from './useEditorScrollSyncEffects';
import { useEditorTextMeasurement } from './useEditorTextMeasurement';
import { useEditorTextDragMoveAction } from './useEditorTextDragMoveAction';
import { useEditorToggleLineCommentsAction } from './useEditorToggleLineCommentsAction';
import { useEditorTextSelectionHighlightSync } from './useEditorTextSelectionHighlightSync';
import { useEditorUiInteractionEffects } from './useEditorUiInteractionEffects';
import { useEditorVisibleItemsRendered } from './useEditorVisibleItemsRendered';

const MAX_LINE_RANGE = 2147483647;
const DEFAULT_FETCH_BUFFER_LINES = 50;
const LARGE_FILE_FETCH_BUFFER_LINES = 200;
const HUGE_EDITABLE_FETCH_BUFFER_LINES = 100;
const LARGE_FILE_FETCH_DEBOUNCE_MS = 12;
const HUGE_EDITABLE_FETCH_DEBOUNCE_MS = 24;
const NORMAL_FILE_FETCH_DEBOUNCE_MS = 50;
const LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD = 20000;
const LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS = 160;
const NORMAL_EDIT_SYNC_DEBOUNCE_MS = 40;
const HUGE_EDITABLE_WINDOW_UNLOCK_MS = 260;
const EMPTY_LINE_PLACEHOLDER = '\u200B';
const SEARCH_HIGHLIGHT_CLASS = 'rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/70';
const PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-sky-300/45 ring-1 ring-sky-500/45 dark:bg-sky-400/35 dark:ring-sky-300/45';
const SEARCH_AND_PAIR_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-emerald-300/55 text-black ring-1 ring-emerald-500/45 dark:bg-emerald-400/40 dark:ring-emerald-300/45';
const RECTANGULAR_SELECTION_HIGHLIGHT_CLASS =
  'rounded-[2px] bg-violet-300/45 text-black ring-1 ring-violet-500/40 dark:bg-violet-400/30 dark:ring-violet-300/40';
const TEXT_SELECTION_HIGHLIGHT_CLASS =
  'bg-blue-400/35 dark:bg-blue-500/30';
const RECTANGULAR_AUTO_SCROLL_EDGE_PX = 36;
const RECTANGULAR_AUTO_SCROLL_MAX_STEP_PX = 18;
const SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX = 12;
const SEARCH_NAVIGATE_MIN_VISIBLE_TEXT_WIDTH_PX = 32;
const EMPTY_BOOKMARKS: number[] = [];
const EMPTY_UNSAVED_CHANGE_LINES: number[] = [];
const HYPERLINK_UNDERLINE_CLASS =
  'underline decoration-sky-500/80 underline-offset-2 text-sky-600 dark:text-sky-300';

export { editorTestUtils } from './editorUtils';

const {
  isToggleLineCommentShortcut,
  isVerticalSelectionShortcut,
  isTextareaInputElement,
  setInputLayerText,
  getEditableText,
  normalizeEditorText,
  normalizeLineText,
  normalizeEditableLineText,
  normalizeSegmentText,
  toInputLayerText,
  mapLogicalOffsetToInputLayerOffset,
  getCaretLineInElement,
  getSelectionOffsetsInElement,
  getSelectionAnchorFocusOffsetsInElement,
  getLogicalOffsetFromDomPoint,
  getLogicalOffsetFromPoint,
  getCodeUnitOffsetFromLineColumn,
  setCaretToLineColumn,
  codeUnitOffsetToLineColumn,
  arePairHighlightPositionsEqual,
  buildCodeUnitDiff,
  codeUnitOffsetToUnicodeScalarIndex,
  alignScrollOffset,
  normalizeRectangularSelection,
  buildLineStartOffsets,
  getLineBoundsByLineNumber,
  getOffsetForColumnInLine,
  setCaretToCodeUnitOffset,
  setSelectionToCodeUnitOffsets,
  dispatchEditorInputEvent,
  normalizeInputLayerDom,
  writePlainTextToClipboard,
  replaceSelectionWithText,
  isPointerOnScrollbar,
  trimHttpUrlCandidate,
  getHttpUrlRangesInLine,
  getHttpUrlAtTextOffset,
  appendClassName,
  dispatchDocumentUpdated,
} = editorTestUtils;
export function Editor({
  tab,
  diffHighlightLines = [],
}: {
  tab: FileTab;
  diffHighlightLines?: number[];
}) {
  const settings = useStore((state) => state.settings);
  const updateTab = useStore((state) => state.updateTab);
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const savedCursorPosition = useStore((state) => state.cursorPositionByTab[tab.id]);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const activeSyntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
  const {
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
  } = useEditorCoreState({
    defaultSubmenuVerticalAlignments: DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS,
    defaultSubmenuMaxHeights: DEFAULT_SUBMENU_MAX_HEIGHTS,
  });
  const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();
  const {
    lineNumberMultiSelectionSet,
    diffHighlightLineSet,
    normalizedRectangularSelection,
  } = useEditorDerivedState({
    lineNumberMultiSelection,
    diffHighlightLines,
    rectangularSelection,
    normalizeRectangularSelection,
  });

  const {
    tabSize,
    wordWrap,
    showLineNumbers,
    highlightCurrentLine,
    renderedFontSizePx,
    lineNumberFontSizePx,
    lineHeightPx,
    itemSize,
    lineNumberColumnWidthPx,
    contentViewportLeftPx,
    contentViewportWidth,
    lineNumberBottomSpacerHeightPx,
    contentTextPadding,
    contentTextRightPadding,
    contentBottomSafetyPadding,
    horizontalOverflowMode,
    usePlainLineRendering,
    isHugeEditableMode,
    isPairHighlightEnabled,
    hugeEditablePaddingTop,
    hugeEditableSegmentHeightPx,
    lineNumberVirtualItemCount,
  } = useEditorLayoutConfig({
    settings,
    width,
    tabLineCount: tab.lineCount,
    tabLargeFileMode: tab.largeFileMode,
    editableSegmentStartLine: editableSegment.startLine,
    editableSegmentEndLine: editableSegment.endLine,
    largeFilePlainRenderLineThreshold: LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD,
  });
  const {
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
  } = useEditorContextMenuConfig({
    tr,
    submenuDirection: editorContextMenu?.submenuDirection,
    submenuVerticalAlignments,
    submenuMaxHeights,
  });

  const addBookmark = useStore((state) => state.addBookmark);
  const removeBookmark = useStore((state) => state.removeBookmark);
  const toggleBookmark = useStore((state) => state.toggleBookmark);
  const bookmarkSidebarOpen = useStore((state) => state.bookmarkSidebarOpen);
  const toggleBookmarkSidebar = useStore((state) => state.toggleBookmarkSidebar);
  const bookmarks = useStore((state) => state.bookmarksByTab[tab.id] ?? EMPTY_BOOKMARKS);
  const [unsavedChangeLines, setUnsavedChangeLines] = useState<number[]>(EMPTY_UNSAVED_CHANGE_LINES);
  const unsavedChangeLineSet = useMemo(() => {
    return new Set(unsavedChangeLines);
  }, [unsavedChangeLines]);
  const largeFetchBuffer = isHugeEditableMode
    ? HUGE_EDITABLE_FETCH_BUFFER_LINES
    : tab.largeFileMode
    ? LARGE_FILE_FETCH_BUFFER_LINES
    : DEFAULT_FETCH_BUFFER_LINES;
  const { getListItemSize, getLineNumberListItemSize, measureRenderedLineHeight } = useEditorRowMeasurement({
    itemSize,
    wordWrap,
    lineNumberBottomSpacerHeightPx,
    tabLineCount: tab.lineCount,
    lineHeightPx,
    renderedFontSizePx,
    fontFamily: settings.fontFamily,
    tabId: tab.id,
    width,
    showLineNumbers,
    listRef,
    lineNumberListRef,
  });
  const { syncVisibleTokens, loadTextFromBackend } = useEditorContentSync({
    maxLineRange: MAX_LINE_RANGE,
    tabId: tab.id,
    height,
    itemSize,
    largeFetchBuffer,
    isHugeEditableMode,
    usePlainLineRendering,
    contentRef,
    scrollContainerRef,
    listRef,
    isScrollbarDragRef,
    currentRequestVersionRef: currentRequestVersion,
    hugeWindowLockedRef,
    hugeWindowFollowScrollOnUnlockRef,
    editableSegmentRef,
    pendingRestoreScrollTopRef,
    syncedTextRef,
    pendingSyncRequestedRef,
    setPlainLines,
    setPlainStartLine,
    setLineTokens,
    setStartLine,
    setEditableSegment,
    normalizeLineText,
    normalizeEditableLineText,
    normalizeEditorText,
    setInputLayerText,
    getEditableText,
  });

  const { handleScroll } = useEditorScrollSyncEffects({
    isHugeEditableMode,
    showLineNumbers,
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    editableSegmentStartLine: editableSegment.startLine,
    editableSegmentEndLine: editableSegment.endLine,
    alignScrollOffset,
    pendingRestoreScrollTopRef,
    contentRef,
    scrollContainerRef,
    listRef,
    lineNumberListRef,
    isScrollbarDragRef,
    lastKnownContentScrollTopRef,
    lastKnownContentScrollLeftRef,
    lastKnownContainerScrollTopRef,
    lastKnownContainerScrollLeftRef,
  });

  const {
    setPointerSelectionNativeHighlightMode,
    clearPointerSelectionNativeHighlightMode,
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
  } = useEditorPointerSelectionGuards({
    contentRef,
    isScrollbarDragRef,
    pointerSelectionActiveRef,
  });
  const { measureTextWidthByEditorStyle, resolveDropOffsetFromPointer } = useEditorTextMeasurement({
    renderedFontSizePx,
    fontFamily: settings.fontFamily,
    lineHeightPx,
    wordWrap,
    getEditableText,
  });

  const { ensureSearchMatchVisibleHorizontally } = useEditorSearchHorizontalNavigation({
    contentRef,
    wordWrap,
    searchNavigateHorizontalMarginPx: SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX,
    searchNavigateMinVisibleTextWidthPx: SEARCH_NAVIGATE_MIN_VISIBLE_TEXT_WIDTH_PX,
    getEditableText,
    measureTextWidthByEditorStyle,
    alignScrollOffset,
  });

  const {
    handleEditorPointerMove,
    handleEditorPointerLeave,
    handleEditorPointerDown,
    handleHugeScrollablePointerDown,
  } = useEditorPointerInteractions({
    isHugeEditableMode,
    hyperlinkHoverHint: tr('editor.hyperlink.openHint'),
    contentRef,
    scrollContainerRef,
    textDragMoveStateRef,
    isScrollbarDragRef,
    pointerSelectionActiveRef,
    verticalSelectionRef,
    rectangularSelectionRef,
    rectangularSelectionPointerActiveRef,
    rectangularSelectionLastClientPointRef,
    setLineNumberMultiSelection,
    setPointerSelectionNativeHighlightMode,
    setRectangularSelection,
    isPointerOnScrollbar,
    isTextareaInputElement,
    resolveDropOffsetFromPointer,
    getHttpUrlAtTextOffset,
    getEditableText,
    getSelectionOffsetsInElement,
    getLogicalOffsetFromPoint,
    normalizeSegmentText,
    codeUnitOffsetToLineColumn,
  });
  const { editableSegmentLines, hugeScrollableContentWidth, syncHugeScrollableContentWidth } =
    useEditorHugeEditableLayout({
      isHugeEditableMode,
      wordWrap,
      contentViewportWidth,
      editableSegmentStartLine: editableSegment.startLine,
      editableSegmentEndLine: editableSegment.endLine,
      editableSegmentText: editableSegment.text,
      renderedFontSizePx,
      fontFamily: settings.fontFamily,
      contentRef,
    });

  const { syncActiveLineStateNow, syncSelectionState } = useEditorSelectionStateSync({
    isHugeEditableMode,
    isPairHighlightEnabled,
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    initializedRef,
    contentRef,
    editableSegmentRef,
    setActiveLineNumber,
    setCursorPosition,
    setPairHighlights,
    normalizeSegmentText,
    getEditableText,
    getSelectionOffsetsInElement,
    codeUnitOffsetToLineColumn,
    arePairHighlightPositionsEqual,
  });

  const {
    clearVerticalSelectionState,
    clearRectangularSelection,
    syncSelectionAfterInteraction,
  } = useEditorSelectionInteractionActions({
    verticalSelectionRef,
    rectangularSelectionRef,
    rectangularSelectionPointerActiveRef,
    rectangularSelectionLastClientPointRef,
    rectangularSelectionAutoScrollDirectionRef,
    rectangularSelectionAutoScrollRafRef,
    setRectangularSelection,
    handleScroll,
    syncActiveLineStateNow,
    syncSelectionState,
  });
  const {
    clearLineNumberMultiSelection,
    mapAbsoluteLineToSourceLine,
    buildLineNumberSelectionRangeText,
    applyLineNumberMultiSelectionEdit,
  } = useEditorLineNumberMultiSelection({
    lineNumberMultiSelection,
    setLineNumberMultiSelection,
    isHugeEditableMode,
    tabId: tab.id,
    contentRef,
    editableSegmentRef,
    setEditableSegment,
    syncedTextRef,
    suppressExternalReloadRef,
    lineNumberSelectionAnchorLineRef,
    normalizeSegmentText,
    getEditableText,
    buildLineStartOffsets,
    getLineBoundsByLineNumber,
    codeUnitOffsetToUnicodeScalarIndex,
    setInputLayerText,
    setCaretToCodeUnitOffset,
    setActiveLineNumber,
    setCursorPosition,
    handleScroll,
    syncSelectionState,
    syncVisibleTokens,
    updateTab,
    dispatchDocumentUpdated,
  });

  const {
    getRectangularSelectionText,
    getRectangularSelectionTextFromBackend,
    replaceRectangularSelection,
    updateRectangularSelectionFromPoint,
    getRectangularSelectionScrollElement,
    beginRectangularSelectionAtPoint,
    beginRectangularSelectionFromCaret,
    nudgeRectangularSelectionByKey,
  } = useEditorRectangularSelectionActions({
    isHugeEditableMode,
    contentRef,
    scrollContainerRef,
    rectangularSelectionRef,
    normalizedRectangularSelection,
    setRectangularSelection,
    clearRectangularSelection,
    syncSelectionState,
    normalizeSegmentText,
    normalizeLineText,
    getEditableText,
    buildLineStartOffsets,
    getLineBoundsByLineNumber,
    getOffsetForColumnInLine,
    setInputLayerText,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    dispatchEditorInputEvent,
    getLogicalOffsetFromPoint,
    codeUnitOffsetToLineColumn,
    getSelectionAnchorFocusOffsetsInElement,
    getSelectionOffsetsInElement,
  });

  const { getSelectedEditorText } = useEditorSelectedTextReader({
    contentRef,
    normalizedRectangularSelection,
    getRectangularSelectionText,
    normalizeSegmentText,
    normalizeLineText,
    getEditableText,
    isTextareaInputElement,
  });

  const { applyTextDragMove } = useEditorTextDragMoveAction({
    setInputLayerText,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    dispatchEditorInputEvent,
    syncSelectionAfterInteraction,
  });

  const { syncTextSelectionHighlight } = useEditorTextSelectionHighlightSync({
    contentRef,
    rectangularSelectionRef,
    normalizedRectangularSelection,
    setTextSelectionHighlight,
    getSelectionOffsetsInElement,
  });

  const { hasSelectionInsideEditor } = useEditorSelectionPresence({
    contentRef,
    lineNumberMultiSelectionCount: lineNumberMultiSelection.length,
    isTextareaInputElement,
  });

  const {
    updateSubmenuVerticalAlignment,
    handleEditorContextMenu,
    handleLineNumberContextMenu,
  } = useEditorContextMenuInteractions({
    contentRef,
    submenuPanelRefs,
    lineNumberContextLineRef,
    activeLineNumber,
    normalizedRectangularSelection,
    hasSelectionInsideEditor,
    defaultSubmenuVerticalAlignments: DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS,
    defaultSubmenuMaxHeights: DEFAULT_SUBMENU_MAX_HEIGHTS,
    setSubmenuVerticalAlignments,
    setSubmenuMaxHeights,
    setEditorContextMenu,
  });

  const {
    tryPasteTextIntoEditor,
    isEditorContextMenuActionDisabled,
    handleEditorContextMenuAction,
  } = useEditorContextMenuActions({
    contentRef,
    editorContextMenuHasSelection: !!editorContextMenu?.hasSelection,
    lineNumberMultiSelection,
    normalizedRectangularSelection,
    setEditorContextMenu,
    clearLineNumberMultiSelection,
    buildLineNumberSelectionRangeText,
    applyLineNumberMultiSelectionEdit,
    getRectangularSelectionTextFromBackend,
    replaceRectangularSelection,
    syncSelectionAfterInteraction,
    getRectangularSelectionText,
    getSelectedEditorText,
    clearRectangularSelection,
    normalizeSegmentText,
    getEditableText,
    setSelectionToCodeUnitOffsets,
    replaceSelectionWithText,
    dispatchEditorInputEvent,
    handleScroll,
  });

  const {
    hasContextBookmark,
    handleAddBookmarkFromContext,
    handleRemoveBookmarkFromContext,
    handleLineNumberDoubleClick,
  } = useEditorBookmarkActions({
    tabId: tab.id,
    bookmarks,
    bookmarkSidebarOpen,
    editorContextMenu,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    toggleBookmarkSidebar,
    setEditorContextMenu,
  });
  const { getLineNumberFromGutterElement, handleLineNumberClick } = useEditorLineNumberInteractions({
    tabId: tab.id,
    contentRef,
    lineNumberSelectionAnchorLineRef,
    clearLineNumberMultiSelection,
    clearRectangularSelection,
    mapAbsoluteLineToSourceLine,
    setLineNumberMultiSelection,
    setActiveLineNumber,
    setCursorPosition,
    syncSelectionAfterInteraction,
    normalizeSegmentText,
    getEditableText,
    buildLineStartOffsets,
    getLineBoundsByLineNumber,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    setSelectionToCodeUnitOffsets,
  });

  const { handleLineNumberWheel } = useEditorLineNumberWheel({
    getRectangularSelectionScrollElement,
    alignScrollOffset,
  });

  const { flushPendingSync } = useEditorFlushPendingSync({
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    isHugeEditableMode,
    hugeEditableWindowUnlockMs: HUGE_EDITABLE_WINDOW_UNLOCK_MS,
    height,
    itemSize,
    largeFetchBuffer,
    contentRef,
    scrollContainerRef,
    editableSegmentRef,
    setEditableSegment,
    syncedTextRef,
    suppressExternalReloadRef,
    pendingSyncRequestedRef,
    syncInFlightRef,
    isComposingRef,
    hugeWindowLockedRef,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowUnlockTimerRef,
    syncVisibleTokens,
    updateTab,
    dispatchDocumentUpdated,
    normalizeSegmentText,
    getEditableText,
    alignScrollOffset,
    buildCodeUnitDiff,
    codeUnitOffsetToUnicodeScalarIndex,
  });

  const { handleCleanupDocumentFromContext } = useEditorContextCleanupAction({
    tabId: tab.id,
    setEditorContextMenu,
    flushPendingSync,
    loadTextFromBackend,
    syncVisibleTokens,
    syncSelectionAfterInteraction,
    updateTab,
    dispatchDocumentUpdated,
  });

  const { handleConvertSelectionFromContext } = useEditorContextConvertActions({
    editorContextMenuHasSelection: !!editorContextMenu?.hasSelection,
    contentRef,
    normalizedRectangularSelection,
    base64DecodeErrorToastTimerRef,
    setShowBase64DecodeErrorToast,
    setEditorContextMenu,
    getRectangularSelectionTextFromBackend,
    getSelectedEditorText,
    replaceRectangularSelection,
    replaceSelectionWithText,
    dispatchEditorInputEvent,
    syncSelectionAfterInteraction,
    writePlainTextToClipboard,
  });

  const {
    handleInput,
    handleCompositionStart,
    handleCompositionEnd,
  } = useEditorInputSyncActions({
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    tabIsDirty: tab.isDirty,
    largeFilePlainRenderLineThreshold: LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD,
    largeFileEditSyncDebounceMs: LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS,
    normalEditSyncDebounceMs: NORMAL_EDIT_SYNC_DEBOUNCE_MS,
    isHugeEditableMode,
    pendingSyncRequestedRef,
    hugeWindowLockedRef,
    editTimeoutRef: editTimeout,
    contentRef,
    isComposingRef,
    clearVerticalSelectionState,
    normalizeInputLayerDom,
    syncHugeScrollableContentWidth,
    updateTab,
    syncSelectionAfterInteraction,
    handleScroll,
    flushPendingSync,
  });

  const { toggleSelectedLinesComment } = useEditorToggleLineCommentsAction({
    activeSyntaxKey,
    tabId: tab.id,
    tabLineCount: tab.lineCount,
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
  });

  const { handleEditableKeyDown } = useEditorKeyboardActions({
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    activeLineNumber,
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
    clearRectangularSelection,
    clearLineNumberMultiSelection,
    handleInput,
  });

  const { onItemsRendered } = useEditorVisibleItemsRendered({
    isHugeEditableMode,
    pendingSyncRequestedRef,
    syncInFlightRef,
    isComposingRef,
    largeFetchBuffer,
    tabLineCount: tab.lineCount,
    tabLargeFileMode: tab.largeFileMode,
    editableSegmentStartLine: editableSegment.startLine,
    editableSegmentEndLine: editableSegment.endLine,
    usePlainLineRendering,
    plainLinesLength: plainLines.length,
    plainStartLine,
    lineTokensLength: lineTokens.length,
    startLine,
    requestTimeoutRef: requestTimeout,
    hugeEditableFetchDebounceMs: HUGE_EDITABLE_FETCH_DEBOUNCE_MS,
    largeFileFetchDebounceMs: LARGE_FILE_FETCH_DEBOUNCE_MS,
    normalFileFetchDebounceMs: NORMAL_FILE_FETCH_DEBOUNCE_MS,
    syncVisibleTokens,
  });

  const { renderHighlightedPlainLine, renderHighlightedTokens } = useEditorLineHighlightRenderers({
    searchHighlight,
    isPairHighlightEnabled,
    pairHighlights,
    normalizedRectangularSelection,
    textSelectionHighlight,
    isHugeEditableMode,
    editableSegmentRef,
    contentRef,
    normalizeSegmentText,
    getEditableText,
    getCodeUnitOffsetFromLineColumn,
    getHttpUrlRangesInLine,
    appendClassName,
    resolveTokenTypeClass,
    classNames: {
      search: SEARCH_HIGHLIGHT_CLASS,
      pair: PAIR_HIGHLIGHT_CLASS,
      searchAndPair: SEARCH_AND_PAIR_HIGHLIGHT_CLASS,
      rectangular: RECTANGULAR_SELECTION_HIGHLIGHT_CLASS,
      textSelection: TEXT_SELECTION_HIGHLIGHT_CLASS,
      hyperlinkUnderline: HYPERLINK_UNDERLINE_CLASS,
    },
  });

  const {
    handleSelectCurrentLineFromContext,
    handleAddCurrentLineBookmarkFromContext,
  } = useEditorLineNumberContextActions({
    editorContextMenu,
    lineNumberContextLineRef,
    handleLineNumberClick,
    handleLineNumberDoubleClick,
    setEditorContextMenu,
  });

  useEditorDocumentLoadEffects({
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    itemSize,
    savedCursorLine: savedCursorPosition?.line ?? 1,
    savedCursorColumn: savedCursorPosition?.column ?? 1,
    usePlainLineRendering,
    isHugeEditableMode,
    lineTokens,
    startLine,
    plainLines,
    plainStartLine,
    editableSegmentState: editableSegment,
    initializedRef,
    suppressExternalReloadRef,
    syncInFlightRef,
    pendingSyncRequestedRef,
    hugeWindowLockedRef,
    hugeWindowFollowScrollOnUnlockRef,
    hugeWindowUnlockTimerRef,
    syncedTextRef,
    requestTimeoutRef: requestTimeout,
    editTimeoutRef: editTimeout,
    editableSegmentRef,
    contentRef,
    scrollContainerRef,
    pendingRestoreScrollTopRef,
    lastKnownContentScrollTopRef,
    lastKnownContentScrollLeftRef,
    lastKnownContainerScrollTopRef,
    lastKnownContainerScrollLeftRef,
    setLineTokens,
    setStartLine,
    setEditableSegment,
    setPlainLines,
    setPlainStartLine,
    setInputLayerText,
    getEditableText,
    setCaretToLineColumn,
    loadTextFromBackend,
    syncVisibleTokens,
  });


  useEditorPointerFinalizeEffects({
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
    clearPointerSelectionNativeHighlightMode,
    syncSelectionAfterInteraction,
    syncTextSelectionHighlight,
  });

  useEditorGlobalPointerEffects({
    rectangularAutoScrollEdgePx: RECTANGULAR_AUTO_SCROLL_EDGE_PX,
    rectangularAutoScrollMaxStepPx: RECTANGULAR_AUTO_SCROLL_MAX_STEP_PX,
    contentRef,
    textDragMoveStateRef,
    textDragCursorAppliedRef,
    rectangularSelectionPointerActiveRef,
    rectangularSelectionLastClientPointRef,
    rectangularSelectionAutoScrollDirectionRef,
    rectangularSelectionAutoScrollRafRef,
    isTextareaInputElement,
    resolveDropOffsetFromPointer,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
    getRectangularSelectionScrollElement,
    updateRectangularSelectionFromPoint,
    applyTextDragMove,
    alignScrollOffset,
    handleScroll,
  });

  useEditorClipboardSelectionEffects({
    contentRef,
    normalizedRectangularSelection,
    lineNumberMultiSelection,
    normalizeSegmentText,
    getEditableText,
    buildLineNumberSelectionRangeText,
    getRectangularSelectionText,
    applyLineNumberMultiSelectionEdit,
    replaceRectangularSelection,
  });

  useEditorUiInteractionEffects({
    contentRef,
    selectionChangeRafRef,
    pointerSelectionActiveRef,
    verticalSelectionRef,
    hasSelectionInsideEditor,
    clearVerticalSelectionState,
    handleScroll,
    syncActiveLineStateNow,
    syncSelectionState,
    syncTextSelectionHighlight,
    editorContextMenu,
    editorContextMenuRef,
    setEditorContextMenu,
  });

  useEditorLocalLifecycleEffects({
    isPairHighlightEnabled,
    setPairHighlights,
    base64DecodeErrorToastTimerRef,
    setEditorContextMenu,
    lineNumberContextLineRef,
    clearRectangularSelection,
    textDragCursorAppliedRef,
    contentRef,
    textDragMoveStateRef,
    tabId: tab.id,
    savedCursorLine: savedCursorPosition?.line ?? 1,
    savedCursorColumn: savedCursorPosition?.column ?? 1,
    highlightCurrentLine,
    syncSelectionState,
    tryPasteTextIntoEditor,
    setActiveLineNumber,
    lineNumberSelectionAnchorLineRef,
    setLineNumberMultiSelection,
    setCursorPosition,
    setSearchHighlight,
    setTextSelectionHighlight,
    outlineFlashTimerRef,
    setOutlineFlashLine,
  });

  useEditorNavigationAndRefreshEffects({
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    itemSize,
    isHugeEditableMode,
    requestTimeoutRef: requestTimeout,
    currentRequestVersionRef: currentRequestVersion,
    pendingRestoreScrollTopRef,
    outlineFlashTimerRef,
    contentRef,
    scrollContainerRef,
    listRef,
    lineNumberListRef,
    editableSegmentRef,
    setActiveLineNumber,
    setCursorPosition,
    setOutlineFlashLine,
    setSearchHighlight,
    ensureSearchMatchVisibleHorizontally,
    syncVisibleTokens,
    alignScrollOffset,
    setCaretToLineColumn,
    loadTextFromBackend,
    updateTab,
    getSelectionOffsetsInElement,
    getEditableText,
    mapLogicalOffsetToInputLayerOffset,
    setCaretToCodeUnitOffset,
  });

  useEffect(() => {
    let disposed = false;
    let latestRequestId = 0;

    const applyUnsavedChangeLines = (result: unknown) => {
      const normalized = Array.isArray(result)
        ? Array.from(
            new Set(
              result
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0)
                .map((value) => Math.floor(value))
            )
          ).sort((left, right) => left - right)
        : EMPTY_UNSAVED_CHANGE_LINES;

      setUnsavedChangeLines((previous) => {
        if (previous.length === normalized.length && previous.every((value, index) => value === normalized[index])) {
          return previous;
        }

        return normalized;
      });
    };

    const refreshUnsavedChangeLines = async () => {
      const requestId = ++latestRequestId;

      if (tab.tabType === 'diff' || tab.largeFileMode || !tab.isDirty) {
        if (!disposed && requestId === latestRequestId) {
          applyUnsavedChangeLines([]);
        }
        return;
      }

      try {
        const result = await invoke<number[]>('get_unsaved_change_line_numbers', { id: tab.id });
        if (disposed || requestId !== latestRequestId) {
          return;
        }
        applyUnsavedChangeLines(result);
      } catch (error) {
        if (disposed || requestId !== latestRequestId) {
          return;
        }
        console.error('Failed to load unsaved change line markers:', error);
        applyUnsavedChangeLines([]);
      }
    };

    const handleDocumentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId?: string }>).detail;
      if (detail?.tabId !== tab.id) {
        return;
      }

      void refreshUnsavedChangeLines();
    };

    void refreshUnsavedChangeLines();
    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);

    return () => {
      disposed = true;
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [tab.id, tab.isDirty, tab.largeFileMode, tab.tabType]);

  return (
    <EditorView
      containerRef={containerRef}
      activeSyntaxKey={activeSyntaxKey}
      isHugeEditableMode={isHugeEditableMode}
      contentRef={contentRef}
      scrollContainerRef={scrollContainerRef}
      contentViewportLeftPx={contentViewportLeftPx}
      contentViewportWidth={contentViewportWidth}
      horizontalOverflowMode={horizontalOverflowMode}
      handleScroll={handleScroll}
      handleHugeScrollablePointerDown={handleHugeScrollablePointerDown}
      tab={tab}
      itemSize={itemSize}
      wordWrap={wordWrap}
      hugeScrollableContentWidth={hugeScrollableContentWidth}
      hugeEditablePaddingTop={hugeEditablePaddingTop}
      hugeEditableSegmentHeightPx={hugeEditableSegmentHeightPx}
      settings={settings}
      renderedFontSizePx={renderedFontSizePx}
      lineHeightPx={lineHeightPx}
      tabSize={tabSize}
      contentTextPadding={contentTextPadding}
      contentTextRightPadding={contentTextRightPadding}
      contentBottomSafetyPadding={contentBottomSafetyPadding}
      handleInput={handleInput}
      handleEditableKeyDown={handleEditableKeyDown}
      handleEditorPointerDown={handleEditorPointerDown}
      handleEditorPointerMove={handleEditorPointerMove}
      handleEditorPointerLeave={handleEditorPointerLeave}
      syncSelectionAfterInteraction={syncSelectionAfterInteraction}
      handleEditorContextMenu={handleEditorContextMenu}
      handleCompositionStart={handleCompositionStart}
      handleCompositionEnd={handleCompositionEnd}
      width={width}
      height={height}
      listRef={listRef}
      getListItemSize={getListItemSize}
      onItemsRendered={onItemsRendered}
      editableSegment={editableSegment}
      usePlainLineRendering={usePlainLineRendering}
      plainStartLine={plainStartLine}
      startLine={startLine}
      lineTokens={lineTokens}
      editableSegmentLines={editableSegmentLines}
      plainLines={plainLines}
      measureRenderedLineHeight={measureRenderedLineHeight}
      diffHighlightLineSet={diffHighlightLineSet}
      unsavedChangeLineSet={unsavedChangeLineSet}
      outlineFlashLine={outlineFlashLine}
      lineNumberMultiSelectionSet={lineNumberMultiSelectionSet}
      highlightCurrentLine={highlightCurrentLine}
      activeLineNumber={activeLineNumber}
      renderHighlightedPlainLine={renderHighlightedPlainLine}
      renderHighlightedTokens={renderHighlightedTokens}
      showLineNumbers={showLineNumbers}
      lineNumberColumnWidthPx={lineNumberColumnWidthPx}
      lineNumberVirtualItemCount={lineNumberVirtualItemCount}
      lineNumberFontSizePx={lineNumberFontSizePx}
      lineNumberListRef={lineNumberListRef}
      bookmarks={bookmarks}
      getLineNumberListItemSize={getLineNumberListItemSize}
      getLineNumberFromGutterElement={getLineNumberFromGutterElement}
      handleLineNumberWheel={handleLineNumberWheel}
      handleLineNumberDoubleClick={handleLineNumberDoubleClick}
      handleLineNumberClick={handleLineNumberClick}
      handleLineNumberContextMenu={handleLineNumberContextMenu}
      editorContextMenu={editorContextMenu}
      editorContextMenuRef={editorContextMenuRef}
      submenuPanelRefs={submenuPanelRefs}
      editSubmenuStyle={editSubmenuStyle}
      sortSubmenuStyle={sortSubmenuStyle}
      convertSubmenuStyle={convertSubmenuStyle}
      bookmarkSubmenuStyle={bookmarkSubmenuStyle}
      editSubmenuPositionClassName={editSubmenuPositionClassName}
      sortSubmenuPositionClassName={sortSubmenuPositionClassName}
      convertSubmenuPositionClassName={convertSubmenuPositionClassName}
      bookmarkSubmenuPositionClassName={bookmarkSubmenuPositionClassName}
      cleanupMenuItems={cleanupMenuItems}
      sortMenuItems={sortMenuItems}
      copyLabel={copyLabel}
      cutLabel={cutLabel}
      pasteLabel={pasteLabel}
      deleteLabel={deleteLabel}
      selectAllLabel={selectAllLabel}
      selectCurrentLineLabel={selectCurrentLineLabel}
      addCurrentLineToBookmarkLabel={addCurrentLineToBookmarkLabel}
      editMenuLabel={editMenuLabel}
      sortMenuLabel={sortMenuLabel}
      convertMenuLabel={convertMenuLabel}
      convertBase64EncodeLabel={convertBase64EncodeLabel}
      convertBase64DecodeLabel={convertBase64DecodeLabel}
      copyBase64EncodeResultLabel={copyBase64EncodeResultLabel}
      copyBase64DecodeResultLabel={copyBase64DecodeResultLabel}
      bookmarkMenuLabel={bookmarkMenuLabel}
      addBookmarkLabel={addBookmarkLabel}
      removeBookmarkLabel={removeBookmarkLabel}
      hasContextBookmark={hasContextBookmark}
      handleSelectCurrentLineFromContext={handleSelectCurrentLineFromContext}
      handleAddCurrentLineBookmarkFromContext={handleAddCurrentLineBookmarkFromContext}
      handleEditorContextMenuAction={handleEditorContextMenuAction}
      isEditorContextMenuActionDisabled={isEditorContextMenuActionDisabled}
      updateSubmenuVerticalAlignment={updateSubmenuVerticalAlignment}
      handleCleanupDocumentFromContext={handleCleanupDocumentFromContext}
      handleConvertSelectionFromContext={handleConvertSelectionFromContext}
      handleAddBookmarkFromContext={handleAddBookmarkFromContext}
      handleRemoveBookmarkFromContext={handleRemoveBookmarkFromContext}
      showBase64DecodeErrorToast={showBase64DecodeErrorToast}
      base64DecodeFailedToastLabel={base64DecodeFailedToastLabel}
    />
  );
}

