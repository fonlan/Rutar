import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { dispatchDocumentUpdated } from '@/lib/documentEvents';
import { dispatchEditorForceRefresh } from './utils';
import { useStore } from '@/store/useStore';
import type { FileTab } from '@/store/storeTypes';
import type {
  PathReplaceApplyBackendResult,
  PathReplacePreviewBackendResult,
  PathReplacePreviewFile,
  PathSearchFileError,
  SearchMode,
} from './types';
import { normalizeTargetPath } from './crossFileTarget';

export interface CrossFileReplaceDialogProps {
  isOpen: boolean;
  target: string;
  keyword: string;
  replaceValue: string;
  searchMode: SearchMode;
  caseSensitive: boolean;
  parseEscapeSequences: boolean;
  includeSubdirectories: boolean;
  messages: ReturnType<typeof getSearchPanelMessages>;
  onClose: () => void;
  onCompleted?: (info: {
    totalReplaced: number;
    filesChanged: number;
    fileErrors: PathSearchFileError[];
  }) => void;
  onError?: (message: string) => void;
}

function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function reloadOpenTabsForChangedPaths(changedPaths: string[]) {
  if (changedPaths.length === 0) {
    return;
  }
  const state = useStore.getState();
  const targetSet = new Set(changedPaths.map(normalizeTargetPath));

  const matchingTabs = state.tabs.filter((tab) => {
    const normalized = normalizeTargetPath(tab.path);
    return normalized.length > 0 && targetSet.has(normalized);
  });

  for (const tab of matchingTabs) {
    try {
      const info = await invoke<FileTab>('reload_file_from_disk', { id: tab.id });
      useStore.getState().updateTab(tab.id, {
        name: info.name,
        path: info.path,
        encoding: info.encoding,
        lineEnding: info.lineEnding,
        lineCount: info.lineCount,
        largeFileMode: info.largeFileMode,
        syntaxOverride: info.syntaxOverride ?? null,
        isDirty: false,
      });
      if (useStore.getState().activeTabId === tab.id) {
        dispatchEditorForceRefresh(tab.id, Math.max(1, info.lineCount));
      }
      dispatchDocumentUpdated(tab.id);
    } catch (error) {
      console.warn(`Failed to reload tab after cross-file replace: ${tab.path}`, error);
    }
  }
}

export function CrossFileReplaceDialog({
  isOpen,
  target,
  keyword,
  replaceValue,
  searchMode,
  caseSensitive,
  parseEscapeSequences,
  includeSubdirectories,
  messages,
  onClose,
  onCompleted,
  onError,
}: CrossFileReplaceDialogProps) {
  const [preview, setPreview] = useState<PathReplacePreviewBackendResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setErrorMessage(null);
      setIsLoadingPreview(false);
      setIsApplying(false);
      return;
    }

    requestIdRef.current += 1;
    const currentId = requestIdRef.current;
    setIsLoadingPreview(true);
    setErrorMessage(null);

    invoke<PathReplacePreviewBackendResult>('path_replace_preview', {
      target,
      keyword,
      mode: searchMode,
      caseSensitive,
      includeSubdirectories,
    })
      .then((result) => {
        if (currentId !== requestIdRef.current) {
          return;
        }
        setPreview(result);
      })
      .catch((error) => {
        if (currentId !== requestIdRef.current) {
          return;
        }
        setErrorMessage(`${messages.crossFileReplaceFailed}: ${describeError(error)}`);
      })
      .finally(() => {
        if (currentId !== requestIdRef.current) {
          return;
        }
        setIsLoadingPreview(false);
      });
  }, [
    caseSensitive,
    includeSubdirectories,
    isOpen,
    keyword,
    messages.crossFileReplaceFailed,
    searchMode,
    target,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusRequestId = window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(focusRequestId);
      document.removeEventListener('keydown', handleKey);
      previousFocusedElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  const totalMatches = preview?.totalMatches ?? 0;
  const matchedFiles = preview?.files ?? [];
  const totalFiles = preview?.totalFiles ?? 0;
  const previewFileErrors = preview?.fileErrors ?? [];

  const canConfirm = useMemo(() => {
    return (
      !!keyword &&
      !isLoadingPreview &&
      !isApplying &&
      !errorMessage &&
      totalMatches > 0
    );
  }, [errorMessage, isApplying, isLoadingPreview, keyword, totalMatches]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) {
      return;
    }
    requestIdRef.current += 1;
    const currentId = requestIdRef.current;
    setIsApplying(true);
    setErrorMessage(null);
    try {
      const result = await invoke<PathReplaceApplyBackendResult>('path_replace_apply', {
        target,
        keyword,
        replaceValue,
        mode: searchMode,
        caseSensitive,
        parseEscapeSequences,
        includeSubdirectories,
      });
      if (currentId !== requestIdRef.current) {
        return;
      }
      await reloadOpenTabsForChangedPaths(result.filesChanged.map((entry) => entry.filePath));
      onCompleted?.({
        totalReplaced: result.totalMatchesReplaced,
        filesChanged: result.filesChanged.length,
        fileErrors: result.fileErrors,
      });
      onClose();
    } catch (error) {
      if (currentId !== requestIdRef.current) {
        return;
      }
      const description = describeError(error);
      setErrorMessage(`${messages.crossFileReplaceFailed}: ${description}`);
      onError?.(description);
    } finally {
      if (currentId === requestIdRef.current) {
        setIsApplying(false);
      }
    }
  }, [
    canConfirm,
    caseSensitive,
    keyword,
    messages.crossFileReplaceFailed,
    onClose,
    onCompleted,
    onError,
    parseEscapeSequences,
    replaceValue,
    searchMode,
    target,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-[80vh] w-[min(94vw,560px)] flex-col rounded-lg border border-border bg-background p-4 shadow-2xl"
      >
        <p id={titleId} className="text-sm font-medium text-foreground">
          {messages.crossFileReplaceTitle}
        </p>

        <div id={descriptionId} className="mt-3 space-y-2 text-xs text-muted-foreground">
          <ReplaceDialogFieldRow
            label={messages.crossFileReplaceTargetLabel}
            value={target}
          />
          <ReplaceDialogFieldRow
            label={messages.crossFileReplaceFindLabel}
            value={keyword}
          />
          <ReplaceDialogFieldRow
            label={messages.crossFileReplaceWithLabel}
            value={replaceValue}
          />
        </div>

        <div className="mt-3 flex-1 overflow-y-auto rounded-md border border-border bg-muted/10 p-2">
          {isLoadingPreview ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {messages.crossFileReplacePreviewLoading}
            </div>
          ) : errorMessage ? (
            <div className="flex items-start gap-2 px-2 py-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="break-all">{errorMessage}</span>
            </div>
          ) : totalMatches === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              {messages.crossFileReplacePreviewEmpty}
            </div>
          ) : (
            <>
              <p className="mb-2 px-2 text-xs font-medium text-foreground">
                {messages.crossFileReplaceSummary(totalMatches, matchedFiles.length, totalFiles)}
              </p>
              <ul className="space-y-1">
                {matchedFiles.slice(0, 200).map((file) => (
                  <ReplaceDialogFileRow key={file.filePath} file={file} matchLabel={messages.crossFileGroupMatchCount(file.matchCount)} />
                ))}
              </ul>
              {matchedFiles.length > 200 && (
                <div className="mt-1 px-2 text-[11px] text-muted-foreground">
                  …{matchedFiles.length - 200}
                </div>
              )}
            </>
          )}

          {previewFileErrors.length > 0 && (
            <details className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">
                {messages.crossFileFileErrorsTitle(previewFileErrors.length)}
              </summary>
              <ul className="mt-1 space-y-1">
                {previewFileErrors.slice(0, 50).map((entry) => (
                  <li key={`${entry.filePath}-${entry.error}`} className="break-all">
                    <span className="text-foreground">{entry.filePath}</span>: {entry.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            onClick={onClose}
            disabled={isApplying}
          >
            {messages.crossFileReplaceCancel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            title={messages.crossFileReplaceConfirm}
          >
            {isApplying ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {messages.crossFileReplaceApplying}
              </>
            ) : (
              messages.crossFileReplaceConfirm
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReplaceDialogFieldRowProps {
  label: string;
  value: string;
}

function ReplaceDialogFieldRow({ label, value }: ReplaceDialogFieldRowProps) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 flex-shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <span className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
        {value || '\u200b'}
      </span>
    </div>
  );
}

interface ReplaceDialogFileRowProps {
  file: PathReplacePreviewFile;
  matchLabel: string;
}

function ReplaceDialogFileRow({ file, matchLabel }: ReplaceDialogFileRowProps) {
  return (
    <li className="flex items-baseline justify-between gap-3 rounded px-2 py-1 hover:bg-muted/40">
      <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={file.filePath}>
        {file.filePath}
      </span>
      <span className="flex-shrink-0 text-[10px] text-muted-foreground">{matchLabel}</span>
    </li>
  );
}
