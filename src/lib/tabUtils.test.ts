import { isReusableBlankTab } from "./tabUtils";

describe("isReusableBlankTab", () => {
  it("returns true for clean untitled single-line tab", () => {
    expect(
      isReusableBlankTab({
        id: "t1",
        name: "Untitled-1",
        path: "",
        encoding: "utf-8",
        lineEnding: "LF",
        lineCount: 1,
        largeFileMode: false,
        isDirty: false,
      })
    ).toBe(true);
  });

  it("returns false when tab has a path, is dirty, or has multiple lines", () => {
    expect(
      isReusableBlankTab({
        id: "t2",
        name: "a.ts",
        path: "/tmp/a.ts",
        encoding: "utf-8",
        lineEnding: "LF",
        lineCount: 1,
        largeFileMode: false,
        isDirty: false,
      })
    ).toBe(false);

    expect(
      isReusableBlankTab({
        id: "t3",
        name: "Untitled-2",
        path: "",
        encoding: "utf-8",
        lineEnding: "LF",
        lineCount: 2,
        largeFileMode: false,
        isDirty: false,
      })
    ).toBe(false);

    expect(
      isReusableBlankTab({
        id: "t4",
        name: "Untitled-3",
        path: "",
        encoding: "utf-8",
        lineEnding: "LF",
        lineCount: 1,
        largeFileMode: false,
        isDirty: true,
      })
    ).toBe(false);
  });

  it("returns false when tab is empty", () => {
    expect(isReusableBlankTab(undefined)).toBe(false);
    expect(isReusableBlankTab(null)).toBe(false);
  });
});
