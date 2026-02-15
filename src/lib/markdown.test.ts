import { describe, expect, it } from "vitest";
import { isMarkdownTab } from "./markdown";

describe("markdown", () => {
  it("returns false for nullish tabs", () => {
    expect(isMarkdownTab(null)).toBe(false);
    expect(isMarkdownTab(undefined)).toBe(false);
  });

  it("respects syntax override", () => {
    expect(
      isMarkdownTab({
        name: "file.ts",
        path: "C:\\repo\\file.ts",
        syntaxOverride: "markdown",
      })
    ).toBe(true);

    expect(
      isMarkdownTab({
        name: "README.md",
        path: "C:\\repo\\README.md",
        syntaxOverride: "typescript",
      })
    ).toBe(false);
  });

  it("detects markdown by file extension when no override", () => {
    expect(
      isMarkdownTab({
        name: "README",
        path: "C:\\repo\\README.mdx",
        syntaxOverride: null,
      })
    ).toBe(true);

    expect(
      isMarkdownTab({
        name: "main.ts",
        path: "C:\\repo\\main.ts",
        syntaxOverride: null,
      })
    ).toBe(false);
  });
});
