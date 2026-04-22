import { describe, expect, it } from 'vitest';
import { createMonacoTextSnapshotFromChunks } from './monacoTextSnapshot';

describe('createMonacoTextSnapshotFromChunks', () => {
  it('reads chunks in order and returns null at the end', () => {
    const snapshot = createMonacoTextSnapshotFromChunks(['ab', 'cd', 'ef']);

    expect(snapshot.read()).toBe('ab');
    expect(snapshot.read()).toBe('cd');
    expect(snapshot.read()).toBe('ef');
    expect(snapshot.read()).toBeNull();
    expect(snapshot.read()).toBeNull();
  });
});
