import {
  SYNTAX_OPTIONS,
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
    ).toBe("dockerfile");

    expect(
      detectSyntaxKeyFromTab({
        name: "GNUmakefile",
        path: "",
      })
    ).toBe("makefile");

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

    expect(
      detectSyntaxKeyFromTab({
        name: "weird.",
        path: "",
      })
    ).toBe("plain_text");

    expect(
      detectSyntaxKeyFromTab({
        name: "",
        path: "   ",
      })
    ).toBe("plain_text");
  });

  it("covers extension groups across all syntax families", () => {
    const cases: Array<{ fileName: string; expected: ReturnType<typeof detectSyntaxKeyFromTab> }> = [
      { fileName: "main.mjs", expected: "javascript" },
      { fileName: "main.cts", expected: "typescript" },
      { fileName: "main.rs", expected: "rust" },
      { fileName: "main.pyw", expected: "python" },
      { fileName: "doc.mdx", expected: "markdown" },
      { fileName: "service.Dockerfile", expected: "dockerfile" },
      { fileName: "build.mk", expected: "makefile" },
      { fileName: "app.properties", expected: "ini" },
      { fileName: "index.xhtml", expected: "html" },
      { fileName: "theme.scss", expected: "css" },
      { fileName: "shell.zsh", expected: "bash" },
      { fileName: "config.toml", expected: "toml" },
      { fileName: "config.yml", expected: "yaml" },
      { fileName: "icon.svg", expected: "xml" },
      { fileName: "header.h", expected: "c" },
      { fileName: "header.hpp", expected: "cpp" },
      { fileName: "main.go", expected: "go" },
      { fileName: "Main.java", expected: "java" },
      { fileName: "Program.cs", expected: "csharp" },
      { fileName: "main.tf", expected: "hcl" },
      { fileName: "main.lua", expected: "lua" },
      { fileName: "index.phtml", expected: "php" },
      { fileName: "build.kts", expected: "kotlin" },
      { fileName: "script.ps1", expected: "powershell" },
      { fileName: "Gemfile", expected: "ruby" },
      { fileName: "schema.sql", expected: "sql" },
      { fileName: "App.swift", expected: "swift" },
    ];

    for (const testCase of cases) {
      expect(
        detectSyntaxKeyFromTab({
          name: testCase.fileName,
          path: "",
        })
      ).toBe(testCase.expected);
    }
  });

  it("prefers path over name and normalizes directory separators", () => {
    expect(
      detectSyntaxKeyFromTab({
        name: "wrong.txt",
        path: "/home/dev/project/src/main.KTS",
      })
    ).toBe("kotlin");
  });
});

describe("syntax helpers", () => {
  it("exports syntax options list with plain_text first", () => {
    expect(SYNTAX_OPTIONS.length).toBeGreaterThan(5);
    expect(SYNTAX_OPTIONS[0]).toEqual({
      value: "plain_text",
      label: "Plain Text",
    });
  });

  it("returns label for syntax key", () => {
    expect(getSyntaxLabel("typescript")).toBe("TypeScript");
    expect(getSyntaxLabel("dockerfile")).toBe("Dockerfile");
    expect(getSyntaxLabel("powershell")).toBe("PowerShell");
    expect(getSyntaxLabel("unknown" as never)).toBe("Plain Text");
  });

  it("returns line comment prefix with fallback", () => {
    expect(getLineCommentPrefixForSyntaxKey("typescript")).toBe("//");
    expect(getLineCommentPrefixForSyntaxKey("dockerfile")).toBe("#");
    expect(getLineCommentPrefixForSyntaxKey("lua")).toBe("--");
    expect(getLineCommentPrefixForSyntaxKey("sql")).toBe("--");
    expect(getLineCommentPrefixForSyntaxKey(null)).toBe("#");
    expect(getLineCommentPrefixForSyntaxKey(undefined)).toBe("#");
    expect(getLineCommentPrefixForSyntaxKey("unknown" as never)).toBe("#");
  });
});
