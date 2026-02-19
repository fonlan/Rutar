// @ts-nocheck
import { invoke } from '@tauri-apps/api/core';
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { detectSyntaxKeyFromTab, getLineCommentPrefixForSyntaxKey } from '@/lib/syntax';
import { FileTab, useStore } from '@/store/useStore';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { t } from '@/i18n';
import {
  EditorContextMenu,
  type EditorCleanupAction,
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
  type EditorInputElement,
  type EditorSegmentState,
  type EditorSubmenuVerticalAlign,
  type PairHighlightPosition,
  type RectangularSelectionState,
  type ReplaceRectangularSelectionResultPayload,
  type SearchHighlightState,
  type SyntaxToken,
  type TextDragMoveState,
  type TextSelectionState,
  type ToggleLineCommentsBackendResult,
  type VerticalSelectionState,
} from './Editor.types';
import { resolveTokenTypeClass } from './editorTokenClass';
import { editorTestUtils } from './editorUtils';
import { useEditorClipboardSelectionEffects } from './useEditorClipboardSelectionEffects';
import { useEditorContentSync } from './useEditorContentSync';
import { useEditorContextMenuConfig } from './useEditorContextMenuConfig';
import { useEditorGlobalPointerEffects } from './useEditorGlobalPointerEffects';
import { useEditorHugeEditableLayout } from './useEditorHugeEditableLayout';
import { useEditorLayoutConfig } from './useEditorLayoutConfig';
import { useEditorLineNumberInteractions } from './useEditorLineNumberInteractions';
import { useEditorLineNumberMultiSelection } from './useEditorLineNumberMultiSelection';
import { useEditorLineHighlightRenderers } from './useEditorLineHighlightRenderers';
import { useEditorLocalLifecycleEffects } from './useEditorLocalLifecycleEffects';
import { useEditorNavigationAndRefreshEffects } from './useEditorNavigationAndRefreshEffects';
import { useEditorPointerInteractions } from './useEditorPointerInteractions';
import { useEditorRowMeasurement } from './useEditorRowMeasurement';
import { useEditorSelectionStateSync } from './useEditorSelectionStateSync';
import { useEditorScrollSyncEffects } from './useEditorScrollSyncEffects';
import { useEditorTextMeasurement } from './useEditorTextMeasurement';
import { useEditorUiInteractionEffects } from './useEditorUiInteractionEffects';

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

  const releaseHugeEditableWindowLock = useCallback(() => {
    hugeWindowLockedRef.current = false;

    if (!isHugeEditableMode) {
      hugeWindowFollowScrollOnUnlockRef.current = false;
      return;
    }

    if (!hugeWindowFollowScrollOnUnlockRef.current) {
      return;
    }

    hugeWindowFollowScrollOnUnlockRef.current = false;
    void syncVisibleTokens(Math.max(1, tab.lineCount));
  }, [isHugeEditableMode, syncVisibleTokens, tab.lineCount]);

  const scheduleHugeEditableWindowUnlock = useCallback(() => {
    if (!isHugeEditableMode) {
      return;
    }

    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
    }

    hugeWindowUnlockTimerRef.current = setTimeout(() => {
      hugeWindowUnlockTimerRef.current = null;
      releaseHugeEditableWindowLock();
    }, HUGE_EDITABLE_WINDOW_UNLOCK_MS);
  }, [isHugeEditableMode, releaseHugeEditableWindowLock]);
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
    []
  );

  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent<EditorInputElement>) => {
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

      setSubmenuVerticalAlignments({ ...DEFAULT_SUBMENU_VERTICAL_ALIGNMENTS });
      setSubmenuMaxHeights({ ...DEFAULT_SUBMENU_MAX_HEIGHTS });

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
    [activeLineNumber, hasSelectionInsideEditor, normalizedRectangularSelection]
  );

  const handleLineNumberContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, line: number) => {
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
    []
  );

  const runEditorContextCommand = useCallback((action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
    if (!contentRef.current) {
      return false;
    }

    contentRef.current.focus();

    if (normalizedRectangularSelection) {
      if (action === 'copy') {
        const text = normalizeSegmentText(getEditableText(contentRef.current));
        const content = getRectangularSelectionText(text);
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(content).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }
        return true;
      }

      if (action === 'cut') {
        const text = normalizeSegmentText(getEditableText(contentRef.current));
        const content = getRectangularSelectionText(text);
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(content).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }
        void replaceRectangularSelection('');
        return true;
      }

      if (action === 'delete') {
        void replaceRectangularSelection('');
        return true;
      }

      if (action === 'paste') {
        return false;
      }

      if (action === 'selectAll') {
        clearRectangularSelection();
      }
    }

    if (action === 'selectAll') {
      const text = getEditableText(contentRef.current);
      setSelectionToCodeUnitOffsets(contentRef.current, 0, text.length);
      return true;
    }

    if (action === 'paste') {
      return false;
    }

    if (action === 'delete') {
      const deleted = replaceSelectionWithText(contentRef.current, '');
      if (deleted) {
        dispatchEditorInputEvent(contentRef.current);
      }
      return deleted;
    }

    if (action === 'copy' || action === 'cut') {
      const selected = getSelectedEditorText();
      if (!selected) {
        return false;
      }

      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(selected).catch(() => {
          console.warn('Failed to write selection to clipboard.');
        });
      }

      if (action === 'cut') {
        const cut = replaceSelectionWithText(contentRef.current, '');
        if (cut) {
          dispatchEditorInputEvent(contentRef.current);
        }
        return cut;
      }

      return true;
    }

    return false;
  }, [
    clearRectangularSelection,
    getRectangularSelectionText,
    getSelectedEditorText,
    normalizedRectangularSelection,
    replaceRectangularSelection,
  ]);

  const tryPasteTextIntoEditor = useCallback(
    (text: string) => {
      if (!contentRef.current) {
        return false;
      }

      const inserted = replaceSelectionWithText(contentRef.current, text);
      if (!inserted) {
        return false;
      }

      dispatchEditorInputEvent(contentRef.current);
      syncSelectionAfterInteraction();
      window.requestAnimationFrame(() => {
        handleScroll();
        window.requestAnimationFrame(() => {
          handleScroll();
        });
      });
      return true;
    },
    [handleScroll, syncSelectionAfterInteraction]
  );

  const isEditorContextMenuActionDisabled = useCallback(
    (action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
      const hasSelection = !!editorContextMenu?.hasSelection;

      switch (action) {
        case 'copy':
          return !hasSelection;
        case 'cut':
        case 'delete':
          return !hasSelection;
        case 'paste':
          return false;
        case 'selectAll':
          return false;
        default:
          return false;
      }
    },
    [editorContextMenu?.hasSelection]
  );

  const handleEditorContextMenuAction = useCallback(
    async (action: 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll') => {
      if (isEditorContextMenuActionDisabled(action)) {
        setEditorContextMenu(null);
        return;
      }

      if ((action === 'copy' || action === 'cut' || action === 'delete') && lineNumberMultiSelection.length > 0) {
        if (action === 'copy') {
          if (contentRef.current) {
            const text = normalizeSegmentText(getEditableText(contentRef.current));
            const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn('Failed to write line selection to clipboard.');
              });
            }
          }

          setEditorContextMenu(null);
          return;
        }

        await applyLineNumberMultiSelectionEdit(action === 'cut' ? 'cut' : 'delete');
        setEditorContextMenu(null);
        return;
      }

      if (action === 'selectAll' && lineNumberMultiSelection.length > 0) {
        clearLineNumberMultiSelection();
      }

      if (action === 'paste') {
        let pasted = false;

        try {
          const clipboardText = await readClipboardText();
          pasted = tryPasteTextIntoEditor(clipboardText);
        } catch (error) {
          console.warn('Failed to read clipboard text via Tauri clipboard plugin:', error);
        }

        if (!pasted) {
          const commandSucceeded = document.execCommand('paste');
          if (!commandSucceeded) {
            console.warn('Paste command blocked. Use Ctrl+V in editor.');
          }
        }

        setEditorContextMenu(null);
        return;
      }

      if ((action === 'copy' || action === 'cut') && normalizedRectangularSelection) {
        const selected = await getRectangularSelectionTextFromBackend();
        if (!selected) {
          setEditorContextMenu(null);
          return;
        }

        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(selected).catch(() => {
            console.warn('Failed to write rectangular selection to clipboard.');
          });
        }

        if (action === 'cut') {
          void replaceRectangularSelection('');
          syncSelectionAfterInteraction();
        }

        setEditorContextMenu(null);
        return;
      }

      const succeeded = runEditorContextCommand(action);

      setEditorContextMenu(null);
      if (succeeded) {
        syncSelectionAfterInteraction();
      }
    },
    [
      applyLineNumberMultiSelectionEdit,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      getRectangularSelectionTextFromBackend,
      isEditorContextMenuActionDisabled,
      lineNumberMultiSelection,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      runEditorContextCommand,
      syncSelectionAfterInteraction,
      tryPasteTextIntoEditor,
    ]
  );

  const hasContextBookmark =
    editorContextMenu !== null && bookmarks.includes(editorContextMenu.lineNumber);

  const handleAddBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    addBookmark(tab.id, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [addBookmark, editorContextMenu, tab.id]);

  const handleRemoveBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu) {
      return;
    }

    removeBookmark(tab.id, editorContextMenu.lineNumber);
    setEditorContextMenu(null);
  }, [editorContextMenu, removeBookmark, tab.id]);

  const handleLineNumberDoubleClick = useCallback(
    (line: number) => {
      const safeLine = Math.max(1, Math.floor(line));
      const hasBookmark = bookmarks.includes(safeLine);

      toggleBookmark(tab.id, safeLine);

      if (!hasBookmark && !bookmarkSidebarOpen) {
        toggleBookmarkSidebar(true);
      }
    },
    [bookmarkSidebarOpen, bookmarks, tab.id, toggleBookmark, toggleBookmarkSidebar]
  );
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

  const handleLineNumberWheel = useCallback(
    (event) => {
      if (event.ctrlKey) {
        return;
      }

      const scrollElement = getRectangularSelectionScrollElement();
      if (!scrollElement) {
        return;
      }

      const hasVerticalDelta = Math.abs(event.deltaY) > 0.001;
      const horizontalDelta = Math.abs(event.deltaX) > 0.001 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      const hasHorizontalDelta = Math.abs(horizontalDelta) > 0.001;

      if (!hasVerticalDelta && !hasHorizontalDelta) {
        return;
      }

      event.preventDefault();

      if (hasVerticalDelta) {
        const maxTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        const targetTop = Math.max(0, Math.min(maxTop, alignScrollOffset(scrollElement.scrollTop + event.deltaY)));
        if (Math.abs(scrollElement.scrollTop - targetTop) > 0.001) {
          scrollElement.scrollTop = targetTop;
        }
      }

      if (hasHorizontalDelta) {
        const maxLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
        const targetLeft = Math.max(
          0,
          Math.min(maxLeft, alignScrollOffset(scrollElement.scrollLeft + horizontalDelta))
        );

        if (Math.abs(scrollElement.scrollLeft - targetLeft) > 0.001) {
          scrollElement.scrollLeft = targetLeft;
        }
      }
    },
    [getRectangularSelectionScrollElement]
  );

  const flushPendingSync = useCallback(async () => {
    if (syncInFlightRef.current || isComposingRef.current || !contentRef.current) {
      return;
    }

    const baseText = syncedTextRef.current;
    const targetText = normalizeSegmentText(getEditableText(contentRef.current));
    pendingSyncRequestedRef.current = false;

    if (isHugeEditableMode) {
      const segment = editableSegmentRef.current;
      if (segment.endLine <= segment.startLine) {
        return;
      }

      hugeWindowLockedRef.current = true;

      if (baseText === targetText) {
        syncedTextRef.current = targetText;
        scheduleHugeEditableWindowUnlock();
        return;
      }

      syncInFlightRef.current = true;

      try {
        const newLineCount = await invoke<number>('replace_line_range', {
          id: tab.id,
          startLine: segment.startLine,
          endLine: segment.endLine,
          newText: targetText,
        });

        const newLineCountSafe = Math.max(1, newLineCount);
        const currentScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        const viewportLines = Math.max(1, Math.ceil((height || 0) / itemSize));
        const currentLine = Math.max(0, Math.floor(currentScrollTop / itemSize));
        const buffer = largeFetchBuffer;
        const nextStart = Math.max(0, currentLine - buffer);
        const nextEnd = Math.max(nextStart + 1, Math.min(newLineCountSafe, currentLine + viewportLines + buffer));

        const nextSegment: EditorSegmentState = {
          startLine: nextStart,
          endLine: nextEnd,
          text: targetText,
        };

        editableSegmentRef.current = nextSegment;
        setEditableSegment(nextSegment);
        syncedTextRef.current = targetText;
        suppressExternalReloadRef.current = true;
        updateTab(tab.id, { lineCount: newLineCountSafe, isDirty: true });
        dispatchDocumentUpdated(tab.id);

        if (contentRef.current) {
          const alignedTop = alignScrollOffset(currentScrollTop);
          if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - alignedTop) > 0.001) {
            scrollContainerRef.current.scrollTop = alignedTop;
          }
        }
      } catch (e) {
        console.error('Large segment sync error:', e);
      } finally {
        syncInFlightRef.current = false;
        scheduleHugeEditableWindowUnlock();

        if (pendingSyncRequestedRef.current && !isComposingRef.current) {
          void flushPendingSync();
        }
      }

      return;
    }

    const diff = buildCodeUnitDiff(baseText, targetText);

    if (!diff) {
      syncedTextRef.current = targetText;
      return;
    }

    syncInFlightRef.current = true;

    try {
      const startChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.start);
      const endChar = codeUnitOffsetToUnicodeScalarIndex(baseText, diff.end);

      const newLineCount = await invoke<number>('edit_text', {
        id: tab.id,
        startChar,
        endChar,
        newText: diff.newText,
      });

      syncedTextRef.current = targetText;
      suppressExternalReloadRef.current = true;
      updateTab(tab.id, { lineCount: newLineCount, isDirty: true });
      dispatchDocumentUpdated(tab.id);
      await syncVisibleTokens(newLineCount);
    } catch (e) {
      console.error('Edit sync error:', e);
    } finally {
      syncInFlightRef.current = false;

      if (pendingSyncRequestedRef.current && !isComposingRef.current) {
        void flushPendingSync();
      }
    }
  }, [
    height,
    isHugeEditableMode,
    itemSize,
    largeFetchBuffer,
    scheduleHugeEditableWindowUnlock,
    syncVisibleTokens,
    tab.id,
    updateTab,
  ]);

  const handleCleanupDocumentFromContext = useCallback(
    async (action: EditorCleanupAction) => {
      setEditorContextMenu(null);

      try {
        await flushPendingSync();

        const newLineCount = await invoke<number>('cleanup_document', {
          id: tab.id,
          action,
        });

        const safeLineCount = Math.max(1, newLineCount);
        updateTab(tab.id, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        dispatchDocumentUpdated(tab.id);

        await loadTextFromBackend();
        await syncVisibleTokens(safeLineCount);
        syncSelectionAfterInteraction();
      } catch (error) {
        console.error('Failed to cleanup document:', error);
      }
    },
    [
      flushPendingSync,
      loadTextFromBackend,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tab.id,
      updateTab,
    ]
  );

  const triggerBase64DecodeErrorToast = useCallback(() => {
    if (base64DecodeErrorToastTimerRef.current !== null) {
      window.clearTimeout(base64DecodeErrorToastTimerRef.current);
    }

    setShowBase64DecodeErrorToast(true);
    base64DecodeErrorToastTimerRef.current = window.setTimeout(() => {
      setShowBase64DecodeErrorToast(false);
      base64DecodeErrorToastTimerRef.current = null;
    }, 2200);
  }, []);

  const handleConvertSelectionFromContext = useCallback(
    async (
      action: 'base64_encode' | 'base64_decode' | 'copy_base64_encode' | 'copy_base64_decode'
    ) => {
      const shouldCopyResult = action === 'copy_base64_encode' || action === 'copy_base64_decode';
      const shouldDecode = action === 'base64_decode' || action === 'copy_base64_decode';

      if (!editorContextMenu?.hasSelection || !contentRef.current) {
        setEditorContextMenu(null);
        return;
      }

      const selectedText = normalizedRectangularSelection
        ? await getRectangularSelectionTextFromBackend()
        : getSelectedEditorText();
      if (!selectedText) {
        setEditorContextMenu(null);
        return;
      }

      let nextText = '';

      try {
        nextText = await invoke<string>('convert_text_base64', {
          text: selectedText,
          action: shouldDecode ? 'base64_decode' : 'base64_encode',
        });
      } catch (error) {
        if (shouldDecode) {
          triggerBase64DecodeErrorToast();
        } else {
          console.error('Failed to convert Base64 text:', error);
        }
        setEditorContextMenu(null);
        return;
      }

      if (shouldCopyResult) {
        void writePlainTextToClipboard(nextText).catch((error) => {
          console.warn('Failed to write conversion result to clipboard:', error);
        });
        setEditorContextMenu(null);
        return;
      }

      if (normalizedRectangularSelection) {
        void replaceRectangularSelection(nextText);
      } else {
        const replaced = replaceSelectionWithText(contentRef.current, nextText);
        if (replaced) {
          dispatchEditorInputEvent(contentRef.current);
          syncSelectionAfterInteraction();
        }
      }

      setEditorContextMenu(null);
    },
    [
      editorContextMenu?.hasSelection,
      getRectangularSelectionTextFromBackend,
      getSelectedEditorText,
      normalizedRectangularSelection,
      replaceRectangularSelection,
      triggerBase64DecodeErrorToast,
      syncSelectionAfterInteraction,
    ]
  );

  const queueTextSync = useCallback(
    () => {
      pendingSyncRequestedRef.current = true;

      if (isHugeEditableMode) {
        hugeWindowLockedRef.current = true;
      }

      if (editTimeout.current) {
        clearTimeout(editTimeout.current);
      }

      const debounceMs =
        tab.lineCount >= LARGE_FILE_PLAIN_RENDER_LINE_THRESHOLD
          ? LARGE_FILE_EDIT_SYNC_DEBOUNCE_MS
          : NORMAL_EDIT_SYNC_DEBOUNCE_MS;

      editTimeout.current = setTimeout(() => {
        void flushPendingSync();
      }, debounceMs);
    },
    [flushPendingSync, isHugeEditableMode, tab.lineCount]
  );

  const handleInput = useCallback(
    () => {
      clearVerticalSelectionState();

      if (contentRef.current && !isComposingRef.current) {
        normalizeInputLayerDom(contentRef.current);
        syncHugeScrollableContentWidth();
      }

      if (!tab.isDirty) {
        updateTab(tab.id, { isDirty: true });
      }

      syncSelectionAfterInteraction();
      window.requestAnimationFrame(handleScroll);

      if (!isComposingRef.current) {
        queueTextSync();
      }
    },
    [
      clearVerticalSelectionState,
      handleScroll,
      tab.id,
      tab.isDirty,
      updateTab,
      queueTextSync,
      syncHugeScrollableContentWidth,
      syncSelectionAfterInteraction,
    ]
  );

  const handleRectangularSelectionInputByKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!normalizedRectangularSelection || event.isComposing) {
        return false;
      }

      const key = event.key;
      const lower = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === 'c' || lower === 'x' || lower === 'v') {
          return false;
        }

        if (lower === 'a') {
          event.preventDefault();
          event.stopPropagation();
          clearRectangularSelection();
          return true;
        }

        return false;
      }

      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearRectangularSelection();
        return true;
      }

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection('');
        return true;
      }

      if (key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection('\t');
        return true;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        void replaceRectangularSelection(key);
        return true;
      }

      return false;
    },
    [clearRectangularSelection, normalizedRectangularSelection, replaceRectangularSelection]
  );

  const insertTextAtSelection = useCallback((text: string) => {
    const element = contentRef.current;
    if (!element) {
      return false;
    }

    const selectionOffsets = getSelectionOffsetsInElement(element);
    if (!selectionOffsets) {
      return false;
    }

    if (isTextareaInputElement(element)) {
      const start = selectionOffsets.start;
      const end = selectionOffsets.end;
      const nextText = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
      element.setRangeText(text, start, end, 'end');
      if (element.value !== nextText) {
        element.value = nextText;
      }
      return true;
    }

    const currentText = getEditableText(element);
    const nextText = `${currentText.slice(0, selectionOffsets.start)}${text}${currentText.slice(selectionOffsets.end)}`;
    setInputLayerText(element, nextText);
    const logicalNextOffset = selectionOffsets.start + text.length;
    const layerNextOffset = mapLogicalOffsetToInputLayerOffset(nextText, logicalNextOffset);
    setCaretToCodeUnitOffset(element, layerNextOffset);
    return true;
  }, []);

  const toggleSelectedLinesComment = useCallback(
    async (event: React.KeyboardEvent<HTMLDivElement>) => {
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
          id: tab.id,
          startChar,
          endChar,
          isCollapsed: selectionOffsets.isCollapsed,
          prefix,
        });

        if (!result.changed) {
          return;
        }

        const safeLineCount = Math.max(1, result.lineCount ?? tab.lineCount);
        updateTab(tab.id, {
          lineCount: safeLineCount,
          isDirty: true,
        });
        dispatchDocumentUpdated(tab.id);

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
      loadTextFromBackend,
      syncSelectionAfterInteraction,
      syncVisibleTokens,
      tab.id,
      tab.lineCount,
      updateTab,
    ]
  );

  const handleEditableKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (handleRectangularSelectionInputByKey(event)) {
        return;
      }

      if (isVerticalSelectionShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        const direction =
          event.key === 'ArrowUp'
            ? 'up'
            : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
            ? 'left'
            : 'right';

        if (!rectangularSelectionRef.current) {
          beginRectangularSelectionFromCaret();
        }

        void nudgeRectangularSelectionByKey(direction as 'up' | 'down' | 'left' | 'right');
        return;
      }

      if (isToggleLineCommentShortcut(event)) {
        clearVerticalSelectionState();
        void toggleSelectedLinesComment(event);
        return;
      }

      if (event.key !== 'Enter' || event.isComposing) {
        if (event.key === 'Delete' && lineNumberMultiSelection.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('delete');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'x' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          void applyLineNumberMultiSelectionEdit('cut');
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'c' &&
          lineNumberMultiSelection.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          const element = contentRef.current;
          if (element) {
            const text = normalizeSegmentText(getEditableText(element));
            const selected = buildLineNumberSelectionRangeText(text, lineNumberMultiSelection);
            if (selected && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(selected).catch(() => {
                console.warn('Failed to write line selection to clipboard.');
              });
            }
          }
          return;
        }

        if (
          normalizedRectangularSelection &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        ) {
          clearRectangularSelection();
        }
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey && event.key !== 'Shift') {
          clearLineNumberMultiSelection();
        }
        if (!event.shiftKey || event.key !== 'Shift') {
          clearVerticalSelectionState();
        }
        return;
      }

      clearVerticalSelectionState();
      clearRectangularSelection();
      clearLineNumberMultiSelection();
      event.preventDefault();
      event.stopPropagation();
      if (insertTextAtSelection('\n')) {
        handleInput();
      }
    },
    [
      applyLineNumberMultiSelectionEdit,
      buildLineNumberSelectionRangeText,
      clearLineNumberMultiSelection,
      clearRectangularSelection,
      clearVerticalSelectionState,
      beginRectangularSelectionFromCaret,
      expandVerticalSelection,
      lineNumberMultiSelection,
      handleInput,
      handleRectangularSelectionInputByKey,
      insertTextAtSelection,
      nudgeRectangularSelectionByKey,
      normalizedRectangularSelection,
      toggleSelectedLinesComment,
    ]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;

    if (isHugeEditableMode) {
      hugeWindowLockedRef.current = true;
    }
  }, [isHugeEditableMode]);

  const handleCompositionEnd = useCallback(
    () => {
      isComposingRef.current = false;
      queueTextSync();
    },
    [queueTextSync]
  );

  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }) => {
      if (isHugeEditableMode && (pendingSyncRequestedRef.current || syncInFlightRef.current || isComposingRef.current)) {
        return;
      }

      const buffer = largeFetchBuffer;
      const start = Math.max(0, visibleStartIndex - buffer);
      const end = Math.min(tab.lineCount, visibleStopIndex + buffer);

      const cachedCount = isHugeEditableMode
        ? Math.max(0, editableSegment.endLine - editableSegment.startLine)
        : usePlainLineRendering
        ? plainLines.length
        : lineTokens.length;
      const cachedStart = isHugeEditableMode
        ? editableSegment.startLine
        : usePlainLineRendering
        ? plainStartLine
        : startLine;
      const hasNoCache = isHugeEditableMode
        ? editableSegment.endLine <= editableSegment.startLine
        : usePlainLineRendering
        ? plainLines.length === 0
        : lineTokens.length === 0;
      const isOutside = hasNoCache || start < cachedStart || end > cachedStart + cachedCount;

      if (isOutside) {
        if (requestTimeout.current) clearTimeout(requestTimeout.current);
        const debounceMs = isHugeEditableMode
          ? HUGE_EDITABLE_FETCH_DEBOUNCE_MS
          : tab.largeFileMode
          ? LARGE_FILE_FETCH_DEBOUNCE_MS
          : NORMAL_FILE_FETCH_DEBOUNCE_MS;
        requestTimeout.current = setTimeout(
          () => syncVisibleTokens(tab.lineCount, {
            start: visibleStartIndex,
            stop: visibleStopIndex,
          }),
          debounceMs
        );
      }
    },
    [
      editableSegment.endLine,
      editableSegment.startLine,
      isHugeEditableMode,
      isComposingRef,
      largeFetchBuffer,
      usePlainLineRendering,
      plainLines.length,
      plainStartLine,
      lineTokens.length,
      pendingSyncRequestedRef,
      lineTokens.length,
      syncInFlightRef,
      startLine,
      syncVisibleTokens,
      tab.lineCount,
      tab.largeFileMode,
    ]
  );

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

  const handleSelectCurrentLineFromContext = useCallback(() => {
    if (!editorContextMenu || editorContextMenu.target !== 'lineNumber') {
      return;
    }

    const targetLine = lineNumberContextLineRef.current ?? editorContextMenu.lineNumber;
    handleLineNumberClick(targetLine, false, false);
    setEditorContextMenu(null);
  }, [editorContextMenu, handleLineNumberClick]);

  const handleAddCurrentLineBookmarkFromContext = useCallback(() => {
    if (!editorContextMenu || editorContextMenu.target !== 'lineNumber') {
      return;
    }

    const targetLine = lineNumberContextLineRef.current ?? editorContextMenu.lineNumber;
    handleLineNumberDoubleClick(targetLine);
    setEditorContextMenu(null);
  }, [editorContextMenu, handleLineNumberDoubleClick]);

  useEffect(() => {
    let cancelled = false;

    initializedRef.current = false;
    suppressExternalReloadRef.current = false;
    syncInFlightRef.current = false;
    pendingSyncRequestedRef.current = false;
    hugeWindowLockedRef.current = false;
    hugeWindowFollowScrollOnUnlockRef.current = false;
    if (hugeWindowUnlockTimerRef.current) {
      clearTimeout(hugeWindowUnlockTimerRef.current);
      hugeWindowUnlockTimerRef.current = null;
    }
    syncedTextRef.current = '';
    setLineTokens([]);
    editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
    setEditableSegment({ startLine: 0, endLine: 0, text: '' });

    const bootstrap = async () => {
      try {
        await loadTextFromBackend();
        if (cancelled) return;

        await syncVisibleTokens(Math.max(1, tab.lineCount));
        if (!cancelled) {
          initializedRef.current = true;
        }
      } catch (e) {
        console.error('Failed to load file text:', e);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      if (editTimeout.current) clearTimeout(editTimeout.current);
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    };
  }, [tab.id, loadTextFromBackend, syncVisibleTokens]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    if (suppressExternalReloadRef.current) {
      suppressExternalReloadRef.current = false;
      return;
    }

    const syncExternalChange = async () => {
      try {
        await loadTextFromBackend();
        await syncVisibleTokens(Math.max(1, tab.lineCount));
      } catch (e) {
        console.error('Failed to sync external edit:', e);
      }
    };

    syncExternalChange();
  }, [tab.lineCount, loadTextFromBackend, syncVisibleTokens]);

  useEffect(() => {
    if (!usePlainLineRendering) {
      setPlainLines([]);
      setPlainStartLine(0);
    }

    if (!isHugeEditableMode) {
      editableSegmentRef.current = { startLine: 0, endLine: 0, text: '' };
      setEditableSegment({ startLine: 0, endLine: 0, text: '' });
      hugeWindowLockedRef.current = false;
      hugeWindowFollowScrollOnUnlockRef.current = false;
      if (hugeWindowUnlockTimerRef.current) {
        clearTimeout(hugeWindowUnlockTimerRef.current);
        hugeWindowUnlockTimerRef.current = null;
      }
    }

  }, [isHugeEditableMode, usePlainLineRendering]);


  useEffect(() => {
    window.addEventListener('pointerup', endScrollbarDragSelectionGuard);
    window.addEventListener('pointercancel', endScrollbarDragSelectionGuard);
    window.addEventListener('blur', endScrollbarDragSelectionGuard);

    return () => {
      window.removeEventListener('pointerup', endScrollbarDragSelectionGuard);
      window.removeEventListener('pointercancel', endScrollbarDragSelectionGuard);
      window.removeEventListener('blur', endScrollbarDragSelectionGuard);
    };
  }, [endScrollbarDragSelectionGuard]);

  useEffect(() => {
    window.addEventListener('pointerup', finalizePointerSelectionInteraction);
    window.addEventListener('pointercancel', finalizePointerSelectionInteraction);
    window.addEventListener('blur', finalizePointerSelectionInteraction);

    return () => {
      window.removeEventListener('pointerup', finalizePointerSelectionInteraction);
      window.removeEventListener('pointercancel', finalizePointerSelectionInteraction);
      window.removeEventListener('blur', finalizePointerSelectionInteraction);
    };
  }, [finalizePointerSelectionInteraction]);

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

