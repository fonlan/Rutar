import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "./StatusBar";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-1",
    name: "main.ts",
    path: "C:\\repo\\main.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 12,
    largeFileMode: false,
    ...partial,
  };
}

describe("StatusBar", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
  });

  it("renders ready state without active tab", () => {
    render(<StatusBar />);
    expect(screen.getByText("Rutar Ready")).toBeInTheDocument();
  });

  it("prevents native context menu in ready state", () => {
    const { container } = render(<StatusBar />);
    const statusbarRoot = container.querySelector('[data-layout-region="statusbar"]') as HTMLElement | null;
    expect(statusbarRoot).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const dispatched = (statusbarRoot as HTMLElement).dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("shows active tab status and gesture preview", async () => {
    const tab = createTab({ id: "tab-status" });
    useStore.getState().addTab(tab);
    useStore.getState().setCursorPosition(tab.id, 3, 9);

    render(<StatusBar />);
    expect(screen.getByText("Lines: 12")).toBeInTheDocument();
    expect(screen.getByText("Cursor: 3:9")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:gesture-preview", {
          detail: {
            sequence: "RD",
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Mouse Gestures: RD")).toBeInTheDocument();
    });
  });

  it("exposes accessible labels for status comboboxes", () => {
    const tab = createTab({ id: "tab-status-a11y" });
    useStore.getState().addTab(tab);

    render(<StatusBar />);

    expect(screen.getByRole("combobox", { name: "Line ending" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Encoding" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Syntax" })).toBeInTheDocument();
  });

  it("uses statusbar-themed classes for all dropdowns and options", () => {
    const tab = createTab({ id: "tab-status-theme-classes" });
    useStore.getState().addTab(tab);

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    const options = container.querySelectorAll("option");

    expect(selects.length).toBe(3);
    selects.forEach((select) => {
      expect(select.className).toContain("statusbar-select");
    });
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      expect(option.className).toContain("statusbar-option");
    });
  });

  it("shows newly added encoding options and supports selecting ANSI", async () => {
    invokeMock.mockResolvedValue(undefined);
    const tab = createTab({ id: "tab-encoding-options", path: "C:\\repo\\encoding-options.ts" });
    useStore.getState().addTab(tab);

    render(<StatusBar />);

    const encodingSelect = screen.getByRole("combobox", { name: "Encoding" });
    const encodingOptions = Array.from((encodingSelect as HTMLSelectElement).options).map(
      (option) => option.text
    );

    expect(encodingOptions).toEqual(expect.arrayContaining(["ANSI", "GB2312", "Big5"]));

    fireEvent.change(encodingSelect, { target: { value: "ANSI" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("convert_encoding", {
        id: "tab-encoding-options",
        newEncoding: "ANSI",
      });
    });

    const currentTab = useStore.getState().tabs.find((item) => item.id === "tab-encoding-options");
    expect(currentTab?.encoding).toBe("ANSI");
  });

  it("prevents native context menu when active tab exists", () => {
    const tab = createTab({ id: "tab-status-context-active" });
    useStore.getState().addTab(tab);

    const { container } = render(<StatusBar />);
    const statusbarRoot = container.querySelector('[data-layout-region="statusbar"]') as HTMLElement | null;
    expect(statusbarRoot).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const dispatched = (statusbarRoot as HTMLElement).dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("changes syntax and calls backend command", async () => {
    invokeMock.mockResolvedValue(undefined);
    const tab = createTab({ id: "tab-syntax", path: "C:\\repo\\main.ts" });
    useStore.getState().addTab(tab);

    const refreshEvents: Array<{ tabId: string; lineCount: number; preserveCaret: boolean }> = [];
    const refreshListener = (event: Event) => {
      refreshEvents.push(
        (event as CustomEvent).detail as {
          tabId: string;
          lineCount: number;
          preserveCaret: boolean;
        }
      );
    };
    window.addEventListener("rutar:force-refresh", refreshListener as EventListener);

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(3);

    fireEvent.change(selects[2], { target: { value: "markdown" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_document_syntax", {
        id: "tab-syntax",
        syntaxOverride: "markdown",
      });
    });
    expect(useStore.getState().tabs.find((item) => item.id === "tab-syntax")?.syntaxOverride).toBe(
      "markdown"
    );
    expect(refreshEvents[0]).toEqual({
      tabId: "tab-syntax",
      lineCount: 12,
      preserveCaret: true,
    });
    window.removeEventListener("rutar:force-refresh", refreshListener as EventListener);
  });

  it("changes line ending and encoding then dispatches document-updated", async () => {
    invokeMock.mockResolvedValue(undefined);
    const tab = createTab({ id: "tab-format", path: "C:\\repo\\format.ts" });
    useStore.getState().addTab(tab);

    const updatedEvents: Array<{ tabId: string }> = [];
    const updatedListener = (event: Event) => {
      updatedEvents.push((event as CustomEvent).detail as { tabId: string });
    };
    window.addEventListener("rutar:document-updated", updatedListener as EventListener);

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(3);

    fireEvent.change(selects[0], { target: { value: "CRLF" } });
    fireEvent.change(selects[1], { target: { value: "GBK" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_line_ending", {
        id: "tab-format",
        newLineEnding: "CRLF",
      });
      expect(invokeMock).toHaveBeenCalledWith("convert_encoding", {
        id: "tab-format",
        newEncoding: "GBK",
      });
    });

    await waitFor(() => {
      const currentTab = useStore.getState().tabs.find((item) => item.id === "tab-format");
      expect(currentTab?.lineEnding).toBe("CRLF");
      expect(currentTab?.encoding).toBe("GBK");
      expect(currentTab?.isDirty).toBe(true);
    });

    expect(updatedEvents).toEqual([{ tabId: "tab-format" }, { tabId: "tab-format" }]);
    window.removeEventListener("rutar:document-updated", updatedListener as EventListener);
  });

  it("logs errors when line ending or syntax update fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tab = createTab({ id: "tab-status-fail", path: "C:\\repo\\status-fail.ts" });
    useStore.getState().addTab(tab);

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "set_line_ending" || command === "set_document_syntax") {
        throw new Error(`${command}-failed`);
      }
      return undefined;
    });

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(3);

    fireEvent.change(selects[0], { target: { value: "CRLF" } });
    fireEvent.change(selects[2], { target: { value: "markdown" } });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });

    errorSpy.mockRestore();
  });

  it("logs error when encoding conversion fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tab = createTab({ id: "tab-encoding-fail", path: "C:\\repo\\encoding-fail.ts" });
    useStore.getState().addTab(tab);

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "convert_encoding") {
        throw new Error("convert-encoding-failed");
      }
      return undefined;
    });

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(3);

    fireEvent.change(selects[1], { target: { value: "GBK" } });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    const currentTab = useStore.getState().tabs.find((item) => item.id === "tab-encoding-fail");
    expect(currentTab?.encoding).toBe("UTF-8");
    errorSpy.mockRestore();
  });
  it("maps auto syntax selection to null override", async () => {
    invokeMock.mockResolvedValue(undefined);
    const tab = createTab({
      id: "tab-syntax-auto",
      path: "C:\\repo\\auto.ts",
      syntaxOverride: "markdown",
    });
    useStore.getState().addTab(tab);

    const { container } = render(<StatusBar />);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(3);

    fireEvent.change(selects[2], { target: { value: "auto" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_document_syntax", {
        id: "tab-syntax-auto",
        syntaxOverride: null,
      });
    });

    expect(useStore.getState().tabs.find((item) => item.id === "tab-syntax-auto")?.syntaxOverride).toBeNull();
  });

  it("shows large-file warning badge when active tab is in large-file mode", () => {
    const tab = createTab({
      id: "tab-large-file",
      path: "C:\\repo\\large.log",
      largeFileMode: true,
    });
    useStore.getState().addTab(tab);

    render(<StatusBar />);

    expect(screen.getByText("Highlight Off (Large File)")).toBeInTheDocument();
  });

  it("ignores gesture preview event without sequence payload", async () => {
    const tab = createTab({ id: "tab-gesture-empty" });
    useStore.getState().addTab(tab);

    render(<StatusBar />);

    act(() => {
      window.dispatchEvent(new CustomEvent("rutar:gesture-preview"));
    });

    await waitFor(() => {
      expect(screen.queryByText(/Mouse Gestures:/)).toBeNull();
    });
  });
});
