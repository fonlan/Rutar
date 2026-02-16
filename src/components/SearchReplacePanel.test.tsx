import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchReplacePanel } from "./SearchReplacePanel";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

const invokeMock = vi.mocked(invoke);
const openMock = vi.mocked(open);
const saveMock = vi.mocked(save);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-search",
    name: "main.ts",
    path: "C:\\repo\\main.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 10,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

describe("SearchReplacePanel", () => {
  let initialState: ReturnType<typeof useStore.getState>;
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeAll(() => {
    initialState = useStore.getState();
    class MockResizeObserver {
      observe = observeMock;
      disconnect = disconnectMock;
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });
  });

  it("renders nothing when there is no active file tab", async () => {
    const { container } = render(<SearchReplacePanel />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("load_filter_rule_groups_config");
    });
    expect(container.firstChild).toBeNull();
  });

  it("keeps filter mode usable when initial rule-group loading fails", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        throw new Error("load-config-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("load_filter_rule_groups_config");
    });
    expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
  });

  it("opens in replace mode via search-open event", async () => {
    useStore.getState().addTab(createTab());
    const { container } = render(<SearchReplacePanel />);

    const sidebar = container.querySelector('[data-rutar-search-sidebar="true"]') as HTMLDivElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar.style.transform).toContain("translateX(calc");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(sidebar.style.transform).toBe("translateX(0)");
    });

    const replaceModeButton = screen.getByTitle("Switch to replace mode");
    expect(replaceModeButton.className).toContain("bg-primary/10");
  });

  it("runs replace current with active search match", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 1,
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_current_in_document") {
        return {
          replaced: true,
          lineCount: 10,
          documentVersion: 2,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace current match"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "replace_current_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          replaceValue: "done",
          targetStart: 0,
          targetEnd: 4,
        })
      );
    });
  });

  it("runs replace all with active search keyword", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 2,
          matchedLines: 2,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_all_in_document") {
        return {
          replacedCount: 2,
          lineCount: 10,
          documentVersion: 2,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace all matches"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "replace_all_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          replaceValue: "done",
        })
      );
    });
  });

  it("shows no-match feedback when replace current backend returns replaced=false", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 1,
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_current_in_document") {
        return {
          replaced: false,
          lineCount: 10,
          documentVersion: 1,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace current match"));

    await waitFor(() => {
      expect(screen.getByText(/No matches to replace/)).toBeInTheDocument();
    });
    expect(invokeMock.mock.calls.some(([command]) => command === "replace_current_in_document")).toBe(
      true
    );
  });

  it("shows replace-current failure message when backend replace command throws", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 1,
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_current_in_document") {
        throw new Error("replace-current-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace current match"));

    await waitFor(() => {
      expect(screen.getByText(/Replace failed: replace-current-failed/)).toBeInTheDocument();
    });
  });

  it("shows no-match feedback and skips replace current command", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 0,
          matchedLines: 0,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace current match"));

    await waitFor(() => {
      expect(screen.getByText(/No matches to replace/)).toBeInTheDocument();
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "replace_current_in_document")
    ).toBe(false);
  });

  it("shows no-match feedback and skips replace all command", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 0,
          matchedLines: 0,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace all matches"));

    await waitFor(() => {
      expect(screen.getByText(/No matches to replace/)).toBeInTheDocument();
    });
    expect(invokeMock.mock.calls.some(([command]) => command === "replace_all_in_document")).toBe(
      false
    );
  });

  it("shows replace-all failure message when backend replace command throws", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 1,
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_all_in_document") {
        throw new Error("replace-all-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace all matches"));

    await waitFor(() => {
      expect(screen.getByText(/Replace all failed: replace-all-failed/)).toBeInTheDocument();
    });
  });

  it("shows no-match feedback when replace-all backend returns replacedCount=0", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return {
          totalMatches: 1,
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "search_in_document_chunk") {
        return {
          matches: [
            {
              start: 0,
              end: 4,
              startChar: 0,
              endChar: 4,
              text: "todo",
              line: 1,
              column: 1,
              lineText: "todo item",
            },
          ],
          documentVersion: 1,
          nextOffset: null,
        };
      }
      if (command === "replace_all_in_document") {
        return {
          replacedCount: 0,
          lineCount: 10,
          documentVersion: 2,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "replace" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Replace with"), {
      target: { value: "done" },
    });
    fireEvent.click(screen.getByTitle("Replace all matches"));

    await waitFor(() => {
      expect(screen.getByText(/No matches to replace/)).toBeInTheDocument();
    });
    expect(invokeMock.mock.calls.some(([command]) => command === "replace_all_in_document")).toBe(
      true
    );
  });

  it("opens in filter mode and shows filter action UI", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });
  });

  it("runs filter query when filter action is triggered with non-empty rule", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "filter_count_in_document") {
        return {
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "filter_in_document_chunk") {
        return {
          matches: [
            {
              line: 1,
              column: 1,
              length: 4,
              lineText: "todo item",
              ruleIndex: 0,
              style: {
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
              ranges: [{ startChar: 0, endChar: 4 }],
            },
          ],
          documentVersion: 1,
          nextLine: null,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "filter_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          rules: [
            {
              keyword: "todo",
              matchMode: "contains",
              backgroundColor: "#fff7a8",
              textColor: "#1f2937",
              bold: false,
              italic: false,
              applyTo: "line",
            },
          ],
          startLine: 0,
        })
      );
    });
  });

  it("re-runs filter query from results panel refresh action", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "filter_count_in_document") {
        return {
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "filter_in_document_chunk") {
        return {
          matches: [
            {
              line: 1,
              column: 1,
              length: 4,
              lineText: "todo item",
              ruleIndex: 0,
              style: {
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
              ranges: [{ startChar: 0, endChar: 4 }],
            },
          ],
          documentVersion: 1,
          nextLine: null,
        };
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "filter_in_document_chunk")
      ).toHaveLength(1);
    });

    fireEvent.click(screen.getByTitle("Refresh filter results"));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "filter_in_document_chunk")
      ).toHaveLength(2);
    });
  });

  it("shows filter failure message when filter chunk command throws", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "filter_count_in_document") {
        return {
          matchedLines: 1,
          documentVersion: 1,
        };
      }
      if (command === "filter_in_document_chunk") {
        throw new Error("filter-chunk-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(screen.getByText(/Filter failed: filter-chunk-failed/)).toBeInTheDocument();
    });
  });

  it("saves filter rule group with normalized payload", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: " todo " },
    });
    fireEvent.change(screen.getByPlaceholderText("Rule group name"), {
      target: { value: "  Team Rules  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Group" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_filter_rule_groups_config", {
        groups: [
          {
            name: "Team Rules",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ],
      });
    });
  });

  it("shows save failure message when persisting filter rule groups fails", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "save_filter_rule_groups_config") {
        throw new Error("save-group-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Group" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Rule group name"), {
      target: { value: "group-save-fail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Group" }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save rule groups: save-group-failed/)).toBeInTheDocument();
    });
  });

  it("shows validation error when saving group with empty name", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Group" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Group" }));

    await waitFor(() => {
      expect(screen.getByText(/Please enter a rule group name/)).toBeInTheDocument();
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
  });

  it("shows validation error when saving group without non-empty rules", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Rule group name")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Rule group name"), {
      target: { value: "empty-rules" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Group" }));

    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
    expect(screen.queryByRole("option", { name: "empty-rules" })).toBeNull();
  });

  it("shows validation error when loading filter group without selection", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load Group" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter keyword"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load Group" }));

    await waitFor(() => {
      expect(screen.getByText(/Please select a rule group/)).toBeInTheDocument();
    });
  });

  it("shows validation error when deleting filter group without selection", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete Group" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Group" }));

    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
  });

  it("loads selected filter rule group into current rules", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "group-a",
            rules: [
              {
                keyword: "alpha",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "group-a" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "group-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load Group" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Filter keyword")).toHaveValue("alpha");
    });
  });

  it("deletes selected filter rule group and persists empty list", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "group-b",
            rules: [
              {
                keyword: "beta",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "group-b" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "group-b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Group" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_filter_rule_groups_config", {
        groups: [],
      });
    });
  });

  it("shows save failure message when persisting deleted filter groups fails", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "group-fail-delete",
            rules: [
              {
                keyword: "beta",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "save_filter_rule_groups_config") {
        throw new Error("delete-save-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "group-fail-delete" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "group-fail-delete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Group" }));

    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")).toBe(
        true
      );
    });
    expect(screen.getByRole("option", { name: "group-fail-delete" })).toBeInTheDocument();
  });

  it("imports filter rule groups from selected json file", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\filter-groups.json");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "import_filter_rule_groups") {
        return [
          {
            name: "imported-group",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import Groups" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Groups" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_filter_rule_groups", {
        path: "C:\\repo\\filter-groups.json",
      });
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_filter_rule_groups_config", {
        groups: [
          {
            name: "imported-group",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ],
      });
    });
  });

  it("shows import failure when imported group list is empty", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\filter-groups-empty.json");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "import_filter_rule_groups") {
        return [];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import Groups" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Groups" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_filter_rule_groups", {
        path: "C:\\repo\\filter-groups-empty.json",
      });
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
  });

  it("shows import failure message when backend import command throws", async () => {
    openMock.mockResolvedValueOnce("C:\\repo\\filter-groups-bad.json");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "import_filter_rule_groups") {
        throw new Error("import-command-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import Groups" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Groups" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_filter_rule_groups", {
        path: "C:\\repo\\filter-groups-bad.json",
      });
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
  });

  it("exports normalized filter rule groups to selected path", async () => {
    saveMock.mockResolvedValueOnce("C:\\repo\\filter-groups-export.json");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "team-rules",
            rules: [
              {
                keyword: "fixme",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "team-rules" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Groups" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("export_filter_rule_groups", {
        path: "C:\\repo\\filter-groups-export.json",
        groups: [
          {
            name: "team-rules",
            rules: [
              {
                keyword: "fixme",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ],
      });
    });
  });

  it("skips export backend command when save dialog is cancelled", async () => {
    saveMock.mockResolvedValueOnce(null);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "export-cancel-group",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "export-cancel-group" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Groups" }));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });
    expect(invokeMock.mock.calls.some(([command]) => command === "export_filter_rule_groups")).toBe(
      false
    );
  });

  it("shows export failure message when backend export command throws", async () => {
    saveMock.mockResolvedValueOnce("C:\\repo\\filter-groups-export.json");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [
          {
            name: "export-fail-group",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ];
      }
      if (command === "export_filter_rule_groups") {
        throw new Error("export-command-failed");
      }
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "export-fail-group" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Groups" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("export_filter_rule_groups", {
        path: "C:\\repo\\filter-groups-export.json",
        groups: [
          {
            name: "export-fail-group",
            rules: [
              {
                keyword: "todo",
                matchMode: "contains",
                backgroundColor: "#fff7a8",
                textColor: "#1f2937",
                bold: false,
                italic: false,
                applyTo: "line",
              },
            ],
          },
        ],
      });
    });
  });

  it("skips import flow when dialog selection is cancelled", async () => {
    openMock.mockResolvedValueOnce(null);
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import Groups" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Groups" }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalled();
    });

    expect(invokeMock.mock.calls.some(([command]) => command === "import_filter_rule_groups")).toBe(
      false
    );
    expect(
      invokeMock.mock.calls.some(([command]) => command === "save_filter_rule_groups_config")
    ).toBe(false);
  });

  it("skips export flow when no rule groups are available", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "filter" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export Groups" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Groups" }));

    expect(saveMock).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.some(([command]) => command === "export_filter_rule_groups")).toBe(
      false
    );
  });

  it("closes opened panel when Escape is pressed globally", async () => {
    useStore.getState().addTab(createTab());
    const { container } = render(<SearchReplacePanel />);

    const sidebar = container.querySelector('[data-rutar-search-sidebar="true"]') as HTMLDivElement;
    expect(sidebar).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(sidebar.style.transform).toBe("translateX(0)");
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(sidebar.style.transform).toContain("translateX(calc");
    });
  });

  it("dispatches search-close when panel is closed", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    const closeEvents: Array<{ tabId: string }> = [];
    const closeListener = (event: Event) => {
      closeEvents.push((event as CustomEvent).detail as { tabId: string });
    };
    window.addEventListener("rutar:search-close", closeListener as EventListener);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTitle("Close")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Close"));

    await waitFor(() => {
      expect(closeEvents[0]).toEqual({ tabId: "tab-search" });
    });
    window.removeEventListener("rutar:search-close", closeListener as EventListener);
  });
});
