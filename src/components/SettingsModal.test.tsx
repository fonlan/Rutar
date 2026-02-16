import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SettingsModal } from "./SettingsModal";
import { useStore } from "@/store/useStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
}));

const invokeMock = vi.mocked(invoke);

describe("SettingsModal", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({
      language: "en-US",
      wordWrap: false,
    });
    invokeMock.mockResolvedValue(["Consolas", "Cascadia Code"]);
  });

  it("renders null when modal is closed", async () => {
    useStore.getState().toggleSettings(false);

    const view = render(<SettingsModal />);

    expect(view.container.firstChild).toBeNull();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_system_fonts");
    });
  });

  it("closes modal from top-right close button", async () => {
    useStore.getState().toggleSettings(true);

    render(<SettingsModal />);
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    await waitFor(() => {
      expect(useStore.getState().settings.isOpen).toBe(false);
    });
  });

  it("updates language from general settings", async () => {
    useStore.getState().toggleSettings(true);

    render(<SettingsModal />);

    const languageSelect = screen.getByDisplayValue("English (US)");
    fireEvent.change(languageSelect, { target: { value: "zh-CN" } });

    await waitFor(() => {
      expect(useStore.getState().settings.language).toBe("zh-CN");
    });
  });

  it("toggles word wrap switch", async () => {
    useStore.getState().toggleSettings(true);

    render(<SettingsModal />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Word Wrap" }));

    await waitFor(() => {
      expect(useStore.getState().settings.wordWrap).toBe(true);
    });
  });

  it("adds a new mouse gesture with normalized pattern", async () => {
    useStore.getState().toggleSettings(true);

    render(<SettingsModal />);

    fireEvent.click(screen.getByText("Mouse Gestures"));

    const input = await screen.findByPlaceholderText("e.g. L, RD, UL");
    fireEvent.change(input, { target: { value: "rdx1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const gestures = useStore.getState().settings.mouseGestures;
      expect(gestures.some((gesture) => gesture.pattern === "RD")).toBe(true);
    });
  });
});
