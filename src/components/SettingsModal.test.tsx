import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const originalUserAgent = window.navigator.userAgent;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value,
  });
}

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
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
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

    const languageSelect = screen.getByRole("combobox", { name: "Language" });
    fireEvent.change(languageSelect, { target: { value: "zh-CN" } });

    await waitFor(() => {
      expect(useStore.getState().settings.language).toBe("zh-CN");
    });
    expect(screen.getByRole("combobox", { name: "新建文件换行符" })).toBeInTheDocument();
  });

  it("toggles word wrap switch", async () => {
    useStore.getState().toggleSettings(true);

    render(<SettingsModal />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Word Wrap" }));

    await waitFor(() => {
      expect(useStore.getState().settings.wordWrap).toBe(true);
    });
  });

  it("registers and unregisters Windows context menu from general tab", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({ windowsContextMenuEnabled: false });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      return undefined;
    });

    render(<SettingsModal />);

    const toggleButton = await screen.findByRole("button", { name: "Windows 11 Context Menu" });
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("register_windows_context_menu", {
        language: "en-US",
      });
      expect(useStore.getState().settings.windowsContextMenuEnabled).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Windows 11 Context Menu" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("unregister_windows_context_menu");
      expect(useStore.getState().settings.windowsContextMenuEnabled).toBe(false);
    });
  });

  it("logs error when Windows context menu registration fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({ windowsContextMenuEnabled: false });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "register_windows_context_menu") {
        throw new Error("register-failed");
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      return undefined;
    });

    render(<SettingsModal />);
    fireEvent.click(await screen.findByRole("button", { name: "Windows 11 Context Menu" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to update Windows context menu:",
        expect.any(Error)
      );
      expect(useStore.getState().settings.windowsContextMenuEnabled).toBe(false);
    });
    errorSpy.mockRestore();
  });

  it("toggles Windows file associations on and off", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({
      windowsFileAssociationEnabled: false,
      windowsFileAssociationExtensions: [".txt", ".md"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      if (command === "apply_windows_file_associations") {
        return [".TXT", ".env", ".md"];
      }
      return undefined;
    });

    render(<SettingsModal />);
    fireEvent.click(await screen.findByRole("button", { name: "Windows File Associations" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("apply_windows_file_associations", {
        language: "en-US",
        extensions: [".md", ".txt"],
        openSettingsPage: true,
      });
      expect(useStore.getState().settings.windowsFileAssociationEnabled).toBe(true);
      expect(useStore.getState().settings.windowsFileAssociationExtensions).toEqual([".env", ".md", ".txt"]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Windows File Associations" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("remove_windows_file_associations", {
        extensions: [".env", ".md", ".txt"],
      });
      expect(useStore.getState().settings.windowsFileAssociationEnabled).toBe(false);
    });
  });

  it("logs error when Windows file association toggle fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({
      windowsFileAssociationEnabled: false,
      windowsFileAssociationExtensions: [".txt"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      if (command === "apply_windows_file_associations") {
        throw new Error("apply-association-failed");
      }
      return undefined;
    });

    render(<SettingsModal />);
    fireEvent.click(await screen.findByRole("button", { name: "Windows File Associations" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to update Windows file associations:",
        expect.any(Error)
      );
      expect(useStore.getState().settings.windowsFileAssociationEnabled).toBe(false);
    });
    errorSpy.mockRestore();
  });

  it("persists preset extension changes when Windows file associations are enabled", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({
      windowsFileAssociationEnabled: true,
      windowsFileAssociationExtensions: [".txt", ".md"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      if (command === "apply_windows_file_associations") {
        return [".md"];
      }
      return undefined;
    });

    render(<SettingsModal />);
    fireEvent.click(await screen.findByRole("button", { name: ".txt" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("remove_windows_file_associations", {
        extensions: [".txt"],
      });
      expect(invokeMock).toHaveBeenCalledWith("apply_windows_file_associations", {
        language: "en-US",
        extensions: [".md"],
      });
      expect(useStore.getState().settings.windowsFileAssociationEnabled).toBe(true);
      expect(useStore.getState().settings.windowsFileAssociationExtensions).toEqual([".md"]);
    });
  });

  it("adds and removes custom Windows file association extensions", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    useStore.getState().toggleSettings(true);
    useStore.getState().updateSettings({
      windowsFileAssociationEnabled: false,
      windowsFileAssociationExtensions: [".txt"],
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_system_fonts") {
        return ["Consolas", "Cascadia Code"];
      }
      if (command === "get_default_windows_file_association_extensions") {
        return [".txt", ".md"];
      }
      return undefined;
    });

    render(<SettingsModal />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Custom extension, e.g. .env" }), {
      target: { value: ".sql" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(useStore.getState().settings.windowsFileAssociationExtensions).toEqual([".sql", ".txt"]);
    });

    fireEvent.click(screen.getByRole("button", { name: /\.sql/i }));

    await waitFor(() => {
      expect(useStore.getState().settings.windowsFileAssociationExtensions).toEqual([".txt"]);
    });
  });

  it("updates appearance settings from appearance tab controls", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /Appearance/i }));
    fireEvent.change(await screen.findByDisplayValue("Light"), { target: { value: "dark" } });

    const numberInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(numberInputs[0], { target: { value: "18" } });
    fireEvent.change(numberInputs[1], { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Show Line Numbers" }));
    fireEvent.click(screen.getByRole("button", { name: "Highlight Current Line" }));

    await waitFor(() => {
      const { settings } = useStore.getState();
      expect(settings.theme).toBe("dark");
      expect(settings.fontSize).toBe(18);
      expect(settings.tabWidth).toBe(8);
      expect(settings.showLineNumbers).toBe(false);
      expect(settings.highlightCurrentLine).toBe(false);
    });
  });

  it("associates appearance labels with theme and typography controls", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /Appearance/i }));

    expect(await screen.findByRole("combobox", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByLabelText("Font Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Tab Width")).toBeInTheDocument();
  });

  it("renders shortcut table in shortcuts tab", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /Shortcuts/i }));

    await waitFor(() => {
      expect(screen.getByText("Action")).toBeInTheDocument();
      expect(screen.getByText("Shortcut")).toBeInTheDocument();
      expect(screen.getByText("F3 / Shift + F3")).toBeInTheDocument();
      expect(screen.getByText("Go to Line")).toBeInTheDocument();
      expect(screen.getByText("Ctrl + G")).toBeInTheDocument();
    });
  });

  it("selects font from suggestions with keyboard navigation", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /Appearance/i }));
    const input = await screen.findByPlaceholderText("Type or select a font family (system fonts supported)");
    fireEvent.change(input, { target: { value: "casc" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(useStore.getState().settings.fontFamily.toLowerCase()).toContain("cascadia code");
      expect(useStore.getState().settings.fontFamily.toLowerCase().startsWith("cascadia code")).toBe(true);
    });
  });

  it("reorders and removes fonts in appearance font priority list", async () => {
    useStore.getState().updateSettings({
      fontFamily: "Consolas, Cascadia Code, Arial",
    });
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /Appearance/i }));

    const moveDownButtons = await screen.findAllByRole("button", { name: "Move Font Down" });
    fireEvent.click(moveDownButtons[0]);

    await waitFor(() => {
      expect(useStore.getState().settings.fontFamily).toBe("Cascadia Code, Consolas, Arial");
    });

    const removeButtons = screen.getAllByRole("button", { name: "Remove Font" });
    fireEvent.click(removeButtons[2]);

    await waitFor(() => {
      expect(useStore.getState().settings.fontFamily).toBe("Cascadia Code, Consolas");
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

  it("toggles mouse gesture section visibility with switch state", async () => {
    useStore.getState().updateSettings({
      mouseGesturesEnabled: true,
      mouseGestures: [{ pattern: "L", action: "previousTab" }],
    });
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByText("Mouse Gestures"));
    await screen.findByDisplayValue("L");

    const gestureButtons = screen.getAllByRole("button", { name: "Mouse Gestures" });
    fireEvent.click(gestureButtons[gestureButtons.length - 1]);

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(false);
      expect(screen.queryByDisplayValue("L")).toBeNull();
    });

    const refreshedButtons = screen.getAllByRole("button", { name: "Mouse Gestures" });
    fireEvent.click(refreshedButtons[refreshedButtons.length - 1]);

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGesturesEnabled).toBe(true);
      expect(screen.getByDisplayValue("L")).toBeInTheDocument();
    });
  });

  it("updates existing and new mouse gesture actions from action selectors", async () => {
    useStore.getState().updateSettings({
      mouseGesturesEnabled: true,
      mouseGestures: [{ pattern: "L", action: "previousTab" }],
    });
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByText("Mouse Gestures"));
    expect(await screen.findByRole("textbox", { name: "Gesture Sequence 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Action 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Gesture Sequence" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();

    const actionSelects = await screen.findAllByRole("combobox");
    fireEvent.change(actionSelects[0], { target: { value: "closeCurrentTab" } });

    await waitFor(() => {
      expect(useStore.getState().settings.mouseGestures[0].action).toBe("closeCurrentTab");
    });

    fireEvent.change(actionSelects[actionSelects.length - 1], {
      target: { value: "toggleSidebar" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. L, RD, UL"), {
      target: { value: "du" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        useStore
          .getState()
          .settings.mouseGestures.some(
            (gesture) => gesture.pattern === "DU" && gesture.action === "toggleSidebar"
          )
      ).toBe(true);
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

  it("logs error when opening project url fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    openUrlMock.mockRejectedValueOnce(new Error("open-failed"));
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /About/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Open link" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to open project URL:",
        expect.any(Error)
      );
    });
    errorSpy.mockRestore();
  });

  it("logs error when copying project url fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("copy-failed"));
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /About/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to copy project URL:",
        expect.any(Error)
      );
    });
    errorSpy.mockRestore();
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

  it("keeps modal open when clicking inside dialog content", async () => {
    useStore.getState().toggleSettings(true);
    render(<SettingsModal />);

    fireEvent.mouseDown(screen.getByRole("dialog"));

    await waitFor(() => {
      expect(useStore.getState().settings.isOpen).toBe(true);
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
