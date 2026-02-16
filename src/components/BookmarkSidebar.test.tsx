import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkSidebar } from "./BookmarkSidebar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-bookmark",
    name: "note.md",
    path: "C:\\repo\\note.md",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 20,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

describe("BookmarkSidebar", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    invokeMock.mockResolvedValue(["First line", "Second line"]);
  });

  it("renders null when sidebar is closed or active tab missing", () => {
    useStore.setState({ bookmarkSidebarOpen: false });
    const first = render(<BookmarkSidebar />);
    expect(first.container.firstChild).toBeNull();
    first.unmount();

    useStore.setState({ bookmarkSidebarOpen: true, activeTabId: null });
    const second = render(<BookmarkSidebar />);
    expect(second.container.firstChild).toBeNull();
    second.unmount();
  });

  it("loads bookmark previews and renders bookmark items", async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: {
        [tab.id]: [10, 2],
      },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_bookmark_line_previews", {
        id: tab.id,
        lines: [2, 10],
      });
    });

    expect(screen.getByText("Line 2")).toBeInTheDocument();
    expect(screen.getByText("Line 10")).toBeInTheDocument();
    expect(screen.getByText("First line")).toBeInTheDocument();
  });

  it("closes sidebar with close button", async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [1] },
    });

    render(<BookmarkSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Close Sidebar" }));

    await waitFor(() => {
      expect(useStore.getState().bookmarkSidebarOpen).toBe(false);
    });
  });

  it("removes bookmark when clicking remove button", async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [3, 8] },
    });

    render(<BookmarkSidebar />);
    await waitFor(() => {
      expect(screen.getByText("Line 3")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: "Remove Bookmark" });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(useStore.getState().bookmarksByTab[tab.id]).toEqual([8]);
    });
  });

  it("reloads previews when current tab document-updated event arrives", async () => {
    const tab = createTab();
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [5] },
    });

    render(<BookmarkSidebar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:document-updated", {
          detail: { tabId: tab.id },
        })
      );
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });
  });
});
