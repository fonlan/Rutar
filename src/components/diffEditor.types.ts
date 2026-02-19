export type ActivePanel = 'source' | 'target';

export type DiffLineKind = 'insert' | 'delete' | 'modify';

export interface LineDiffComparisonResult {
  alignedSourceLines: string[];
  alignedTargetLines: string[];
  alignedSourcePresent: boolean[];
  alignedTargetPresent: boolean[];
  diffLineNumbers: number[];
  sourceDiffLineNumbers: number[];
  targetDiffLineNumbers: number[];
  alignedDiffKinds?: Array<DiffLineKind | null>;
  sourceLineNumbersByAlignedRow?: number[];
  targetLineNumbersByAlignedRow?: number[];
  diffRowIndexes?: number[];
  sourceLineCount: number;
  targetLineCount: number;
  alignedLineCount: number;
}
