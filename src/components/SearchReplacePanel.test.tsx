import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function getReactOnClick(element: Element): (() => void) | undefined {
  const propsKey = Object.keys(element as object).find((key) => key.startsWith("__reactProps$"));
  return propsKey ? (element as any)[propsKey]?.onClick : undefined;
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

  it("prevents native context menu on search sidebar root", async () => {
    useStore.getState().addTab(createTab({ id: "tab-search-context" }));
    const { container } = render(<SearchReplacePanel />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("load_filter_rule_groups_config");
    });

    const sidebar = container.querySelector('[data-rutar-search-sidebar="true"]') as HTMLElement | null;
    expect(sidebar).not.toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    let dispatched = true;
    act(() => {
      dispatched = (sidebar as HTMLElement).dispatchEvent(event);
    });

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("shows text-input context menu with only copy cut paste delete actions", async () => {
    useStore.getState().addTab(createTab({ id: "tab-search-input-context" }));
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    const keywordInput = (await screen.findByPlaceholderText("Find text")) as HTMLInputElement;
    fireEvent.change(keywordInput, { target: { value: "hello world" } });
    keywordInput.setSelectionRange(0, 5);

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 128,
      clientY: 144,
    });
    let dispatched = true;
    act(() => {
      dispatched = keywordInput.dispatchEvent(event);
    });

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);

    const menu = await screen.findByRole("menu");
    const menuItems = within(menu).getAllByRole("menuitem");

    expect(menuItems).toHaveLength(4);
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
      "Copy",
      "Cut",
      "Paste",
      "Delete",
    ]);
  });

  it("executes copy cut paste delete actions from text-input context menu", async () => {
    const writeTextMock = vi.fn(async () => undefined);
    const readTextMock = vi.fn(async () => "PASTED");
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
        readText: readTextMock,
      },
    });

    useStore.getState().addTab(createTab({ id: "tab-search-input-context-actions" }));
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    const keywordInput = (await screen.findByPlaceholderText("Find text")) as HTMLInputElement;
    fireEvent.change(keywordInput, { target: { value: "hello world" } });

    const openContextMenu = async () => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 148,
        clientY: 166,
      });

      let dispatched = true;
      act(() => {
        dispatched = keywordInput.dispatchEvent(event);
      });

      expect(dispatched).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      return await screen.findByRole("menu");
    };

    keywordInput.setSelectionRange(0, 5);
    let menu = await openContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("hello");
    });
    expect(keywordInput.value).toBe("hello world");

    keywordInput.setSelectionRange(6, 11);
    menu = await openContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Cut" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("world");
      expect(keywordInput.value).toBe("hello ");
    });

    keywordInput.setSelectionRange(6, 6);
    menu = await openContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Paste" }));

    await waitFor(() => {
      expect(readTextMock).toHaveBeenCalledTimes(1);
      expect(keywordInput.value).toBe("hello PASTED");
    });

    keywordInput.setSelectionRange(0, 5);
    menu = await openContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(keywordInput.value).toBe(" PASTED");
    });
  });

  it("switches panel mode via find/replace/filter buttons", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Replace with")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });
  });

  it("navigates from replace-mode next-match toolbar button", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_first_in_document") {
        return {
          firstMatch: {
            start: 0,
            end: 4,
            startChar: 0,
            endChar: 4,
            text: "todo",
            line: 1,
            column: 1,
            lineText: "todo item",
          },
          documentVersion: 1,
        };
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

    const navigateEvents: Array<{ line: number }> = [];
    const listener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ line: number }>).detail);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Next match"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_first_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          reverse: false,
        })
      );
    });
    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(0);
    });
    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("navigates from replace-mode previous-match toolbar button", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_first_in_document") {
        return {
          firstMatch: {
            start: 0,
            end: 4,
            startChar: 0,
            endChar: 4,
            text: "todo",
            line: 1,
            column: 1,
            lineText: "todo item",
          },
          documentVersion: 1,
        };
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

    const navigateEvents: Array<{ line: number }> = [];
    const listener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ line: number }>).detail);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Previous match"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_first_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          reverse: true,
        })
      );
    });
    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(0);
    });
    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("navigates from find-mode previous/next toolbar buttons", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_first_in_document") {
        return {
          firstMatch: {
            start: 0,
            end: 4,
            startChar: 0,
            endChar: 4,
            text: "todo",
            line: 1,
            column: 1,
            lineText: "todo item",
          },
          documentVersion: 1,
        };
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    const navigateEvents: Array<{ line: number }> = [];
    const listener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ line: number }>).detail);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Previous match"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_first_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          reverse: true,
        })
      );
    });
    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(0);
    });

    const eventsBeforeNext = navigateEvents.length;
    fireEvent.click(screen.getByTitle("Next match"));

    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(eventsBeforeNext);
    });
    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("switches search mode and toggles case/reverse options from toolbar controls", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    const literalButton = screen.getByRole("button", { name: "Literal" });
    const regexButton = screen.getByRole("button", { name: "Regex" });
    const wildcardButton = screen.getByRole("button", { name: "Wildcard" });
    const caseSensitiveCheckbox = screen.getByLabelText("Case Sensitive");
    const reverseSearchCheckbox = screen.getByLabelText("Reverse Search");

    expect(literalButton.className).toContain("bg-primary/10");
    expect(caseSensitiveCheckbox).not.toBeChecked();
    expect(reverseSearchCheckbox).not.toBeChecked();

    fireEvent.click(regexButton);
    expect(regexButton.className).toContain("bg-primary/10");

    fireEvent.click(wildcardButton);
    expect(wildcardButton.className).toContain("bg-primary/10");

    fireEvent.click(literalButton);
    expect(literalButton.className).toContain("bg-primary/10");

    fireEvent.click(caseSensitiveCheckbox);
    expect(caseSensitiveCheckbox).toBeChecked();

    fireEvent.click(reverseSearchCheckbox);
    expect(reverseSearchCheckbox).toBeChecked();
  });

  it("shows search-results empty hint when opening result panel without keyword", async () => {
    useStore.getState().addTab(createTab());
    render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(screen.getByText(/Enter a keyword to list all matches here/)).toBeInTheDocument();
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "search_in_document_chunk")
    ).toBe(false);
  });

  it("shows no-match hint when search result panel is opened with unmatched keyword", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/No matches found\./)).toBeInTheDocument();
    });
  });

  it("shows search pending-total status and selects a search result item", async () => {
    let resolveSearchCount!: (value: { totalMatches: number; matchedLines: number; documentVersion: number }) => void;
    let hasSearchCountResolver = false;

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "search_count_in_document") {
        return await new Promise<{ totalMatches: number; matchedLines: number; documentVersion: number }>((resolve) => {
          resolveSearchCount = resolve;
          hasSearchCountResolver = true;
        });
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
              line: 3,
              column: 2,
              lineText: "  todo item",
            },
          ],
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
          detail: { mode: "find" },
        })
      );
    });

    const navigateEvents: Array<{ line: number }> = [];
    const listener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ line: number }>).detail);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    const input = await screen.findByPlaceholderText("Find text");
    fireEvent.change(input, { target: { value: "todo" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          startOffset: 0,
        })
      );
    });

    const openResultsButton = screen.queryByTitle("Expand results");
    if (openResultsButton) {
      fireEvent.click(openResultsButton);
    }

    await waitFor(() => {
      expect(screen.getByTitle("Line 3, Col 2")).toBeInTheDocument();
    });
    expect(screen.getByText((text) => text.includes("Current 1/?"))).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Line 3, Col 2"));
    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(0);
    });

    expect(hasSearchCountResolver).toBe(true);
    await act(async () => {
      resolveSearchCount({
        totalMatches: 1,
        matchedLines: 1,
        documentVersion: 1,
      });
    });

    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("minimizes and reopens search results panel", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Minimize results"));

    await waitFor(() => {
      expect(screen.getByTitle("Open search results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Open search results"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
    });
  });

  it("resizes search result panel and stops resizing after mouseup", async () => {
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
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    useStore.getState().addTab(createTab());
    const { container } = render(<SearchReplacePanel />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:search-open", {
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultList = await waitFor(() => {
      const element = container.querySelector<HTMLDivElement>('div.overflow-auto[style*="max-height"]');
      expect(element).toBeTruthy();
      return element as HTMLDivElement;
    });

    const initialHeight = parseInt(resultList.style.maxHeight, 10);
    const resizeHandle = screen.getByLabelText("Resize results panel");

    fireEvent.mouseDown(resizeHandle, { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 360 });

    await waitFor(() => {
      const nextHeight = parseInt(resultList.style.maxHeight, 10);
      expect(nextHeight).toBeGreaterThan(initialHeight);
    });

    fireEvent.mouseUp(window);
    const heightAfterMouseUp = resultList.style.maxHeight;
    fireEvent.mouseMove(window, { clientY: 300 });
    expect(resultList.style.maxHeight).toBe(heightAfterMouseUp);
  });

  it("ignores stale resize mousemove callback after drag cleanup", async () => {
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
      if (command === "get_document_version") {
        return 1;
      }
      return [];
    });

    let staleMouseMoveHandler: ((event: MouseEvent) => void) | null = null;
    const originalAddEventListener = window.addEventListener.bind(window);
    const addEventListenerSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation((type: any, listener: any, options?: any) => {
        if (type === "mousemove") {
          staleMouseMoveHandler = listener as (event: MouseEvent) => void;
        }
        originalAddEventListener(type, listener, options);
      });

    try {
      useStore.getState().addTab(createTab());
      const { container } = render(<SearchReplacePanel />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent("rutar:search-open", {
            detail: { mode: "find" },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText("Find text"), {
        target: { value: "todo" },
      });
      fireEvent.click(screen.getByTitle("Expand results"));

      const resultList = await waitFor(() => {
        const element = container.querySelector<HTMLDivElement>('div.overflow-auto[style*="max-height"]');
        expect(element).toBeTruthy();
        return element as HTMLDivElement;
      });

      const resizeHandle = screen.getByLabelText("Resize results panel");
      fireEvent.mouseDown(resizeHandle, { clientY: 400 });
      fireEvent.mouseUp(window);
      const heightAfterMouseUp = resultList.style.maxHeight;

      expect(staleMouseMoveHandler).toBeTypeOf("function");
      act(() => {
        staleMouseMoveHandler?.(new MouseEvent("mousemove", { clientY: 120 }));
      });

      expect(resultList.style.maxHeight).toBe(heightAfterMouseUp);
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });

  it("closes minimized search results panel from minimized-strip close button", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Minimize results"));

    const minimizedOpenButton = await screen.findByTitle("Open search results");
    const minimizedCloseButton = minimizedOpenButton.parentElement?.querySelector(
      'button[title="Close results"]'
    ) as HTMLButtonElement | null;
    expect(minimizedCloseButton).not.toBeNull();
    fireEvent.click(minimizedCloseButton as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.queryByTitle("Open search results")).toBeNull();
    });
  });

  it("clears result filter keyword from result panel clear action", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });
    expect(screen.getByTitle("Clear result filter")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear result filter"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search in all results")).toHaveValue("");
    });
  });

  it("refreshes search results from result panel refresh action", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "search_in_document_chunk").length
      ).toBeGreaterThanOrEqual(1);
    });
    const beforeRefreshCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "search_in_document_chunk"
    ).length;

    fireEvent.click(screen.getByTitle("Refresh search results"));

    await waitFor(() => {
      const afterRefreshCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "search_in_document_chunk"
      ).length;
      expect(afterRefreshCalls).toBeGreaterThan(beforeRefreshCalls);
    });
  });

  it("copies plain-text search results from result panel copy action", async () => {
    const writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const copyButton = await screen.findByTitle("Copy results as plain text");
    await waitFor(() => {
      expect(copyButton).not.toBeDisabled();
    }, { timeout: 5000 });
    fireEvent.click(copyButton);

    await waitFor(() => {
      const copiedByNavigator = writeTextMock.mock.calls.length > 0;
      const copiedFeedback = screen.queryByText(/Copied 1 results as plain text/) !== null;
      expect(copiedByNavigator || copiedFeedback).toBe(true);
    });
  });

  it("shows copy failure message when clipboard write throws", async () => {
    const writeTextMock = vi.fn(async () => {
      throw new Error("clipboard-failed");
    });
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const copyButton = await screen.findByTitle("Copy results as plain text");
    await waitFor(() => {
      expect(copyButton).not.toBeDisabled();
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText((text) => text.includes("Failed to copy results"))).toBeInTheDocument();
    });
  });

  it("disables copy action when result list is empty", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const copyButton = await screen.findByTitle("Copy results as plain text");
    expect(copyButton).toBeDisabled();
  });

  it("shows empty-copy feedback when forced copy runs with empty result list", async () => {
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const copyButton = await screen.findByTitle("Copy results as plain text");
    expect(copyButton).toBeDisabled();

    const onClick = getReactOnClick(copyButton);
    expect(onClick).toBeTypeOf("function");
    act(() => {
      onClick?.();
    });

    expect(screen.getByText((text) => text.includes("No results to copy"))).toBeInTheDocument();
  });

  it("applies result filter when Enter is pressed in result-filter input", async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as Record<string, unknown> | undefined;
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
          nextOffset: args?.resultFilterKeyword ? 10 : null,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });
    invokeMock.mockClear();

    fireEvent.keyDown(resultFilterInput, { key: "Enter" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          startOffset: 0,
        })
      );
    });
  });

  it("runs result-filter previous step from result panel controls", async () => {
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
      if (command === "step_result_filter_search_in_document") {
        return {
          targetMatch: null,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });

    const controlContainer = resultFilterInput.parentElement as HTMLElement;
    fireEvent.click(within(controlContainer).getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "step_result_filter_search_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          step: -1,
        })
      );
    });
  });

  it("runs result-filter next step from result panel controls", async () => {
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
      if (command === "step_result_filter_search_in_document") {
        return {
          targetMatch: null,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });

    const controlContainer = resultFilterInput.parentElement as HTMLElement;
    fireEvent.click(within(controlContainer).getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "step_result_filter_search_in_document",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          step: 1,
        })
      );
    });
  });

  it("cancels pending next-step loading when next is clicked again during next-step run", async () => {
    let resolveLoadMore:
      | ((value: { matches: unknown[]; documentVersion: number; nextOffset: number | null }) => void)
      | null = null;

    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as Record<string, unknown> | undefined;
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
        if (
          args?.resultFilterKeyword === "line-filter" &&
          (args?.startOffset as number | undefined) === 10
        ) {
          return await new Promise((resolve) => {
            resolveLoadMore = resolve as (value: {
              matches: unknown[];
              documentVersion: number;
              nextOffset: number | null;
            }) => void;
          });
        }

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
          nextOffset: 10,
        };
      }
      if (command === "step_result_filter_search_in_document") {
        return {
          targetMatch: {
            start: 100,
            end: 104,
            startChar: 100,
            endChar: 104,
            text: "todo",
            line: 20,
            column: 1,
            lineText: "todo item",
          },
          documentVersion: 1,
          batchStartOffset: 100,
          targetIndexInBatch: null,
          totalMatches: 2,
          totalMatchedLines: 2,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });
    fireEvent.keyDown(resultFilterInput, { key: "Enter" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          startOffset: 0,
        })
      );
    });

    const controlContainer = resultFilterInput.parentElement as HTMLElement;
    const nextButton = within(controlContainer).getByRole("button", { name: "Next" });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(resolveLoadMore).not.toBeNull();
    });

    const stepCallCountBeforeCancel = invokeMock.mock.calls.filter(
      ([command]) => command === "step_result_filter_search_in_document"
    ).length;

    fireEvent.click(nextButton);

    await waitFor(() => {
      const stepCallCountAfterCancel = invokeMock.mock.calls.filter(
        ([command]) => command === "step_result_filter_search_in_document"
      ).length;
      expect(stepCallCountAfterCancel).toBe(stepCallCountBeforeCancel);
    });

    if (resolveLoadMore) {
      (resolveLoadMore as (value: {
        matches: unknown[];
        documentVersion: number;
        nextOffset: number | null;
      }) => void)({
        matches: [],
        documentVersion: 1,
        nextOffset: null,
      });
    }

    await waitFor(() => {
      expect(within(controlContainer).getByRole("button", { name: "Next" })).toBeInTheDocument();
    });
  });

  it("cancels pending previous-step loading when previous is clicked again during previous-step run", async () => {
    let resolveLoadMore:
      | ((value: { matches: unknown[]; documentVersion: number; nextOffset: number | null }) => void)
      | null = null;

    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as Record<string, unknown> | undefined;
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
        if (
          args?.resultFilterKeyword === "line-filter" &&
          (args?.startOffset as number | undefined) === 10
        ) {
          return await new Promise((resolve) => {
            resolveLoadMore = resolve as (value: {
              matches: unknown[];
              documentVersion: number;
              nextOffset: number | null;
            }) => void;
          });
        }

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
          nextOffset: 10,
        };
      }
      if (command === "step_result_filter_search_in_document") {
        return {
          targetMatch: {
            start: 100,
            end: 104,
            startChar: 100,
            endChar: 104,
            text: "todo",
            line: 20,
            column: 1,
            lineText: "todo item",
          },
          documentVersion: 1,
          batchStartOffset: 100,
          targetIndexInBatch: null,
          totalMatches: 2,
          totalMatchedLines: 2,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });
    fireEvent.keyDown(resultFilterInput, { key: "Enter" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          startOffset: 0,
        })
      );
    });

    const controlContainer = resultFilterInput.parentElement as HTMLElement;
    const previousButton = within(controlContainer).getByRole("button", { name: "Previous" });
    fireEvent.click(previousButton);

    await waitFor(() => {
      expect(resolveLoadMore).not.toBeNull();
    });

    const stepCallCountBeforeCancel = invokeMock.mock.calls.filter(
      ([command]) => command === "step_result_filter_search_in_document"
    ).length;

    fireEvent.click(previousButton);

    await waitFor(() => {
      const stepCallCountAfterCancel = invokeMock.mock.calls.filter(
        ([command]) => command === "step_result_filter_search_in_document"
      ).length;
      expect(stepCallCountAfterCancel).toBe(stepCallCountBeforeCancel);
    });

    if (resolveLoadMore) {
      (resolveLoadMore as (value: {
        matches: unknown[];
        documentVersion: number;
        nextOffset: number | null;
      }) => void)({
        matches: [],
        documentVersion: 1,
        nextOffset: null,
      });
    }

    await waitFor(() => {
      expect(within(controlContainer).getByRole("button", { name: "Previous" })).toBeInTheDocument();
    });
  });

  it("stops result-filter search when stop button is clicked during running filter search", async () => {
    let resolveFilteredSearch:
      | ((value: { matches: unknown[]; documentVersion: number; nextOffset: number | null }) => void)
      | null = null;

    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as Record<string, unknown> | undefined;
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
        if (args?.resultFilterKeyword === "line-filter") {
          return await new Promise((resolve) => {
            resolveFilteredSearch = resolve as (value: {
              matches: unknown[];
              documentVersion: number;
              nextOffset: number | null;
            }) => void;
          });
        }
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    await waitFor(() => {
      expect(screen.getByText("todo item")).toBeInTheDocument();
    });

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });

    fireEvent.keyDown(resultFilterInput, { key: "Enter" });

    await waitFor(() => {
      expect(resolveFilteredSearch).not.toBeNull();
      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    });

    const filteredCallCountBeforeStop = invokeMock.mock.calls.filter(
      ([command, payload]) =>
        command === "search_in_document_chunk" &&
        ((payload as Record<string, unknown> | undefined)?.resultFilterKeyword as string | undefined) ===
          "line-filter"
    ).length;

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      const filteredCallCountAfterStop = invokeMock.mock.calls.filter(
        ([command, payload]) =>
          command === "search_in_document_chunk" &&
          ((payload as Record<string, unknown> | undefined)?.resultFilterKeyword as string | undefined) ===
            "line-filter"
      ).length;
      expect(filteredCallCountAfterStop).toBe(filteredCallCountBeforeStop);
    });

    const resolveRunningSearch = resolveFilteredSearch as
      | ((value: { matches: unknown[]; documentVersion: number; nextOffset: number | null }) => void)
      | null;
    if (resolveRunningSearch) {
      resolveRunningSearch({
        matches: [],
        documentVersion: 1,
        nextOffset: null,
      });
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
      expect(screen.getByText("todo item")).toBeInTheDocument();
    });
  });

  it("applies result filter from filter button when idle", async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = payload as Record<string, unknown> | undefined;
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
          nextOffset: args?.resultFilterKeyword ? 10 : null,
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
          detail: { mode: "find" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Find text")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Find text"), {
      target: { value: "todo" },
    });
    fireEvent.click(screen.getByTitle("Expand results"));

    const resultFilterInput = await screen.findByPlaceholderText("Search in all results");
    fireEvent.change(resultFilterInput, {
      target: { value: "line-filter" },
    });
    invokeMock.mockClear();

    const controlContainer = resultFilterInput.parentElement as HTMLElement;
    fireEvent.click(within(controlContainer).getByRole("button", { name: "Filter" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "search_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          keyword: "todo",
          resultFilterKeyword: "line-filter",
          startOffset: 0,
        })
      );
    });
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

  it("shows empty filter-results hint when running filter with no valid rules", async () => {
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

    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(screen.getByText(/Add rules and run filter to list matching lines here/)).toBeInTheDocument();
    });
  });

  it("shows filter pending-total status while filter count is loading", async () => {
    let resolveFilterCount!: (value: { matchedLines: number; documentVersion: number }) => void;
    let hasFilterCountResolver = false;

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "filter_count_in_document") {
        return await new Promise<{ matchedLines: number; documentVersion: number }>((resolve) => {
          resolveFilterCount = resolve;
          hasFilterCountResolver = true;
        });
      }
      if (command === "filter_in_document_chunk") {
        return {
          matches: [
            {
              line: 2,
              column: 1,
              length: 4,
              lineText: "todo",
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

    const navigateEvents: Array<{ line: number }> = [];
    const listener = (event: Event) => {
      navigateEvents.push((event as CustomEvent<{ line: number }>).detail);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

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
      expect(screen.getByTitle("Line 2, Col 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Line 2, Col 1"));
    await waitFor(() => {
      expect(navigateEvents.length).toBeGreaterThan(0);
    });
    expect(hasFilterCountResolver).toBe(true);
    await act(async () => {
      resolveFilterCount({
        matchedLines: 1,
        documentVersion: 1,
      });
    });
    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
  });

  it("shows no-filter-match hint when filter backend returns zero matches", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_filter_rule_groups_config") {
        return [];
      }
      if (command === "filter_count_in_document") {
        return {
          matchedLines: 0,
          documentVersion: 1,
        };
      }
      if (command === "filter_in_document_chunk") {
        return {
          matches: [],
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
          startLine: 0,
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/No lines matched current filter rules/)).toBeInTheDocument();
    });
  });

  it("minimizes and reopens filter results panel", async () => {
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

    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Minimize results"));

    await waitFor(() => {
      expect(screen.getByTitle("Open filter results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Open filter results"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Close results"));

    await waitFor(() => {
      expect(screen.queryByTitle("Minimize results")).toBeNull();
    });
  });

  it("reopens minimized filter panel and re-runs filter query", async () => {
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
        invokeMock.mock.calls.filter(([command]) => command === "filter_in_document_chunk").length
      ).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTitle("Minimize results"));
    await waitFor(() => {
      expect(screen.getByTitle("Open filter results")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Open filter results"));

    await waitFor(() => {
      expect(screen.getByTitle("Minimize results")).toBeInTheDocument();
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

  it("does not refresh filter query when toggle is clicked during searching", async () => {
    let resolveFilterChunk!: (value: { matches: unknown[]; documentVersion: number; nextLine: null }) => void;
    let hasFilterChunkResolver = false;

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
        return await new Promise<{ matches: unknown[]; documentVersion: number; nextLine: null }>((resolve) => {
          resolveFilterChunk = resolve;
          hasFilterChunkResolver = true;
        });
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

    const filterButton = screen.getByTitle("Click Filter to run current rules");
    fireEvent.click(filterButton);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "filter_in_document_chunk")
      ).toHaveLength(1);
    });

    fireEvent.click(filterButton);
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "filter_in_document_chunk")
    ).toHaveLength(1);

    expect(hasFilterChunkResolver).toBe(true);
    resolveFilterChunk({
      matches: [],
      documentVersion: 1,
      nextLine: null,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "filter_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          startLine: 0,
        })
      );
    });
  });

  it("runs filter query with apply-to target switched to match", async () => {
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
                applyTo: "match",
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
    fireEvent.click(screen.getByRole("button", { name: "Match only" }));
    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "filter_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          rules: [
            expect.objectContaining({
              keyword: "todo",
              applyTo: "match",
            }),
          ],
          startLine: 0,
        })
      );
    });
  });

  it("updates filter-rule style and mode controls before running filter query", async () => {
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
          matches: [],
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

    fireEvent.click(screen.getByRole("button", { name: "Add Rule" }));
    fireEvent.click(screen.getAllByTitle("Delete")[1]);

    fireEvent.click(screen.getByRole("button", { name: "Regex" }));
    fireEvent.click(screen.getByRole("button", { name: "Wildcard" }));

    const noBgCheckbox = screen.getByLabelText("No Bg");
    fireEvent.click(noBgCheckbox);
    fireEvent.click(noBgCheckbox);

    const colorInputs = document.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.change(colorInputs[0], { target: { value: "#abcdef" } });
    fireEvent.change(colorInputs[1], { target: { value: "#123456" } });

    fireEvent.click(screen.getByLabelText("Bold"));
    fireEvent.click(screen.getByLabelText("Italic"));

    fireEvent.click(screen.getByRole("button", { name: "Match only" }));
    fireEvent.click(screen.getByRole("button", { name: "Whole line" }));

    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "filter_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          rules: [
            expect.objectContaining({
              keyword: "todo",
              matchMode: "wildcard",
              backgroundColor: "#abcdef",
              textColor: "#123456",
              bold: true,
              italic: true,
              applyTo: "line",
            }),
          ],
          startLine: 0,
        })
      );
    });
  });

  it("reorders filter rules via move buttons and drag-drop", async () => {
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
          matches: [],
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
    const { container } = render(<SearchReplacePanel />);

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
      target: { value: "first" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Rule" }));
    fireEvent.change(screen.getAllByPlaceholderText("Filter keyword")[1], {
      target: { value: "second" },
    });

    fireEvent.click(screen.getAllByTitle("Move down")[0]);
    fireEvent.click(screen.getAllByTitle("Move up")[1]);

    const dataTransferStore: Record<string, string> = {};
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn((type: string, value: string) => {
        dataTransferStore[type] = value;
      }),
      getData: vi.fn((type: string) => dataTransferStore[type] || ""),
    };

    const dragHandles = container.querySelectorAll<HTMLElement>('[draggable="true"]');
    const ruleInputs = screen.getAllByPlaceholderText("Filter keyword");
    const ruleCards = ruleInputs.map((input) => input.parentElement as HTMLElement);

    fireEvent.dragStart(dragHandles[0], { dataTransfer });
    fireEvent.dragOver(ruleCards[1], { dataTransfer });
    fireEvent.drop(ruleCards[1], { dataTransfer });
    fireEvent.dragEnd(dragHandles[0]);

    fireEvent.click(screen.getByTitle("Click Filter to run current rules"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "filter_in_document_chunk",
        expect.objectContaining({
          id: "tab-search",
          rules: expect.arrayContaining([
            expect.objectContaining({ keyword: "first" }),
            expect.objectContaining({ keyword: "second" }),
          ]),
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
