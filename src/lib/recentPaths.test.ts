import {
  MAX_RECENT_PATHS,
  appendRecentPath,
  removeRecentPath,
  sanitizeRecentPathList,
} from "./recentPaths";

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
