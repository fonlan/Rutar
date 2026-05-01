interface ApplySearchPanelErrorMessageOptions {
  error: unknown;
  prefix: string;
  setErrorMessage: (value: string | null) => void;
}

export function resolveSearchPanelErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
