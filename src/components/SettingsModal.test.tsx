import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsModal } from "./SettingsModal";
import { useStore } from "@/store/useStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
}));

const invokeMock = vi.mocked(invoke);
const openUrlMock = vi.mocked(openUrl);

describe("SettingsModal", () => {
  let initialState: ReturnType<typeof useStore.getState>;
  let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

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
    clipboardWriteTextMock = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
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

  it("opens project url from about panel", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /About/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Open link" }));

    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith("https://github.com/fonlan/Rutar");
    });
  });

  it("copies project url from about panel", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /About/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("https://github.com/fonlan/Rutar");
    });
  });

  it("closes modal when clicking backdrop", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    const backdrop = screen.getByRole("presentation");
    fireEvent.mouseDown(backdrop);

    await waitFor(() => {
      expect(useStore.getState().settings.isOpen).toBe(false);
    });
  });

  it("shows restart toast after toggling single-instance mode", async () => {
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({ singleInstanceMode: true });
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: "Single Instance Mode" }));

    await waitFor(() => {
      expect(useStore.getState().settings.singleInstanceMode).toBe(false);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Restart Rutar to apply it/i);
  });

  it("removes a mouse gesture from list", async () => {
    useStore.getState().updateSettings({
      mouseGesturesEnabled: true,
      mouseGestures: [
        { pattern: "L", action: "previousTab" },
        { pattern: "R", action: "nextTab" },
      ],
    });
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByText("Mouse Gestures"));
    fireEvent.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGestures).toEqual([{ pattern: "R", action: "nextTab" }]);
    });
  });

  it("ignores duplicate mouse gesture pattern edits", async () => {
    useStore.getState().updateSettings({
      mouseGesturesEnabled: true,
      mouseGestures: [
        { pattern: "L", action: "previousTab" },
        { pattern: "R", action: "nextTab" },
      ],
    });
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByText("Mouse Gestures"));
    const sequenceInputs = await screen.findAllByDisplayValue(/^(L|R)$/);
    fireEvent.change(sequenceInputs[0], { target: { value: "R" } });

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGestures[0].pattern).toBe("L");
      expect(useStore.getState().settings.mouseGestures[1].pattern).toBe("R");
    });
  });

  it("logs error when loading system fonts fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        throw new Error("font-load-failed");
      }
      return [];
    });

    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load system fonts:",
        expect.any(Error)
      );
    });
    errorSpy.mockRestore();
  });

  it("opens project url from about url card button", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /About/ }));
    fireEvent.click(await screen.findByRole("button", { name: /https:\/\/github.com\/fonlan\/Rutar/i }));

    await waitFor(() => {
      expect(openUrlMock).toHaveBeenCalledWith("https://github.com/fonlan/Rutar");
    });
  });
});
