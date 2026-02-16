import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { openFilePath } from "@/lib/openFile";
import { addRecentFolderPath, removeRecentFilePath, removeRecentFolderPath } from "@/lib/recentPaths";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: vi.fn(async () => undefined),
  open: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(async () => ""),
}));

vi.mock("@/lib/openFile", () => ({
  openFilePath: vi.fn(async () => undefined),
}));

vi.mock("@/lib/recentPaths", () => ({
  addRecentFolderPath: vi.fn(),
  removeRecentFilePath: vi.fn(),
  removeRecentFolderPath: vi.fn(),
}));

vi.mock("@/lib/outline", () => ({
  detectOutlineType: vi.fn(() => null),
  loadOutline: vi.fn(async () => []),
}));

vi.mock("@/lib/structuredFormat", () => ({
  detectStructuredFormatSyntaxKey: vi.fn(() => null),
  isStructuredFormatSupported: vi.fn(() => false),
}));

vi.mock("@/lib/tabClose", () => ({
  confirmTabClose: vi.fn(async () => "discard"),
  saveTab: vi.fn(async () => true),
}));

const invokeMock = vi.mocked(invoke);
const messageMock = vi.mocked(message);
const openFilePathMock = vi.mocked(openFilePath);
const addRecentFolderPathMock = vi.mocked(addRecentFolderPath);
const removeRecentFilePathMock = vi.mocked(removeRecentFilePath);
const removeRecentFolderPathMock = vi.mocked(removeRecentFolderPath);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-toolbar",
    name: "main.ts",
    path: "C:\\repo\\main.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 20,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

describe("Toolbar", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US", wordWrap: false });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      return undefined;
    });
  });

  it("shows save disabled reason when active document has no unsaved changes", async () => {
    useStore.getState().addTab(createTab({ isDirty: false }));
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const saveWrapper = screen.getByTitle((title) => title.includes("Save (Ctrl+S)"));
    expect(saveWrapper.getAttribute("title")).toContain("No unsaved changes");
    expect(saveWrapper.querySelector("button")).toBeDisabled();
  });

  it("disables live preview for non-markdown tab and auto-closes preview panel", async () => {
    useStore.getState().addTab(createTab({ path: "C:\\repo\\main.ts", name: "main.ts" }));
    useStore.setState({ markdownPreviewOpen: true });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    await waitFor(() => {
      expect(useStore.getState().markdownPreviewOpen).toBe(false);
    });

    const previewWrapper = screen.getByTitle((title) => title.includes("Live Preview"));
    expect(previewWrapper.getAttribute("title")).toContain(
      "Preview is available for Markdown files only."
    );
    expect(previewWrapper.querySelector("button")).toBeDisabled();
  });

  it("toggles wordWrap setting via toolbar button", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const toggleWrapper = screen.getByTitle("Toggle Word Wrap");
    const toggleButton = toggleWrapper.querySelector("button");
    expect(toggleButton).not.toBeNull();

    fireEvent.click(toggleButton as HTMLButtonElement);

    await waitFor(() => {
      expect(useStore.getState().settings.wordWrap).toBe(true);
    });
  });

  it("dispatches search-open find event on Ctrl+F", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const events: Array<{ mode: "find" | "replace" | "filter" }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail as { mode: "find" | "replace" | "filter" });
    };
    window.addEventListener("rutar:search-open", listener as EventListener);

    fireEvent.keyDown(window, {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(events[0]).toEqual({ mode: "find" });
    });
    window.removeEventListener("rutar:search-open", listener as EventListener);
  });

  it("dispatches search-open replace event on Ctrl+H", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const events: Array<{ mode: "find" | "replace" | "filter" }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail as { mode: "find" | "replace" | "filter" });
    };
    window.addEventListener("rutar:search-open", listener as EventListener);

    fireEvent.keyDown(window, {
      key: "h",
      code: "KeyH",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(events[0]).toEqual({ mode: "replace" });
    });
    window.removeEventListener("rutar:search-open", listener as EventListener);
  });

  it("toggles line numbers on Alt+L", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({ showLineNumbers: false });
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    fireEvent.keyDown(window, {
      key: "l",
      code: "KeyL",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
    });

    await waitFor(() => {
      expect(useStore.getState().settings.showLineNumbers).toBe(true);
    });
  });

  it("triggers undo on Ctrl+Z", async () => {
    useStore.getState().addTab(createTab({ lineCount: 20 }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: true,
          canRedo: true,
          isDirty: true,
        };
      }
      if (command === "undo") {
        return 19;
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    fireEvent.keyDown(window, {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: false,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("undo", { id: "tab-toolbar" });
    });
  });

  it("triggers redo on Ctrl+Shift+Z", async () => {
    useStore.getState().addTab(createTab({ lineCount: 20 }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: true,
          canRedo: true,
          isDirty: true,
        };
      }
      if (command === "redo") {
        return 21;
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    fireEvent.keyDown(window, {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("redo", { id: "tab-toolbar" });
    });
  });

  it("opens recent file from split menu list item", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-a.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    const recentItemRow = await screen.findByTitle("C:\\repo\\recent-a.ts");
    fireEvent.click(recentItemRow.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(openFilePathMock).toHaveBeenCalledWith("C:\\repo\\recent-a.ts");
    });
  });

  it("removes recent file entry from split menu", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-b.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Bookmark" }));

    await waitFor(() => {
      expect(removeRecentFilePathMock).toHaveBeenCalledWith("C:\\repo\\recent-b.ts");
    });
  });

  it("closes opened recent file menu on Escape", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-c.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\recent-c.ts")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTitle("C:\\repo\\recent-c.ts")).toBeNull();
    });
  });

  it("closes recent file split menu when toggled twice", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-c2.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\recent-c2.ts")).toBeInTheDocument();
    });

    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.queryByTitle("C:\\repo\\recent-c2.ts")).toBeNull();
    });
  });

  it("shows no recent files text and closes file menu on outside pointerdown", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: [],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.getByText("No recent files")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText("No recent files")).toBeNull();
    });
  });

  it("clears recent file entries from split menu", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-d.ts", "C:\\repo\\recent-e.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Clear recent files" }));

    await waitFor(() => {
      expect(useStore.getState().settings.recentFiles).toEqual([]);
    });
    expect(screen.queryByTitle("C:\\repo\\recent-d.ts")).toBeNull();
  });

  it("closes opened recent file menu on titlebar pointerdown event", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-f.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\recent-f.ts")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("rutar:titlebar-pointerdown"));
    });

    await waitFor(() => {
      expect(screen.queryByTitle("C:\\repo\\recent-f.ts")).toBeNull();
    });
  });

  it("logs recent file open error when split-menu item open fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    openFilePathMock.mockRejectedValueOnce(new Error("open-recent-file-failed"));

    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-g.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    const recentItemRow = await screen.findByTitle("C:\\repo\\recent-g.ts");
    fireEvent.click(recentItemRow.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to open recent file:", expect.any(Error));
    });
    expect(screen.queryByTitle("C:\\repo\\recent-g.ts")).toBeNull();
    errorSpy.mockRestore();
  });

  it("opens recent folder from split menu list item", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-a"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "read_dir_if_directory") {
        return [{ name: "main.ts", path: "C:\\repo\\folder-a\\main.ts" }];
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);

    const recentFolderRow = await screen.findByTitle("C:\\repo\\folder-a");
    fireEvent.click(recentFolderRow.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_dir_if_directory", { path: "C:\\repo\\folder-a" });
    });
    await waitFor(() => {
      expect(addRecentFolderPathMock).toHaveBeenCalledWith("C:\\repo\\folder-a");
    });
  });

  it("removes recent folder entry from split menu", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-b"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Bookmark" }));

    await waitFor(() => {
      expect(removeRecentFolderPathMock).toHaveBeenCalledWith("C:\\repo\\folder-b");
    });
  });

  it("clears recent folder entries from split menu", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-c", "C:\\repo\\folder-d"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Clear recent folders" }));

    await waitFor(() => {
      expect(useStore.getState().settings.recentFolders).toEqual([]);
    });
    expect(screen.queryByTitle("C:\\repo\\folder-c")).toBeNull();
  });

  it("closes opened recent folder menu on outside pointerdown", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-e"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\folder-e")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTitle("C:\\repo\\folder-e")).toBeNull();
    });
  });

  it("logs recent folder open error when split-menu folder open fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-f"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "read_dir_if_directory") {
        throw new Error("open-recent-folder-failed");
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    const recentFolderRow = await screen.findByTitle("C:\\repo\\folder-f");
    fireEvent.click(recentFolderRow.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to open recent folder:", expect.any(Error));
    });
    expect(addRecentFolderPathMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("prevents default on split-menu primary and toggle mousedown", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    expect(openFileButtons.length).toBeGreaterThanOrEqual(2);

    const primaryMouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    openFileButtons[0].dispatchEvent(primaryMouseDown);
    expect(primaryMouseDown.defaultPrevented).toBe(true);

    const toggleMouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    openFileButtons[1].dispatchEvent(toggleMouseDown);
    expect(toggleMouseDown.defaultPrevented).toBe(true);
  });

  it("prevents default on enabled toolbar button mousedown", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const toggleWrapper = screen.getByTitle("Toggle Word Wrap");
    const toggleButton = toggleWrapper.querySelector("button");
    expect(toggleButton).not.toBeNull();

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    (toggleButton as HTMLButtonElement).dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("shows unsupported format warning when Alt+F is triggered on unsupported syntax", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    fireEvent.keyDown(window, {
      key: "f",
      code: "KeyF",
      altKey: true,
      ctrlKey: true,
      metaKey: false,
    });

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        "Only JSON, YAML, XML, HTML, and TOML are supported.",
        expect.objectContaining({ title: "Settings", kind: "warning" })
      );
    });
  });

  it("shows unsupported format warning when Ctrl+Alt+M is triggered on unsupported syntax", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    fireEvent.keyDown(window, {
      key: "m",
      code: "KeyM",
      altKey: true,
      ctrlKey: true,
      metaKey: false,
    });

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        "Only JSON, YAML, XML, HTML, and TOML are supported.",
        expect.objectContaining({ title: "Settings", kind: "warning" })
      );
    });
  });

  it("shows word count failure warning when backend returns error", async () => {
    useStore.getState().addTab(createTab());
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "get_word_count_info") {
        throw new Error("wc-failed");
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const wordCountWrapper = screen.getByTitle("Word Count");
    fireEvent.click(wordCountWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        "Word count failed: wc-failed",
        expect.objectContaining({ title: "Word Count", kind: "warning" })
      );
    });
  });
});
