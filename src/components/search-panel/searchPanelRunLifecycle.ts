import type { MutableRefObject } from 'react';

interface BeginSearchPanelRunOptions {
  runVersionRef: MutableRefObject<number>;
  setIsSearching: (value: boolean) => void;
  silent?: boolean;
}

interface SearchPanelRunVersionOptions {
  runVersion: number;
  runVersionRef: MutableRefObject<number>;
}

interface FinalizeSearchPanelRunOptions extends SearchPanelRunVersionOptions {
  setIsSearching: (value: boolean) => void;
  silent?: boolean;
}

export function beginSearchPanelRun({
  runVersionRef,
  setIsSearching,
  silent = false,
}: BeginSearchPanelRunOptions): number {
  const runVersion = runVersionRef.current + 1;
  runVersionRef.current = runVersion;
  if (!silent) {
    setIsSearching(true);
  }

  return runVersion;
}

export function isSearchPanelRunStale({
  runVersion,
  runVersionRef,
}: SearchPanelRunVersionOptions): boolean {
  return runVersionRef.current !== runVersion;
}

export function finalizeSearchPanelRun({
  runVersion,
  runVersionRef,
  setIsSearching,
  silent = false,
}: FinalizeSearchPanelRunOptions) {
  if (isSearchPanelRunStale({ runVersion, runVersionRef }) || silent) {
    return;
  }

  setIsSearching(false);
}
