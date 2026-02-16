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
