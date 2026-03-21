import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useEditorRowMeasurement } from "./useEditorRowMeasurement";

interface HookSnapshot {
  getListItemSize: (index: number) => number;
  measureRenderedLineHeight: (index: number, element: HTMLDivElement | null) => void;
  listResetAfterIndexMock: ReturnType<typeof vi.fn>;
  lineNumberResetAfterIndexMock: ReturnType<typeof vi.fn>;
}

let latestSnapshot: HookSnapshot | null = null;

function HookHarness() {
  const listResetAfterIndexMockRef = useRef(vi.fn());
  const lineNumberResetAfterIndexMockRef = useRef(vi.fn());
  const listRef = useRef<any>({
    resetAfterIndex: listResetAfterIndexMockRef.current,
  });
  const lineNumberListRef = useRef<any>({
    resetAfterIndex: lineNumberResetAfterIndexMockRef.current,
  });

  const { getListItemSize, measureRenderedLineHeight } = useEditorRowMeasurement({
    itemSize: 24,
    wordWrap: true,
    lineNumberBottomSpacerHeightPx: 14,
    tabLineCount: 10,
    lineHeightPx: 24,
    renderedFontSizePx: 14,
    fontFamily: "Consolas",
    tabId: "tab-row-measurement",
    width: 960,
    showLineNumbers: true,
    listRef,
    lineNumberListRef,
  });

  latestSnapshot = {
    getListItemSize,
    measureRenderedLineHeight,
    listResetAfterIndexMock: listResetAfterIndexMockRef.current,
    lineNumberResetAfterIndexMock: lineNumberResetAfterIndexMockRef.current,
  };

  return null;
}

describe("useEditorRowMeasurement", () => {
  it("measures intrinsic content height so wrapped rows can shrink after edits", () => {
    latestSnapshot = null;
    render(<HookHarness />);
    expect(latestSnapshot).toBeTruthy();

    const row = document.createElement("div");
    const content = document.createElement("div");
    row.appendChild(content);

    let contentScrollHeight = 96;
    Object.defineProperty(content, "scrollHeight", {
      configurable: true,
      get: () => contentScrollHeight,
    });
    Object.defineProperty(row, "scrollHeight", {
      configurable: true,
      get: () => 200,
    });

    act(() => {
      latestSnapshot!.measureRenderedLineHeight(1, row as HTMLDivElement);
    });
    expect(latestSnapshot!.getListItemSize(1)).toBe(96);

    contentScrollHeight = 24;
    act(() => {
      latestSnapshot!.measureRenderedLineHeight(1, row as HTMLDivElement);
    });
    expect(latestSnapshot!.getListItemSize(1)).toBe(24);
    expect(latestSnapshot!.listResetAfterIndexMock).toHaveBeenCalledWith(1);
    expect(latestSnapshot!.lineNumberResetAfterIndexMock).toHaveBeenCalledWith(1);
  });
});
