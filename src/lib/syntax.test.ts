import {
  detectSyntaxKeyFromTab,
  getLineCommentPrefixForSyntaxKey,
  getSyntaxLabel,
} from "./syntax";

describe("detectSyntaxKeyFromTab", () => {
  it("handles common file extensions", () => {
    expect(
      detectSyntaxKeyFromTab({
        name: "main.tsx",
        path: "",
      })
    ).toBe("typescript");

    expect(
      detectSyntaxKeyFromTab({
        name: "README.md",
        path: "",
      })
    ).toBe("markdown");

    expect(
      detectSyntaxKeyFromTab({
        name: "settings.jsonc",
        path: "",
      })
    ).toBe("json");
  });

  it("supports special filenames and windows paths", () => {
    expect(
      detectSyntaxKeyFromTab({
        name: "Dockerfile",
        path: "",
      })
    ).toBe("bash");

    expect(
      detectSyntaxKeyFromTab({
        name: "ignored.txt",
        path: "C:\\Users\\dev\\project\\app\\styles.CSS",
      })
    ).toBe("css");
  });

  it("falls back to plain_text", () => {
    expect(
      detectSyntaxKeyFromTab({
        name: "LICENSE",
        path: "",
      })
    ).toBe("plain_text");
  });
});

describe("syntax helpers", () => {
  it("returns label for syntax key", () => {
    expect(getSyntaxLabel("typescript")).toBe("TypeScript");
  });

  it("returns line comment prefix with fallback", () => {
    expect(getLineCommentPrefixForSyntaxKey("typescript")).toBe("//");
    expect(getLineCommentPrefixForSyntaxKey(null)).toBe("#");
  });
});
