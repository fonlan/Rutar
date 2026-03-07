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