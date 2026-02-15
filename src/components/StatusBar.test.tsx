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
});
