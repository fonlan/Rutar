import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cssSource = readFileSync(`${process.cwd()}/src/index.css`, "utf8");

const getLastMatchGroup = (matches, groupIndex) => {
  if (matches.length === 0) {
    return "";
  }

  const target = matches[matches.length - 1];
  return typeof target[groupIndex] === "string" ? target[groupIndex] : "";
};

describe("editor inline highlight wrapping styles", () => {
  it("keeps mark highlights in inline flow so soft-wrap breakpoints stay stable", () => {
    const markRuleMatches = Array.from(cssSource.matchAll(/\.editor-line mark\s*\{([\s\S]*?)\}/g));
    const markSpanRuleMatches = Array.from(cssSource.matchAll(/\.editor-line mark > span\s*\{([\s\S]*?)\}/g));
    const markRule = getLastMatchGroup(markRuleMatches, 1);
    const markSpanRule = getLastMatchGroup(markSpanRuleMatches, 1);

    expect(markRule).toContain("display: inline;");
    expect(markRule).not.toContain("display: inline-block;");
    expect(markSpanRule).toContain("display: inline;");
    expect(markSpanRule).not.toContain("display: inline-block;");
  });
});
