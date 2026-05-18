import { describe, expect, it } from 'vitest';
import {
  containsWildcardChars,
  evaluateCrossFileTarget,
  normalizeTargetPath,
} from './crossFileTarget';

describe('crossFileTarget.normalizeTargetPath', () => {
  it('returns empty for null/undefined/whitespace', () => {
    expect(normalizeTargetPath(null)).toBe('');
    expect(normalizeTargetPath(undefined)).toBe('');
    expect(normalizeTargetPath('   ')).toBe('');
  });

  it('lowercases windows-style paths and unifies separators', () => {
    expect(normalizeTargetPath('C:\\Users\\Fa\\file.txt')).toBe('c:/users/fa/file.txt');
    expect(normalizeTargetPath('c:/Users/fa/FILE.TXT')).toBe('c:/users/fa/file.txt');
  });

  it('keeps posix-style paths case-sensitive', () => {
    expect(normalizeTargetPath('/usr/Local/Dir/File.TXT')).toBe('/usr/Local/Dir/File.TXT');
  });

  it('trims trailing slashes', () => {
    expect(normalizeTargetPath('/foo/bar/')).toBe('/foo/bar');
    expect(normalizeTargetPath('C:\\foo\\bar\\')).toBe('c:/foo/bar');
  });
});

describe('crossFileTarget.containsWildcardChars', () => {
  it('detects wildcard characters', () => {
    expect(containsWildcardChars('foo*.txt')).toBe(true);
    expect(containsWildcardChars('foo?.txt')).toBe(true);
    expect(containsWildcardChars('foo[1].txt')).toBe(true);
  });

  it('returns false for literal paths', () => {
    expect(containsWildcardChars('C:/Users/file.txt')).toBe(false);
    expect(containsWildcardChars('/home/user/file.txt')).toBe(false);
  });
});

describe('crossFileTarget.evaluateCrossFileTarget', () => {
  it('treats empty target as in-document mode', () => {
    expect(evaluateCrossFileTarget('', 'C:\\foo.txt')).toEqual({
      isCrossFile: false,
      isEmpty: true,
      hasWildcard: false,
    });
  });

  it('treats wildcard target as cross-file even if it matches active path prefix', () => {
    expect(evaluateCrossFileTarget('C:\\foo\\*.txt', 'C:\\foo\\bar.txt')).toEqual({
      isCrossFile: true,
      isEmpty: false,
      hasWildcard: true,
    });
  });

  it('detects in-document when target equals active path (case/sep insensitive on windows)', () => {
    const decision = evaluateCrossFileTarget('c:/Users/me/file.txt', 'C:\\Users\\me\\FILE.TXT');
    expect(decision.isCrossFile).toBe(false);
    expect(decision.isEmpty).toBe(false);
  });

  it('detects cross-file when target differs from active path', () => {
    const decision = evaluateCrossFileTarget('C:\\dir\\other.txt', 'C:\\dir\\file.txt');
    expect(decision.isCrossFile).toBe(true);
  });

  it('treats target as cross-file when there is no active path', () => {
    const decision = evaluateCrossFileTarget('C:\\dir\\other.txt', '');
    expect(decision.isCrossFile).toBe(true);
  });
});
