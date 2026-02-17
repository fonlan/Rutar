import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownPreviewPanel } from "./MarkdownPreviewPanel";
import { useStore, type FileTab } from "@/store/useStore";

const { mermaidInitializeMock, mermaidRenderMock } = vi.hoisted(() => ({
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("mermaid/dist/mermaid.core.mjs", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

const invokeMock = vi.mocked(invoke);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-md-preview",
    name: "note.md",
    path: "C:\\repo\\note.md",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 8,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

function getReactPointerDown(element: Element): ((event: unknown) => void) | undefined {
  const propsKey = Object.keys(element as object).find((key) => key.startsWith("__reactProps$"));
  return propsKey ? (element as any)[propsKey]?.onPointerDown : undefined;
}

describe("MarkdownPreviewPanel", () => {
  let initialState: ReturnType<typeof useStore.getState>;
  const requestAnimationFrameSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  const cancelAnimationFrameSpy = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => undefined);

  beforeAll(() => {
    initialState = useStore.getState();
  });

  afterAll(() => {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    useStore.setState({ markdownPreviewWidthRatio: 0.5 });
    invokeMock.mockResolvedValue("# Hello");
    mermaidInitializeMock.mockImplementation(() => undefined);
    mermaidRenderMock.mockResolvedValue({ svg: "<svg><g>ok</g></svg>" });
  });

  it("shows no active document message when tab is missing", () => {
    render(<MarkdownPreviewPanel open={true} tab={null} />);

    expect(screen.getByText("No active document")).toBeInTheDocument();
  });

  it("shows markdown-only message for non-markdown tabs", () => {
    const textTab = createTab({ name: "note.txt", path: "C:\\repo\\note.txt", syntaxOverride: "plain_text" });

    render(<MarkdownPreviewPanel open={true} tab={textTab} />);

    expect(screen.getByText("Preview is available for Markdown files only.")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("shows load error message when backend request fails", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockRejectedValueOnce(new Error("boom"));

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load preview: boom")).toBeInTheDocument();
    });
  });

  it("refreshes content when current tab emits document-updated event", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenLastCalledWith("get_visible_lines", {
        id: markdownTab.id,
        startLine: 0,
        endLine: markdownTab.lineCount,
      });
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:document-updated", {
          detail: { tabId: markdownTab.id },
        })
      );
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });
  });

  it("forwards preview wheel events to editor scroller", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    const gestureArea = document.createElement("div");
    gestureArea.setAttribute("data-rutar-gesture-area", "true");
    const editorScroller = document.createElement("div");
    editorScroller.className = "editor-scroll-stable";
    gestureArea.appendChild(editorScroller);
    document.body.appendChild(gestureArea);

    Object.defineProperty(editorScroller, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(editorScroller, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(editorScroller, "scrollWidth", { configurable: true, value: 800 });
    Object.defineProperty(editorScroller, "clientWidth", { configurable: true, value: 200 });
    editorScroller.scrollTop = 100;
    editorScroller.scrollLeft = 40;

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const previewScroller = document.querySelector(".preview-scroll-shared") as HTMLDivElement;
    fireEvent.wheel(previewScroller, { deltaY: 60, deltaX: 25 });

    expect(editorScroller.scrollTop).toBe(160);
    expect(editorScroller.scrollLeft).toBe(65);

    gestureArea.remove();
  });

  it("updates width ratio when dragging resize handle", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });

    render(
      <div data-testid="layout-root">
        <MarkdownPreviewPanel open={true} tab={markdownTab} />
      </div>
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const resizeHandle = screen.getByRole("separator", {
      name: "Resize markdown preview panel",
      hidden: true,
    });
    const previewPanel = resizeHandle.closest("[aria-hidden]") as HTMLDivElement;
    const parentElement = previewPanel.parentElement as HTMLDivElement;
    vi.spyOn(parentElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(resizeHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(resizeHandle, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(resizeHandle, { pointerId: 7, clientX: 600 });
    expect(useStore.getState().markdownPreviewWidthRatio).toBeCloseTo(0.4, 4);

    fireEvent.pointerMove(document, { pointerId: 7, clientX: 20 });
    expect(useStore.getState().markdownPreviewWidthRatio).toBeCloseTo(0.8, 4);

    fireEvent.pointerUp(document, { pointerId: 7 });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("ignores resize handle pointerdown when preview panel is closed", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    useStore.setState({ markdownPreviewWidthRatio: 0.5 });

    render(<MarkdownPreviewPanel open={false} tab={markdownTab} />);

    const resizeHandle = screen.getByRole("separator", {
      name: "Resize markdown preview panel",
      hidden: true,
    });
    const setPointerCaptureMock = vi.fn();
    Object.defineProperty(resizeHandle, "setPointerCapture", {
      configurable: true,
      value: setPointerCaptureMock,
    });

    fireEvent.pointerDown(resizeHandle, { pointerId: 9, clientX: 300 });

    expect(useStore.getState().markdownPreviewWidthRatio).toBe(0.5);
    expect(setPointerCaptureMock).not.toHaveBeenCalled();
  });

  it("ignores resize pointerdown when preview panel parent element is missing", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    useStore.setState({ markdownPreviewWidthRatio: 0.5 });

    const { unmount } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const resizeHandle = screen.getByRole("separator", { name: "Resize markdown preview panel" });
    const setPointerCaptureMock = vi.fn();
    const preventDefaultMock = vi.fn();
    Object.defineProperty(resizeHandle, "setPointerCapture", {
      configurable: true,
      value: setPointerCaptureMock,
    });
    const pointerDown = getReactPointerDown(resizeHandle);
    expect(pointerDown).toBeTypeOf("function");

    unmount();
    pointerDown?.({
      preventDefault: preventDefaultMock,
      currentTarget: resizeHandle,
      pointerId: 10,
      clientX: 250,
    });

    expect(useStore.getState().markdownPreviewWidthRatio).toBe(0.5);
    expect(preventDefaultMock).not.toHaveBeenCalled();
    expect(setPointerCaptureMock).not.toHaveBeenCalled();
  });

  it("skips wheel forwarding when no editor scroller source is available", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const previewScroller = document.querySelector(".preview-scroll-shared") as HTMLDivElement;
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 40,
      deltaX: 20,
    });

    previewScroller.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(false);
  });

  it("shows mermaid fallback block when mermaid render fails", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce("```mermaid\ngraph TD;A-->B;\n```");
    mermaidRenderMock.mockRejectedValueOnce(new Error("render-boom"));

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledTimes(1);
      expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const fallback = document.querySelector(".mermaid-render-error");
      expect(fallback).not.toBeNull();
      expect(fallback?.textContent).toContain("Mermaid render failed: render-boom");
      expect(fallback?.textContent).toContain("graph TD;A-->B;");
    });
  });

  it("logs error when mermaid initialization throws", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce("```mermaid\ngraph TD;A-->B;\n```");
    mermaidInitializeMock.mockImplementationOnce(() => {
      throw new Error("init-boom");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to render mermaid diagrams:",
          expect.objectContaining({ message: "init-boom" })
        );
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
