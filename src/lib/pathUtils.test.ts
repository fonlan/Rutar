import { describe, expect, it } from 'vitest';
import { getParentDirectoryPath, pathBaseName } from './pathUtils';

describe('pathUtils', () => {
  it('resolves parent directories for Windows and POSIX paths', () => {
    expect(getParentDirectoryPath('C:\\Users\\me\\file.txt')).toBe('C:\\Users\\me');
    expect(getParentDirectoryPath('C:\\')).toBe('C:\\');
    expect(getParentDirectoryPath('/tmp/file.txt')).toBe('/tmp');
    expect(getParentDirectoryPath('/file.txt')).toBe('/');
    expect(getParentDirectoryPath('file.txt')).toBeNull();
  });

  it('resolves base names without trailing separators', () => {
    expect(pathBaseName('C:\\Users\\me\\file.txt')).toBe('file.txt');
    expect(pathBaseName('/tmp/folder/')).toBe('folder');
    expect(pathBaseName('file.txt')).toBe('file.txt');
  });
});
