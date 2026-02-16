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
