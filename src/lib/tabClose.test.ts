import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  confirmTabClose,
  ensureTabCanClose,
  saveTab,
  shouldEnableBulkTabCloseActions,
} from "./tabClose";
import type { FileTab } from "@/store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { requestTabCloseConfirm } from "@/lib/closeConfirm";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@/lib/closeConfirm", () => ({
  requestTabCloseConfirm: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const saveDialogMock = vi.mocked(save);
const requestTabCloseConfirmMock = vi.mocked(requestTabCloseConfirm);

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-1",
    name: "main.ts",
    path: "C:\\repo\\main.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 1,
    largeFileMode: false,
    isDirty: true,
    ...partial,
  };
}

describe("tabClose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveTab saves existing file path via save_file", async () => {
    invokeMock.mockResolvedValue(undefined);
    const updateTab = vi.fn();

    const ok = await saveTab(createTab(), updateTab);

    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_file", { id: "tab-1" });
    expect(updateTab).toHaveBeenCalledWith("tab-1", { isDirty: false });
    expect(saveDialogMock).not.toHaveBeenCalled();
  });

  it("saveTab returns false when save-as is cancelled", async () => {
    saveDialogMock.mockResolvedValue(null);
    const updateTab = vi.fn();

    const ok = await saveTab(createTab({ path: "", name: "" }), updateTab);

    expect(ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith("save_file_as", expect.anything());
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("saveTab returns false when save-as result is not a string", async () => {
    saveDialogMock.mockResolvedValue(["C:\\repo\\a.ts"] as unknown as string);
    const updateTab = vi.fn();

    const ok = await saveTab(createTab({ path: "", name: "Untitled-2" }), updateTab);

    expect(ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith("save_file_as", expect.anything());
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("saveTab saves as new file and updates tab metadata", async () => {
    saveDialogMock.mockResolvedValue("C:\\repo\\new-name.ts");
    invokeMock.mockResolvedValue(undefined);
    const updateTab = vi.fn();

    const ok = await saveTab(createTab({ path: "", name: "Untitled-1" }), updateTab);

    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_file_as", {
      id: "tab-1",
      path: "C:\\repo\\new-name.ts",
    });
    expect(updateTab).toHaveBeenCalledWith("tab-1", {
      path: "C:\\repo\\new-name.ts",
      name: "new-name.ts",
      isDirty: false,
    });
  });

  it("confirmTabClose returns discard for clean tabs", async () => {
    const decision = await confirmTabClose(createTab({ isDirty: false }), "zh-CN", false);

    expect(decision).toBe("discard");
    expect(requestTabCloseConfirmMock).not.toHaveBeenCalled();
  });

  it("confirmTabClose asks closeConfirm for dirty tabs", async () => {
    requestTabCloseConfirmMock.mockResolvedValue("save");

    const decision = await confirmTabClose(
      createTab({ name: "", path: "C:\\repo\\dirty.ts", isDirty: true }),
      "en-US",
      true
    );

    expect(decision).toBe("save");
    expect(requestTabCloseConfirmMock).toHaveBeenCalledWith({
      language: "en-US",
      tabName: "C:\\repo\\dirty.ts",
      allowAllActions: true,
    });
  });

  it("confirmTabClose falls back to Untitled display name", async () => {
    requestTabCloseConfirmMock.mockResolvedValue("discard");

    await confirmTabClose(createTab({ name: "", path: "", isDirty: true }), "zh-CN", true);

    expect(requestTabCloseConfirmMock).toHaveBeenCalledWith({
      language: "zh-CN",
      tabName: "Untitled",
      allowAllActions: true,
    });
  });

  it("ensureTabCanClose handles cancel/discard/save decisions", async () => {
    const updateTab = vi.fn();
    const tab = createTab({ isDirty: true });

    requestTabCloseConfirmMock.mockResolvedValueOnce("cancel");
    await expect(ensureTabCanClose(tab, "zh-CN", updateTab)).resolves.toBe(false);

    requestTabCloseConfirmMock.mockResolvedValueOnce("discard");
    await expect(ensureTabCanClose(tab, "zh-CN", updateTab)).resolves.toBe(true);

    requestTabCloseConfirmMock.mockResolvedValueOnce("save");
    invokeMock.mockResolvedValue(undefined);
    await expect(ensureTabCanClose(tab, "zh-CN", updateTab)).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_file", { id: tab.id });

    requestTabCloseConfirmMock.mockResolvedValueOnce("save_all");
    await expect(ensureTabCanClose(tab, "zh-CN", updateTab)).resolves.toBe(true);
  });

  it("ensureTabCanClose returns false when save throws", async () => {
    const updateTab = vi.fn();
    const tab = createTab({ isDirty: true });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    requestTabCloseConfirmMock.mockResolvedValue("save");
    invokeMock.mockRejectedValue(new Error("save failed"));

    await expect(ensureTabCanClose(tab, "zh-CN", updateTab)).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("shouldEnableBulkTabCloseActions only enables bulk buttons for multiple dirty tabs", () => {
    expect(
      shouldEnableBulkTabCloseActions(
        [createTab({ isDirty: true }), createTab({ id: "tab-2", isDirty: false })],
        true
      )
    ).toBe(false);

    expect(
      shouldEnableBulkTabCloseActions(
        [createTab({ isDirty: true }), createTab({ id: "tab-2", isDirty: true })],
        true
      )
    ).toBe(true);

    expect(
      shouldEnableBulkTabCloseActions(
        [createTab({ isDirty: true }), createTab({ id: "tab-2", isDirty: true })],
        false
      )
    ).toBe(false);
  });
});
