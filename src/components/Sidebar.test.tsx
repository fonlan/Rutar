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
});
