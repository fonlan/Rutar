import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { QUICK_FIND_OPEN_EVENT } from "@/lib/quickFind";
import { type FileTab, useStore } from "@/store/useStore";
import { QuickFindOverlay } from "./QuickFindOverlay";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function createTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: "tab-quick-find",
    name: "main.ts",
    path: "C:\\repo\\main.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 20,
    largeFileMode: false,
    tabType: "file",
    isDirty: false,
    ...overrides,
  };
}

describe("QuickFindOverlay", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    useStore.getState().addTab(createTab());
    invokeMock.mockResolvedValue({
      targetMatch: null,
      documentVersion: 1,
    });
  });

  it("opens overlay on quick-find-open event for active tab", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;
    render(<QuickFindOverlay tab={tab} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(QUICK_FIND_OPEN_EVENT, {
          detail: { tabId: "tab-quick-find" },
        })
      );
    });

    expect(await screen.findByTestId("quick-find-overlay")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Quick Find")).toBeInTheDocument();
  });

  it("searches and navigates to match after input debounce", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;
    const navigateEvents: Array<{ tabId?: string; line?: number; column?: number; length?: number }> = [];
    const navigateListener = (event: Event) => {
      navigateEvents.push((event as CustomEvent).detail as { tabId?: string; line?: number; column?: number; length?: number });
    };
    window.addEventListener("rutar:navigate-to-line", navigateListener as EventListener);

    invokeMock.mockResolvedValueOnce({
      targetMatch: {
        start: 0,
        end: 5,
        startChar: 0,
        endChar: 5,
        text: "hello",
        line: 3,
        column: 4,
        lineText: "abc hello xyz",
      },
      documentVersion: 5,
    });

    try {
      render(<QuickFindOverlay tab={tab} />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(QUICK_FIND_OPEN_EVENT, {
            detail: { tabId: "tab-quick-find" },
          })
        );
      });

      const input = await screen.findByPlaceholderText("Quick Find");
      fireEvent.change(input, { target: { value: "hello" } });

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith("search_step_from_cursor_in_document", expect.objectContaining({
          id: "tab-quick-find",
          keyword: "hello",
          mode: "literal",
          step: 1,
        }));
      });

      await waitFor(() => {
        expect(navigateEvents[0]).toEqual(
          expect.objectContaining({
            tabId: "tab-quick-find",
            line: 3,
            column: 4,
            length: 5,
            source: "quick-find",
          })
        );
      });
    } finally {
      window.removeEventListener("rutar:navigate-to-line", navigateListener as EventListener);
    }
  });

  it("shows no-match feedback and dispatches search-close when no result exists", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;
    const closeEvents: Array<{ tabId?: string }> = [];
    const closeListener = (event: Event) => {
      closeEvents.push((event as CustomEvent).detail as { tabId?: string });
    };
    window.addEventListener("rutar:search-close", closeListener as EventListener);

    invokeMock.mockResolvedValueOnce({
      targetMatch: null,
      documentVersion: 7,
    });

    try {
      render(<QuickFindOverlay tab={tab} />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(QUICK_FIND_OPEN_EVENT, {
            detail: { tabId: "tab-quick-find" },
          })
        );
      });

      const input = await screen.findByPlaceholderText("Quick Find");
      fireEvent.change(input, { target: { value: "missing" } });

      expect(await screen.findByText("No matches")).toBeInTheDocument();
      expect(closeEvents[0]).toEqual({ tabId: "tab-quick-find" });
    } finally {
      window.removeEventListener("rutar:search-close", closeListener as EventListener);
    }
  });

  it("does not auto-step repeatedly when cursor position updates after first match", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;

    invokeMock.mockResolvedValueOnce({
      targetMatch: {
        start: 0,
        end: 5,
        startChar: 0,
        endChar: 5,
        text: "hello",
        line: 2,
        column: 3,
        lineText: "hello world",
      },
      documentVersion: 8,
    });

    render(<QuickFindOverlay tab={tab} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(QUICK_FIND_OPEN_EVENT, {
          detail: { tabId: "tab-quick-find" },
        })
      );
    });

    const input = await screen.findByPlaceholderText("Quick Find");
    fireEvent.change(input, { target: { value: "hello" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_step_from_cursor_in_document",
        expect.objectContaining({
          id: "tab-quick-find",
          keyword: "hello",
          step: 1,
        })
      );
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);

    act(() => {
      useStore.getState().setCursorPosition("tab-quick-find", 10, 1);
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("keeps quick-find input focused after navigate-to-line focus shift", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;
    const editorTextarea = document.createElement("textarea");
    editorTextarea.className = "editor-input-layer";
    document.body.appendChild(editorTextarea);

    const stealFocusOnNavigate = () => {
      editorTextarea.focus();
    };
    window.addEventListener("rutar:navigate-to-line", stealFocusOnNavigate as EventListener);

    invokeMock.mockResolvedValueOnce({
      targetMatch: {
        start: 0,
        end: 3,
        startChar: 0,
        endChar: 3,
        text: "abc",
        line: 1,
        column: 1,
        lineText: "abc",
      },
      documentVersion: 9,
    });

    try {
      render(<QuickFindOverlay tab={tab} />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(QUICK_FIND_OPEN_EVENT, {
            detail: { tabId: "tab-quick-find" },
          })
        );
      });

      const input = await screen.findByPlaceholderText("Quick Find");
      input.focus();
      fireEvent.change(input, { target: { value: "abc" } });

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith(
          "search_step_from_cursor_in_document",
          expect.objectContaining({
            id: "tab-quick-find",
            keyword: "abc",
            step: 1,
          })
        );
      });

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    } finally {
      window.removeEventListener("rutar:navigate-to-line", stealFocusOnNavigate as EventListener);
      editorTextarea.remove();
    }
  });

  it("does not force-reset input selection range during focus restore", async () => {
    const tab = useStore.getState().tabs.find((entry) => entry.id === "tab-quick-find") ?? null;
    const editorTextarea = document.createElement("textarea");
    editorTextarea.className = "editor-input-layer";
    document.body.appendChild(editorTextarea);
    const stealFocusOnNavigate = () => {
      editorTextarea.focus();
    };
    window.addEventListener("rutar:navigate-to-line", stealFocusOnNavigate as EventListener);

    invokeMock.mockResolvedValueOnce({
      targetMatch: {
        start: 0,
        end: 2,
        startChar: 0,
        endChar: 2,
        text: "ab",
        line: 1,
        column: 1,
        lineText: "ab",
      },
      documentVersion: 10,
    });

    try {
      render(<QuickFindOverlay tab={tab} />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(QUICK_FIND_OPEN_EVENT, {
            detail: { tabId: "tab-quick-find" },
          })
        );
      });

      const input = (await screen.findByPlaceholderText("Quick Find")) as HTMLInputElement;
      const setSelectionRangeSpy = vi.spyOn(input, "setSelectionRange");
      fireEvent.change(input, { target: { value: "ab" } });

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith(
          "search_step_from_cursor_in_document",
          expect.objectContaining({
            id: "tab-quick-find",
            keyword: "ab",
            step: 1,
          })
        );
      });

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });

      expect(setSelectionRangeSpy).not.toHaveBeenCalled();
      setSelectionRangeSpy.mockRestore();
    } finally {
      window.removeEventListener("rutar:navigate-to-line", stealFocusOnNavigate as EventListener);
      editorTextarea.remove();
    }
  });
});
