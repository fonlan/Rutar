// @ts-nocheck
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { detectSyntaxKeyFromTab } from '@/lib/syntax';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { t } from '@/i18n';
import {
  EditorContextMenu,
  type EditorContextMenuState,
  type EditorSubmenuKey,
} from './EditorContextMenu';
import { EditorBase64DecodeToast } from './EditorBase64DecodeToast';
import { EditorBackdropLayer } from './EditorBackdropLayer';
import { EditorInputLayer } from './EditorInputLayer';
import { EditorLineNumberGutter } from './EditorLineNumberGutter';
import {
  DEFAULT_SUBMENU_MAX_HEIGHTS,
  DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS,
  type EditorSegmentState,
  type EditorSubmenuVerticalAlign,
  type PairHighlightPosition,
  type RectangularSelectionState,
  type ReplaceRectangularSelectionResultPayload,
  type SearchHighlightState,
  type SyntaxToken,
  type TextDragMoveState,
  type TextSelectionState,
  type VerticalSelectionState,
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
import { useEditorRowMeasurement } from './useEditorRowMeasurement';
import { useEditorSelectionStateSync } from './useEditorSelectionStateSync';
import { useEditorScrollSyncEffects } from './useEditorScrollSyncEffects';
import { useEditorTextMeasurement } from './useEditorTextMeasurement';
import { useEditorToggleLineCommentsAction } from './useEditorToggleLineCommentsAction';
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
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const activeSyntaxKey = tab.syntaxOverride ?? detectSyntaxKeyFromTab(tab);
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
  >(() => ({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS }));
  const [submenuMaxHeights, setSubmenuMaxHeights] = useState<
    Record<EditorSubmenuKey, number | null>
  >(() => ({ ...DEFAULT_SUBMENU_MAX_HEIGHTS }));
  const { ref: containerRef, width, height } = useResizeObserver<HTMLDivElement>();

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
  const lineNumberMultiSelectionSet = useMemo(() => new Set(lineNumberMultiSelection), [lineNumberMultiSelection]);
  const diffHighlightLineSet = useMemo(
    () =>
      new Set(
        (diffHighlightLines || [])
          .filter((line) => Number.isFinite(line) && line > 0)
          .map((line) => Math.floor(line))
      ),
    [diffHighlightLines]
  );

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
  });

  const setPointerSelectionNativeHighlightMode = useCallback((enabled: boolean) => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    if (enabled) {
      element.style.setProperty('--editor-native-selection-bg', 'hsl(217 91% 60% / 0.28)');
      return;
    }

    element.style.removeProperty('--editor-native-selection-bg');
  }, []);
  const { measureTextWidthByEditorStyle, resolveDropOffsetFromPointer } = useEditorTextMeasurement({
    renderedFontSizePx,
    fontFamily: settings.fontFamily,
    lineHeightPx,
    wordWrap,
    getEditableText,
  });

  const estimateLineTextForNavigation = useCallback(
    (lineNumber: number, incomingLineText: string) => {
      if (incomingLineText) {
        return incomingLineText;
      }

      if (!contentRef.current || lineNumber <= 0) {
        return '';
      }

      const allText = getEditableText(contentRef.current);
      if (!allText) {
        return '';
      }

      const lines = allText.split('\n');
      const lineIndex = lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        return '';
      }

      return lines[lineIndex] ?? '';
    },
    []
  );

  const getFallbackSearchSidebarOcclusionPx = useCallback(() => {
    const sidebarElement = document.querySelector<HTMLElement>('[data-rutar-search-sidebar="true"]');
    if (!sidebarElement) {
      return 0;
    }

    const rect = sidebarElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }

    return Math.max(0, window.innerWidth - rect.left);
  }, []);

  const ensureSearchMatchVisibleHorizontally = useCallback(
    (
      scrollElement: HTMLDivElement | HTMLTextAreaElement | null,
      lineNumber: number,
      columnNumber: number,
      matchLength: number,
      incomingLineText: string,
      occludedRightPx: number,
      lineListElement?: HTMLDivElement
    ) => {
      if (!scrollElement || wordWrap) {
        return;
      }

      const textareaElement = contentRef.current;
      if (!textareaElement) {
        return;
      }

      const lineText = estimateLineTextForNavigation(lineNumber, incomingLineText);
      const zeroBasedStart = Math.max(0, columnNumber - 1);
      const safeStart = Math.min(zeroBasedStart, lineText.length);
      const safeLength = Math.max(1, matchLength || 1);
      const safeEnd = Math.min(lineText.length, safeStart + safeLength);

      const prefixWidth = measureTextWidthByEditorStyle(textareaElement, lineText.slice(0, safeStart));
      const matchWidth = Math.max(
        measureTextWidthByEditorStyle(textareaElement, lineText.slice(safeStart, safeEnd)),
        measureTextWidthByEditorStyle(textareaElement, lineText.charAt(safeStart) || ' ')
      );

      const style = window.getComputedStyle(textareaElement);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;

      const fallbackOccludedRightPx = getFallbackSearchSidebarOcclusionPx();
      const effectiveOccludedRight = Math.max(0, occludedRightPx, fallbackOccludedRightPx);
      const baseVisibleWidth = Math.max(
        0,
        scrollElement.clientWidth - paddingLeft - paddingRight - SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX * 2
      );
      const availableVisibleWidth = Math.max(
        SEARCH_NAVIGATE_MIN_VISIBLE_TEXT_WIDTH_PX,
        baseVisibleWidth - effectiveOccludedRight
      );

      const targetStartX = Math.max(0, prefixWidth - SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX);
      const targetEndX = Math.max(
        targetStartX,
        prefixWidth + matchWidth + SEARCH_NAVIGATE_HORIZONTAL_MARGIN_PX
      );

      let nextScrollLeft = scrollElement.scrollLeft;
      const viewportStartX = nextScrollLeft;
      const viewportEndX = viewportStartX + availableVisibleWidth;

      if (targetEndX > viewportEndX) {
        nextScrollLeft = targetEndX - availableVisibleWidth;
      } else if (targetStartX < viewportStartX) {
        nextScrollLeft = targetStartX;
      }

      const maxScrollableWidthByElement = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
      const maxScrollableWidthByTextarea = Math.max(0, textareaElement.scrollWidth - textareaElement.clientWidth);
      const maxScrollableWidthByList = lineListElement
        ? Math.max(0, lineListElement.scrollWidth - lineListElement.clientWidth)
        : 0;
      const maxScrollableWidth = Math.max(
        maxScrollableWidthByElement,
        maxScrollableWidthByTextarea,
        maxScrollableWidthByList
      );

      const alignedNextScrollLeft = alignScrollOffset(Math.max(0, Math.min(nextScrollLeft, maxScrollableWidth)));
      if (Math.abs(scrollElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        scrollElement.scrollLeft = alignedNextScrollLeft;
      }

      if (lineListElement && Math.abs(lineListElement.scrollLeft - alignedNextScrollLeft) > 0.001) {
        lineListElement.scrollLeft = alignedNextScrollLeft;
      }
    },
    [
      estimateLineTextForNavigation,
      getFallbackSearchSidebarOcclusionPx,
      measureTextWidthByEditorStyle,
      wordWrap,
    ]
  );

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

  const endScrollbarDragSelectionGuard = useCallback(() => {
    if (!isScrollbarDragRef.current) {
      return;
    }

    isScrollbarDragRef.current = false;

    if (contentRef.current) {
      contentRef.current.style.userSelect = 'text';
      contentRef.current.style.webkitUserSelect = 'text';
    }
  }, []);

  const { syncSelectionState } = useEditorSelectionStateSync({
    isHugeEditableMode,
    isPairHighlightEnabled,
    tabId: tab.id,
    tabLineCount: tab.lineCount,
    contentRef,
    editableSegmentRef,
    setActiveLineNumber,
    setCursorPosition,
    setPairHighlights,
    normalizeSegmentText,
    getEditableText,
    getSelectionAnchorFocusOffsetsInElement,
    getSelectionOffsetsInElement,
    codeUnitOffsetToLineColumn,
    arePairHighlightPositionsEqual,
  });

  const clearVerticalSelectionState = useCallback(() => {
    verticalSelectionRef.current = null;
  }, []);

  const clearRectangularSelection = useCallback(() => {
    rectangularSelectionPointerActiveRef.current = false;
    rectangularSelectionRef.current = null;
    rectangularSelectionLastClientPointRef.current = null;
    rectangularSelectionAutoScrollDirectionRef.current = 0;
    if (rectangularSelectionAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(rectangularSelectionAutoScrollRafRef.current);
      rectangularSelectionAutoScrollRafRef.current = null;
    }
    setRectangularSelection(null);
  }, []);
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

  const normalizedRectangularSelection = useMemo(
    () => normalizeRectangularSelection(rectangularSelection),
    [rectangularSelection]
  );

  const getRectangularSelectionText = useCallback(
    (text: string) => {
      if (!normalizedRectangularSelection) {
        return '';
      }

      const starts = buildLineStartOffsets(text);
      const lines: string[] = [];

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          lines.push('');
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        lines.push(text.slice(segmentStart, segmentEnd));
      }

      return lines.join('\n');
    },
    [normalizedRectangularSelection]
  );

  const getRectangularSelectionTextFromBackend = useCallback(async () => {
    const element = contentRef.current;
    if (!element || !normalizedRectangularSelection) {
      return '';
    }

    const text = normalizeSegmentText(getEditableText(element));

    try {
      return await invoke<string>('get_rectangular_selection_text', {
        text,
        startLine: normalizedRectangularSelection.startLine,
        endLine: normalizedRectangularSelection.endLine,
        startColumn: normalizedRectangularSelection.startColumn,
        endColumn: normalizedRectangularSelection.endColumn,
      });
    } catch (error) {
      console.error('Failed to get rectangular selection text from backend:', error);
      return getRectangularSelectionText(text);
    }
  }, [getRectangularSelectionText, normalizedRectangularSelection]);

  const getSelectedEditorText = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return '';
    }

    if (normalizedRectangularSelection) {
      const text = normalizeSegmentText(getEditableText(element));
      return getRectangularSelectionText(text);
    }

    if (isTextareaInputElement(element)) {
      const start = Math.max(0, Math.min(element.selectionStart ?? 0, element.value.length));
      const end = Math.max(0, Math.min(element.selectionEnd ?? start, element.value.length));
      if (end <= start) {
        return '';
      }

      return normalizeLineText(element.value.slice(start, end));
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return '';
    }

    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) {
      return '';
    }

    return normalizeLineText(selection.toString());
  }, [getRectangularSelectionText, normalizedRectangularSelection]);

  const replaceRectangularSelectionLocally = useCallback(
    (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const starts = buildLineStartOffsets(text);
      const rawRows = normalizeLineText(insertText ?? '').split('\n');
      const rowCount = normalizedRectangularSelection.lineCount;
      const rows = Array.from({ length: rowCount }, (_, index) => {
        if (rawRows.length === 0) {
          return '';
        }
        return rawRows[Math.min(index, rawRows.length - 1)] ?? '';
      });

      const pieces: string[] = [];
      let cursor = 0;
      let caretLogicalOffset = 0;

      for (
        let line = normalizedRectangularSelection.startLine;
        line <= normalizedRectangularSelection.endLine;
        line += 1
      ) {
        const bounds = getLineBoundsByLineNumber(text, starts, line);
        if (!bounds) {
          continue;
        }

        const segmentStart = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.startColumn
        );
        const segmentEnd = getOffsetForColumnInLine(
          bounds.start,
          bounds.end,
          normalizedRectangularSelection.endColumn
        );

        pieces.push(text.slice(cursor, segmentStart));
        const replacementRow = rows[line - normalizedRectangularSelection.startLine] ?? '';
        pieces.push(replacementRow);
        cursor = segmentEnd;

        if (line === normalizedRectangularSelection.endLine) {
          caretLogicalOffset =
            pieces.join('').length + (options?.collapseToStart ? 0 : replacementRow.length);
        }
      }

      pieces.push(text.slice(cursor));
      const nextText = pieces.join('');

      setInputLayerText(element, nextText);
      const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, layerCaretOffset);
      clearRectangularSelection();
      dispatchEditorInputEvent(element);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [clearRectangularSelection, normalizedRectangularSelection, syncSelectionState]
  );

  const replaceRectangularSelection = useCallback(
    async (insertText: string, options?: { collapseToStart?: boolean }) => {
      const element = contentRef.current;
      if (!element || !normalizedRectangularSelection) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));

      try {
        const result = await invoke<ReplaceRectangularSelectionResultPayload>(
          'replace_rectangular_selection_text',
          {
            text,
            startLine: normalizedRectangularSelection.startLine,
            endLine: normalizedRectangularSelection.endLine,
            startColumn: normalizedRectangularSelection.startColumn,
            endColumn: normalizedRectangularSelection.endColumn,
            insertText,
            collapseToStart: options?.collapseToStart === true,
          }
        );

        const nextText = normalizeSegmentText(result?.nextText ?? text);
        const caretLogicalOffset = Math.max(
          0,
          Math.min(nextText.length, Math.floor(result?.caretOffset ?? 0))
        );

        setInputLayerText(element, nextText);
        const layerCaretOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
        setCaretToCodeUnitOffset(element, layerCaretOffset);
        clearRectangularSelection();
        dispatchEditorInputEvent(element);
        window.requestAnimationFrame(() => {
          syncSelectionState();
        });
        return true;
      } catch (error) {
        console.error('Failed to replace rectangular selection with backend command:', error);
        return replaceRectangularSelectionLocally(insertText, options);
      }
    },
    [
      clearRectangularSelection,
      normalizedRectangularSelection,
      replaceRectangularSelectionLocally,
      syncSelectionState,
    ]
  );

  const updateRectangularSelectionFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
      if (logicalOffset === null) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const position = codeUnitOffsetToLineColumn(text, logicalOffset);
      const line = Math.max(1, position.line);
      const column = Math.max(1, position.column + 1);
      const current = rectangularSelectionRef.current;

      if (!current) {
        const next: RectangularSelectionState = {
          anchorLine: line,
          anchorColumn: column,
          focusLine: line,
          focusColumn: column,
        };

        rectangularSelectionRef.current = next;
        setRectangularSelection(next);
        return true;
      }

      const next: RectangularSelectionState = {
        ...current,
        focusLine: line,
        focusColumn: column,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    []
  );

  const getRectangularSelectionScrollElement = useCallback(() => {
    if (isHugeEditableMode) {
      return scrollContainerRef.current;
    }

    return contentRef.current;
  }, [isHugeEditableMode]);

  const beginRectangularSelectionAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const logicalOffset = getLogicalOffsetFromPoint(element, clientX, clientY);
    if (logicalOffset === null) {
      return false;
    }

    const text = normalizeSegmentText(getEditableText(element));
    const position = codeUnitOffsetToLineColumn(text, logicalOffset);
    const line = Math.max(1, position.line);
    const column = Math.max(1, position.column + 1);
    const next: RectangularSelectionState = {
      anchorLine: line,
      anchorColumn: column,
      focusLine: line,
      focusColumn: column,
    };

    rectangularSelectionRef.current = next;
    setRectangularSelection(next);
    return true;
  }, []);

  const beginRectangularSelectionFromCaret = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
    const resolvedFocusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(element)?.end ?? 0;
    const text = normalizeSegmentText(getEditableText(element));
    const position = codeUnitOffsetToLineColumn(text, resolvedFocusOffset);
    const line = Math.max(1, position.line);
    const column = Math.max(1, position.column + 1);
    const next: RectangularSelectionState = {
      anchorLine: line,
      anchorColumn: column,
      focusLine: line,
      focusColumn: column,
    };

    rectangularSelectionRef.current = next;
    setRectangularSelection(next);
    return true;
  }, []);

  const nudgeRectangularSelectionByKey = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const current = rectangularSelectionRef.current;
      if (!current) {
        return false;
      }

      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const logicalLineCount = Math.max(1, text.length === 0 ? 1 : text.split('\n').length);

      const nextFocusLine = direction === 'up'
        ? Math.max(1, current.focusLine - 1)
        : direction === 'down'
        ? Math.min(logicalLineCount, current.focusLine + 1)
        : current.focusLine;

      const nextFocusColumn = direction === 'left'
        ? Math.max(1, current.focusColumn - 1)
        : direction === 'right'
        ? current.focusColumn + 1
        : current.focusColumn;

      const next: RectangularSelectionState = {
        ...current,
        focusLine: nextFocusLine,
        focusColumn: nextFocusColumn,
      };

      rectangularSelectionRef.current = next;
      setRectangularSelection(next);
      return true;
    },
    []
  );

  const expandVerticalSelection = useCallback(
    (direction: 'up' | 'down') => {
      const element = contentRef.current;
      if (!element) {
        return false;
      }

      const text = normalizeSegmentText(getEditableText(element));
      const logicalLineCount = Math.max(1, text.length === 0 ? 1 : text.split('\n').length);

      const current = verticalSelectionRef.current;
      if (!current) {
        const anchorFocusOffsets = getSelectionAnchorFocusOffsetsInElement(element);
        const resolvedFocusOffset = anchorFocusOffsets?.focus ?? getSelectionOffsetsInElement(element)?.end ?? 0;
        const position = codeUnitOffsetToLineColumn(text, resolvedFocusOffset);
        const initialLine = Math.max(1, Math.min(logicalLineCount, position.line));
        const initialColumn = Math.max(1, position.column + 1);

        verticalSelectionRef.current = {
          baseLine: initialLine,
          baseColumn: initialColumn,
          focusLine: initialLine,
        };
      }

      const state = verticalSelectionRef.current;
      if (!state) {
        return false;
      }

      const nextFocusLine = direction === 'up'
        ? Math.max(1, state.focusLine - 1)
        : Math.min(logicalLineCount, state.focusLine + 1);

      if (nextFocusLine === state.focusLine) {
        return true;
      }

      state.focusLine = nextFocusLine;

      const startLine = Math.min(state.baseLine, state.focusLine);
      const endLine = Math.max(state.baseLine, state.focusLine);
      const startOffset = getCodeUnitOffsetFromLineColumn(text, startLine, state.baseColumn);
      const endOffset = getCodeUnitOffsetFromLineColumn(text, endLine, state.baseColumn);
      const layerStartOffset = mapLogicalOffsetToInputLayerOffset(text, startOffset);
      const layerEndOffset = mapLogicalOffsetToInputLayerOffset(text, endOffset);

      setSelectionToCodeUnitOffsets(element, layerStartOffset, layerEndOffset);
      window.requestAnimationFrame(() => {
        syncSelectionState();
      });
      return true;
    },
    [syncSelectionState]
  );

  const syncSelectionAfterInteraction = useCallback(() => {
    window.requestAnimationFrame(() => {
      handleScroll();
      syncSelectionState();

      window.requestAnimationFrame(() => {
        handleScroll();
      });
    });
  }, [handleScroll, syncSelectionState]);

  const applyTextDragMove = useCallback(
    (element: HTMLTextAreaElement, state: TextDragMoveState) => {
      if (!state.dragging) {
        return false;
      }

      const sourceStart = state.sourceStart;
      const sourceEnd = state.sourceEnd;
      const baseText = state.baseText;
      if (sourceStart < 0 || sourceEnd <= sourceStart || sourceEnd > baseText.length) {
        return false;
      }

      let dropOffset = Math.max(0, Math.min(baseText.length, state.dropOffset));
      if (dropOffset >= sourceStart && dropOffset <= sourceEnd) {
        return false;
      }

      const sourceText = baseText.slice(sourceStart, sourceEnd);
      const textWithoutSource = `${baseText.slice(0, sourceStart)}${baseText.slice(sourceEnd)}`;

      let adjustedDropOffset = dropOffset;
      if (dropOffset > sourceEnd) {
        adjustedDropOffset -= sourceText.length;
      }

      adjustedDropOffset = Math.max(0, Math.min(textWithoutSource.length, adjustedDropOffset));
      const nextText = `${textWithoutSource.slice(0, adjustedDropOffset)}${sourceText}${textWithoutSource.slice(adjustedDropOffset)}`;
      if (nextText === baseText) {
        return false;
      }

      setInputLayerText(element, nextText);
      const caretLogicalOffset = adjustedDropOffset + sourceText.length;
      const caretLayerOffset = mapLogicalOffsetToInputLayerOffset(nextText, caretLogicalOffset);
      setCaretToCodeUnitOffset(element, caretLayerOffset);
      dispatchEditorInputEvent(element);
      syncSelectionAfterInteraction();
      return true;
    },
    [syncSelectionAfterInteraction]
  );

  const syncTextSelectionHighlight = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      setTextSelectionHighlight(null);
      return;
    }

    if (rectangularSelectionRef.current) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const offsets = getSelectionOffsetsInElement(element);
    if (!offsets || offsets.isCollapsed) {
      setTextSelectionHighlight((prev) => (prev === null ? prev : null));
      return;
    }

    const start = Math.min(offsets.start, offsets.end);
    const end = Math.max(offsets.start, offsets.end);

    setTextSelectionHighlight((prev) => {
      if (prev && prev.start === start && prev.end === end) {
        return prev;
      }

      return { start, end };
    });
  }, []);

  const finalizePointerSelectionInteraction = useCallback(() => {
    pointerSelectionActiveRef.current = false;
    setPointerSelectionNativeHighlightMode(false);
  }, [setPointerSelectionNativeHighlightMode]);

  useEffect(() => {
    if (!normalizedRectangularSelection) {
      return;
    }

    setTextSelectionHighlight((prev) => (prev === null ? prev : null));
  }, [normalizedRectangularSelection]);

  const hasSelectionInsideEditor = useCallback(() => {
    if (!contentRef.current) {
      return false;
    }

    if (lineNumberMultiSelection.length > 0) {
      return true;
    }

    if (isTextareaInputElement(contentRef.current)) {
      const start = contentRef.current.selectionStart ?? 0;
      const end = contentRef.current.selectionEnd ?? 0;
      return end > start;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    const range = selection.getRangeAt(0);
    return contentRef.current.contains(range.commonAncestorContainer) && selection.toString().length > 0;
  }, [lineNumberMultiSelection.length]);

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
    usePlainLineRendering,
    isHugeEditableMode,
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
    setLineTokens,
    setEditableSegment,
    setPlainLines,
    setPlainStartLine,
    loadTextFromBackend,
    syncVisibleTokens,
  });


  useEditorPointerFinalizeEffects({
    endScrollbarDragSelectionGuard,
    finalizePointerSelectionInteraction,
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
    selectionChangeRafRef,
    verticalSelectionRef,
    hasSelectionInsideEditor,
    clearVerticalSelectionState,
    handleScroll,
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

  return (
    <div
      ref={containerRef}
      className={`flex-1 w-full h-full overflow-hidden bg-background relative focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/40 editor-syntax-${activeSyntaxKey}`}
      tabIndex={-1}
    >
      <EditorInputLayer
        isHugeEditableMode={isHugeEditableMode}
        contentRef={contentRef}
        scrollContainerRef={scrollContainerRef}
        contentViewportLeftPx={contentViewportLeftPx}
        contentViewportWidth={contentViewportWidth}
        horizontalOverflowMode={horizontalOverflowMode}
        onScroll={handleScroll}
        onHugeScrollablePointerDown={handleHugeScrollablePointerDown}
        tabLineCount={tab.lineCount}
        itemSize={itemSize}
        wordWrap={wordWrap}
        hugeScrollableContentWidth={hugeScrollableContentWidth}
        hugeEditablePaddingTop={hugeEditablePaddingTop}
        hugeEditableSegmentHeightPx={hugeEditableSegmentHeightPx}
        fontFamily={settings.fontFamily}
        renderedFontSizePx={renderedFontSizePx}
        lineHeightPx={lineHeightPx}
        tabSize={tabSize}
        contentTextPadding={contentTextPadding}
        contentTextRightPadding={contentTextRightPadding}
        contentBottomSafetyPadding={contentBottomSafetyPadding}
        onInput={handleInput}
        onEditableKeyDown={handleEditableKeyDown}
        onEditorPointerDown={handleEditorPointerDown}
        onEditorPointerMove={handleEditorPointerMove}
        onEditorPointerLeave={handleEditorPointerLeave}
        onSyncSelectionAfterInteraction={syncSelectionAfterInteraction}
        onEditorContextMenu={handleEditorContextMenu}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />

      <EditorBackdropLayer
        visible={true}
        width={width}
        height={height}
        contentViewportLeftPx={contentViewportLeftPx}
        contentViewportWidth={contentViewportWidth}
        contentBottomSafetyPadding={contentBottomSafetyPadding}
        tabLineCount={tab.lineCount}
        itemSize={itemSize}
        listRef={listRef}
        getListItemSize={getListItemSize}
        onItemsRendered={onItemsRendered}
        isHugeEditableMode={isHugeEditableMode}
        editableSegmentStartLine={editableSegment.startLine}
        usePlainLineRendering={usePlainLineRendering}
        plainStartLine={plainStartLine}
        startLine={startLine}
        lineTokens={lineTokens}
        editableSegmentLines={editableSegmentLines}
        plainLines={plainLines}
        measureRenderedLineHeight={measureRenderedLineHeight}
        wordWrap={wordWrap}
        contentTextPadding={contentTextPadding}
        contentTextRightPadding={contentTextRightPadding}
        fontFamily={settings.fontFamily}
        renderedFontSizePx={renderedFontSizePx}
        lineHeightPx={lineHeightPx}
        hugeScrollableContentWidth={hugeScrollableContentWidth}
        diffHighlightLineSet={diffHighlightLineSet}
        outlineFlashLine={outlineFlashLine}
        lineNumberMultiSelectionSet={lineNumberMultiSelectionSet}
        highlightCurrentLine={highlightCurrentLine}
        activeLineNumber={activeLineNumber}
        tabSize={tabSize}
        renderHighlightedPlainLine={renderHighlightedPlainLine}
        renderHighlightedTokens={renderHighlightedTokens}
      />

      <EditorLineNumberGutter
        visible={showLineNumbers}
        width={width}
        height={height}
        tabLineCount={tab.lineCount}
        lineNumberColumnWidthPx={lineNumberColumnWidthPx}
        lineNumberVirtualItemCount={lineNumberVirtualItemCount}
        itemSize={itemSize}
        lineHeightPx={lineHeightPx}
        lineNumberFontSizePx={lineNumberFontSizePx}
        fontFamily={settings.fontFamily}
        lineNumberListRef={lineNumberListRef}
        diffHighlightLineSet={diffHighlightLineSet}
        bookmarks={bookmarks}
        lineNumberMultiSelectionSet={lineNumberMultiSelectionSet}
        getLineNumberListItemSize={getLineNumberListItemSize}
        getLineNumberFromGutterElement={getLineNumberFromGutterElement}
        onLineNumberWheel={handleLineNumberWheel}
        onLineNumberDoubleClick={handleLineNumberDoubleClick}
        onLineNumberClick={handleLineNumberClick}
        onLineNumberContextMenu={handleLineNumberContextMenu}
      />

      <EditorContextMenu
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
        onSelectCurrentLine={handleSelectCurrentLineFromContext}
        onAddCurrentLineBookmark={handleAddCurrentLineBookmarkFromContext}
        onEditorAction={handleEditorContextMenuAction}
        isEditorActionDisabled={isEditorContextMenuActionDisabled}
        onUpdateSubmenuVerticalAlignment={updateSubmenuVerticalAlignment}
        onCleanup={handleCleanupDocumentFromContext}
        onConvert={handleConvertSelectionFromContext}
        onAddBookmark={handleAddBookmarkFromContext}
        onRemoveBookmark={handleRemoveBookmarkFromContext}
      />

      <EditorBase64DecodeToast
        visible={showBase64DecodeErrorToast}
        message={base64DecodeFailedToastLabel}
      />
    </div>
  );
}

