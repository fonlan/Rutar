import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectOutlineType, dispatchNavigateToLineFromOutline, loadOutline } from "./outline";
import { invoke } from "@tauri-apps/api/core";
import type { FileTab } from "@/store/useStore";

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
    lineCount: 1,
    largeFileMode: false,
    ...partial,
  };
}

describe("outline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects outline type from syntax override first", () => {
    expect(detectOutlineType(createTab({ syntaxOverride: "yaml" }))).toBe("yaml");
    expect(
      detectOutlineType(
        createTab({ syntaxOverride: "  RUST  " as unknown as FileTab["syntaxOverride"] })
      )
    ).toBe("rust");
    expect(detectOutlineType(createTab({ syntaxOverride: "markdown" }))).toBe(null);
  });

  it("detects outline type from extension", () => {
    expect(detectOutlineType(createTab({ path: "C:\\repo\\main.rs" }))).toBe("rust");
    expect(detectOutlineType(createTab({ path: "C:\\repo\\a.yml" }))).toBe("yaml");
    expect(detectOutlineType(createTab({ path: "C:\\repo\\a." }))).toBe(null);
    expect(detectOutlineType(createTab({ path: "C:\\repo\\README" }))).toBe(null);
    expect(detectOutlineType(null)).toBe(null);
  });

  it("dispatches navigation events with sanitized coordinates", () => {
    vi.useFakeTimers();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const lineEvents: CustomEvent[] = [];
    const outlineEvents: CustomEvent[] = [];
    const lineListener = (event: Event) => lineEvents.push(event as CustomEvent);
    const outlineListener = (event: Event) => outlineEvents.push(event as CustomEvent);
    window.addEventListener("rutar:navigate-to-line", lineListener as EventListener);
    window.addEventListener("rutar:navigate-to-outline", outlineListener as EventListener);

    dispatchNavigateToLineFromOutline("tab-1", 0.1, Number.NaN);
    vi.runAllTimers();

    window.removeEventListener("rutar:navigate-to-line", lineListener as EventListener);
    window.removeEventListener("rutar:navigate-to-outline", outlineListener as EventListener);
    rafSpy.mockRestore();
    vi.useRealTimers();

    expect(lineEvents.length).toBe(3);
    expect(outlineEvents.length).toBe(3);
    expect(lineEvents[0].detail).toEqual(
      expect.objectContaining({
        tabId: "tab-1",
        line: 1,
        column: 1,
        source: "outline",
      })
    );
  });

  it("loadOutline invokes backend command with expected payload", async () => {
    const nodes = [{ label: "x", nodeType: "fn", line: 1, column: 1, children: [] }];
    invokeMock.mockResolvedValue(nodes);
    const tab = createTab({ id: "tab-x" });

    const result = await loadOutline(tab, "typescript");

    expect(invokeMock).toHaveBeenCalledWith("get_outline", {
      id: "tab-x",
      fileType: "typescript",
    });
    expect(result).toEqual(nodes);
  });
});
