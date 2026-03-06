import type { SyntaxKey } from "@/store/useStore";

function getLineLeadingWhitespaceAtOffset(
  text: string,
  offset: number,
): string {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), text.length));
  const lineStart = text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", lineStart);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const lineText = text.slice(lineStart, lineEnd);
  const match = lineText.match(/^[\t ]*/);
  return match?.[0] ?? "";
}

function getLinePrefixAtOffset(text: string, offset: number): string {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), text.length));
  const lineStart = text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
  return text.slice(lineStart, safeOffset);
}

function getLineSuffixAtOffset(text: string, offset: number): string {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), text.length));
  const lineEndIndex = text.indexOf("\n", safeOffset);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  return text.slice(safeOffset, lineEnd);
}

function getLineStartAtOffset(text: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), text.length));
  return text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
}

function shouldIncreaseIndent(
  syntaxKey: SyntaxKey | null | undefined,
  trimmedLinePrefix: string,
): boolean {
  if (!trimmedLinePrefix) {
    return false;
  }

  if (syntaxKey === "python" || syntaxKey === "yaml") {
    return trimmedLinePrefix.endsWith(":");
  }

  if (syntaxKey === "json") {
    return trimmedLinePrefix.endsWith("{") || trimmedLinePrefix.endsWith("[");
  }

  return false;
}

function isPythonDedentKeywordPrefix(trimmedLinePrefix: string): boolean {
  return (
    /^(else|finally)(\b.*)?$/.test(trimmedLinePrefix) ||
    /^(elif|except)\b.+$/.test(trimmedLinePrefix) ||
    trimmedLinePrefix === "except"
  );
}

function canDedentLeadingWhitespace(
  leadingWhitespace: string,
  indentText: string,
): boolean {
  return (
    !!indentText &&
    !!leadingWhitespace &&
    leadingWhitespace.endsWith(indentText)
  );
}

function getJsonCloserForPrefix(trimmedLinePrefix: string): "]" | "}" | null {
  if (trimmedLinePrefix.endsWith("{")) {
    return "}";
  }

  if (trimmedLinePrefix.endsWith("[")) {
    return "]";
  }

  return null;
}

export function buildEnterAutoIndentEdit({
  text,
  offset,
  syntaxKey,
  indentText,
}: {
  text: string;
  offset: number;
  syntaxKey: SyntaxKey | null | undefined;
  indentText: string;
}) {
  const leadingWhitespace = getLineLeadingWhitespaceAtOffset(text, offset);
  const linePrefix = getLinePrefixAtOffset(text, offset);
  const lineSuffix = getLineSuffixAtOffset(text, offset);
  const trimmedPrefix = linePrefix.trimEnd();
  const trimmedSuffix = lineSuffix.trimStart();

  if (syntaxKey === "json") {
    const expectedCloser = getJsonCloserForPrefix(trimmedPrefix);
    if (expectedCloser && trimmedSuffix.startsWith(expectedCloser)) {
      const insertedText = `\n${leadingWhitespace}${indentText}\n${leadingWhitespace}`;
      return {
        text: insertedText,
        caretOffset: `\n${leadingWhitespace}${indentText}`.length,
      };
    }
  }

  const extraIndent = shouldIncreaseIndent(syntaxKey, trimmedPrefix)
    ? indentText
    : "";
  const insertedText = `\n${leadingWhitespace}${extraIndent}`;
  return {
    text: insertedText,
    caretOffset: insertedText.length,
  };
}

export function buildEnterAutoIndentText({
  text,
  offset,
  syntaxKey,
  indentText,
}: {
  text: string;
  offset: number;
  syntaxKey: SyntaxKey | null | undefined;
  indentText: string;
}) {
  return buildEnterAutoIndentEdit({ text, offset, syntaxKey, indentText }).text;
}

export function buildAutoDedentInsertion({
  text,
  offset,
  syntaxKey,
  indentText,
  key,
}: {
  text: string;
  offset: number;
  syntaxKey: SyntaxKey | null | undefined;
  indentText: string;
  key: string;
}) {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), text.length));
  const lineStart = getLineStartAtOffset(text, safeOffset);
  const linePrefix = getLinePrefixAtOffset(text, safeOffset);
  const lineSuffix = getLineSuffixAtOffset(text, safeOffset);
  const leadingWhitespace = getLineLeadingWhitespaceAtOffset(text, safeOffset);

  if (!canDedentLeadingWhitespace(leadingWhitespace, indentText)) {
    return null;
  }

  if (syntaxKey === "json" && (key === "}" || key === "]")) {
    if (linePrefix.trim().length > 0 || lineSuffix.trim().length > 0) {
      return null;
    }

    return {
      start: lineStart + leadingWhitespace.length - indentText.length,
      end: safeOffset,
      newText: key,
    };
  }

  if (syntaxKey === "python" && key === ":") {
    const trimmedPrefix = linePrefix.trim();
    if (
      !isPythonDedentKeywordPrefix(trimmedPrefix) ||
      lineSuffix.trim().length > 0
    ) {
      return null;
    }

    return {
      start: lineStart + leadingWhitespace.length - indentText.length,
      end: safeOffset,
      newText: `${trimmedPrefix}:`,
    };
  }

  return null;
}
