import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function getReactOnClick(button: HTMLButtonElement): (() => void) | undefined {
  const propsKey = Object.keys(button as object).find((key) => key.startsWith("__reactProps$"));
  return propsKey ? (button as any)[propsKey]?.onClick : undefined;
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

  it("triggers minimize, maximize, and close window controls", async () => {
    const tab = createTab({ id: "tab-window-controls", name: "window.ts", path: "C:\\repo\\window.ts" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const { container } = render(<TitleBar />);

    const minimizeButton = container.querySelector(".lucide-minus")?.closest("button");
    const maximizeButton = container.querySelector(".lucide-square")?.closest("button");
    expect(minimizeButton).not.toBeNull();
    expect(maximizeButton).not.toBeNull();

    const closeButton = maximizeButton?.nextElementSibling as HTMLButtonElement | null;
    expect(closeButton).not.toBeNull();

    fireEvent.click(minimizeButton as HTMLButtonElement);
    fireEvent.click(maximizeButton as HTMLButtonElement);
    fireEvent.click(closeButton as HTMLButtonElement);

    await waitFor(() => {
      expect(tauriWindowMocks.appWindow.minimize).toHaveBeenCalledTimes(1);
      expect(tauriWindowMocks.appWindow.toggleMaximize).toHaveBeenCalledTimes(1);
      expect(tauriWindowMocks.appWindow.close).toHaveBeenCalledTimes(1);
    });
  });

  it("logs error when toggling always-on-top fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tab = createTab({ id: "tab-top-fail", name: "top.ts", path: "C:\\repo\\top.ts" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    tauriWindowMocks.appWindow.setAlwaysOnTop.mockRejectedValueOnce(new Error("always-top-failed"));

    render(<TitleBar />);

    const toggleButton = await screen.findByRole("button", { name: "Enable Always on Top" });
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to toggle always on top:", expect.any(Error));
    });
    errorSpy.mockRestore();
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

  it("logs error when opening containing folder fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tab = createTab({ id: "tab-open-dir-fail", name: "main.rs", path: "C:\\repo\\src\\main.rs" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "open_in_file_manager") {
        throw new Error("open-folder-failed");
      }
      return undefined;
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("main.rs"), {
      clientX: 175,
      clientY: 125,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Open Containing Folder" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to open file directory:", expect.any(Error));
    });
    errorSpy.mockRestore();
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

  it("returns early for copy-path action when context-menu tab path is empty", async () => {
    const tab = createTab({ id: "tab-empty-copy-path", name: "untitled", path: "" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("untitled"), {
      clientX: 141,
      clientY: 91,
    });

    const copyPathButton = await screen.findByRole("button", { name: "Copy Path" });
    expect(copyPathButton).toBeDisabled();
    const onClick = getReactOnClick(copyPathButton as HTMLButtonElement);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it("returns early for copy-file-name action when context-menu tab name is empty", async () => {
    const tab = createTab({ id: "tab-empty-copy-name", name: "", path: "" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const { container } = render(<TitleBar />);
    const firstTab = container.querySelector("div.group.flex.items-center");
    expect(firstTab).not.toBeNull();

    fireEvent.contextMenu(firstTab as Element, {
      clientX: 143,
      clientY: 93,
    });

    const copyFileNameButton = await screen.findByRole("button", { name: "Copy File Name" });
    const onClick = getReactOnClick(copyFileNameButton as HTMLButtonElement);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it("returns early for copy-directory action when context-menu tab path is empty", async () => {
    const tab = createTab({ id: "tab-empty-copy-dir", name: "untitled", path: "" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("untitled"), {
      clientX: 144,
      clientY: 94,
    });

    const copyDirectoryButton = await screen.findByRole("button", { name: "Copy Directory" });
    expect(copyDirectoryButton).toBeDisabled();
    const onClick = getReactOnClick(copyDirectoryButton as HTMLButtonElement);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it("returns early for open-containing-folder action when context-menu tab path is empty", async () => {
    const tab = createTab({ id: "tab-empty-open-folder", name: "untitled", path: "" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("untitled"), {
      clientX: 142,
      clientY: 92,
    });

    const openFolderButton = await screen.findByRole("button", { name: "Open Containing Folder" });
    expect(openFolderButton).toBeDisabled();
    const onClick = getReactOnClick(openFolderButton as HTMLButtonElement);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(
      invokeMock.mock.calls.some(([command]) => command === "open_in_file_manager")
    ).toBe(false);
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

  it("logs error when creating fallback tab after close-all fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tabA = createTab({ id: "tab-close-all-fail-a", name: "a.ts", path: "C:\\repo\\a.ts" });
    const tabB = createTab({ id: "tab-close-all-fail-b", name: "b.ts", path: "C:\\repo\\b.ts" });
    useStore.setState({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "close_files") {
        return undefined;
      }
      if (command === "new_file") {
        throw new Error("new-file-failed");
      }
      return undefined;
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("a.ts"), {
      clientX: 172,
      clientY: 112,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close All Tabs" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to create tab after closing all tabs:",
        expect.any(Error)
      );
    });
    expect(useStore.getState().tabs).toHaveLength(0);
    errorSpy.mockRestore();
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

  it("logs error when backend close_files fails while closing other tabs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sourceTab = createTab({ id: "tab-source-fail-close", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-target-fail-close", name: "target.ts", path: "C:\\repo\\target.ts" });

    useStore.setState({
      tabs: [sourceTab, targetTab],
      activeTabId: sourceTab.id,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "close_files") {
        throw new Error("close-files-failed");
      }
      return undefined;
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("target.ts"), {
      clientX: 166,
      clientY: 106,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close Other Tabs" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to close tabs:", expect.any(Error));
    });
    await waitFor(() => {
      const { tabs, activeTabId } = useStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe("tab-target-fail-close");
      expect(activeTabId).toBe("tab-target-fail-close");
    });
    errorSpy.mockRestore();
  });
});
