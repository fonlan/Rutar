import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MarkdownPreviewPanel } from "./MarkdownPreviewPanel";
import { useStore, type FileTab } from "@/store/useStore";

const {
  convertFileSrcMock,
  mermaidInitializeMock,
  mermaidRenderMock,
} = vi.hoisted(() => ({
  convertFileSrcMock: vi.fn(),
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: convertFileSrcMock,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock("mermaid/dist/mermaid.core.mjs", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

const invokeMock = vi.mocked(invoke);
const convertFileSrcApiMock = vi.mocked(convertFileSrc);
const openUrlMock = vi.mocked(openUrl);
const MERMAID_HTML = '<pre><code class="language-mermaid">graph TD;A--&gt;B;\n</code></pre>';

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

function setElementMetric(element: Element, key: string, value: number) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
  });
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
    convertFileSrcApiMock.mockImplementation((filePath: string) => `http://asset.localhost/${encodeURIComponent(filePath)}`);
    invokeMock.mockResolvedValue("<h1>Hello</h1>");
    mermaidInitializeMock.mockImplementation(() => undefined);
    mermaidRenderMock.mockResolvedValue({ svg: "<svg><g>ok</g></svg>" });
  });

  it("shows no active document message when tab is missing", () => {
    render(<MarkdownPreviewPanel open={true} tab={null} />);
    expect(screen.getByText("No active document")).toBeInTheDocument();
  });

  it("resolves relative markdown image paths through tauri asset URLs", async () => {
    const markdownTab = createTab({ path: "C:\\repo\\docs\\note.md", syntaxOverride: "markdown" });
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "render_markdown_preview") {
        return '<p><img src="./images/pic.png" alt="Preview"></p>';
      }
      if (
        command === "encode_image_file_as_data_url"
        && (args as { path?: string } | undefined)?.path === "C:\\repo\\docs\\images\\pic.png"
      ) {
        return "data:image/png;base64,Zm9v";
      }
      return "<h1>Hello</h1>";
    });
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const image = await screen.findByRole("img", { name: "Preview" });
    expect(convertFileSrcApiMock).toHaveBeenCalledWith("C:\\repo\\docs\\images\\pic.png");
    expect(image.getAttribute("src")).toBe("http://asset.localhost/C%3A%5Crepo%5Cdocs%5Cimages%5Cpic.png");
    expect(image.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("keeps remote markdown image paths unchanged", async () => {
    const markdownTab = createTab({ path: "C:\\repo\\docs\\note.md", syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><img src="https://example.com/pic.png" alt="Remote"></p>');
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const image = await screen.findByRole("img", { name: "Remote" });
    expect(convertFileSrcApiMock).not.toHaveBeenCalled();
    expect(image.getAttribute("src")).toBe("https://example.com/pic.png");
  });

  it("keeps data url markdown images unchanged", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><img src="data:image/png;base64,Zm9v" alt="Inline"></p>');
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const image = await screen.findByRole("img", { name: "Inline" });
    expect(convertFileSrcApiMock).not.toHaveBeenCalled();
    expect(image.getAttribute("src")).toBe("data:image/png;base64,Zm9v");
  });

  it("renders inline html color markup from markdown source", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<font color="#ff0000">Red</font><span style="background-color: #fff7a8;">Glow</span>');
    const { container } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(container.querySelector("font")).not.toBeNull();
      expect(container.querySelector('span[style*="background-color: #fff7a8"]')).not.toBeNull();
    });
  });

  it("opens markdown hyperlinks with the system opener instead of navigating in-panel", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><a href="https://example.com/docs">Docs</a></p>');
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const link = await screen.findByRole("link", { name: "Docs" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const dispatched = link.dispatchEvent(event);
    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith("https://example.com/docs");
    });
  });

  it("opens clicked markdown images with the system opener using the original file target", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><img src="./images/pic.png" alt="Preview"></p>');
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const image = await screen.findByRole("img", { name: "Preview" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const dispatched = image.dispatchEvent(event);
    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith("file:///C:/repo/images/pic.png");
    });
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

  it("prevents native context menu inside preview panel", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    const previewScroller = document.querySelector(".preview-scroll-shared") as HTMLDivElement;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const dispatched = previewScroller.dispatchEvent(event);
    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("shows image context menu and copies remote preview images to the clipboard", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><img src="https://example.com/pic.png" alt="Preview"></p>');
    const { container } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const panel = container.firstElementChild as HTMLDivElement | null;
    expect(panel).not.toBeNull();
    vi.spyOn(panel as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
      x: 800,
      y: 100,
      left: 800,
      top: 100,
      right: 1200,
      bottom: 900,
      width: 400,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    const image = await screen.findByRole("img", { name: "Preview" });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 3 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 2 });
    const drawImageMock = vi.fn();
    const getImageDataMock = vi.fn(() => ({
      data: Uint8ClampedArray.from([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
        255, 255, 0, 255,
        255, 0, 255, 255,
        0, 255, 255, 255,
      ]),
    }));
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({
        drawImage: drawImageMock,
        getImageData: getImageDataMock,
      } as unknown as CanvasRenderingContext2D);
    try {
      const contextMenuEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 160,
        clientY: 120,
      });
      Object.defineProperty(contextMenuEvent, "target", {
        configurable: true,
        value: image,
      });
      fireEvent(panel as HTMLDivElement, contextMenuEvent);
      const copyButton = await screen.findByRole("menuitem", { name: "Copy Image" });
      const menu = copyButton.closest('[role="menu"]') as HTMLDivElement | null;
      expect(menu).not.toBeNull();
      expect(menu?.style.left).toBe("8px");
      expect(menu?.style.top).toBe("20px");
      fireEvent.click(copyButton);
      expect(screen.queryByRole("button", { name: "Copy Image" })).toBeNull();
      await waitFor(() => {
        expect(drawImageMock).toHaveBeenCalledWith(image, 0, 0, 3, 2);
        expect(invokeMock).toHaveBeenCalledWith("copy_rgba_image_to_clipboard", {
          rgba: [
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 255, 0, 255,
            255, 0, 255, 255,
            0, 255, 255, 255,
          ],
          width: 3,
          height: 2,
        });
      });
    } finally {
      getContextSpy.mockRestore();
    }
  });

  it("copies local preview images to the clipboard from the rendered image element", async () => {
    const markdownTab = createTab({ path: "C:\\repo\\docs\\note.md", syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce('<p><img src="./images/pic.png" alt="Local Preview"></p>');
    const { container } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    const panel = container.firstElementChild as HTMLDivElement | null;
    expect(panel).not.toBeNull();
    vi.spyOn(panel as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
      x: 800,
      y: 100,
      left: 800,
      top: 100,
      right: 1200,
      bottom: 900,
      width: 400,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    const image = await screen.findByRole("img", { name: "Local Preview" });
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 160,
      clientY: 120,
    });
    Object.defineProperty(contextMenuEvent, "target", {
      configurable: true,
      value: image,
    });
    fireEvent(panel as HTMLDivElement, contextMenuEvent);
    const copyButton = await screen.findByRole("menuitem", { name: "Copy Image" });
    fireEvent.click(copyButton);
    expect(screen.queryByRole("button", { name: "Copy Image" })).toBeNull();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("copy_image_file_to_clipboard", {
        path: "C:\\repo\\docs\\images\\pic.png",
      });
    });
    expect(getContextSpy).not.toHaveBeenCalled();
    expect(
      invokeMock.mock.calls.some(([command]) => command === "copy_rgba_image_to_clipboard")
    ).toBe(false);
    getContextSpy.mockRestore();
  });
  it("refreshes content when current tab emits document-updated event", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenLastCalledWith("render_markdown_preview", {
        id: markdownTab.id,
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

  it("reuses cached preview html when switching back to an already loaded markdown tab", async () => {
    const markdownTab = createTab({ id: "tab-markdown-cache", syntaxOverride: "markdown" });
    const textTab = createTab({
      id: "tab-text-cache",
      name: "note.txt",
      path: "C:\\repo\\note.txt",
      syntaxOverride: "plain_text",
    });
    invokeMock.mockResolvedValueOnce("<h1>Cached Preview</h1>");

    const { rerender } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await screen.findByRole("heading", { name: "Cached Preview" });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    rerender(<MarkdownPreviewPanel open={true} tab={textTab} />);
    expect(screen.getByText("Preview is available for Markdown files only.")).toBeInTheDocument();

    rerender(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    expect(screen.getByRole("heading", { name: "Cached Preview" })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
  it("keeps cached mermaid preview DOM when switching away and back to the same markdown tab", async () => {
    const markdownTab = createTab({ id: "tab-mermaid-cache", syntaxOverride: "markdown" });
    const textTab = createTab({
      id: "tab-text-after-mermaid-cache",
      name: "note.txt",
      path: "C:\\repo\\note.txt",
      syntaxOverride: "plain_text",
    });
    invokeMock.mockResolvedValueOnce(MERMAID_HTML);

    const { rerender } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-preview-tab-id="tab-mermaid-cache"] .mermaid-host svg')).not.toBeNull();
      expect(
        document
          .querySelector('[data-preview-tab-id="tab-mermaid-cache"]')
          ?.getAttribute("data-rutar-mermaid-theme")
      ).toBe("default");
    });

    const cachedArticle = document.querySelector(
      '[data-preview-tab-id="tab-mermaid-cache"]'
    ) as HTMLElement | null;
    expect(cachedArticle).not.toBeNull();
    expect(cachedArticle?.className).not.toContain("hidden");

    rerender(<MarkdownPreviewPanel open={true} tab={textTab} />);
    expect(document.querySelector('[data-preview-tab-id="tab-mermaid-cache"]')).toBe(cachedArticle);
    expect(cachedArticle?.className).toContain("hidden");

    rerender(<MarkdownPreviewPanel open={true} tab={markdownTab} />);

    await waitFor(() => {
      expect(document.querySelector('[data-preview-tab-id="tab-mermaid-cache"]')).toBe(cachedArticle);
      expect(cachedArticle?.className).not.toContain("hidden");
      expect(document.querySelector('[data-preview-tab-id="tab-mermaid-cache"] .mermaid-host svg')).not.toBeNull();
    });
    expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
  });


  it.skip("legacy editor/preview scroll sync behavior", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    const gestureArea = document.createElement("div");
    gestureArea.setAttribute("data-rutar-gesture-area", "true");
    const editorScroller = document.createElement("div");
    editorScroller.className = "editor-scroll-stable";
    gestureArea.appendChild(editorScroller);
    document.body.appendChild(gestureArea);
    Object.defineProperty(editorScroller, "scrollHeight", { configurable: true, value: 1400 });
    Object.defineProperty(editorScroller, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(editorScroller, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(editorScroller, "clientWidth", { configurable: true, value: 300 });
    editorScroller.scrollTop = 0;
    editorScroller.scrollLeft = 0;

    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const previewScroller = document.querySelector(".preview-scroll-shared") as HTMLDivElement;
    Object.defineProperty(previewScroller, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(previewScroller, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(previewScroller, "scrollWidth", { configurable: true, value: 700 });
    Object.defineProperty(previewScroller, "clientWidth", { configurable: true, value: 300 });

    previewScroller.scrollTop = 300;
    previewScroller.scrollLeft = 200;
    fireEvent.scroll(previewScroller);

    expect(editorScroller.scrollTop).toBe(550);
    expect(editorScroller.scrollLeft).toBe(300);
    gestureArea.remove();
  });

  it("keeps preview scroll ratio when rendered markdown content changes", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    const previewScroller = document.querySelector(".preview-scroll-shared") as HTMLDivElement;
    Object.defineProperty(previewScroller, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(previewScroller, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(previewScroller, "scrollWidth", { configurable: true, value: 700 });
    Object.defineProperty(previewScroller, "clientWidth", { configurable: true, value: 300 });
    previewScroller.scrollTop = 300;
    previewScroller.scrollLeft = 200;
    fireEvent.scroll(previewScroller);
    invokeMock.mockResolvedValueOnce("<h1>Updated</h1><h2>More</h2>");
    Object.defineProperty(previewScroller, "scrollHeight", { configurable: true, value: 1500 });
    Object.defineProperty(previewScroller, "scrollWidth", { configurable: true, value: 1100 });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("rutar:document-updated", {
          detail: { tabId: markdownTab.id },
        })
      );
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(previewScroller.scrollTop).toBe(600);
      expect(previewScroller.scrollLeft).toBe(400);
    });
  });
  it("keeps width ratio stable during drag and commits on pointerup", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    const { container } = render(
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
    const resizePreview = container.querySelector(
      ".pointer-events-none.fixed.w-px.bg-primary\\/70"
    ) as HTMLDivElement | null;
    expect(resizePreview).not.toBeNull();
    expect(useStore.getState().markdownPreviewWidthRatio).toBeCloseTo(0.5, 4);
    expect(resizePreview?.style.left).toBe("600px");

    fireEvent.pointerMove(document, { pointerId: 7, clientX: 20 });
    expect(useStore.getState().markdownPreviewWidthRatio).toBeCloseTo(0.5, 4);
    expect(resizePreview?.style.left).toBe("20px");

    fireEvent.pointerUp(document, { pointerId: 7 });
    expect(useStore.getState().markdownPreviewWidthRatio).toBeCloseTo(0.8, 4);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("renders the resize preview line outside the transformed preview section", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    const { container } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const panel = container.firstElementChild as HTMLDivElement | null;
    const section = panel?.querySelector("section") as HTMLElement | null;
    const resizePreview = panel?.querySelector(
      ".pointer-events-none.fixed.w-px.bg-primary\\/70"
    ) as HTMLDivElement | null;

    expect(panel).not.toBeNull();
    expect(section).not.toBeNull();
    expect(resizePreview).not.toBeNull();
    expect(section?.contains(resizePreview as Node)).toBe(false);
  });

  it("does not animate preview width changes from surrounding layout updates", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    const { container } = render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    const panel = container.firstElementChild as HTMLDivElement | null;
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain("transition-[opacity,border-color]");
    expect(panel?.className).not.toContain("transition-[width,opacity,border-color]");
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

  it("allows native preview wheel scrolling when no mermaid zoom action is triggered", async () => {
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
    invokeMock.mockResolvedValueOnce(MERMAID_HTML);
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

  it("re-renders mermaid diagrams after dragging the preview splitter", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce(MERMAID_HTML);
    render(
      <div data-testid="layout-root">
        <MarkdownPreviewPanel open={true} tab={markdownTab} />
      </div>
    );
    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledTimes(1);
      expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
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
    fireEvent.pointerDown(resizeHandle, { pointerId: 11, clientX: 600 });
    expect(mermaidInitializeMock).toHaveBeenCalledTimes(1);
    expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(document, { pointerId: 11, clientX: 520 });
    expect(mermaidInitializeMock).toHaveBeenCalledTimes(1);
    expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(document, { pointerId: 11 });
    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledTimes(2);
      expect(mermaidRenderMock).toHaveBeenCalledTimes(2);
    });
    expect(document.querySelector(".mermaid-host svg")).not.toBeNull();
  });

  it("supports mermaid zoom, pan, and reset without forwarding ctrl+wheel to editor scrolling", async () => {
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
    invokeMock.mockResolvedValueOnce(MERMAID_HTML);
    render(<MarkdownPreviewPanel open={true} tab={markdownTab} />);
    await waitFor(() => {
      expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
    });
    const viewport = document.querySelector(".mermaid-interactive-viewport") as HTMLDivElement;
    const canvas = document.querySelector(".mermaid-interactive-canvas") as HTMLDivElement;
    const svg = document.querySelector(".mermaid-host svg") as SVGSVGElement;
    const resetButton = screen.getByRole("button", { name: "Reset view" });
    expect(viewport).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(svg).not.toBeNull();
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    } as DOMRect);
    setElementMetric(viewport, "clientWidth", 400);
    setElementMetric(viewport, "clientHeight", 300);
    Object.defineProperty(viewport, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(viewport, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.wheel(viewport, {
      deltaY: -120,
      ctrlKey: true,
      clientX: 120,
      clientY: 90,
    });
    expect(editorScroller.scrollTop).toBe(100);
    expect(editorScroller.scrollLeft).toBe(40);
    expect(Number(viewport.dataset.mermaidScale)).toBeGreaterThan(1);
    expect(svg.style.width).not.toBe("");
    expect(resetButton).not.toBeDisabled();
    fireEvent.pointerDown(viewport, { pointerId: 21, clientX: 220, clientY: 180, button: 0 });
    fireEvent.pointerMove(document, { pointerId: 21, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(document, { pointerId: 21 });
    expect(viewport.scrollLeft).toBeGreaterThan(0);
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(svg.style.width).toContain("px");
    fireEvent.click(resetButton);
    expect(viewport.dataset.mermaidScale).toBe("1.0000");
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    gestureArea.remove();
  });

  it("logs error when mermaid initialization throws", async () => {
    const markdownTab = createTab({ syntaxOverride: "markdown" });
    invokeMock.mockResolvedValueOnce(MERMAID_HTML);
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
