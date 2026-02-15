import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";

describe("useResizableSidebarWidth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });

  it("resizes from right edge with clamp and commits width on pointerup", () => {
    const onWidthChange = vi.fn();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const { result } = renderHook(() =>
      useResizableSidebarWidth({
        width: 240,
        minWidth: 200,
        maxWidth: 400,
        onWidthChange,
      })
    );

    const container = document.createElement("div");
    act(() => {
      result.current.containerRef.current = container;
    });

    act(() => {
      result.current.startResize({
        preventDefault: vi.fn(),
        clientX: 100,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 }));
    });

    expect(container.style.width).toBe("400px");

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(onWidthChange).toHaveBeenCalledWith(400);
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");
    rafSpy.mockRestore();
  });

  it("supports left edge resize direction", () => {
    const onWidthChange = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const { result } = renderHook(() =>
      useResizableSidebarWidth({
        width: 300,
        minWidth: 100,
        maxWidth: 500,
        onWidthChange,
        resizeEdge: "left",
      })
    );

    const container = document.createElement("div");
    act(() => {
      result.current.containerRef.current = container;
    });

    act(() => {
      result.current.startResize({
        preventDefault: vi.fn(),
        clientX: 500,
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 450 }));
    });
    expect(container.style.width).toBe("350px");

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(onWidthChange).toHaveBeenCalledWith(350);
  });
});
