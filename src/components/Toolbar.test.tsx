import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { message, open } from "@tauri-apps/plugin-dialog";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { openFilePath } from "@/lib/openFile";
import { addRecentFolderPath, removeRecentFilePath, removeRecentFolderPath } from "@/lib/recentPaths";
import { detectOutlineType, loadOutline } from "@/lib/outline";
import { detectStructuredFormatSyntaxKey, isStructuredFormatSupported } from "@/lib/structuredFormat";
import { saveTab } from "@/lib/tabClose";

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
const openMock = vi.mocked(open);
const openFilePathMock = vi.mocked(openFilePath);
const addRecentFolderPathMock = vi.mocked(addRecentFolderPath);
const removeRecentFilePathMock = vi.mocked(removeRecentFilePath);
const removeRecentFolderPathMock = vi.mocked(removeRecentFolderPath);
const detectOutlineTypeMock = vi.mocked(detectOutlineType);
const loadOutlineMock = vi.mocked(loadOutline);
const detectStructuredFormatSyntaxKeyMock = vi.mocked(detectStructuredFormatSyntaxKey);
const isStructuredFormatSupportedMock = vi.mocked(isStructuredFormatSupported);
const saveTabMock = vi.mocked(saveTab);
const readClipboardTextMock = vi.mocked(readClipboardText);

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

function getReactOnClick(button: HTMLButtonElement): (() => void) | undefined {
  const propsKey = Object.keys(button as object).find((key) => key.startsWith("__reactProps$"));
  return propsKey ? (button as any)[propsKey]?.onClick : undefined;
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
    readClipboardTextMock.mockResolvedValue("");
    detectOutlineTypeMock.mockReturnValue(null);
    loadOutlineMock.mockResolvedValue([]);
    detectStructuredFormatSyntaxKeyMock.mockReturnValue(null);
    isStructuredFormatSupportedMock.mockReturnValue(false);
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

  it("shows no-active-document disabled reasons when no tab is open", () => {
    render(<Toolbar />);

    const saveWrapper = screen.getByTitle((title) => title.includes("Save (Ctrl+S)"));
    expect(saveWrapper.getAttribute("title")).toContain("No active document");
    expect(saveWrapper.querySelector("button")).toBeDisabled();

    const undoWrapper = screen.getByTitle((title) => title.includes("Undo (Ctrl+Z)"));
    expect(undoWrapper.getAttribute("title")).toContain("No active document");
    expect(undoWrapper.querySelector("button")).toBeDisabled();

    const previewWrapper = screen.getByTitle((title) => title.includes("Live Preview"));
    expect(previewWrapper.getAttribute("title")).toContain("No active document");
    expect(previewWrapper.querySelector("button")).toBeDisabled();

    const wordCountWrapper = screen.getByTitle((title) => title.includes("Word Count"));
    expect(wordCountWrapper.getAttribute("title")).toContain("No active document");
    expect(wordCountWrapper.querySelector("button")).toBeDisabled();
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

  it("dispatches search-open filter event from toolbar filter button", async () => {
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

    const filterWrapper = screen.getByTitle("Filter");
    fireEvent.click(filterWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(events[0]).toEqual({ mode: "filter" });
    });
    window.removeEventListener("rutar:search-open", listener as EventListener);
  });

  it("dispatches search-open find and replace events from toolbar buttons", async () => {
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

    const findWrapper = screen.getByTitle((title) => title.includes("Find"));
    fireEvent.click(findWrapper.querySelector("button") as HTMLButtonElement);
    const replaceWrapper = screen.getByTitle((title) => title.includes("Replace"));
    fireEvent.click(replaceWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(events).toEqual([{ mode: "find" }, { mode: "replace" }]);
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

  it("creates new file on Ctrl+N", async () => {
    useStore.getState().addTab(createTab({ id: "tab-current" }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "new_file") {
        return createTab({
          id: "tab-new-shortcut",
          name: "untitled",
          path: "",
          isDirty: true,
        });
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-current" });
    });

    fireEvent.keyDown(window, {
      key: "n",
      code: "KeyN",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("new_file", expect.any(Object));
    });
    await waitFor(() => {
      expect(useStore.getState().tabs.some((tab) => tab.id === "tab-new-shortcut")).toBe(true);
    });
  });

  it("opens file dialog on Ctrl+O and opens selected file", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\from-shortcut.ts");
    useStore.getState().addTab(createTab({ id: "tab-open-shortcut" }));
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-open-shortcut" });
    });

    fireEvent.keyDown(window, {
      key: "o",
      code: "KeyO",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({ multiple: false, directory: false })
      );
    });
    await waitFor(() => {
      expect(openFilePathMock).toHaveBeenCalledWith("C:\\repo\\from-shortcut.ts");
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

  it("triggers redo on Ctrl+Y", async () => {
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
      key: "y",
      code: "KeyY",
      ctrlKey: true,
      shiftKey: false,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("redo", { id: "tab-toolbar" });
    });
  });

  it("triggers save on Ctrl+S", async () => {
    useStore.getState().addTab(createTab({ id: "tab-save", name: "save.ts", path: "C:\\repo\\save.ts" }));
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-save" });
    });

    fireEvent.keyDown(window, {
      key: "s",
      code: "KeyS",
      ctrlKey: true,
      shiftKey: false,
    });

    await waitFor(() => {
      expect(saveTabMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "tab-save" }),
        expect.any(Function)
      );
    });
  });

  it("triggers save all on Ctrl+Shift+S", async () => {
    useStore.getState().addTab(createTab({
      id: "tab-save-all",
      name: "save-all.ts",
      path: "C:\\repo\\save-all.ts",
      isDirty: true,
    }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        };
      }
      if (command === "save_files") {
        return [{ id: "tab-save-all", success: true }];
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-save-all" });
    });

    fireEvent.keyDown(window, {
      key: "s",
      code: "KeyS",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_files", { ids: ["tab-save-all"] });
    });
  });

  it("closes active tab on Ctrl+W", async () => {
    useStore.getState().addTab(createTab({ id: "tab-a", name: "a.ts", path: "C:\\repo\\a.ts" }));
    useStore.getState().addTab(createTab({ id: "tab-b", name: "b.ts", path: "C:\\repo\\b.ts" }));

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-b" });
    });

    fireEvent.keyDown(window, {
      key: "w",
      code: "KeyW",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("close_file", { id: "tab-b" });
    });
    await waitFor(() => {
      expect(useStore.getState().tabs.some((tab) => tab.id === "tab-b")).toBe(false);
    });
  });

  it("creates a blank tab when closing the last tab on Ctrl+W", async () => {
    useStore.getState().addTab(createTab({ id: "tab-only", name: "only.ts", path: "C:\\repo\\only.ts" }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "close_file") {
        return undefined;
      }
      if (command === "new_file") {
        return createTab({
          id: "tab-new",
          name: "untitled",
          path: "",
          isDirty: true,
        });
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-only" });
    });

    fireEvent.keyDown(window, {
      key: "w",
      code: "KeyW",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("close_file", { id: "tab-only" });
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("new_file", expect.any(Object));
    });
    await waitFor(() => {
      expect(useStore.getState().tabs.some((tab) => tab.id === "tab-new")).toBe(true);
    });
  });

  it("formats document from beautify and minify toolbar buttons when supported", async () => {
    useStore.getState().addTab(createTab({ name: "data.json", path: "C:\\repo\\data.json" }));
    isStructuredFormatSupportedMock.mockReturnValue(true);
    detectStructuredFormatSyntaxKeyMock.mockReturnValue("json");
    invokeMock.mockImplementation(async (command: string, payload?: any) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: true,
          canRedo: true,
          isDirty: true,
        };
      }
      if (command === "format_document") {
        return payload?.mode === "beautify" ? 30 : 20;
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const beautifyWrapper = screen.getByTitle("Beautify (Ctrl+Alt+F)");
    const minifyWrapper = screen.getByTitle("Minify (Ctrl+Alt+M)");
    fireEvent.click(beautifyWrapper.querySelector("button") as HTMLButtonElement);
    fireEvent.click(minifyWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "format_document",
        expect.objectContaining({ id: "tab-toolbar", mode: "beautify", fileSyntax: "json" })
      );
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "format_document",
        expect.objectContaining({ id: "tab-toolbar", mode: "minify", fileSyntax: "json" })
      );
    });
  });

  it("loads outline from toolbar outline button when outline is supported", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    detectOutlineTypeMock.mockReturnValue("typescript");
    loadOutlineMock.mockResolvedValue([{ id: "n1", label: "fn main", children: [] }] as any);

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const outlineWrapper = screen.getByTitle("Outline");
    const outlineButton = outlineWrapper.querySelector("button") as HTMLButtonElement;
    expect(outlineButton).not.toBeDisabled();
    fireEvent.click(outlineButton);

    await waitFor(() => {
      expect(loadOutlineMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "tab-toolbar" }),
        "typescript"
      );
    });
    await waitFor(() => {
      expect(useStore.getState().outlineOpen).toBe(true);
    });
  });

  it("shows outline unsupported warning when no active tab is available", async () => {
    render(<Toolbar />);

    const outlineWrapper = screen.getByTitle((title) => title.includes("Outline"));
    const outlineButton = outlineWrapper.querySelector("button") as HTMLButtonElement;
    const onClick = getReactOnClick(outlineButton);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        expect.stringContaining("Cannot open outline."),
        expect.objectContaining({ title: "Outline", kind: "warning" })
      );
    });
  });

  it("shows outline unsupported warning when outline type cannot be detected", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    detectOutlineTypeMock.mockReturnValue(null);

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const outlineWrapper = screen.getByTitle("Outline");
    const outlineButton = outlineWrapper.querySelector("button") as HTMLButtonElement;
    const onClick = getReactOnClick(outlineButton);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        expect.stringContaining("Cannot open outline."),
        expect.objectContaining({ title: "Outline", kind: "warning" })
      );
    });
  });

  it("closes outline when toolbar outline button is clicked while outline is open", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    useStore.getState().toggleOutline(true);
    detectOutlineTypeMock.mockReturnValue("typescript");

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const outlineWrapper = screen.getByTitle("Outline");
    const outlineButton = outlineWrapper.querySelector("button") as HTMLButtonElement;
    fireEvent.click(outlineButton);

    await waitFor(() => {
      expect(useStore.getState().outlineOpen).toBe(false);
    });
    expect(loadOutlineMock).not.toHaveBeenCalled();
  });

  it("shows outline warning and stores error when outline loading throws a non-error value", async () => {
    useStore.getState().addTab(createTab({ name: "main.ts", path: "C:\\repo\\main.ts" }));
    detectOutlineTypeMock.mockReturnValue("typescript");
    loadOutlineMock.mockRejectedValue("outline-crashed");

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const outlineWrapper = screen.getByTitle("Outline");
    const outlineButton = outlineWrapper.querySelector("button") as HTMLButtonElement;
    fireEvent.click(outlineButton);

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        expect.stringContaining("outline-crashed"),
        expect.objectContaining({ title: "Outline", kind: "warning" })
      );
    });
    await waitFor(() => {
      expect(useStore.getState().outlineError).toBe("outline-crashed");
      expect(useStore.getState().outlineNodes).toEqual([]);
      expect(useStore.getState().outlineType).toBe("typescript");
    });
  });

  it("returns early for word count handler when no active tab is available", async () => {
    render(<Toolbar />);

    const wordCountWrapper = screen.getByTitle((title) => title.includes("Word Count"));
    const wordCountButton = wordCountWrapper.querySelector("button") as HTMLButtonElement;
    const onClick = getReactOnClick(wordCountButton);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(invokeMock.mock.calls.some(([command]) => command === "get_word_count_info")).toBe(false);
    expect(messageMock).not.toHaveBeenCalled();
  });

  it("shows word count info message when backend returns result", async () => {
    useStore.getState().addTab(createTab({ id: "tab-wordcount" }));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "get_word_count_info") {
        return {
          wordCount: 12,
          characterCount: 34,
          characterCountNoSpaces: 30,
          lineCount: 5,
          paragraphCount: 2,
        };
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-wordcount" });
    });

    const wordCountWrapper = screen.getByTitle("Word Count");
    fireEvent.click(wordCountWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        expect.stringContaining("Words"),
        expect.objectContaining({ title: "Word Count", kind: "info" })
      );
    });
  });

  it("keeps split menu open when split-menu root ref becomes unavailable", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\recent-root-null.ts"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\recent-root-null.ts")).toBeInTheDocument();
    });

    const splitMenuRoot = openFileButtons[0].closest("div.relative.flex.items-center.flex-shrink-0");
    expect(splitMenuRoot).not.toBeNull();
    const fiberKey = Object.keys(splitMenuRoot as object).find((key) => key.startsWith("__reactFiber$"));
    expect(fiberKey).toBeTruthy();
    const fiberNode = (splitMenuRoot as any)[fiberKey as string];
    const refObject = fiberNode?.ref as { current: HTMLDivElement | null } | null;
    expect(refObject).toBeTruthy();
    if (refObject) {
      refObject.current = null;
    }

    fireEvent.pointerDown(document.body);
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\recent-root-null.ts")).toBeInTheDocument();
    });
  });

  it("runs cut and copy through execCommand when editor has selection", async () => {
    useStore.getState().addTab(createTab());

    const editor = document.createElement("textarea");
    editor.className = "editor-input-layer";
    editor.value = "hello";
    document.body.appendChild(editor);
    editor.focus();
    editor.setSelectionRange(0, 2);

    const originalExecCommand = (document as Document & {
      execCommand?: (command: string) => boolean;
    }).execCommand;
    const execCommandMock = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommandMock,
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    document.dispatchEvent(new Event("selectionchange"));

    const cutWrapper = screen.getByTitle("Cut");
    const copyWrapper = screen.getByTitle("Copy");
    await waitFor(() => {
      expect(cutWrapper.querySelector("button")).not.toBeDisabled();
      expect(copyWrapper.querySelector("button")).not.toBeDisabled();
    });

    fireEvent.click(cutWrapper.querySelector("button") as HTMLButtonElement);
    fireEvent.click(copyWrapper.querySelector("button") as HTMLButtonElement);

    expect(execCommandMock).toHaveBeenCalledWith("cut");
    expect(execCommandMock).toHaveBeenCalledWith("copy");

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: originalExecCommand ?? (() => false),
    });
    editor.remove();
  });

  it("dispatches paste-text event from paste button", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const pasteEvents: Array<{ tabId: string; text: string }> = [];
    const listener = (event: Event) => {
      pasteEvents.push((event as CustomEvent<{ tabId: string; text: string }>).detail);
    };
    window.addEventListener("rutar:paste-text", listener as EventListener);

    const pasteWrapper = screen.getByTitle("Paste");
    fireEvent.click(pasteWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(pasteEvents[0]).toEqual({ tabId: "tab-toolbar", text: "" });
    });
    window.removeEventListener("rutar:paste-text", listener as EventListener);
  });

  it("falls back to execCommand paste when clipboard read fails for active tab", async () => {
    useStore.getState().addTab(createTab());
    readClipboardTextMock.mockRejectedValue(new Error("clipboard-read-failed-tab"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const pasteWrapper = screen.getByTitle("Paste");
    fireEvent.click(pasteWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to read clipboard text via Tauri clipboard plugin:",
        expect.objectContaining({ message: "clipboard-read-failed-tab" })
      );
    });
    expect(warnSpy).toHaveBeenCalledWith("Paste command blocked. Use Ctrl+V in editor.");
    warnSpy.mockRestore();
  });

  it("falls back to execCommand paste when clipboard read fails for diff tab", async () => {
    useStore.getState().addTab(createTab({ id: "tab-source", name: "a.ts", path: "C:\\repo\\a.ts" }));
    useStore.getState().addTab(createTab({ id: "tab-target", name: "b.ts", path: "C:\\repo\\b.ts" }));
    useStore.getState().addTab({
      id: "tab-diff",
      name: "a.ts ↔ b.ts",
      path: "",
      encoding: "UTF-8",
      lineEnding: "LF",
      lineCount: 1,
      largeFileMode: false,
      isDirty: false,
      tabType: "diff",
      diffPayload: {
        sourceTabId: "tab-source",
        targetTabId: "tab-target",
        sourceName: "a.ts",
        targetName: "b.ts",
        sourcePath: "C:\\repo\\a.ts",
        targetPath: "C:\\repo\\b.ts",
        alignedSourceLines: [""],
        alignedTargetLines: [""],
        alignedSourcePresent: [true],
        alignedTargetPresent: [true],
        diffLineNumbers: [],
        sourceDiffLineNumbers: [],
        targetDiffLineNumbers: [],
        sourceLineCount: 1,
        targetLineCount: 1,
        alignedLineCount: 1,
      },
    });
    readClipboardTextMock.mockRejectedValue(new Error("clipboard-read-failed-diff"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-source" });
    });

    const pasteWrapper = screen.getByTitle("Paste");
    fireEvent.click(pasteWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to read clipboard text via Tauri clipboard plugin:",
        expect.objectContaining({ message: "clipboard-read-failed-diff" })
      );
    });
    expect(warnSpy).toHaveBeenCalledWith("Paste command blocked. Use Ctrl+V in editor.");
    warnSpy.mockRestore();
  });

  it("toggles bookmark sidebar from toolbar button", async () => {
    useStore.getState().addTab(createTab());
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const bookmarkWrapper = screen.getByTitle("Bookmark Sidebar");
    fireEvent.click(bookmarkWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(useStore.getState().bookmarkSidebarOpen).toBe(true);
    });
  });

  it("returns early for bookmark sidebar handler when no active tab is available", async () => {
    useStore.setState({ bookmarkSidebarOpen: false });
    render(<Toolbar />);

    const bookmarkWrapper = screen.getByTitle((title) => title.includes("Bookmark Sidebar"));
    const bookmarkButton = bookmarkWrapper.querySelector("button") as HTMLButtonElement;
    const onClick = getReactOnClick(bookmarkButton);
    expect(onClick).toBeTypeOf("function");

    await act(async () => {
      onClick?.();
    });

    expect(useStore.getState().bookmarkSidebarOpen).toBe(false);
  });

  it("toggles markdown preview from toolbar for markdown tab", async () => {
    useStore.getState().addTab(createTab({ name: "README.md", path: "C:\\repo\\README.md" }));
    useStore.setState({ markdownPreviewOpen: false });
    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const previewWrapper = screen.getByTitle("Live Preview");
    expect(previewWrapper.querySelector("button")).not.toBeDisabled();
    fireEvent.click(previewWrapper.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(useStore.getState().markdownPreviewOpen).toBe(true);
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

  it("opens file from primary split button using dialog result", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\from-dialog.ts");
    useStore.getState().addTab(createTab());

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFileButtons = screen.getAllByTitle("Open File (Ctrl+O)");
    fireEvent.click(openFileButtons[0]);

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({ multiple: false, directory: false })
      );
    });
    await waitFor(() => {
      expect(openFilePathMock).toHaveBeenCalledWith("C:\\repo\\from-dialog.ts");
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

  it("opens folder from primary split button using dialog result", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\folder-primary");
    useStore.getState().addTab(createTab());
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_edit_history_state") {
        return {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        };
      }
      if (command === "read_dir_if_directory") {
        return [{ name: "index.ts", path: "C:\\repo\\folder-primary\\index.ts" }];
      }
      return undefined;
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[0]);

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({ multiple: false, directory: true })
      );
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_dir_if_directory", {
        path: "C:\\repo\\folder-primary",
      });
    });
    await waitFor(() => {
      expect(addRecentFolderPathMock).toHaveBeenCalledWith("C:\\repo\\folder-primary");
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

  it("closes recent folder split menu when toggled twice", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\folder-c2"],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    await waitFor(() => {
      expect(screen.getByTitle("C:\\repo\\folder-c2")).toBeInTheDocument();
    });

    fireEvent.click(openFolderButtons[1]);
    await waitFor(() => {
      expect(screen.queryByTitle("C:\\repo\\folder-c2")).toBeNull();
    });
  });

  it("shows no recent folders text and closes folder menu on outside pointerdown", async () => {
    useStore.getState().addTab(createTab());
    useStore.getState().updateSettings({
      recentFolders: [],
    });

    render(<Toolbar />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_edit_history_state", { id: "tab-toolbar" });
    });

    const openFolderButtons = screen.getAllByTitle("Open Folder");
    fireEvent.click(openFolderButtons[1]);
    await waitFor(() => {
      expect(screen.getByText("No recent folders")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText("No recent folders")).toBeNull();
    });
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
