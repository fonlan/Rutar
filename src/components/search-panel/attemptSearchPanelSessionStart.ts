import { invoke } from '@tauri-apps/api/core';
import type { MutableRefObject } from 'react';
import { isMissingInvokeCommandError } from './backendGuards';

interface AttemptSearchPanelSessionStartOptions<TResult> {
  commandName: string;
  isExpectedResult: (value: unknown) => value is TResult;
  request: Record<string, unknown>;
  sessionCommandUnsupportedRef: MutableRefObject<boolean>;
}

export async function attemptSearchPanelSessionStart<TResult>({
  commandName,
  isExpectedResult,
  request,
  sessionCommandUnsupportedRef,
}: AttemptSearchPanelSessionStartOptions<TResult>): Promise<TResult | null> {
  if (sessionCommandUnsupportedRef.current) {
    return null;
  }

  try {
    const result = await invoke<unknown>(commandName, request);
    return isExpectedResult(result) ? result : null;
  } catch (error) {
    if (isMissingInvokeCommandError(error, commandName)) {
      sessionCommandUnsupportedRef.current = true;
    }

    return null;
  }
}
