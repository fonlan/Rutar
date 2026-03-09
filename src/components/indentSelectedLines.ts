interface BuildIndentSelectedLinesEditParams {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  indentText: string;
}

interface BuildOutdentCurrentLineEditParams {
  text: string;
  offset: number;
  indentText: string;
}

interface BuildIndentAtCaretEditParams {
  text: string;
  offset: number;
  indentText: string;
}

export interface IndentSelectedLinesEdit {
  start: number;
  end: number;
  newText: string;
  selectionStart: number;
  selectionEnd: number;
}

function getLeadingOutdentLength(line: string, indentText: string) {
  if (!line || !indentText) {
    return 0;
  }

  if (line.startsWith("\t")) {
    return 1;
  }

  const maxSpaces = indentText.match(/^ +$/)?.[0].length ?? 0;
  if (maxSpaces > 0) {
    let count = 0;
    while (count < maxSpaces && line[count] === " ") {
      count += 1;
    }
    return count;
  }

  return line.startsWith(indentText) ? indentText.length : 0;
}

function getLeadingWhitespaceLength(line: string) {
  let count = 0;
  while (count < line.length) {
    const char = line[count];
    if (char !== " " && char !== "\t") {
      break;
    }
    count += 1;
  }
  return count;
}

function getIndentStepWidth(indentText: string) {
  if (!indentText) {
    return 0;
  }

  if (indentText === "\t") {
    return 1;
  }

  return indentText.length;
}

function getLineStartOffset(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  return text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
}

function getLineEndOffset(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineEnd = text.indexOf("\n", safeOffset);
  return lineEnd === -1 ? text.length : lineEnd;
}

export function buildIndentSelectedLinesEdit({
  text,
  selectionStart,
  selectionEnd,
  indentText,
}: BuildIndentSelectedLinesEditParams): IndentSelectedLinesEdit | null {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(0, Math.min(selectionEnd, text.length));
  if (safeStart === safeEnd || !indentText) {
    return null;
  }

  const rangeStart = Math.min(safeStart, safeEnd);
  const rangeEnd = Math.max(safeStart, safeEnd);
  const replaceStart = getLineStartOffset(text, rangeStart);
  const inclusiveEndOffset = Math.max(rangeStart, rangeEnd - 1);
  const replaceEnd = getLineEndOffset(text, inclusiveEndOffset);
  const selectedBlock = text.slice(replaceStart, replaceEnd);
  const lineCount = selectedBlock.split("\n").length;
  const newText = `${indentText}${selectedBlock.replace(/\n/g, `\n${indentText}`)}`;

  return {
    start: replaceStart,
    end: replaceEnd,
    newText,
    selectionStart: rangeStart + indentText.length,
    selectionEnd: rangeEnd + indentText.length * lineCount,
  };
}

export function buildOutdentSelectedLinesEdit({
  text,
  selectionStart,
  selectionEnd,
  indentText,
}: BuildIndentSelectedLinesEditParams): IndentSelectedLinesEdit | null {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(0, Math.min(selectionEnd, text.length));
  if (safeStart === safeEnd || !indentText) {
    return null;
  }

  const rangeStart = Math.min(safeStart, safeEnd);
  const rangeEnd = Math.max(safeStart, safeEnd);
  const replaceStart = getLineStartOffset(text, rangeStart);
  const inclusiveEndOffset = Math.max(rangeStart, rangeEnd - 1);
  const replaceEnd = getLineEndOffset(text, inclusiveEndOffset);
  const selectedBlock = text.slice(replaceStart, replaceEnd);
  const lines = selectedBlock.split("\n");
  const nextLines: string[] = [];
  let removedBeforeStart = 0;
  let removedBeforeEnd = 0;
  let lineStartOffset = replaceStart;
  let removedAny = false;

  for (const line of lines) {
    const removedCount = getLeadingOutdentLength(line, indentText);
    const startCharsIntoLine = Math.max(
      0,
      Math.min(line.length, rangeStart - lineStartOffset),
    );
    const endCharsIntoLine = Math.max(
      0,
      Math.min(line.length, rangeEnd - lineStartOffset),
    );

    removedBeforeStart += Math.min(removedCount, startCharsIntoLine);
    removedBeforeEnd += Math.min(removedCount, endCharsIntoLine);
    removedAny ||= removedCount > 0;
    nextLines.push(line.slice(removedCount));
    lineStartOffset += line.length + 1;
  }

  if (!removedAny) {
    return null;
  }

  return {
    start: replaceStart,
    end: replaceEnd,
    newText: nextLines.join("\n"),
    selectionStart: Math.max(replaceStart, rangeStart - removedBeforeStart),
    selectionEnd: Math.max(replaceStart, rangeEnd - removedBeforeEnd),
  };
}

export function buildOutdentCurrentLineEdit({
  text,
  offset,
  indentText,
}: BuildOutdentCurrentLineEditParams): IndentSelectedLinesEdit | null {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  if (!indentText) {
    return null;
  }

  const replaceStart = getLineStartOffset(text, safeOffset);
  const replaceEnd = getLineEndOffset(text, safeOffset);
  const line = text.slice(replaceStart, replaceEnd);
  const removedCount = getLeadingOutdentLength(line, indentText);
  if (removedCount <= 0) {
    return null;
  }

  const caretOffsetInLine = safeOffset - replaceStart;
  const leadingWhitespaceLength = getLeadingWhitespaceLength(line);
  const remainingLeadingWhitespaceLength = Math.max(
    0,
    leadingWhitespaceLength - removedCount,
  );
  const indentStepWidth = Math.max(1, getIndentStepWidth(indentText));
  const nextCaretOffsetInLine = caretOffsetInLine <= leadingWhitespaceLength
    ? Math.min(
        remainingLeadingWhitespaceLength,
        Math.floor(Math.max(0, caretOffsetInLine - 1) / indentStepWidth)
          * indentStepWidth,
      )
    : Math.max(0, caretOffsetInLine - removedCount);

  return {
    start: replaceStart,
    end: replaceEnd,
    newText: line.slice(removedCount),
    selectionStart: replaceStart + nextCaretOffsetInLine,
    selectionEnd: replaceStart + nextCaretOffsetInLine,
  };
}

export function buildIndentAtCaretEdit({
  text,
  offset,
  indentText,
}: BuildIndentAtCaretEditParams): IndentSelectedLinesEdit | null {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  if (!indentText) {
    return null;
  }

  const lineStart = getLineStartOffset(text, safeOffset);
  const lineEnd = getLineEndOffset(text, safeOffset);
  const line = text.slice(lineStart, lineEnd);
  const caretOffsetInLine = safeOffset - lineStart;
  const leadingWhitespaceLength = getLeadingWhitespaceLength(line);
  const indentStepWidth = Math.max(1, getIndentStepWidth(indentText));
  const remainder = caretOffsetInLine % indentStepWidth;
  const insertText = caretOffsetInLine <= leadingWhitespaceLength
    ? indentText === "\t"
      ? "\t"
      : " ".repeat(remainder === 0 ? indentStepWidth : indentStepWidth - remainder)
    : indentText;

  return {
    start: safeOffset,
    end: safeOffset,
    newText: insertText,
    selectionStart: safeOffset + insertText.length,
    selectionEnd: safeOffset + insertText.length,
  };
}
