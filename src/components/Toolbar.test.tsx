import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";

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
});
