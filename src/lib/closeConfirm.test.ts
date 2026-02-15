import { describe, expect, it, vi } from "vitest";
import {
  requestTabCloseConfirm,
  TAB_CLOSE_CONFIRM_REQUEST_EVENT,
  TAB_CLOSE_CONFIRM_RESPONSE_EVENT,
} from "./closeConfirm";

describe("closeConfirm", () => {
  it("resolves cancel when window is unavailable", async () => {
    const originalWindow = globalThis.window;
    // Simulate non-browser runtime for the guard branch.
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });

    await expect(
      requestTabCloseConfirm({
        language: "zh-CN",
        tabName: "a.ts",
        allowAllActions: false,
      })
    ).resolves.toBe("cancel");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("dispatches request event and resolves only when response id matches", async () => {
    let requestId = "";
    const requestListener = vi.fn((event: Event) => {
      const detail = (event as CustomEvent).detail as {
        id: string;
        language: string;
        tabName: string;
        allowAllActions: boolean;
      };
      requestId = detail.id;
      expect(detail.language).toBe("en-US");
      expect(detail.tabName).toBe("dirty.ts");
      expect(detail.allowAllActions).toBe(true);
    });
    window.addEventListener(TAB_CLOSE_CONFIRM_REQUEST_EVENT, requestListener as EventListener);

    const promise = requestTabCloseConfirm({
      language: "en-US",
      tabName: "dirty.ts",
      allowAllActions: true,
    });

    window.dispatchEvent(
      new CustomEvent(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, {
        detail: {
          id: "wrong-id",
          action: "discard",
        },
      })
    );

    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    window.dispatchEvent(
      new CustomEvent(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, {
        detail: {
          id: requestId,
          action: "save_all",
        },
      })
    );

    await expect(promise).resolves.toBe("save_all");
    expect(requestListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(TAB_CLOSE_CONFIRM_REQUEST_EVENT, requestListener as EventListener);
  });
});
