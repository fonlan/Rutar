import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchReplacePanel } from "./SearchReplacePanel";
import { useStore, type FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

const invokeMock = vi.mocked(invoke);

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
