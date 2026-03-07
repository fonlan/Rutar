import type { MutableRefObject } from 'react';

type ResultFilterStepLoadingDirection = 'next' | 'prev' | null;

interface BeginResultFilterStepRunOptions {
  direction: Exclude<ResultFilterStepLoadingDirection, null>;
  loadMoreLockRef: MutableRefObject<boolean>;
  resultFilterStepRunVersionRef: MutableRefObject<number>;
  setIsSearching: (value: boolean) => void;
  setResultFilterStepLoadingDirection: (value: ResultFilterStepLoadingDirection) => void;
}

interface ResultFilterStepRunVersionOptions {
  resultFilterStepRunVersionRef: MutableRefObject<number>;
  runVersion: number;
}

interface FinalizeResultFilterStepRunOptions extends ResultFilterStepRunVersionOptions {
  loadMoreLockRef: MutableRefObject<boolean>;
  setIsSearching: (value: boolean) => void;
  setResultFilterStepLoadingDirection: (value: ResultFilterStepLoadingDirection) => void;
}

export function beginResultFilterStepRun({
  direction,
  loadMoreLockRef,
  resultFilterStepRunVersionRef,
  setIsSearching,
  setResultFilterStepLoadingDirection,
}: BeginResultFilterStepRunOptions): number {
  const runVersion = resultFilterStepRunVersionRef.current + 1;
  resultFilterStepRunVersionRef.current = runVersion;
  loadMoreLockRef.current = true;
  setIsSearching(true);
  setResultFilterStepLoadingDirection(direction);
  return runVersion;
}

export function isResultFilterStepRunStale({
  resultFilterStepRunVersionRef,
  runVersion,
}: ResultFilterStepRunVersionOptions): boolean {
  return runVersion !== resultFilterStepRunVersionRef.current;
}

export function finalizeResultFilterStepRun({
  loadMoreLockRef,
  resultFilterStepRunVersionRef,
  runVersion,
  setIsSearching,
  setResultFilterStepLoadingDirection,
}: FinalizeResultFilterStepRunOptions) {
  if (isResultFilterStepRunStale({ resultFilterStepRunVersionRef, runVersion })) {
    return;
  }

  loadMoreLockRef.current = false;
  setIsSearching(false);
  setResultFilterStepLoadingDirection(null);
}
