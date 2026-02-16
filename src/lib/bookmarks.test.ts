import { describe, expect, it, vi } from "vitest";
import { dispatchNavigateToLineFromBookmark } from "./bookmarks";

describe("bookmarks", () => {
  it("dispatches bookmark navigation events with sanitized line", () => {
    vi.useFakeTimers();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const events: CustomEvent[] = [];
    const listener = (event: Event) => {
      events.push(event as CustomEvent);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    dispatchNavigateToLineFromBookmark("tab-bookmark", Number.NaN);
    vi.runAllTimers();

    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
    rafSpy.mockRestore();
    vi.useRealTimers();

    expect(events).toHaveLength(3);
    expect(events[0].detail).toEqual(
      expect.objectContaining({
        tabId: "tab-bookmark",
        line: 1,
        column: 1,
        source: "bookmark",
      })
    );
  });

  it("floors finite decimal line number before dispatch", () => {
    vi.useFakeTimers();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const events: CustomEvent[] = [];
    const listener = (event: Event) => {
      events.push(event as CustomEvent);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    dispatchNavigateToLineFromBookmark("tab-bookmark-decimal", 3.9);
    vi.runAllTimers();

    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
    rafSpy.mockRestore();
    vi.useRealTimers();

    expect(events).toHaveLength(3);
    expect(events[0].detail).toEqual(
      expect.objectContaining({
        tabId: "tab-bookmark-decimal",
        line: 3,
      })
    );
  });

  it("clamps negative line to 1", () => {
    vi.useFakeTimers();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const events: CustomEvent[] = [];
    const listener = (event: Event) => {
      events.push(event as CustomEvent);
    };
    window.addEventListener("rutar:navigate-to-line", listener as EventListener);

    dispatchNavigateToLineFromBookmark("tab-bookmark-negative", -100);
    vi.runAllTimers();

    window.removeEventListener("rutar:navigate-to-line", listener as EventListener);
    rafSpy.mockRestore();
    vi.useRealTimers();

    expect(events).toHaveLength(3);
    expect(events[0].detail).toEqual(
      expect.objectContaining({
        tabId: "tab-bookmark-negative",
        line: 1,
      })
    );
  });
});
