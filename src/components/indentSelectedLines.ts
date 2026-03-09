interface BuildIndentSelectedLinesEditParams {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  indentText: string;
}

export interface IndentSelectedLinesEdit {
  start: number;
  end: number;
  newText: string;
  selectionStart: number;
  selectionEnd: number;
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
