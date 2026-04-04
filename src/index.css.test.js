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
    const markSpanRuleMatches = Array.from(cssSource.matchAll(/\.editor-line mark\s*>\s*span\s*\{([\s\S]*?)\}/g));
    const markRule = getLastMatchGroup(markRuleMatches, 1);
    const markSpanRule = getLastMatchGroup(markSpanRuleMatches, 1);

    expect(markRule).toContain("display: inline;");
    expect(markRule).not.toContain("display: inline-block;");
    expect(markSpanRule).toContain("display: inline;");
    expect(markSpanRule).not.toContain("display: inline-block;");
  });
});

describe("YAML syntax highlight palette", () => {
  it("keeps YAML comments visually muted and distinct from active values", () => {
    const lightYamlCommentRuleMatches = Array.from(
      cssSource.matchAll(
        /(?:^|\r?\n)\.editor-syntax-yaml \.token-comment,[\s\S]*?\.editor-syntax-yaml \[class\*='token-'\]\[class\*='comment'\]\s*\{([\s\S]*?)\}/gm
      )
    );
    const darkYamlCommentRuleMatches = Array.from(
      cssSource.matchAll(
        /(?:^|\r?\n)\.dark \.editor-syntax-yaml \.token-comment,[\s\S]*?\.dark \.editor-syntax-yaml \[class\*='token-'\]\[class\*='comment'\]\s*\{([\s\S]*?)\}/gm
      )
    );
    const lightYamlCommentRule = getLastMatchGroup(lightYamlCommentRuleMatches, 1);
    const darkYamlCommentRule = getLastMatchGroup(darkYamlCommentRuleMatches, 1);

    expect(lightYamlCommentRule).toContain("color: #6e7781 !important;");
    expect(lightYamlCommentRule).toContain("font-style: italic;");
    expect(darkYamlCommentRule).toContain("color: #8b949e !important;");
    expect(darkYamlCommentRule).toContain("font-style: italic;");
  });

  it("covers plain, block, and numeric YAML scalars with dedicated overrides", () => {
    expect(cssSource).toContain(".editor-syntax-yaml .token-plain_scalar,");
    expect(cssSource).toContain(".editor-syntax-yaml .token-block_scalar,");
    expect(cssSource).toContain(".editor-syntax-yaml .token-integer_scalar,");
    expect(cssSource).toContain(".editor-syntax-yaml .token-float_scalar,");
    expect(cssSource).toContain(".editor-syntax-yaml .token-timestamp_scalar {");
    expect(cssSource).toContain("color: #0f766e !important;");
    expect(cssSource).toContain("color: #1f6feb !important;");
    expect(cssSource).toContain(".dark .editor-syntax-yaml .token-plain_scalar,");
    expect(cssSource).toContain(".dark .editor-syntax-yaml .token-block_scalar,");
    expect(cssSource).toContain(".dark .editor-syntax-yaml .token-integer_scalar,");
    expect(cssSource).toContain(".dark .editor-syntax-yaml .token-float_scalar,");
    expect(cssSource).toContain(".dark .editor-syntax-yaml .token-timestamp_scalar {");
    expect(cssSource).toContain("color: #8bd5ca !important;");
    expect(cssSource).toContain("color: #82aaff !important;");
  });
});
