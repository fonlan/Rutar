import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { openFilePath } from "@/lib/openFile";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/openFile", () => ({
  openFilePath: vi.fn(async () => undefined),
}));

const invokeMock = vi.mocked(invoke);
const openFilePathMock = vi.mocked(openFilePath);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-side",
    name: "opened.ts",
    path: "C:\\repo\\opened.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 1,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

describe("Sidebar", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
  });

  it("renders null when sidebar is closed or folder path missing", () => {
    useStore.setState({ sidebarOpen: false, folderPath: "C:\\repo", folderEntries: [] });
    const firstRender = render(<Sidebar />);
    expect(firstRender.container.firstChild).toBeNull();
    firstRender.unmount();

    useStore.setState({ sidebarOpen: true, folderPath: null, folderEntries: [] });
    const secondRender = render(<Sidebar />);
    expect(secondRender.container.firstChild).toBeNull();
    secondRender.unmount();
  });

  it("renders folder name and closes sidebar by close button", async () => {
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\a.ts", name: "a.ts", is_dir: false }],
    });
    render(<Sidebar />);

    expect(screen.getByText("project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Sidebar" }));

    await waitFor(() => {
      expect(useStore.getState().sidebarOpen).toBe(false);
    });
  });

  it("activates existing tab when clicked file is already open", async () => {
    const existing = createTab({ id: "existing-tab", path: "C:\\repo\\project\\a.ts", name: "a.ts" });
    useStore.setState({
      tabs: [existing],
      activeTabId: null,
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: existing.path, name: "a.ts", is_dir: false }],
    });

    render(<Sidebar />);
    fireEvent.click(screen.getByText("a.ts"));

    await waitFor(() => {
      expect(useStore.getState().activeTabId).toBe("existing-tab");
    });
    expect(openFilePathMock).not.toHaveBeenCalled();
  });

  it("opens file path when clicked file is not open", async () => {
    useStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\new.ts", name: "new.ts", is_dir: false }],
    });

    render(<Sidebar />);
    fireEvent.click(screen.getByText("new.ts"));

    await waitFor(() => {
      expect(openFilePathMock).toHaveBeenCalledWith("C:\\repo\\project\\new.ts");
    });
  });

  it("loads and expands directory children via read_dir", async () => {
    invokeMock.mockResolvedValue([{ path: "C:\\repo\\project\\src\\index.ts", name: "index.ts", is_dir: false }]);
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\src", name: "src", is_dir: true }],
    });

    render(<Sidebar />);
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_dir", { path: "C:\\repo\\project\\src" });
    });
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("refreshes root folder entries when folder-tree-changed targets the opened folder", async () => {
    invokeMock.mockResolvedValueOnce([
      { path: "C:\\repo\\project\\new.ts", name: "new.ts", is_dir: false },
    ]);
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\old.ts", name: "old.ts", is_dir: false }],
    });

    render(<Sidebar />);
    expect(screen.getByText("old.ts")).toBeInTheDocument();

    fireEvent(
      window,
      new CustomEvent("rutar:folder-tree-changed", {
        detail: {
          rootPath: "C:\\repo\\project",
          directoryPaths: ["C:\\repo\\project"],
        },
      })
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_dir_if_directory", { path: "C:\\repo\\project" });
    });
    expect(screen.getByText("new.ts")).toBeInTheDocument();
    expect(screen.queryByText("old.ts")).toBeNull();
  });

  it("refreshes expanded directory children when folder-tree-changed targets that directory", async () => {
    invokeMock
      .mockResolvedValueOnce([{ path: "C:\\repo\\project\\src\\index.ts", name: "index.ts", is_dir: false }])
      .mockResolvedValueOnce([{ path: "C:\\repo\\project\\src\\app.ts", name: "app.ts", is_dir: false }]);
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\src", name: "src", is_dir: true }],
    });

    render(<Sidebar />);
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    fireEvent(
      window,
      new CustomEvent("rutar:folder-tree-changed", {
        detail: {
          rootPath: "C:\\repo\\project",
          directoryPaths: ["C:\\repo\\project\\src"],
        },
      })
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("read_dir", { path: "C:\\repo\\project\\src" });
    });
    expect(screen.getByText("app.ts")).toBeInTheDocument();
    expect(screen.queryByText("index.ts")).toBeNull();
  });
  it("prevents native context menu on sidebar root", () => {
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\a.ts", name: "a.ts", is_dir: false }],
    });

    const { container } = render(<Sidebar />);
    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const dispatched = (root as HTMLElement).dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("logs error when directory read fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValue(new Error("read-dir-failed"));
    useStore.setState({
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\src", name: "src", is_dir: true }],
    });

    render(<Sidebar />);
    const srcNode = screen.getByText("src");
    fireEvent.click(srcNode);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: "read-dir-failed" })
      );
    });

    fireEvent.click(srcNode);
    fireEvent.click(srcNode);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    errorSpy.mockRestore();
  });

  it("logs error when opening file path fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    openFilePathMock.mockRejectedValueOnce(new Error("open-file-failed"));
    useStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarOpen: true,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\broken.ts", name: "broken.ts", is_dir: false }],
    });

    render(<Sidebar />);
    fireEvent.click(screen.getByText("broken.ts"));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: "open-file-failed" })
      );
    });

    errorSpy.mockRestore();
  });

  it("keeps file tree width stable during drag and commits on pointerup", async () => {
    useStore.setState({
      sidebarOpen: true,
      sidebarWidth: 240,
      folderPath: "C:\\repo\\project",
      folderEntries: [{ path: "C:\\repo\\project\\a.ts", name: "a.ts", is_dir: false }],
    });

    const { container } = render(<Sidebar />);
    const root = container.firstElementChild as HTMLDivElement | null;
    expect(root).not.toBeNull();
    vi.spyOn(root as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 240,
      height: 480,
      top: 0,
      right: 240,
      bottom: 480,
      left: 0,
      toJSON: () => ({}),
    });

    const separator = screen.getByRole("separator", { name: "Resize file tree sidebar" });

    fireEvent.pointerDown(separator, { clientX: 100 });
    await waitFor(() => {
      expect(document.body.style.cursor).toBe("col-resize");
    });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 180 }));

    expect((root as HTMLDivElement).style.width).toBe("240px");
    expect(useStore.getState().sidebarWidth).toBe(240);

    window.dispatchEvent(new Event("pointerup"));

    await waitFor(() => {
      expect(useStore.getState().sidebarWidth).toBe(320);
    });
    expect((root as HTMLDivElement).style.width).toBe("320px");
  });
});
