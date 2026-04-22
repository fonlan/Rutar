import type * as monaco from 'monaco-editor';

export function createMonacoTextSnapshotFromChunks(
  chunks: string[],
): monaco.editor.ITextSnapshot {
  let index = 0;

  return {
    read() {
      const chunk = chunks[index];
      index += 1;
      return chunk ?? null;
    },
  };
}
