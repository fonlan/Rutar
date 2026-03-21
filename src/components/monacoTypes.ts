export interface MonacoTextEdit {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  text: string;
}

export interface MonacoEngineState {
  modelId: string;
  syncVersion: number;
  lastAppliedBackendVersion: number;
}

