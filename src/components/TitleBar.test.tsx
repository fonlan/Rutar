import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "./TitleBar";
import { useStore, type FileTab } from "@/store/useStore";

const tauriWindowMocks = vi.hoisted(() => {
  return {
    appWindow: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      isAlwaysOnTop: vi.fn(async () => false),
      setAlwaysOnTop: vi.fn(async () => undefined),
      startDragging: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindowMocks.appWindow,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/tabClose", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tabClose")>("@/lib/tabClose");
  return {
    ...actual,
    confirmTabClose: vi.fn(async () => "discard"),
    saveTab: vi.fn(async () => true),
  };
});

const invokeMock = vi.mocked(invoke);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-title",
    name: "index.ts",
    path: "C:\\repo\\index.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 10,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

describe("TitleBar", () => {
  let initialState: ReturnType<typeof useStore.getState>;
  let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    clipboardWriteTextMock = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
    invokeMock.mockResolvedValue(undefined);
    tauriWindowMocks.appWindow.isAlwaysOnTop.mockResolvedValue(false);
  });

  it("activates clicked tab and opens settings panel", async () => {
    const leftTab = createTab({ id: "tab-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-right", name: "right.ts", path: "C:\\repo\\right.ts" });

    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: leftTab.id,
    });

    render(<TitleBar />);

    fireEvent.click(screen.getByText("right.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-right");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => {
      expect(useStore.getState().settings.isOpen).toBe(true);
    });
  });

  it("toggles always-on-top state", async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    const toggleButton = await screen.findByRole("button", { name: "Enable Always on Top" });
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(tauriWindowMocks.appWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
    });

    await screen.findByRole("button", { name: "Disable Always on Top" });
  });

  it("copies file name from tab context menu", async () => {
    const tab = createTab({ id: "tab-copy", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 120,
      clientY: 80,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Copy File Name" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("main.rs");
    });
  });

  it("copies parent directory from tab context menu", async () => {
    const tab = createTab({ id: "tab-dir", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 140,
      clientY: 90,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Copy Directory" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("C:\\repo\\src");
    });
  });

  it("copies full path from tab context menu", async () => {
    const tab = createTab({ id: "tab-path", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 150,
      clientY: 100,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Copy Path" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("C:\\repo\\src\\main.rs");
    });
  });

  it("opens containing folder from tab context menu", async () => {
    const tab = createTab({ id: "tab-open-dir", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 170,
      clientY: 120,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Open Containing Folder" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_in_file_manager", {
        path: "C:\\repo\\src\\main.rs",
      });
    });
  });

  it("closes tab context menu on Escape", async () => {
    const tab = createTab({ id: "tab-escape", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 130,
      clientY: 95,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy File Name" })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Copy File Name" })).toBeNull();
    });
  });

  it("shows compare action disabled when no compare source is selected", async () => {
    const tab = createTab({ id: "tab-no-source", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 160,
      clientY: 110,
    });

    const compareButton = await screen.findByRole("button", { name: "Compare with selected source" });
    expect(compareButton).toBeDisabled();
  });

  it("sets and clears compare source from tab context menu", async () => {
    const tab = createTab({ id: "tab-compare-source", name: "source.ts", path: "C:\\repo\\source.ts" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 150,
      clientY: 100,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Set as compare source" }));

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 152,
      clientY: 102,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Clear compare source" }));

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 154,
      clientY: 104,
    });
    await screen.findByRole("button", { name: "Set as compare source" });
  });

  it("creates diff tab from compare context menu action", async () => {
    const sourceTab = createTab({ id: "tab-source-compare", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-target-compare", name: "target.ts", path: "C:\\repo\\target.ts" });
    useStore.setState({
      tabs: [sourceTab, targetTab],
      activeTabId: sourceTab.id,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "compare_documents_by_line") {
        return {
          alignedSourceLines: ["const a = 1;"],
          alignedTargetLines: ["const b = 2;"],
          alignedSourcePresent: [true],
          alignedTargetPresent: [true],
          diffLineNumbers: [1],
          sourceDiffLineNumbers: [1],
          targetDiffLineNumbers: [1],
          sourceLineCount: 1,
          targetLineCount: 1,
          alignedLineCount: 1,
        };
      }
      return undefined;
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 180,
      clientY: 120,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Set as compare source" }));

    fireEvent.contextMenu(screen.getByText("target.ts"), {
      clientX: 182,
      clientY: 122,
    });
    fireEvent.click(await screen.findByRole("button", { name: 'Compare with "source.ts"' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("compare_documents_by_line", {
        sourceId: "tab-source-compare",
        targetId: "tab-target-compare",
      });
    });
    await waitFor(() => {
      expect(
        useStore
          .getState()
          .tabs.some(
            (tab) =>
              tab.tabType === "diff" &&
              tab.diffPayload?.sourceTabId === "tab-source-compare" &&
              tab.diffPayload?.targetTabId === "tab-target-compare"
          )
      ).toBe(true);
    });
  });

  it("reuses existing diff tab when compare result tab already exists", async () => {
    const sourceTab = createTab({ id: "tab-source-existing", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-target-existing", name: "target.ts", path: "C:\\repo\\target.ts" });
    const diffTab: FileTab = {
      id: "diff-existing",
      name: "Diff: source.ts <> target.ts",
      path: "",
      encoding: "UTF-8",
      lineEnding: "LF",
      lineCount: 1,
      largeFileMode: false,
      syntaxOverride: "plain_text" as const,
      isDirty: false,
      tabType: "diff" as const,
      diffPayload: {
        sourceTabId: "tab-source-existing",
        targetTabId: "tab-target-existing",
        sourceName: "source.ts",
        targetName: "target.ts",
        sourcePath: "C:\\repo\\source.ts",
        targetPath: "C:\\repo\\target.ts",
        alignedSourceLines: ["a"],
        alignedTargetLines: ["b"],
        alignedSourcePresent: [true],
        alignedTargetPresent: [true],
        diffLineNumbers: [1],
        sourceDiffLineNumbers: [1],
        targetDiffLineNumbers: [1],
        sourceLineCount: 1,
        targetLineCount: 1,
        alignedLineCount: 1,
      },
    } as FileTab;
    useStore.setState({
      tabs: [sourceTab, targetTab, diffTab],
      activeTabId: sourceTab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 180,
      clientY: 120,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Set as compare source" }));

    fireEvent.contextMenu(screen.getByText("target.ts"), {
      clientX: 182,
      clientY: 122,
    });
    fireEvent.click(await screen.findByRole("button", { name: 'Compare with "source.ts"' }));

    await waitFor(() => {
      expect(useStore.getState().activeTabId).toBe("diff-existing");
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "compare_documents_by_line")
    ).toBe(false);
  });

  it("disables copy directory and copy path for tab without path", async () => {
    const tab = createTab({ id: "tab-no-path", name: "untitled", path: "" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("untitled"), {
      clientX: 140,
      clientY: 90,
    });

    expect(await screen.findByRole("button", { name: "Copy Directory" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Copy Path" })).toBeDisabled();
  });

  it("creates a new empty tab after closing all tabs from context menu", async () => {
    const tabA = createTab({ id: "tab-close-all-a", name: "a.ts", path: "C:\\repo\\a.ts" });
    const tabB = createTab({ id: "tab-close-all-b", name: "b.ts", path: "C:\\repo\\b.ts" });
    useStore.setState({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "close_files") {
        return undefined;
      }
      if (command === "new_file") {
        return {
          id: "tab-new-after-close-all",
          name: "untitled",
          path: "",
          encoding: "UTF-8",
          lineEnding: "LF",
          lineCount: 1,
          largeFileMode: false,
          isDirty: false,
        };
      }
      return undefined;
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("a.ts"), {
      clientX: 170,
      clientY: 110,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close All Tabs" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "close_files",
        expect.objectContaining({
          ids: expect.arrayContaining(["tab-close-all-a", "tab-close-all-b"]),
        })
      );
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "new_file",
        expect.objectContaining({
          newFileLineEnding: expect.any(String),
        })
      );
    });
    await waitFor(() => {
      const tabs = useStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe("tab-new-after-close-all");
    });
  });

  it("closes other tabs from tab context menu", async () => {
    const sourceTab = createTab({ id: "tab-source", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-target", name: "target.ts", path: "C:\\repo\\target.ts" });

    useStore.setState({
      tabs: [sourceTab, targetTab],
      activeTabId: sourceTab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("target.ts"), {
      clientX: 160,
      clientY: 100,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close Other Tabs" }));

    await waitFor(() => {
      const { tabs, activeTabId } = useStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe("tab-target");
      expect(activeTabId).toBe("tab-target");
    });
  });
});
