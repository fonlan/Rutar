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