import { useCallback, type MutableRefObject } from 'react';

interface UseSearchBatchControlOptions {
  countRunVersionRef: MutableRefObject<number>;
  filterCountRunVersionRef: MutableRefObject<number>;
  filterRunVersionRef: MutableRefObject<number>;
  loadMoreDebounceRef: MutableRefObject<number | null>;
  loadMoreLockRef: MutableRefObject<boolean>;
  loadMoreSessionRef: MutableRefObject<number>;
  resultFilterStepRunVersionRef: MutableRefObject<number>;
  runVersionRef: MutableRefObject<number>;
  setIsSearching: (value: boolean) => void;
  setResultFilterStepLoadingDirection: (value: 'prev' | 'next' | null) => void;
  stopResultFilterSearchRef: MutableRefObject<boolean>;
}

export function useSearchBatchControl({
  countRunVersionRef,
  filterCountRunVersionRef,
  filterRunVersionRef,
  loadMoreDebounceRef,
  loadMoreLockRef,
  loadMoreSessionRef,
  resultFilterStepRunVersionRef,
  runVersionRef,
  setIsSearching,
  setResultFilterStepLoadingDirection,
  stopResultFilterSearchRef,
}: UseSearchBatchControlOptions) {
  const requestStopResultFilterSearch = useCallback(() => {
    stopResultFilterSearchRef.current = true;
    runVersionRef.current += 1;
    filterRunVersionRef.current += 1;
    countRunVersionRef.current += 1;
    filterCountRunVersionRef.current += 1;
  }, [
    countRunVersionRef,
    filterCountRunVersionRef,
    filterRunVersionRef,
    runVersionRef,
    stopResultFilterSearchRef,
  ]);

  const cancelPendingBatchLoad = useCallback(() => {
    loadMoreSessionRef.current += 1;
    resultFilterStepRunVersionRef.current += 1;
    if (loadMoreDebounceRef.current !== null) {
      window.clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }
    setResultFilterStepLoadingDirection(null);
    if (loadMoreLockRef.current) {
      loadMoreLockRef.current = false;
      setIsSearching(false);
    }
  }, [
    loadMoreDebounceRef,
    loadMoreLockRef,
    loadMoreSessionRef,
    resultFilterStepRunVersionRef,
    setIsSearching,
    setResultFilterStepLoadingDirection,
  ]);

  return {
    cancelPendingBatchLoad,
    requestStopResultFilterSearch,
  };
}