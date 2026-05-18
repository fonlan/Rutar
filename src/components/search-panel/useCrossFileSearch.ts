import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PathSearchFileError,
  PathSearchMatch,
  PathSearchNextBackendResult,
  PathSearchStartBackendResult,
  SearchMode,
} from './types';

const CROSS_FILE_SEARCH_CHUNK = 200;

export interface CrossFileRunOptions {
  target: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
}

export interface UseCrossFileSearchOptions {
  searchFailedLabel: string;
}

export interface UseCrossFileSearchResult {
  matches: PathSearchMatch[];
  totalFiles: number;
  scannedFiles: number;
  completed: boolean;
  isSearching: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  fileErrors: PathSearchFileError[];
  hasRunOnce: boolean;
  runSearch: (options: CrossFileRunOptions) => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

function describeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function disposeSession(sessionId: string | null) {
  if (!sessionId) {
    return;
  }
  void invoke<boolean>('path_search_dispose', { sessionId }).catch((error) => {
    console.warn('Failed to dispose path search session:', error);
  });
}

export function useCrossFileSearch({
  searchFailedLabel,
}: UseCrossFileSearchOptions): UseCrossFileSearchResult {
  const [matches, setMatches] = useState<PathSearchMatch[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<PathSearchFileError[]>([]);
  const [hasRunOnce, setHasRunOnce] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const runVersionRef = useRef(0);

  useEffect(() => {
    return () => {
      disposeSession(sessionIdRef.current);
      sessionIdRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    runVersionRef.current += 1;
    disposeSession(sessionIdRef.current);
    sessionIdRef.current = null;
    setMatches([]);
    setTotalFiles(0);
    setScannedFiles(0);
    setCompleted(false);
    setErrorMessage(null);
    setFileErrors([]);
    setIsSearching(false);
    setIsLoadingMore(false);
    setHasRunOnce(false);
  }, []);

  const runSearch = useCallback(
    async ({ target, keyword, searchMode, caseSensitive }: CrossFileRunOptions) => {
      runVersionRef.current += 1;
      const runVersion = runVersionRef.current;

      disposeSession(sessionIdRef.current);
      sessionIdRef.current = null;

      setMatches([]);
      setTotalFiles(0);
      setScannedFiles(0);
      setCompleted(false);
      setErrorMessage(null);
      setFileErrors([]);
      setHasRunOnce(true);

      if (!keyword) {
        setIsSearching(false);
        return;
      }
      if (!target.trim()) {
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const result = await invoke<PathSearchStartBackendResult>('path_search_start', {
          target,
          keyword,
          mode: searchMode,
          caseSensitive,
          maxResults: CROSS_FILE_SEARCH_CHUNK,
        });

        if (runVersion !== runVersionRef.current) {
          disposeSession(result.sessionId);
          return;
        }

        sessionIdRef.current = result.completed ? null : result.sessionId;
        setMatches(result.matches);
        setTotalFiles(result.totalFiles);
        setScannedFiles(result.scannedFiles);
        setCompleted(result.completed);
        setFileErrors(result.fileErrors);
        if (result.completed && result.sessionId) {
          disposeSession(result.sessionId);
        }
      } catch (error) {
        if (runVersion !== runVersionRef.current) {
          return;
        }
        setErrorMessage(`${searchFailedLabel}: ${describeError(error)}`);
        setCompleted(true);
      } finally {
        if (runVersion === runVersionRef.current) {
          setIsSearching(false);
        }
      }
    },
    [searchFailedLabel],
  );

  const loadMore = useCallback(async () => {
    if (completed || !sessionIdRef.current || isLoadingMore || isSearching) {
      return;
    }

    const runVersion = runVersionRef.current;
    const sessionId = sessionIdRef.current;
    setIsLoadingMore(true);

    try {
      const result = await invoke<PathSearchNextBackendResult>('path_search_next', {
        sessionId,
        maxResults: CROSS_FILE_SEARCH_CHUNK,
      });

      if (runVersion !== runVersionRef.current) {
        return;
      }

      setMatches((prev) => [...prev, ...result.matches]);
      setScannedFiles(result.scannedFiles);
      setCompleted(result.completed);
      if (result.fileErrors.length > 0) {
        setFileErrors((prev) => [...prev, ...result.fileErrors]);
      }
      if (result.completed) {
        disposeSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }
    } catch (error) {
      if (runVersion !== runVersionRef.current) {
        return;
      }
      setErrorMessage(`${searchFailedLabel}: ${describeError(error)}`);
      setCompleted(true);
      disposeSession(sessionIdRef.current);
      sessionIdRef.current = null;
    } finally {
      if (runVersion === runVersionRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [completed, isLoadingMore, isSearching, searchFailedLabel]);

  return {
    matches,
    totalFiles,
    scannedFiles,
    completed,
    isSearching,
    isLoadingMore,
    errorMessage,
    fileErrors,
    hasRunOnce,
    runSearch,
    loadMore,
    reset,
  };
}
