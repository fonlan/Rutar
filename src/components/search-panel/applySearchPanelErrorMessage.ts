import { resolveSearchPanelErrorMessage } from './resolveSearchPanelErrorMessage';

interface ApplySearchPanelErrorMessageOptions {
  error: unknown;
  prefix: string;
  setErrorMessage: (value: string | null) => void;
}

export function applySearchPanelErrorMessage({
  error,
  prefix,
  setErrorMessage,
}: ApplySearchPanelErrorMessageOptions): string {
  const readableError = resolveSearchPanelErrorMessage(error);
  setErrorMessage(`${prefix}: ${readableError}`);
  return readableError;
}
