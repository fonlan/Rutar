import type { FilterRuleInputPayload, SearchMode } from './types';
import { getSearchModeValue } from './utils';

interface BuildSearchSessionStartRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  searchMode: SearchMode;
}

interface BuildSearchChunkRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  searchMode: SearchMode;
  startOffset: number;
}

interface BuildSearchSessionNextRequestOptions {
  maxResults: number;
  sessionId: string;
}

interface BuildSearchFirstRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveSearchKeyword: string;
  reverse: boolean;
  searchMode: SearchMode;
}

interface BuildReplaceCurrentRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  parseEscapeSequences: boolean;
  replaceValue: string;
  searchMode: SearchMode;
  targetEnd: number;
  targetStart: number;
}

interface BuildReplaceAllRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  parseEscapeSequences: boolean;
  replaceValue: string;
  searchMode: SearchMode;
}

interface BuildFilterSessionStartRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  maxResults: number;
  rules: FilterRuleInputPayload[];
}

interface BuildFilterChunkRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  effectiveResultFilterKeyword: string;
  maxResults: number;
  rules: FilterRuleInputPayload[];
  startLine: number;
}

interface BuildFilterSessionNextRequestOptions {
  maxResults: number;
  sessionId: string;
}

interface BuildFilterStepRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  currentColumn: number | null;
  currentLine: number | null;
  maxResults: number;
  resultFilterKeyword: string;
  rules: FilterRuleInputPayload[];
  step: number;
}

interface BuildSearchCursorStepRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  cursorColumn: number | null;
  cursorLine: number | null;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  searchMode: SearchMode;
  step: number;
}

interface BuildSearchResultFilterStepRequestOptions {
  activeTabId: string;
  caseSensitive: boolean;
  currentEnd: number | null;
  currentStart: number | null;
  effectiveResultFilterKeyword: string;
  effectiveSearchKeyword: string;
  maxResults: number;
  searchMode: SearchMode;
  step: number;
}

export function buildSearchSessionStartRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  searchMode,
}: BuildSearchSessionStartRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    maxResults,
  };
}

export function buildSearchSessionNextRequest({
  maxResults,
  sessionId,
}: BuildSearchSessionNextRequestOptions) {
  return {
    sessionId,
    maxResults,
  };
}

export function buildSearchFirstRequest({
  activeTabId,
  caseSensitive,
  effectiveSearchKeyword,
  reverse,
  searchMode,
}: BuildSearchFirstRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    reverse,
  };
}

export function buildSearchChunkRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  searchMode,
  startOffset,
}: BuildSearchChunkRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    resultFilterKeyword: effectiveResultFilterKeyword,
    startOffset,
    maxResults,
  };
}

export function buildReplaceCurrentRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  parseEscapeSequences,
  replaceValue,
  searchMode,
  targetEnd,
  targetStart,
}: BuildReplaceCurrentRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    replaceValue,
    parseEscapeSequences,
    targetStart,
    targetEnd,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    maxResults,
  };
}

export function buildReplaceAllRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  parseEscapeSequences,
  replaceValue,
  searchMode,
}: BuildReplaceAllRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    replaceValue,
    parseEscapeSequences,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    maxResults,
  };
}

export function buildFilterSessionStartRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  maxResults,
  rules,
}: BuildFilterSessionStartRequestOptions) {
  return {
    id: activeTabId,
    rules,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    maxResults,
  };
}

export function buildFilterSessionNextRequest({
  maxResults,
  sessionId,
}: BuildFilterSessionNextRequestOptions) {
  return {
    sessionId,
    maxResults,
  };
}

export function buildFilterStepRequest({
  activeTabId,
  caseSensitive,
  currentColumn,
  currentLine,
  maxResults,
  resultFilterKeyword,
  rules,
  step,
}: BuildFilterStepRequestOptions) {
  return {
    id: activeTabId,
    rules,
    resultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    currentLine,
    currentColumn,
    step,
    maxResults,
  };
}

export function buildSearchCursorStepRequest({
  activeTabId,
  caseSensitive,
  cursorColumn,
  cursorLine,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  searchMode,
  step,
}: BuildSearchCursorStepRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    cursorLine,
    cursorColumn,
    step,
  };
}

export function buildSearchResultFilterStepRequest({
  activeTabId,
  caseSensitive,
  currentEnd,
  currentStart,
  effectiveResultFilterKeyword,
  effectiveSearchKeyword,
  maxResults,
  searchMode,
  step,
}: BuildSearchResultFilterStepRequestOptions) {
  return {
    id: activeTabId,
    keyword: effectiveSearchKeyword,
    mode: getSearchModeValue(searchMode),
    caseSensitive,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    currentStart,
    currentEnd,
    step,
    maxResults,
  };
}

export function buildFilterChunkRequest({
  activeTabId,
  caseSensitive,
  effectiveResultFilterKeyword,
  maxResults,
  rules,
  startLine,
}: BuildFilterChunkRequestOptions) {
  return {
    id: activeTabId,
    rules,
    resultFilterKeyword: effectiveResultFilterKeyword,
    resultFilterCaseSensitive: caseSensitive,
    startLine,
    maxResults,
  };
}