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

  it("returns early when ref has no element", () => {
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    class MockResizeObserver {
      observe = observeMock;
      disconnect = disconnectMock;
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver as unknown as typeof ResizeObserver);

    function TestComponent() {
      const { ref, width, height } = useResizeObserver<HTMLDivElement>();
      void ref;
      return <span data-testid="size">{width},{height}</span>;
    }

    render(<TestComponent />);

    expect(screen.getByTestId("size").textContent).toBe("0,0");
    expect(observeMock).not.toHaveBeenCalled();
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("batches updates while animation frame is pending", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    let rafCallback: FrameRequestCallback | null = null;

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
        rafCallback = callback;
        return 7;
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

    act(() => {
      resizeCallback?.(
        [
          {
            contentRect: {
              width: 100,
              height: 60,
            },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
      resizeCallback?.(
        [
          {
            contentRect: {
              width: 180,
              height: 90,
            },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("size").textContent).toBe("0,0");

    act(() => {
      rafCallback?.(0);
    });

    expect(screen.getByTestId("size").textContent).toBe("180,90");

    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it("keeps previous size when frame update delta is below threshold", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    const queuedFrames: FrameRequestCallback[] = [];

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
        queuedFrames.push(callback);
        return queuedFrames.length;
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
    expect(screen.getByTestId("size").textContent).toBe("0,0");

    act(() => {
      queuedFrames.shift()?.(0);
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
    expect(rafSpy).toHaveBeenCalledTimes(2);

    act(() => {
      queuedFrames.shift()?.(16);
    });
    expect(screen.getByTestId("size").textContent).toBe("120,80");

    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it("ignores empty entries and cancels pending frame on unmount", () => {
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
      .mockImplementation(() => 17);
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

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

    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(rafSpy).not.toHaveBeenCalled();

    act(() => {
      resizeCallback?.(
        [
          {
            contentRect: {
              width: 120,
              height: 70,
            },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("size").textContent).toBe("0,0");

    unmount();

    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith(17);
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});
