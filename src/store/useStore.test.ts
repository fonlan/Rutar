import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isDiffTab, useStore, type DiffTabPayload, type FileTab } from "./useStore";

function createFileTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "file-1",
    name: "file-1.ts",
    path: "C:\\repo\\file-1.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 1,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

function createDiffPayload(): DiffTabPayload {
  return {
    sourceTabId: "source-1",
    targetTabId: "target-1",
    sourceName: "source.ts",
    targetName: "target.ts",
    sourcePath: "C:\\repo\\source.ts",
    targetPath: "C:\\repo\\target.ts",
    alignedSourceLines: [""],
    alignedTargetLines: [""],
    alignedSourcePresent: [true],
    alignedTargetPresent: [true],
    diffLineNumbers: [],
    sourceDiffLineNumbers: [],
    targetDiffLineNumbers: [],
    sourceLineCount: 1,
    targetLineCount: 1,
    alignedLineCount: 1,
  };
}

describe("useStore", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    useStore.setState(initialState, true);
  });

  it("isDiffTab acts as a correct type guard", () => {
    const fileTab = createFileTab();
    const diffTab = createFileTab({
      id: "diff-1",
      tabType: "diff",
      diffPayload: createDiffPayload(),
    });

    expect(isDiffTab(fileTab)).toBe(false);
    expect(isDiffTab(diffTab)).toBe(true);
  });

  it("addTab initializes active tab, cursor and diff panel defaults", () => {
    const fileTab = createFileTab({ id: "file-1" });
    const diffTab = createFileTab({
      id: "diff-1",
      tabType: "diff",
      diffPayload: createDiffPayload(),
    });

    useStore.getState().addTab(fileTab);
    useStore.getState().addTab(diffTab);
    const state = useStore.getState();

    expect(state.activeTabId).toBe("diff-1");
    expect(state.cursorPositionByTab["file-1"]).toEqual({ line: 1, column: 1 });
    expect(state.cursorPositionByTab["diff-1"]).toEqual({ line: 1, column: 1 });
    expect(state.activeDiffPanelByTab["diff-1"]).toBe("source");
  });

  it("closeTab removes related states and falls back active tab", () => {
    const fileTab = createFileTab({ id: "file-1" });
    const diffTab = createFileTab({
      id: "diff-1",
      tabType: "diff",
      diffPayload: createDiffPayload(),
    });

    useStore.getState().addTab(fileTab);
    useStore.getState().addTab(diffTab);
    useStore.getState().setActiveTab("file-1");
    useStore.getState().setActiveDiffPanel("diff-1", "target");
    useStore.getState().addBookmark("file-1", 3);
    useStore.getState().setCursorPosition("file-1", 8, 2);

    useStore.getState().closeTab("file-1");
    const state = useStore.getState();

    expect(state.tabs.map((item) => item.id)).toEqual(["diff-1"]);
    expect(state.activeTabId).toBe("diff-1");
    expect(state.bookmarksByTab["file-1"]).toBeUndefined();
    expect(state.cursorPositionByTab["file-1"]).toBeUndefined();
  });

  it("setMarkdownPreviewWidthRatio clamps and handles invalid value", () => {
    useStore.getState().setMarkdownPreviewWidthRatio(1.5);
    expect(useStore.getState().markdownPreviewWidthRatio).toBe(0.8);

    useStore.getState().setMarkdownPreviewWidthRatio(0.01);
    expect(useStore.getState().markdownPreviewWidthRatio).toBe(0.2);

    useStore.getState().setMarkdownPreviewWidthRatio(Number.NaN);
    expect(useStore.getState().markdownPreviewWidthRatio).toBe(0.5);
  });

  it("bookmark operations keep sorted unique lines and close empty active sidebar", () => {
    const fileTab = createFileTab({ id: "file-1", path: "" });
    useStore.getState().addTab(fileTab);
    useStore.getState().setActiveTab("file-1");
    useStore.getState().toggleBookmarkSidebar(true);

    useStore.getState().addBookmark("file-1", 3.7);
    useStore.getState().addBookmark("file-1", 1);
    useStore.getState().addBookmark("file-1", 1);
    expect(useStore.getState().bookmarksByTab["file-1"]).toEqual([1, 3]);

    useStore.getState().removeBookmark("file-1", 1);
    expect(useStore.getState().bookmarksByTab["file-1"]).toEqual([3]);
    expect(useStore.getState().bookmarkSidebarOpen).toBe(true);

    useStore.getState().removeBookmark("file-1", 3);
    expect(useStore.getState().bookmarksByTab["file-1"]).toBeUndefined();
    expect(useStore.getState().bookmarkSidebarOpen).toBe(false);

    useStore.getState().toggleBookmark("file-1", 5);
    expect(useStore.getState().bookmarksByTab["file-1"]).toEqual([5]);
    useStore.getState().toggleBookmark("file-1", 5);
    expect(useStore.getState().bookmarksByTab["file-1"]).toBeUndefined();
  });

  it("setCursorPosition clamps values and avoids redundant state updates", () => {
    const fileTab = createFileTab({ id: "file-1" });
    useStore.getState().addTab(fileTab);

    useStore.getState().setCursorPosition("file-1", 2.9, 4.4);
    expect(useStore.getState().cursorPositionByTab["file-1"]).toEqual({ line: 2, column: 4 });

    const previousRef = useStore.getState().cursorPositionByTab;
    useStore.getState().setCursorPosition("file-1", 2, 4);
    expect(useStore.getState().cursorPositionByTab).toBe(previousRef);
  });

  it("updates sidebar and outline widths via dedicated setters", () => {
    useStore.getState().setSidebarWidth(420);
    useStore.getState().setOutlineWidth(360);

    expect(useStore.getState().sidebarWidth).toBe(420);
    expect(useStore.getState().outlineWidth).toBe(360);
  });

  it("keeps state reference when removing missing bookmark or setting same diff panel", () => {
    const diffTab = createFileTab({
      id: "diff-1",
      tabType: "diff",
      diffPayload: createDiffPayload(),
    });
    useStore.getState().addTab(diffTab);

    const previousBookmarksRef = useStore.getState().bookmarksByTab;
    useStore.getState().removeBookmark("diff-1", 9);
    expect(useStore.getState().bookmarksByTab).toBe(previousBookmarksRef);

    useStore.getState().setActiveDiffPanel("diff-1", "target");
    const previousDiffPanelRef = useStore.getState().activeDiffPanelByTab;
    useStore.getState().setActiveDiffPanel("diff-1", "target");
    expect(useStore.getState().activeDiffPanelByTab).toBe(previousDiffPanelRef);
  });

  it("toggleBookmark removes only target line when other bookmarks remain", () => {
    const fileTab = createFileTab({ id: "file-2", path: "" });
    useStore.getState().addTab(fileTab);
    useStore.getState().setActiveTab("file-2");
    useStore.getState().toggleBookmarkSidebar(true);

    useStore.getState().addBookmark("file-2", 2);
    useStore.getState().addBookmark("file-2", 4);
    useStore.getState().toggleBookmark("file-2", 2);

    expect(useStore.getState().bookmarksByTab["file-2"]).toEqual([4]);
    expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
  });
});
