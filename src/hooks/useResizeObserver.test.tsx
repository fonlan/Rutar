import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResizeObserver } from "./useResizeObserver";

describe("useResizeObserver", () => {
  it("observes element size and filters tiny changes", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observeMock;
      disconnect = disconnectMock;
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    function TestComponent() {
      const { ref, width, height } = useResizeObserver<HTMLDivElement>();
      return (
        <div>
          <div ref={ref} data-testid="target" />
          <span data-testid="size">
            {width},{height}
          </span>
        </div>
      );
    }

    const { unmount } = render(<TestComponent />);
    expect(observeMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("size").textContent).toBe("0,0");

    act(() => {
      resizeCallback?.(
        [
          {
            contentRect: {
              width: 120,
              height: 80,
            },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    });
    expect(screen.getByTestId("size").textContent).toBe("120,80");

    act(() => {
      resizeCallback?.(
        [
          {
            contentRect: {
              width: 120.2,
              height: 80.3,
            },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    });
    expect(screen.getByTestId("size").textContent).toBe("120,80");

    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });
});
