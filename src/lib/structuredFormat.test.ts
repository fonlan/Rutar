import { describe, expect, it } from "vitest";
import { detectStructuredFormatSyntaxKey, isStructuredFormatSupported } from "./structuredFormat";
import type { FileTab } from "@/store/useStore";

function createTab(partial?: Partial<FileTab>): FileTab {
  return {
    id: "tab-1",
    name: "file.txt",
    path: "C:\\repo\\file.txt",
    encoding: "UTF-8",
    lineEnding: "LF",
    lineCount: 1,
    largeFileMode: false,
    ...partial,
  };
}

describe("structuredFormat", () => {
  it("returns null for empty tab", () => {
    expect(detectStructuredFormatSyntaxKey(undefined)).toBe(null);
    expect(isStructuredFormatSupported(undefined)).toBe(false);
  });

  it("uses syntax override first", () => {
    expect(detectStructuredFormatSyntaxKey(createTab({ syntaxOverride: "json" }))).toBe("json");
    expect(detectStructuredFormatSyntaxKey(createTab({ syntaxOverride: "typescript" }))).toBe(null);
  });

  it("falls back to detected syntax from file extension", () => {
    expect(detectStructuredFormatSyntaxKey(createTab({ path: "C:\\repo\\a.yaml" }))).toBe("yaml");
    expect(detectStructuredFormatSyntaxKey(createTab({ path: "C:\\repo\\index.html" }))).toBe("html");
    expect(detectStructuredFormatSyntaxKey(createTab({ path: "C:\\repo\\main.ts" }))).toBe(null);
  });

  it("reports support state correctly", () => {
    expect(isStructuredFormatSupported(createTab({ path: "C:\\repo\\data.toml" }))).toBe(true);
    expect(isStructuredFormatSupported(createTab({ path: "C:\\repo\\script.py" }))).toBe(false);
  });
});
