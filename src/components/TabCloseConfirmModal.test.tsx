import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabCloseConfirmModal } from "./TabCloseConfirmModal";
import {
  TAB_CLOSE_CONFIRM_REQUEST_EVENT,
  TAB_CLOSE_CONFIRM_RESPONSE_EVENT,
} from "@/lib/closeConfirm";

describe("TabCloseConfirmModal", () => {
  it("ignores request events without detail payload", () => {
    render(<TabCloseConfirmModal />);

    act(() => {
      window.dispatchEvent(new CustomEvent(TAB_CLOSE_CONFIRM_REQUEST_EVENT));
    });

    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
  });

  it("renders dialog from request and responds with selected action", () => {
    render(<TabCloseConfirmModal />);

    const responses: Array<{ id: string; action: string }> = [];
    const responseListener = (event: Event) => {
      responses.push((event as CustomEvent).detail as { id: string; action: string });
    };
    window.addEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TAB_CLOSE_CONFIRM_REQUEST_EVENT, {
          detail: {
            id: "confirm-1",
            language: "en-US",
            tabName: "dirty.ts",
            allowAllActions: true,
          },
        })
      );
    });

    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
    expect(screen.getByText(/dirty.ts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes (All)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes (All)" }));

    expect(responses).toEqual([{ id: "confirm-1", action: "save_all" }]);
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
    window.removeEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);
  });

  it("hides all-actions buttons when allowAllActions is false", () => {
    render(<TabCloseConfirmModal />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TAB_CLOSE_CONFIRM_REQUEST_EVENT, {
          detail: {
            id: "confirm-2",
            language: "en-US",
            tabName: "dirty.ts",
            allowAllActions: false,
          },
        })
      );
    });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes (All)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No (All)" })).not.toBeInTheDocument();
  });

  it("responds with cancel, discard, and save actions", () => {
    const cases = [
      { id: "confirm-cancel", button: "Cancel", action: "cancel" },
      { id: "confirm-discard", button: "No", action: "discard" },
      { id: "confirm-save", button: "Yes", action: "save" },
    ] as const;

    cases.forEach(({ id, button, action }) => {
      const { unmount } = render(<TabCloseConfirmModal />);

      const responses: Array<{ id: string; action: string }> = [];
      const responseListener = (event: Event) => {
        responses.push((event as CustomEvent).detail as { id: string; action: string });
      };
      window.addEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);

      act(() => {
        window.dispatchEvent(
          new CustomEvent(TAB_CLOSE_CONFIRM_REQUEST_EVENT, {
            detail: {
              id,
              language: "en-US",
              tabName: "dirty.ts",
              allowAllActions: false,
            },
          })
        );
      });

      fireEvent.click(screen.getByRole("button", { name: button }));

      expect(responses).toEqual([{ id, action }]);
      expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
      window.removeEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);
      unmount();
    });
  });

  it("responds with discard_all action", () => {
    render(<TabCloseConfirmModal />);

    const responses: Array<{ id: string; action: string }> = [];
    const responseListener = (event: Event) => {
      responses.push((event as CustomEvent).detail as { id: string; action: string });
    };
    window.addEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TAB_CLOSE_CONFIRM_REQUEST_EVENT, {
          detail: {
            id: "confirm-discard-all",
            language: "en-US",
            tabName: "dirty.ts",
            allowAllActions: true,
          },
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "No (All)" }));

    expect(responses).toEqual([{ id: "confirm-discard-all", action: "discard_all" }]);
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
    window.removeEventListener(TAB_CLOSE_CONFIRM_RESPONSE_EVENT, responseListener as EventListener);
  });
});
