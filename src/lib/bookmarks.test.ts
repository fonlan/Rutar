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
});
