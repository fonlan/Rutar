import { describe, expect, it } from "vitest";

import type { SyntaxToken } from "./Editor.types";
import { resolveTokenTypeClass } from "./editorTokenClass";

function makeToken(type: string, text = "value"): SyntaxToken {
  return { type, text };
}

describe("resolveTokenTypeClass", () => {
  it("adds markdown helper classes for common markdown token kinds", () => {
    expect(resolveTokenTypeClass(makeToken("heading_text", "Title"))).toContain("token-title");
    expect(resolveTokenTypeClass(makeToken("link_destination", "https://example.com"))).toContain(
      "token-link"
    );
    expect(resolveTokenTypeClass(makeToken("code_span", "code"))).toContain("token-code");
    expect(resolveTokenTypeClass(makeToken("emphasis_text", "em"))).toContain("token-emphasis");
    expect(resolveTokenTypeClass(makeToken("strong_text", "strong"))).toContain("token-strong");
  });
  it("keeps nested language token classification for injected markdown fences", () => {
    expect(resolveTokenTypeClass(makeToken("const", "const"))).toContain("token-keyword");
    expect(resolveTokenTypeClass(makeToken("number", "42"))).toContain("token-number");
  });
});
