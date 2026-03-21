import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import type { EditorInputElement, EditorSegmentState } from "./Editor.types";
import { useEditorLineHighlightRenderers } from "./useEditorLineHighlightRenderers";
import { editorTestUtils } from "./editorUtils";

const { getCodeUnitOffsetFromLineColumn, appendClassName } = editorTestUtils;

let latestRenderers: ReturnType<typeof useEditorLineHighlightRenderers> | null = null;
const getEditableTextMock = vi.fn((element: EditorInputElement) =>
  "value" in element ? (element.value || "") : (element.textContent || ""),
);
const normalizeSegmentTextMock = vi.fn((value: string) => value);

function HookHarness() {
  const contentRef = useRef<HTMLTextAreaElement | null>(document.createElement("textarea"));
  const editableSegmentRef = useRef<EditorSegmentState>({
    startLine: 0,
    endLine: 3,
    text: "alpha\nbeta\n",
  });

  if (contentRef.current) {
    contentRef.current.value = "alpha\nbeta\n";
  }

  latestRenderers = useEditorLineHighlightRenderers({
    searchHighlight: null,
    isPairHighlightEnabled: false,
    pairHighlights: [],
    compositionDisplay: null,
    normalizedRectangularSelection: null,
    textSelectionHighlight: { start: 0, end: 9 },
    isHugeEditableMode: false,
    editableSegmentRef,
    contentRef,
    normalizeSegmentText: normalizeSegmentTextMock,
    getEditableText: getEditableTextMock,
    getCodeUnitOffsetFromLineColumn,
    getHttpUrlRangesInLine: () => [],
    appendClassName,
    resolveTokenTypeClass: () => "",
    classNames: {
      search: "search",
      pair: "pair",
      searchAndPair: "searchAndPair",
      rectangular: "rectangular",
      textSelection: "textSelection",
      hyperlinkUnderline: "hyperlinkUnderline",
      composition: "composition",
      compositionCommitted: "compositionCommitted",
    },
  });

  return null;
}

describe("useEditorLineHighlightRenderers", () => {
  it("reuses normalized source text across multiple line highlight renders", () => {
    getEditableTextMock.mockClear();
    normalizeSegmentTextMock.mockClear();
    latestRenderers = null;

    render(<HookHarness />);
    expect(latestRenderers).toBeTruthy();

    latestRenderers!.renderHighlightedPlainLine("alpha", 1);
    latestRenderers!.renderHighlightedPlainLine("beta", 2);

    expect(getEditableTextMock).toHaveBeenCalledTimes(1);
    expect(normalizeSegmentTextMock).toHaveBeenCalledTimes(1);
  });
});
