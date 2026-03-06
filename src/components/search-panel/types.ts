export type SearchMode = 'literal' | 'regex' | 'wildcard';
export type SearchOpenMode = 'find' | 'replace' | 'filter';
export type SearchResultPanelState = 'closed' | 'minimized' | 'open';
export type PanelMode = 'find' | 'replace' | 'filter';
export type FilterRuleMatchMode = 'contains' | 'regex' | 'wildcard';
export type FilterRuleApplyTo = 'line' | 'match';

export interface FilterRule {
  id: string;
  keyword: string;
  matchMode: FilterRuleMatchMode;
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

export interface FilterRuleDragState {
  draggingRuleId: string;
  overRuleId: string | null;
}

export interface FilterRuleStyle {
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

export interface FilterMatchRange {
  startChar: number;
  endChar: number;
}

export interface PreviewSegment {
  text: string;
  isPrimaryMatch?: boolean;
  isSecondaryMatch?: boolean;
  isRuleMatch?: boolean;
}

export interface FilterMatch {
  line: number;
  column: number;
  length: number;
  lineText: string;
  ruleIndex: number;
  style: FilterRuleStyle;
  ranges: FilterMatchRange[];
  previewSegments?: PreviewSegment[];
}

export interface FilterRuleInputPayload {
  keyword: string;
  matchMode: FilterRuleMatchMode;
  backgroundColor: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  applyTo: FilterRuleApplyTo;
}

export interface FilterRuleGroupPayload {
  name: string;
  rules: FilterRuleInputPayload[];
}

export interface SearchMatch {
  start: number;
  end: number;
  startChar: number;
  endChar: number;
  text: string;
  line: number;
  column: number;
  lineText: string;
  previewSegments?: PreviewSegment[];
}

export interface SearchOpenEventDetail {
  mode?: SearchOpenMode;
}

export interface SearchRunResult {
  matches: SearchMatch[];
  documentVersion: number;
  errorMessage: string | null;
  nextOffset?: number | null;
}

export interface FilterRunResult {
  matches: FilterMatch[];
  documentVersion: number;
  errorMessage: string | null;
  nextLine?: number | null;
}

export interface SearchChunkBackendResult {
  matches: SearchMatch[];
  documentVersion: number;
  nextOffset: number | null;
}

export interface SearchSessionStartBackendResult {
  sessionId: string | null;
  matches: SearchMatch[];
  documentVersion: number;
  nextOffset: number | null;
  totalMatches: number;
  totalMatchedLines: number;
}

export interface SearchSessionNextBackendResult {
  matches: SearchMatch[];
  documentVersion: number;
  nextOffset: number | null;
}

export interface SearchSessionRestoreBackendResult {
  restored: boolean;
  sessionId: string | null;
  documentVersion: number;
  nextOffset: number | null;
  totalMatches: number;
  totalMatchedLines: number;
}

export interface FilterChunkBackendResult {
  matches: FilterMatch[];
  documentVersion: number;
  nextLine: number | null;
}

export interface FilterSessionStartBackendResult {
  sessionId: string | null;
  matches: FilterMatch[];
  documentVersion: number;
  nextLine: number | null;
  totalMatchedLines: number;
}

export interface FilterSessionNextBackendResult {
  matches: FilterMatch[];
  documentVersion: number;
  nextLine: number | null;
}

export interface FilterSessionRestoreBackendResult {
  restored: boolean;
  sessionId: string | null;
  documentVersion: number;
  nextLine: number | null;
  totalMatchedLines: number;
}

export interface FilterCountBackendResult {
  matchedLines: number;
  documentVersion: number;
}

export interface SearchFirstBackendResult {
  firstMatch: SearchMatch | null;
  documentVersion: number;
}

export interface SearchCountBackendResult {
  totalMatches: number;
  matchedLines: number;
  documentVersion: number;
}

export interface ReplaceAllAndSearchChunkBackendResult {
  replacedCount: number;
  lineCount: number;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  totalMatches: number;
  totalMatchedLines: number;
}

export interface ReplaceCurrentAndSearchChunkBackendResult {
  replaced: boolean;
  lineCount: number;
  documentVersion: number;
  matches: SearchMatch[];
  nextOffset: number | null;
  preferredMatch: SearchMatch | null;
  totalMatches: number;
  totalMatchedLines: number;
}

export interface SearchResultFilterStepBackendResult {
  targetMatch: SearchMatch | null;
  documentVersion: number;
  batchStartOffset: number;
  batchMatches?: SearchMatch[];
  nextOffset?: number | null;
  targetIndexInBatch?: number | null;
  totalMatches: number;
  totalMatchedLines: number;
}

export interface SearchCursorStepBackendResult {
  targetMatch: SearchMatch | null;
  documentVersion: number;
}

export interface FilterResultFilterStepBackendResult {
  targetMatch: FilterMatch | null;
  documentVersion: number;
  batchStartLine: number;
  batchMatches?: FilterMatch[];
  nextLine?: number | null;
  targetIndexInBatch?: number | null;
  totalMatchedLines: number;
}

export interface TabSearchPanelSnapshot {
  isOpen: boolean;
  panelMode: PanelMode;
  resultPanelState: SearchResultPanelState;
  resultPanelHeight: number;
  searchSidebarWidth: number;
  keyword: string;
  replaceValue: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  reverseSearch: boolean;
  resultFilterKeyword: string;
  appliedResultFilterKeyword: string;
  matches: SearchMatch[];
  filterMatches: FilterMatch[];
  currentMatchIndex: number;
  currentFilterMatchIndex: number;
  totalMatchCount: number | null;
  totalMatchedLineCount: number | null;
  totalFilterMatchedLineCount: number | null;
  searchSessionId: string | null;
  filterSessionId: string | null;
  searchNextOffset: number | null;
  filterNextLine: number | null;
  searchDocumentVersion: number | null;
  filterDocumentVersion: number | null;
  filterRulesKey: string;
}

export type SearchSidebarTextInputElement = HTMLInputElement | HTMLTextAreaElement;
export type SearchSidebarInputContextAction = 'copy' | 'cut' | 'paste' | 'delete';

export interface SearchSidebarInputContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  canEdit: boolean;
}
