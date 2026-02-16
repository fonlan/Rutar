import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownPreviewPanel } from "./MarkdownPreviewPanel";
import { useStore, type FileTab } from "@/store/useStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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

describe("MarkdownPreviewPanel", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    useStore.setState({ markdownPreviewWidthRatio: 0.5 });
    invokeMock.mockResolvedValue("# Hello");
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
});
