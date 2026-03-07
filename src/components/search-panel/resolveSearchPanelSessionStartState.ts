import type { FilterSessionStartBackendResult, SearchSessionStartBackendResult } from './types';

interface ResolvedSearchSessionStartState {
  documentVersion: number;
  nextMatches: SearchSessionStartBackendResult['matches'];
  nextOffset: number | null;
  sessionId: string | null;
  totalMatchedLines: number;
  totalMatches: number;
}

interface ResolvedFilterSessionStartState {
  documentVersion: number;
  nextLine: number | null;
  nextMatches: FilterSessionStartBackendResult['matches'];
  sessionId: string | null;
  totalMatchedLines: number;
}

export function resolveSearchSessionStartState(result: SearchSessionStartBackendResult): ResolvedSearchSessionStartState {
  const nextMatches = result.matches || [];

  return {
    documentVersion: result.documentVersion ?? 0,
    nextMatches,
    nextOffset: result.nextOffset ?? null,
    sessionId: result.sessionId ?? null,
    totalMatchedLines: result.totalMatchedLines ?? new Set(nextMatches.map((item) => item.line)).size,
    totalMatches: result.totalMatches ?? nextMatches.length,
  };
}

export function resolveFilterSessionStartState(result: FilterSessionStartBackendResult): ResolvedFilterSessionStartState {
  const nextMatches = result.matches || [];

  return {
    documentVersion: result.documentVersion ?? 0,
    nextLine: result.nextLine ?? null,
    nextMatches,
    sessionId: result.sessionId ?? null,
    totalMatchedLines: result.totalMatchedLines ?? nextMatches.length,
  };
}
