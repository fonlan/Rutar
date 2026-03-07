import type { FilterChunkBackendResult, SearchChunkBackendResult } from './types';

interface ResolvedSearchChunkState {
  documentVersion: number;
  nextMatches: SearchChunkBackendResult['matches'];
  nextOffset: number | null;
}

interface ResolvedFilterChunkState {
  documentVersion: number;
  nextLine: number | null;
  nextMatches: FilterChunkBackendResult['matches'];
}

export function resolveSearchChunkState(result: SearchChunkBackendResult): ResolvedSearchChunkState {
  return {
    documentVersion: result.documentVersion ?? 0,
    nextMatches: result.matches || [],
    nextOffset: result.nextOffset ?? null,
  };
}

export function resolveFilterChunkState(result: FilterChunkBackendResult): ResolvedFilterChunkState {
  return {
    documentVersion: result.documentVersion ?? 0,
    nextLine: result.nextLine ?? null,
    nextMatches: result.matches || [],
  };
}
