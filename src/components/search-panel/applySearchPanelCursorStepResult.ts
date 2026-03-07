import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import type {
  SearchMatch,
  SearchMode,
} from './types';

interface CachedSearchSnapshot {
  tabId: string;
  keyword: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  resultFilterKeyword: string;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  sessionId: string | null;
}

interface ApplySearchCursorStepResultOptions {
  cachedSearchRef: MutableRefObject<CachedSearchSnapshot | null>;
  chunkCursorRef: MutableRefObject<number | null>;
  currentMatchIndexRef: MutableRefObject<number>;
  matches: SearchMatch[];
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  setMatches: Dispatch<SetStateAction<SearchMatch[]>>;
  setSearchSessionId: (value: string | null) => void;
  startTransition: TransitionStartFunction;
  targetMatch: SearchMatch;
}

export function applySearchCursorStepResult({
  cachedSearchRef,
  chunkCursorRef,
  currentMatchIndexRef,
  matches,
  setCurrentMatchIndex,
  setMatches,
  setSearchSessionId,
  startTransition,
  targetMatch,
}: ApplySearchCursorStepResultOptions): number {
  const targetIndex = matches.findIndex(
    (item) => item.start === targetMatch.start && item.end === targetMatch.end
  );

  if (targetIndex >= 0) {
    currentMatchIndexRef.current = targetIndex;
    setCurrentMatchIndex(targetIndex);
    return targetIndex;
  }

  currentMatchIndexRef.current = 0;
  startTransition(() => {
    setMatches([targetMatch]);
    setCurrentMatchIndex(0);
  });

  setSearchSessionId(null);
  chunkCursorRef.current = null;
  cachedSearchRef.current = null;
  return 0;
}