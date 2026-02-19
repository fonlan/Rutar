import type { CSSProperties, MutableRefObject } from 'react';

interface EditorInputLayerProps {
  isHugeEditableMode: boolean;
  contentRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  contentViewportLeftPx: number;
  contentViewportWidth: number;
  horizontalOverflowMode: CSSProperties['overflowX'];
  onScroll: (event: any) => void;
  onHugeScrollablePointerDown: (event: any) => void;
  tabLineCount: number;
  itemSize: number;
  wordWrap: boolean;
  hugeScrollableContentWidth: number;
  hugeEditablePaddingTop: string;
  hugeEditableSegmentHeightPx: string;
  fontFamily: string;
  renderedFontSizePx: number;
  lineHeightPx: number;
  tabSize: number;
  contentTextPadding: string;
  contentTextRightPadding: string;
  contentBottomSafetyPadding: string;
  onInput: (event: any) => void;
  onEditableKeyDown: (event: any) => void;
  onEditorPointerDown: (event: any) => void;
  onEditorPointerMove: (event: any) => void;
  onEditorPointerLeave: (event: any) => void;
  onSyncSelectionAfterInteraction: (event: any) => void;
  onEditorContextMenu: (event: any) => void;
  onCompositionStart: (event: any) => void;
  onCompositionEnd: (event: any) => void;
}

export function EditorInputLayer({
  isHugeEditableMode,
  contentRef,
  scrollContainerRef,
  contentViewportLeftPx,
  contentViewportWidth,
  horizontalOverflowMode,
  onScroll,
  onHugeScrollablePointerDown,
  tabLineCount,
  itemSize,
  wordWrap,
  hugeScrollableContentWidth,
  hugeEditablePaddingTop,
  hugeEditableSegmentHeightPx,
  fontFamily,
  renderedFontSizePx,
  lineHeightPx,
  tabSize,
  contentTextPadding,
  contentTextRightPadding,
  contentBottomSafetyPadding,
  onInput,
  onEditableKeyDown,
  onEditorPointerDown,
  onEditorPointerMove,
  onEditorPointerLeave,
  onSyncSelectionAfterInteraction,
  onEditorContextMenu,
  onCompositionStart,
  onCompositionEnd,
}: EditorInputLayerProps) {
  if (isHugeEditableMode) {
    return (
      <div
        ref={scrollContainerRef}
        className="absolute top-0 bottom-0 right-0 z-20 outline-none overflow-auto editor-scroll-stable"
        style={{
          left: `${contentViewportLeftPx}px`,
          width: `${contentViewportWidth}px`,
          overflowX: horizontalOverflowMode,
          overflowY: 'auto',
        }}
        onScroll={onScroll}
        onPointerDown={onHugeScrollablePointerDown}
      >
        <div
          className="relative"
          style={{
            minHeight: `${Math.max(1, tabLineCount) * itemSize}px`,
            minWidth: wordWrap
              ? '100%'
              : `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`,
          }}
        >
          <textarea
            ref={contentRef}
            className="absolute left-0 right-0 editor-input-layer"
            style={{
              top: hugeEditablePaddingTop,
              height: hugeEditableSegmentHeightPx,
              width: wordWrap ? '100%' : `${Math.max(contentViewportWidth, hugeScrollableContentWidth)}px`,
              right: 'auto',
              fontFamily,
              fontSize: `${renderedFontSizePx}px`,
              lineHeight: `${lineHeightPx}px`,
              whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
              tabSize,
              paddingLeft: contentTextPadding,
              paddingRight: contentTextRightPadding,
              paddingBottom: contentBottomSafetyPadding,
              resize: 'none',
              overflowX: 'hidden',
              overflowY: 'hidden',
            }}
            wrap={wordWrap ? 'soft' : 'off'}
            onInput={onInput}
            onKeyDown={onEditableKeyDown}
            onPointerDown={onEditorPointerDown}
            onPointerMove={onEditorPointerMove}
            onPointerLeave={onEditorPointerLeave}
            onKeyUp={onSyncSelectionAfterInteraction}
            onPointerUp={onSyncSelectionAfterInteraction}
            onFocus={onSyncSelectionAfterInteraction}
            onContextMenu={onEditorContextMenu}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  return (
    <textarea
      ref={contentRef}
      className="absolute top-0 bottom-0 right-0 z-20 outline-none overflow-auto editor-input-layer editor-scroll-stable"
      style={{
        left: `${contentViewportLeftPx}px`,
        width: `${contentViewportWidth}px`,
        overflowX: horizontalOverflowMode,
        overflowY: 'auto',
        fontFamily,
        fontSize: `${renderedFontSizePx}px`,
        lineHeight: `${lineHeightPx}px`,
        whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
        tabSize,
        paddingLeft: contentTextPadding,
        paddingRight: contentTextRightPadding,
        paddingBottom: contentBottomSafetyPadding,
        resize: 'none',
      }}
      wrap={wordWrap ? 'soft' : 'off'}
      onInput={onInput}
      onKeyDown={onEditableKeyDown}
      onScroll={onScroll}
      onPointerDown={onEditorPointerDown}
      onPointerMove={onEditorPointerMove}
      onPointerLeave={onEditorPointerLeave}
      onKeyUp={onSyncSelectionAfterInteraction}
      onPointerUp={onSyncSelectionAfterInteraction}
      onFocus={onSyncSelectionAfterInteraction}
      onContextMenu={onEditorContextMenu}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      spellCheck={false}
    />
  );
}
