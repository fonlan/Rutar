import { describe, expect, it } from "vitest";
import { buildAutoDedentInsertion, buildEnterAutoIndentEdit } from "./enterAutoIndent";

describe("enterAutoIndent jsonc", () => {
  it("adds one indentation level after jsonc opening brace", () => {
    const result = buildEnterAutoIndentEdit({
      text: "{",
      offset: 1,
      syntaxKey: "jsonc",
      indentText: "  ",
    });

    expect(result).toEqual({
      text: "\n  ",
      caretOffset: 3,
    });
  });

  it("creates paired jsonc block lines between braces", () => {
    const result = buildEnterAutoIndentEdit({
      text: "{}",
      offset: 1,
      syntaxKey: "jsonc",
      indentText: "  ",
    });

    expect(result).toEqual({
      text: "\n  \n",
      caretOffset: 3,
    });
  });

  it("dedents jsonc closing brace on blank indented line", () => {
    const result = buildAutoDedentInsertion({
      text: "{\n  ",
      offset: 4,
      syntaxKey: "jsonc",
      indentText: "  ",
      key: "}",
    });

    expect(result).toEqual({
      start: 2,
      end: 4,
      newText: "}",
    });
  });
});
