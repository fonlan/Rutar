import { describe, expect, it } from "vitest";
import {
  buildIndentAtCaretEdit,
  buildOutdentCurrentLineEdit,
} from "./indentSelectedLines";

describe("indentSelectedLines helpers", () => {
  it("snaps caret to the previous indent stop inside leading spaces", () => {
    const edit = buildOutdentCurrentLineEdit({
      text: "        alpha\n",
      offset: 6,
      indentText: "    ",
    });

    expect(edit).toEqual({
      start: 0,
      end: 13,
      newText: "    alpha",
      selectionStart: 4,
      selectionEnd: 4,
    });
  });

  it("keeps subtracting removed indentation when caret is after leading whitespace", () => {
    const edit = buildOutdentCurrentLineEdit({
      text: "        alpha\n",
      offset: 10,
      indentText: "    ",
    });

    expect(edit).toEqual({
      start: 0,
      end: 13,
      newText: "    alpha",
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it("pads to the next indent stop when tabbing inside leading spaces", () => {
    const edit = buildIndentAtCaretEdit({
      text: "        alpha\n",
      offset: 6,
      indentText: "    ",
    });

    expect(edit).toEqual({
      start: 6,
      end: 6,
      newText: "  ",
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it("keeps full indent insertion when caret is after leading whitespace", () => {
    const edit = buildIndentAtCaretEdit({
      text: "    alpha\n",
      offset: 6,
      indentText: "    ",
    });

    expect(edit).toEqual({
      start: 6,
      end: 6,
      newText: "    ",
      selectionStart: 10,
      selectionEnd: 10,
    });
  });
});
