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

  it("closes regular tab on double click when double-click-close is enabled", async () => {
    const leftTab = createTab({ id: "tab-double-close-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-double-close-right", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: rightTab.id,
    });
    useStore.getState().updateSettings({ doubleClickCloseTab: true });

    render(<TitleBar />);

    fireEvent.doubleClick(screen.getByText("left.ts"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("close_files", {
        ids: ["tab-double-close-left"],
      });
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(["tab-double-close-right"]);
      expect(useStore.getState().activeTabId).toBe("tab-double-close-right");
    });
  });

  it("suppresses first tab click after drag and allows the next click", async () => {
    const leftTab = createTab({ id: "tab-drag-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-drag-right", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: leftTab.id,
    });

    render(<TitleBar />);

    const rightTabElement = screen.getByText("right.ts").closest("div.group.flex.items-center");
    expect(rightTabElement).not.toBeNull();

    fireEvent.pointerDown(rightTabElement as Element, {
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      pointerId: 99,
      clientX: 40,
      clientY: 20,
    });
    fireEvent.pointerMove(window, {
      pointerId: 99,
      buttons: 1,
      clientX: 54,
      clientY: 20,
    });

    await waitFor(() => {
      expect(tauriWindowMocks.appWindow.startDragging).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("right.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-drag-left");

    fireEvent.click(screen.getByText("right.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-drag-right");
  });

  it("does not start dragging when pointermove reports no primary button", async () => {
    const leftTab = createTab({ id: "tab-drag-nobutton-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-drag-nobutton-right", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: leftTab.id,
    });

    render(<TitleBar />);

    const rightTabElement = screen.getByText("right.ts").closest("div.group.flex.items-center");
    expect(rightTabElement).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(rightTabElement as Element, {
        isPrimary: true,
        pointerType: "mouse",
        button: 0,
        pointerId: 111,
        clientX: 40,
        clientY: 20,
      });
      fireEvent.pointerMove(window, {
        pointerId: 111,
        buttons: 0,
        clientX: 54,
        clientY: 20,
      });
      fireEvent.pointerMove(window, {
        pointerId: 111,
        buttons: 1,
        clientX: 70,
        clientY: 20,
      });
      await Promise.resolve();
    });

    expect(tauriWindowMocks.appWindow.startDragging).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("right.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-drag-nobutton-right");
  });

  it("does not start dragging when pointermove distance is below drag threshold", async () => {
    const leftTab = createTab({ id: "tab-drag-short-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-drag-short-right", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: leftTab.id,
    });

    render(<TitleBar />);

    const rightTabElement = screen.getByText("right.ts").closest("div.group.flex.items-center");
    expect(rightTabElement).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(rightTabElement as Element, {
        isPrimary: true,
        pointerType: "mouse",
        button: 0,
        pointerId: 112,
        clientX: 40,
        clientY: 20,
      });
      fireEvent.pointerMove(window, {
        pointerId: 112,
        buttons: 1,
        clientX: 44,
        clientY: 20,
      });
      await Promise.resolve();
    });

    expect(tauriWindowMocks.appWindow.startDragging).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("right.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-drag-short-right");
  });

  it("logs error when startDragging fails during tab drag", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const leftTab = createTab({ id: "tab-drag-error-left", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-drag-error-right", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: leftTab.id,
    });
    tauriWindowMocks.appWindow.startDragging.mockRejectedValueOnce(new Error("drag-start-failed"));

    render(<TitleBar />);

    const rightTabElement = screen.getByText("right.ts").closest("div.group.flex.items-center");
    expect(rightTabElement).not.toBeNull();

    fireEvent.pointerDown(rightTabElement as Element, {
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      pointerId: 101,
      clientX: 40,
      clientY: 20,
    });
    fireEvent.pointerMove(window, {
      pointerId: 101,
      buttons: 1,
      clientX: 54,
      clientY: 20,
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to drag window from tab:",
        expect.objectContaining({ message: "drag-start-failed" })
      );
    });

    errorSpy.mockRestore();
  });

  it("closes tab from inline close button and keeps active tab unchanged on close-button pointer events", async () => {
    const leftTab = createTab({ id: "tab-left-close-btn", name: "left.ts", path: "C:\\repo\\left.ts" });
    const rightTab = createTab({ id: "tab-right-close-btn", name: "right.ts", path: "C:\\repo\\right.ts" });
    useStore.setState({
      tabs: [leftTab, rightTab],
      activeTabId: rightTab.id,
    });

    render(<TitleBar />);

    const leftTabElement = screen.getByText("left.ts").closest("div.group.flex.items-center");
    expect(leftTabElement).not.toBeNull();
    const closeButton = leftTabElement?.querySelector("button") as HTMLButtonElement | null;
    expect(closeButton).not.toBeNull();

    fireEvent.pointerDown(closeButton as HTMLButtonElement);
    fireEvent.mouseDown(closeButton as HTMLButtonElement);
    fireEvent.doubleClick(closeButton as HTMLButtonElement);
    expect(useStore.getState().activeTabId).toBe("tab-right-close-btn");

    fireEvent.click(closeButton as HTMLButtonElement);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("close_files", {
        ids: ["tab-left-close-btn"],
      });
      const { tabs, activeTabId } = useStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe("tab-right-close-btn");
      expect(activeTabId).toBe("tab-right-close-btn");
    });
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

  it("shows and clears tab path tooltip on hover", async () => {
    const tabWithPath = createTab({
      id: "tab-tooltip-path",
      name: "with-path.ts",
      path: "C:\\repo\\with-path.ts",
    });
    const tabWithoutPath = createTab({
      id: "tab-tooltip-empty",
      name: "no-path.ts",
      path: "",
    });
    useStore.setState({
      tabs: [tabWithPath, tabWithoutPath],
      activeTabId: tabWithPath.id,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: 100,
            y: 80,
            width: 120,
            height: 24,
            top: 80,
            right: 220,
            bottom: 104,
            left: 100,
            toJSON: () => ({}),
          }) as DOMRect
      );

    render(<TitleBar />);

    const withPathElement = screen.getByText("with-path.ts").closest("div.group.flex.items-center");
    expect(withPathElement).not.toBeNull();
    fireEvent.mouseEnter(withPathElement as Element);

    await waitFor(() => {
      expect(screen.getByText("C:\\repo\\with-path.ts")).toBeInTheDocument();
    });

    fireEvent.mouseLeave(withPathElement as Element);

    await waitFor(() => {
      expect(screen.queryByText("C:\\repo\\with-path.ts")).toBeNull();
    });

    const noPathElement = screen.getByText("no-path.ts").closest("div.group.flex.items-center");
    expect(noPathElement).not.toBeNull();
    fireEvent.mouseEnter(noPathElement as Element);

    await waitFor(() => {
      expect(screen.queryByText("C:\\repo\\with-path.ts")).toBeNull();
    });

    rectMock.mockRestore();
  });

  it("hides tab path tooltip when hovered path no longer matches any tab", async () => {
    const tab = createTab({
      id: "tab-tooltip-path-mismatch",
      name: "mismatch.ts",
      path: "C:\\repo\\mismatch.ts",
    });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: 100,
            y: 80,
            width: 120,
            height: 24,
            top: 80,
            right: 220,
            bottom: 104,
            left: 100,
            toJSON: () => ({}),
          }) as DOMRect
      );

    render(<TitleBar />);

    const tabElement = screen.getByText("mismatch.ts").closest("div.group.flex.items-center");
    expect(tabElement).not.toBeNull();
    fireEvent.mouseEnter(tabElement as Element);

    await waitFor(() => {
      expect(screen.getByText("C:\\repo\\mismatch.ts")).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().updateTab("tab-tooltip-path-mismatch", {
        path: "C:\\repo\\renamed.ts",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("C:\\repo\\mismatch.ts")).toBeNull();
    });

    rectMock.mockRestore();
  });

  it("keeps tab path tooltip visible after viewport resize and scroll events", async () => {
    const tab = createTab({
      id: "tab-tooltip-viewport",
      name: "viewport.ts",
      path: "C:\\repo\\viewport.ts",
    });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: -40,
            y: 90,
            width: 120,
            height: 24,
            top: 90,
            right: 80,
            bottom: 114,
            left: -40,
            toJSON: () => ({}),
          }) as DOMRect
      );

    render(<TitleBar />);

    const tabElement = screen.getByText("viewport.ts").closest("div.group.flex.items-center");
    expect(tabElement).not.toBeNull();
    fireEvent.mouseEnter(tabElement as Element);

    await waitFor(() => {
      expect(screen.getByText("C:\\repo\\viewport.ts")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByText("C:\\repo\\viewport.ts")).toBeInTheDocument();
    });

    rectMock.mockRestore();
  });

  it("flips tooltip placement from bottom to top when tooltip overflows below viewport", async () => {
    const tab = createTab({
      id: "tab-tooltip-bottom-to-top",
      name: "flip-bottom.ts",
      path: "C:\\repo\\flip-bottom.ts",
    });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 100,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const className = this.className?.toString() ?? "";
        if (className.includes("fixed z-[85]")) {
          return {
            x: 12,
            y: 80,
            width: 160,
            height: 40,
            top: 80,
            right: 172,
            bottom: 120,
            left: 12,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 20,
          y: 30,
          width: 120,
          height: 24,
          top: 30,
          right: 140,
          bottom: 54,
          left: 20,
          toJSON: () => ({}),
        } as DOMRect;
      });

    render(<TitleBar />);

    const tabElement = screen.getByText("flip-bottom.ts").closest("div.group.flex.items-center");
    expect(tabElement).not.toBeNull();
    fireEvent.mouseEnter(tabElement as Element);

    const tooltipText = await screen.findByText("C:\\repo\\flip-bottom.ts");
    await waitFor(() => {
      const tooltipElement = tooltipText as HTMLElement;
      expect(tooltipElement.style.transform).toBe("translate(-50%, -100%)");
    });

    rectMock.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("flips tooltip placement from top to bottom when tooltip overflows above viewport", async () => {
    const tab = createTab({
      id: "tab-tooltip-top-to-bottom",
      name: "flip-top.ts",
      path: "C:\\repo\\flip-top.ts",
    });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 150,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const className = this.className?.toString() ?? "";
        if (className.includes("fixed z-[85]")) {
          return {
            x: 12,
            y: 0,
            width: 160,
            height: 22,
            top: 0,
            right: 172,
            bottom: 22,
            left: 12,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 20,
          y: 82,
          width: 120,
          height: 24,
          top: 82,
          right: 140,
          bottom: 106,
          left: 20,
          toJSON: () => ({}),
        } as DOMRect;
      });

    render(<TitleBar />);

    const tabElement = screen.getByText("flip-top.ts").closest("div.group.flex.items-center");
    expect(tabElement).not.toBeNull();
    fireEvent.mouseEnter(tabElement as Element);

    const tooltipText = await screen.findByText("C:\\repo\\flip-top.ts");
    await waitFor(() => {
      const tooltipElement = tooltipText as HTMLElement;
      expect(tooltipElement.style.transform).toBe("translateX(-50%)");
    });

    rectMock.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("repositions tooltip horizontally when it overflows viewport right edge", async () => {
    const tab = createTab({
      id: "tab-tooltip-overflow-right",
      name: "overflow-right.ts",
      path: "C:\\repo\\overflow-right.ts",
    });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 160,
    });

    const rectMock = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const className = this.className?.toString() ?? "";
        if (className.includes("fixed z-[85]")) {
          return {
            x: 30,
            y: 40,
            width: 190,
            height: 24,
            top: 40,
            right: 220,
            bottom: 64,
            left: 30,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          x: 20,
          y: 22,
          width: 120,
          height: 24,
          top: 22,
          right: 140,
          bottom: 46,
          left: 20,
          toJSON: () => ({}),
        } as DOMRect;
      });

    render(<TitleBar />);

    const tabElement = screen.getByText("overflow-right.ts").closest("div.group.flex.items-center");
    expect(tabElement).not.toBeNull();
    fireEvent.mouseEnter(tabElement as Element);

    const tooltipText = await screen.findByText("C:\\repo\\overflow-right.ts");
    await waitFor(() => {
      const tooltipElement = tooltipText as HTMLElement;
      const tooltipLeft = Number.parseFloat(tooltipElement.style.left);
      expect(tooltipLeft).toBeGreaterThanOrEqual(8);
      expect(tooltipLeft).toBeLessThanOrEqual(12);
    });

    rectMock.mockRestore();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("closes tab context menu when window loses focus", async () => {
    const tab = createTab({ id: "tab-blur-close-menu", name: "blur.ts", path: "C:\\repo\\blur.ts" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("blur.ts"), {
      clientX: 138,
      clientY: 96,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy File Name" })).toBeInTheDocument();
    });

    fireEvent.blur(window);

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

  it("clears compare source when selected source tab is removed", async () => {
    const sourceTab = createTab({ id: "tab-compare-source-removed", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-compare-target-removed", name: "target.ts", path: "C:\\repo\\target.ts" });
    useStore.setState({
      tabs: [sourceTab, targetTab],
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
    const compareWithSourceButton = await screen.findByRole("button", { name: 'Compare with "source.ts"' });
    expect(compareWithSourceButton).not.toBeDisabled();

    fireEvent.pointerDown(document.body);

    act(() => {
      useStore.setState({
        tabs: [targetTab],
        activeTabId: targetTab.id,
      });
    });

    fireEvent.contextMenu(screen.getByText("target.ts"), {
      clientX: 184,
      clientY: 124,
    });

    const fallbackCompareButton = await screen.findByRole("button", { name: "Compare with selected source" });
    expect(fallbackCompareButton).toBeDisabled();
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

  it("closes tab context menu when its referenced tab is removed", async () => {
    const sourceTab = createTab({ id: "tab-context-missing-source", name: "source.ts", path: "C:\\repo\\source.ts" });
    const targetTab = createTab({ id: "tab-context-missing-target", name: "target.ts", path: "C:\\repo\\target.ts" });
    useStore.setState({
      tabs: [sourceTab, targetTab],
      activeTabId: sourceTab.id,
    });

    render(<TitleBar />);

    fireEvent.contextMenu(screen.getByText("source.ts"), {
      clientX: 166,
      clientY: 106,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close Other Tabs" })).toBeInTheDocument();
    });

    act(() => {
      useStore.setState({
        tabs: [targetTab],
        activeTabId: targetTab.id,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close Other Tabs" })).toBeNull();
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

  it("handles pending file-open tabs lifecycle and blocks pending-tab interactions", async () => {
    const existingTab = createTab({
      id: "tab-existing",
      name: "existing.ts",
      path: "C:\\repo\\existing.ts",
    });
    useStore.setState({
      tabs: [existingTab],
      activeTabId: existingTab.id,
    });

    render(<TitleBar />);

    act(() => {
      window.dispatchEvent(new CustomEvent("rutar:file-open-loading"));
      window.dispatchEvent(
        new CustomEvent("rutar:file-open-loading", {
          detail: {
            tabId: "pending:missing-path",
            status: "start",
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent("rutar:file-open-loading", {
          detail: {
            path: "C:\\repo\\missing-tab-id.ts",
            status: "start",
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent("rutar:file-open-loading", {
          detail: {
            tabId: "pending:alpha",
            path: "C:\\repo\\pending.ts",
            status: "start",
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent("rutar:file-open-loading", {
          detail: {
            tabId: "pending:alpha",
            path: "C:\\repo\\pending.ts",
            status: "start",
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText("pending.ts")).toHaveLength(1);
    });

    const pendingTabElement = screen.getByText("pending.ts").closest("div.group.flex.items-center");
    expect(pendingTabElement).not.toBeNull();

    invokeMock.mockClear();
    fireEvent.mouseEnter(pendingTabElement as Element);
    fireEvent.doubleClick(pendingTabElement as Element);
    fireEvent.click(screen.getByText("pending.ts"));
    expect(useStore.getState().activeTabId).toBe("tab-existing");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByText("C:\\repo\\pending.ts")).toBeNull();

    fireEvent.contextMenu(screen.getByText("pending.ts"), {
      clientX: 188,
      clientY: 122,
    });
    expect(screen.queryByRole("button", { name: "Copy File Name" })).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:file-open-loading", {
          detail: {
            tabId: "pending:alpha",
            path: "C:\\repo\\pending.ts",
            status: "end",
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("pending.ts")).toBeNull();
    });
  });
});
