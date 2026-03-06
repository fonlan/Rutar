const OPEN_TO_CLOSE_MAP = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
} as const;

const OPENERS = new Set(Object.keys(OPEN_TO_CLOSE_MAP));

function isWordLikeChar(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{N}_$]/u.test(char);
}

function shouldAutoPairQuote(
  text: string,
  offset: number,
  quote: '"' | "'" | "`",
): boolean {
  if (quote === "`") {
    return true;
  }

  const previousChar = offset > 0 ? text[offset - 1] : undefined;
  const nextChar = offset < text.length ? text[offset] : undefined;

  if (isWordLikeChar(previousChar) || isWordLikeChar(nextChar)) {
    return false;
  }

  return true;
}

export function buildAutoPairEdit({
  text,
  start,
  end,
  key,
}: {
  text: string;
  start: number;
  end: number;
  key: string;
}) {
  if (!OPENERS.has(key)) {
    return null;
  }

  const closing = OPEN_TO_CLOSE_MAP[key as keyof typeof OPEN_TO_CLOSE_MAP];
  if (!closing) {
    return null;
  }

  const isQuote = key === '"' || key === "'" || key === "`";
  if (
    isQuote &&
    start === end &&
    !shouldAutoPairQuote(text, start, key as '"' | "'" | "`")
  ) {
    return null;
  }

  if (start !== end) {
    const selectedText = text.slice(start, end);
    const wrappedText = `${key}${selectedText}${closing}`;
    return {
      start,
      end,
      newText: wrappedText,
      caretOffset: wrappedText.length,
    };
  }

  return {
    start,
    end,
    newText: `${key}${closing}`,
    caretOffset: key.length,
  };
}
