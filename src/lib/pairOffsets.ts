// Shared helpers and DTOs for the matching-pair highlight feature used by both
// Editor.tsx and DiffEditor.tsx.

export interface PairOffsetsResultPayload {
  leftOffset: number;
  rightOffset: number;
  leftLine: number;
  leftColumn: number;
  rightLine: number;
  rightColumn: number;
}

export function isQuoteCharacter(value: string) {
  return value === "'" || value === '"';
}
