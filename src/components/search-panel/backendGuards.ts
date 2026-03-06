import type {
  FilterResultFilterStepBackendResult,
  FilterSessionNextBackendResult,
  FilterSessionRestoreBackendResult,
  FilterSessionStartBackendResult,
  SearchCursorStepBackendResult,
  SearchSessionNextBackendResult,
  SearchSessionRestoreBackendResult,
  SearchSessionStartBackendResult,
} from './types';

export function isSearchSessionStartBackendResult(value: unknown): value is SearchSessionStartBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SearchSessionStartBackendResult>;
  const sessionIdValid = candidate.sessionId === null || typeof candidate.sessionId === 'string';
  return (
    sessionIdValid &&
    Array.isArray(candidate.matches) &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextOffset === 'number' || candidate.nextOffset === null) &&
    typeof candidate.totalMatches === 'number' &&
    typeof candidate.totalMatchedLines === 'number'
  );
}

export function isSearchSessionNextBackendResult(value: unknown): value is SearchSessionNextBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SearchSessionNextBackendResult>;
  return (
    Array.isArray(candidate.matches) &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextOffset === 'number' || candidate.nextOffset === null)
  );
}

export function isSearchSessionRestoreBackendResult(value: unknown): value is SearchSessionRestoreBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SearchSessionRestoreBackendResult>;
  const sessionIdValid = candidate.sessionId === null || typeof candidate.sessionId === 'string';
  return (
    typeof candidate.restored === 'boolean' &&
    sessionIdValid &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextOffset === 'number' || candidate.nextOffset === null) &&
    typeof candidate.totalMatches === 'number' &&
    typeof candidate.totalMatchedLines === 'number'
  );
}

export function isFilterSessionStartBackendResult(value: unknown): value is FilterSessionStartBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FilterSessionStartBackendResult>;
  const sessionIdValid = candidate.sessionId === null || typeof candidate.sessionId === 'string';
  return (
    sessionIdValid &&
    Array.isArray(candidate.matches) &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextLine === 'number' || candidate.nextLine === null) &&
    typeof candidate.totalMatchedLines === 'number'
  );
}

export function isFilterSessionNextBackendResult(value: unknown): value is FilterSessionNextBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FilterSessionNextBackendResult>;
  return (
    Array.isArray(candidate.matches) &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextLine === 'number' || candidate.nextLine === null)
  );
}

export function isFilterSessionRestoreBackendResult(value: unknown): value is FilterSessionRestoreBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FilterSessionRestoreBackendResult>;
  const sessionIdValid = candidate.sessionId === null || typeof candidate.sessionId === 'string';
  return (
    typeof candidate.restored === 'boolean' &&
    sessionIdValid &&
    typeof candidate.documentVersion === 'number' &&
    (typeof candidate.nextLine === 'number' || candidate.nextLine === null) &&
    typeof candidate.totalMatchedLines === 'number'
  );
}

export function isSearchCursorStepBackendResult(value: unknown): value is SearchCursorStepBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SearchCursorStepBackendResult>;
  const targetMatchValid = candidate.targetMatch === null || typeof candidate.targetMatch === 'object';
  return targetMatchValid && typeof candidate.documentVersion === 'number';
}

export function isFilterResultFilterStepBackendResult(value: unknown): value is FilterResultFilterStepBackendResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FilterResultFilterStepBackendResult>;
  return (
    typeof candidate.documentVersion === 'number' &&
    typeof candidate.batchStartLine === 'number' &&
    typeof candidate.totalMatchedLines === 'number'
  );
}

export function isMissingInvokeCommandError(error: unknown, commandName: string): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const normalizedCommandName = commandName.toLowerCase();
  if (!message.includes(normalizedCommandName)) {
    return false;
  }

  return (
    message.includes('unknown') ||
    message.includes('not found') ||
    message.includes('cannot find') ||
    message.includes('unrecognized')
  );
}
