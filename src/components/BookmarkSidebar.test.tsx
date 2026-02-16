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
  it("falls back to empty line preview when loading previews fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("preview-load-failed"));
    const tab = createTab({ id: "tab-bookmark-fallback" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [4] },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_bookmark_line_previews", {
        id: tab.id,
        lines: [4],
      });
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load bookmark line previews:",
        expect.objectContaining({ message: "preview-load-failed" })
      );
    });

    expect(screen.getByText("(empty line)")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("ignores document-updated events for non-active tabs", async () => {
    const tab = createTab({ id: "tab-bookmark-ignore-event" });
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
          detail: { tabId: "tab-other" },
        })
      );
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
  });

  it("dispatches navigate event when clicking a bookmark row", async () => {
    const tab = createTab({ id: "tab-bookmark-nav" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [7] },
    });

    const events: Array<{ tabId: string; line: number; source: string }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail as { tabId: string; line: number; source: string });
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    render(<BookmarkSidebar />);
    fireEvent.click(await screen.findByText("Line 7"));

    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        tabId: tab.id,
        line: 7,
        source: "bookmark",
      })
    );

    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("prevents native context menu on bookmark sidebar root", async () => {
    const tab = createTab({ id: "tab-bookmark-context" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [2] },
    });

    const { container } = render(<BookmarkSidebar />);
    await screen.findByText("Line 2");

    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const dispatched = (root as HTMLElement).dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });
  it("shows empty state when active tab has no bookmarks", async () => {
    const tab = createTab({ id: "tab-bookmark-empty" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [] },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(screen.getByText("No bookmarks")).toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("clears stale previews when bookmarks are removed", async () => {
    const tab = createTab({ id: "tab-bookmark-clear-previews" });
    invokeMock.mockResolvedValueOnce(["seed preview"]);
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [3] },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(screen.getByText("seed preview")).toBeInTheDocument();
    });

    act(() => {
      useStore.setState({
        bookmarksByTab: { [tab.id]: [] },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("No bookmarks")).toBeInTheDocument();
    });
  });

  it("uses empty-line fallback when preview entry is missing in response array", async () => {
    const tab = createTab({ id: "tab-bookmark-preview-missing" });
    invokeMock.mockResolvedValueOnce([]);
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [6] },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Line 6")).toBeInTheDocument();
    });
    expect(screen.getByText("(empty line)")).toBeInTheDocument();
  });

  it("uses empty-line fallback when preview response is not an array", async () => {
    const tab = createTab({ id: "tab-bookmark-preview-not-array" });
    invokeMock.mockResolvedValueOnce("not-array" as unknown as string[]);
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [9] },
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Line 9")).toBeInTheDocument();
    });
    expect(screen.getByText("(empty line)")).toBeInTheDocument();
  });

  it("shows resizing style while dragging resize separator", async () => {
    const tab = createTab({ id: "tab-bookmark-resize" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: { [tab.id]: [2] },
    });

    render(<BookmarkSidebar />);
    const separator = await screen.findByLabelText("Resize bookmark sidebar");

    act(() => {
      fireEvent.pointerDown(separator, { clientX: 220 });
    });

    expect(separator.className).toContain("bg-primary/40");

    act(() => {
      fireEvent.pointerUp(window);
    });
  });
  it("falls back to EMPTY_BOOKMARKS when active tab has no bookmark map entry", async () => {
    const tab = createTab({ id: "tab-bookmark-missing-map" });
    useStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      bookmarkSidebarOpen: true,
      bookmarksByTab: {},
    });

    render(<BookmarkSidebar />);

    await waitFor(() => {
      expect(screen.getByText("No bookmarks")).toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
