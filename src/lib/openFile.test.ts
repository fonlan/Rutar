import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileTab } from "@/store/useStore";

interface MockStoreState {
  tabs: FileTab[];
  activeTabId: string | null;
  setActiveTab: ReturnType<typeof vi.fn>;
  addTab: ReturnType<typeof vi.fn>;
  updateTab: ReturnType<typeof vi.fn>;
}

function createFileInfo(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-opened",
    name: "opened.ts",
    path: "C:\\repo\\opened.ts",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 12,
    largeFileMode: false,
    isDirty: false,
    ...partial,
  };
}

function createStoreState(partial?: Partial<MockStoreState>): MockStoreState {
  const state: MockStoreState = {
    tabs: [],
    activeTabId: null,
    setActiveTab: vi.fn((id: string) => {
      state.activeTabId = id;
    }),
    addTab: vi.fn((tab: FileTab) => {
      state.tabs = [...state.tabs, tab];
      state.activeTabId = tab.id;
    }),
    updateTab: vi.fn((id: string, updates: Partial<FileTab>) => {
      state.tabs = state.tabs.map((item) => (item.id === id ? { ...item, ...updates } : item));
      if (state.activeTabId === id && updates.id) {
        state.activeTabId = updates.id;
      }
    }),
  };

  return { ...state, ...partial };
}

describe("openFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadOpenFileModule(storeState: MockStoreState) {
    vi.resetModules();

    const invokeMock = vi.fn();
    const addRecentFilePathMock = vi.fn();
    const isReusableBlankTabMock = vi.fn();
    const getStateMock = vi.fn(() => storeState);

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: invokeMock,
    }));
    vi.doMock("@/lib/recentPaths", () => ({
      addRecentFilePath: addRecentFilePathMock,
    }));
    vi.doMock("@/lib/tabUtils", () => ({
      isReusableBlankTab: isReusableBlankTabMock,
    }));
    vi.doMock("@/store/useStore", () => ({
      useStore: { getState: getStateMock },
    }));

    const module = await import("./openFile");
    return {
      module,
      invokeMock,
      addRecentFilePathMock,
      isReusableBlankTabMock,
      getStateMock,
    };
  }

  it("openFilePath opens file and dispatches loading start/end", async () => {
    const storeState = createStoreState();
    const { module, invokeMock, addRecentFilePathMock, isReusableBlankTabMock } =
      await loadOpenFileModule(storeState);
    const fileInfo = createFileInfo();
    invokeMock.mockResolvedValue(fileInfo);
    isReusableBlankTabMock.mockReturnValue(false);

    const events: Array<{ path: string; tabId: string; status: "start" | "end" }> = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        path: string;
        tabId: string;
        status: "start" | "end";
      };
      events.push(detail);
    };
    window.addEventListener("rutar:file-open-loading", listener as EventListener);

    await module.openFilePath(fileInfo.path);

    window.removeEventListener("rutar:file-open-loading", listener as EventListener);
    expect(invokeMock).toHaveBeenCalledWith("open_file", { path: fileInfo.path });
    expect(storeState.addTab).toHaveBeenCalledWith(fileInfo);
    expect(addRecentFilePathMock).toHaveBeenCalledWith(fileInfo.path);
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe("start");
    expect(events[1].status).toBe("end");
    expect(events[0].tabId).toBe(events[1].tabId);
  });

  it("openFilePath reuses existing opened tab", async () => {
    const fileInfo = createFileInfo();
    const storeState = createStoreState({
      tabs: [fileInfo],
      activeTabId: null,
    });
    const { module, invokeMock, addRecentFilePathMock } = await loadOpenFileModule(storeState);
    invokeMock.mockResolvedValue(fileInfo);

    await module.openFilePath(fileInfo.path);

    expect(storeState.setActiveTab).toHaveBeenCalledWith(fileInfo.id);
    expect(storeState.addTab).not.toHaveBeenCalled();
    expect(addRecentFilePathMock).toHaveBeenCalledWith(fileInfo.path);
  });

  it("openFilePath patches reusable blank tab and closes old backend doc", async () => {
    const blankTab = createFileInfo({
      id: "tab-blank",
      name: "Untitled-1",
      path: "",
      lineCount: 1,
      isDirty: false,
    });
    const openedInfo = createFileInfo({
      id: "tab-real",
      name: "real.ts",
      path: "C:\\repo\\real.ts",
    });
    const storeState = createStoreState({
      tabs: [blankTab],
      activeTabId: blankTab.id,
    });
    const { module, invokeMock, isReusableBlankTabMock } = await loadOpenFileModule(storeState);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "open_file") {
        return openedInfo;
      }
      return undefined;
    });
    isReusableBlankTabMock.mockReturnValue(true);

    await module.openFilePath(openedInfo.path);

    expect(storeState.updateTab).toHaveBeenCalledWith(
      blankTab.id,
      expect.objectContaining({
        id: openedInfo.id,
        name: openedInfo.name,
        path: openedInfo.path,
        lineCount: openedInfo.lineCount,
        isDirty: false,
      })
    );
    expect(storeState.setActiveTab).toHaveBeenCalledWith(openedInfo.id);
    expect(invokeMock).toHaveBeenCalledWith("close_file", { id: blankTab.id });
    expect(storeState.addTab).not.toHaveBeenCalled();
  });

  it("openFilePath ignores duplicate in-flight request for same path", async () => {
    const storeState = createStoreState();
    const { module, invokeMock } = await loadOpenFileModule(storeState);
    const fileInfo = createFileInfo();

    let resolveOpen: ((value: FileTab) => void) | undefined;
    const openPromise = new Promise<FileTab>((resolve) => {
      resolveOpen = resolve;
    });

    invokeMock.mockImplementation((command: string) => {
      if (command === "open_file") {
        return openPromise;
      }
      return Promise.resolve(undefined);
    });

    const first = module.openFilePath(fileInfo.path);
    const second = module.openFilePath(fileInfo.path);
    resolveOpen?.(fileInfo);
    await Promise.all([first, second]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("open_file", { path: fileInfo.path });
  });

  it("openFilePaths handles batch results and skips failed items", async () => {
    const storeState = createStoreState();
    const { module, invokeMock, addRecentFilePathMock } = await loadOpenFileModule(storeState);
    const successFile = createFileInfo({
      id: "ok-1",
      path: "C:\\repo\\ok-1.ts",
      name: "ok-1.ts",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    invokeMock.mockImplementation((command: string) => {
      if (command === "open_files") {
        return Promise.resolve([
          {
            path: successFile.path,
            success: true,
            fileInfo: successFile,
          },
          {
            path: "C:\\repo\\failed.ts",
            success: false,
            error: "permission denied",
          },
        ]);
      }
      return Promise.resolve(undefined);
    });

    await module.openFilePaths([successFile.path, "C:\\repo\\failed.ts"]);

    expect(invokeMock).toHaveBeenCalledWith("open_files", {
      paths: [successFile.path, "C:\\repo\\failed.ts"],
    });
    expect(storeState.addTab).toHaveBeenCalledWith(successFile);
    expect(addRecentFilePathMock).toHaveBeenCalledWith(successFile.path);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("openFilePath emits end event and allows retry after failure", async () => {
    const storeState = createStoreState();
    const { module, invokeMock } = await loadOpenFileModule(storeState);
    const targetPath = "C:\\repo\\retry.ts";
    const fileInfo = createFileInfo({
      id: "tab-retry",
      name: "retry.ts",
      path: targetPath,
    });

    const events: Array<{ path: string; tabId: string; status: "start" | "end" }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail);
    };
    window.addEventListener("rutar:file-open-loading", listener as EventListener);

    invokeMock
      .mockRejectedValueOnce(new Error("open failed"))
      .mockResolvedValueOnce(fileInfo);

    await expect(module.openFilePath(targetPath)).rejects.toThrow("open failed");
    await module.openFilePath(targetPath);

    window.removeEventListener("rutar:file-open-loading", listener as EventListener);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.status)).toEqual(["start", "end", "start", "end"]);
  });

  it("openFilePaths returns early when all paths are already opening", async () => {
    const storeState = createStoreState();
    const { module, invokeMock } = await loadOpenFileModule(storeState);
    const targetPath = "C:\\repo\\inflight.ts";
    const fileInfo = createFileInfo({
      id: "tab-inflight",
      name: "inflight.ts",
      path: targetPath,
    });

    let resolveOpen: ((value: FileTab) => void) | undefined;
    const openPromise = new Promise<FileTab>((resolve) => {
      resolveOpen = resolve;
    });

    invokeMock.mockImplementation((command: string) => {
      if (command === "open_file") {
        return openPromise;
      }
      return Promise.resolve([]);
    });

    const inflightTask = module.openFilePath(targetPath);
    await module.openFilePaths([targetPath]);
    resolveOpen?.(fileInfo);
    await inflightTask;

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("open_file", { path: targetPath });
  });

  it("openFilePaths logs processing error when applyOpenedFileInfo fails", async () => {
    const fileInfo = createFileInfo({
      id: "tab-throw",
      name: "throw.ts",
      path: "C:\\repo\\throw.ts",
    });
    const storeState = createStoreState({
      addTab: vi.fn(() => {
        throw new Error("add-tab-failed");
      }),
    });
    const { module, invokeMock, addRecentFilePathMock } = await loadOpenFileModule(storeState);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    invokeMock.mockImplementation((command: string) => {
      if (command === "open_files") {
        return Promise.resolve([
          {
            path: fileInfo.path,
            success: true,
            fileInfo,
          },
        ]);
      }
      return Promise.resolve(undefined);
    });

    await module.openFilePaths([fileInfo.path]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to process opened path: ${fileInfo.path}`,
      expect.any(Error)
    );
    expect(addRecentFilePathMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
