import {
  MAX_RECENT_PATHS,
  addRecentFilePath,
  addRecentFolderPath,
  appendRecentPath,
  removeRecentFilePath,
  removeRecentFolderPath,
  removeRecentPath,
  sanitizeRecentPathList,
} from "./recentPaths";
import { useStore } from "@/store/useStore";

describe("appendRecentPath", () => {
  it("prepends, de-duplicates, and keeps max length", () => {
    const base = Array.from({ length: MAX_RECENT_PATHS }, (_, index) => `path-${index}`);
    const result = appendRecentPath(base, " path-5 ");

    expect(result[0]).toBe("path-5");
    expect(result).toHaveLength(MAX_RECENT_PATHS);
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns original reference for blank input", () => {
    const base = ["a", "b"];
    const result = appendRecentPath(base, "   ");
    expect(result).toBe(base);
  });
});

describe("removeRecentPath", () => {
  it("removes a matching path", () => {
    const base = ["a", "b", "c"];
    expect(removeRecentPath(base, " b ")).toEqual(["a", "c"]);
  });

  it("returns original reference when no match", () => {
    const base = ["a", "b"];
    const result = removeRecentPath(base, "x");
    expect(result).toBe(base);
  });
});

describe("sanitizeRecentPathList", () => {
  it("normalizes list, removes duplicates, and enforces max", () => {
    const mixed: unknown = [
      "  a  ",
      "",
      "b",
      "a",
      123,
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
    ];
    const result = sanitizeRecentPathList(mixed);

    expect(result).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]);
    expect(result).toHaveLength(MAX_RECENT_PATHS);
  });

  it("returns empty array for non-array input", () => {
    expect(sanitizeRecentPathList(null)).toEqual([]);
  });
});

describe("recent path store helpers", () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({
      recentFiles: [],
      recentFolders: [],
    });
  });

  it("addRecentFilePath updates settings when path is new", () => {
    const previousRef = useStore.getState().settings.recentFiles;

    addRecentFilePath("  C:\\repo\\main.ts  ");

    const nextRef = useStore.getState().settings.recentFiles;
    expect(nextRef).toEqual(["C:\\repo\\main.ts"]);
    expect(nextRef).not.toBe(previousRef);
  });

  it("addRecentFilePath keeps reference for blank or already-first path", () => {
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\main.ts", "C:\\repo\\other.ts"],
    });

    const beforeBlank = useStore.getState().settings.recentFiles;
    addRecentFilePath("   ");
    expect(useStore.getState().settings.recentFiles).toBe(beforeBlank);

    addRecentFilePath("  C:\\repo\\main.ts  ");
    expect(useStore.getState().settings.recentFiles).toBe(beforeBlank);
  });

  it("addRecentFolderPath updates settings when folder is new", () => {
    const previousRef = useStore.getState().settings.recentFolders;

    addRecentFolderPath("  C:\\repo\\workspace  ");

    const nextRef = useStore.getState().settings.recentFolders;
    expect(nextRef).toEqual(["C:\\repo\\workspace"]);
    expect(nextRef).not.toBe(previousRef);
  });

  it("addRecentFolderPath keeps reference for missing input", () => {
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\workspace"],
    });

    const previousRef = useStore.getState().settings.recentFolders;
    addRecentFolderPath("    ");
    expect(useStore.getState().settings.recentFolders).toBe(previousRef);
  });

  it("removeRecentFilePath updates settings when target exists", () => {
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\main.ts", "C:\\repo\\other.ts"],
    });

    const previousRef = useStore.getState().settings.recentFiles;
    removeRecentFilePath(" C:\\repo\\other.ts ");

    const nextRef = useStore.getState().settings.recentFiles;
    expect(nextRef).toEqual(["C:\\repo\\main.ts"]);
    expect(nextRef).not.toBe(previousRef);
  });

  it("removeRecentFilePath keeps reference when target is missing", () => {
    useStore.getState().updateSettings({
      recentFiles: ["C:\\repo\\main.ts"],
    });

    const previousRef = useStore.getState().settings.recentFiles;
    removeRecentFilePath("C:\\repo\\none.ts");
    expect(useStore.getState().settings.recentFiles).toBe(previousRef);
  });

  it("removeRecentFolderPath handles both hit and miss", () => {
    useStore.getState().updateSettings({
      recentFolders: ["C:\\repo\\workspace", "C:\\repo\\demo"],
    });

    const previousRef = useStore.getState().settings.recentFolders;
    removeRecentFolderPath(" C:\\repo\\demo ");
    const nextRef = useStore.getState().settings.recentFolders;

    expect(nextRef).toEqual(["C:\\repo\\workspace"]);
    expect(nextRef).not.toBe(previousRef);

    const afterHitRef = useStore.getState().settings.recentFolders;
    removeRecentFolderPath("C:\\repo\\none");
    expect(useStore.getState().settings.recentFolders).toBe(afterHitRef);
  });
});
