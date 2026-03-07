import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, type MutableRefObject } from 'react';

interface UseSearchSessionLifecycleOptions {
  filterSessionIdRef: MutableRefObject<string | null>;
  searchSessionIdRef: MutableRefObject<string | null>;
}

export function useSearchSessionLifecycle({
  filterSessionIdRef,
  searchSessionIdRef,
}: UseSearchSessionLifecycleOptions) {
  const disposeSearchSessionById = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      return;
    }

    void invoke<boolean>('dispose_search_session', { sessionId }).catch((error) => {
      console.warn('Failed to dispose search session:', error);
    });
  }, []);

  const disposeFilterSessionById = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      return;
    }

    void invoke<boolean>('dispose_filter_session', { sessionId }).catch((error) => {
      console.warn('Failed to dispose filter session:', error);
    });
  }, []);

  const setSearchSessionId = useCallback((nextSessionId: string | null) => {
    const previousSessionId = searchSessionIdRef.current;
    if (previousSessionId && previousSessionId !== nextSessionId) {
      disposeSearchSessionById(previousSessionId);
    }
    searchSessionIdRef.current = nextSessionId;
  }, [disposeSearchSessionById, searchSessionIdRef]);

  const setFilterSessionId = useCallback((nextSessionId: string | null) => {
    const previousSessionId = filterSessionIdRef.current;
    if (previousSessionId && previousSessionId !== nextSessionId) {
      disposeFilterSessionById(previousSessionId);
    }
    filterSessionIdRef.current = nextSessionId;
  }, [disposeFilterSessionById, filterSessionIdRef]);

  useEffect(() => {
    return () => {
      disposeSearchSessionById(searchSessionIdRef.current);
      disposeFilterSessionById(filterSessionIdRef.current);
    };
  }, [disposeFilterSessionById, disposeSearchSessionById, filterSessionIdRef, searchSessionIdRef]);

  return {
    setFilterSessionId,
    setSearchSessionId,
  };
}