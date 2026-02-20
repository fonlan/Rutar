import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ActivePanel } from './diffEditor.types';
import { cn } from '@/lib/utils';

interface DiffEditorHeaderProps {
  leftWidthPx: number;
  rightWidthPx: number;
  splitterWidthPx: number;
  sourcePath: string;
  targetPath: string;
  sourceDisplayName: string;
  targetDisplayName: string;
  sourceTabExists: boolean;
  targetTabExists: boolean;
  sourceTabIsDirty: boolean;
  targetTabIsDirty: boolean;
  sourceSearchQuery: string;
  targetSearchQuery: string;
  setSourceSearchQuery: (value: string) => void;
  setTargetSearchQuery: (value: string) => void;
  setSourceSearchMatchedRow: (value: number | null) => void;
  setTargetSearchMatchedRow: (value: number | null) => void;
  jumpSourceSearchMatch: (direction: 'next' | 'prev') => void;
  jumpTargetSearchMatch: (direction: 'next' | 'prev') => void;
  sourceSearchDisabled: boolean;
  targetSearchDisabled: boolean;
  jumpSourceDiffRow: (direction: 'next' | 'prev') => void;
  jumpTargetDiffRow: (direction: 'next' | 'prev') => void;
  sourceDiffJumpDisabled: boolean;
  targetDiffJumpDisabled: boolean;
  handleSavePanel: (side: ActivePanel) => Promise<void> | void;
  handleHeaderContextMenu: (side: ActivePanel, event: ReactMouseEvent<HTMLElement>) => void;
  saveLabel: string;
  sourceTitlePrefix: string;
  targetTitlePrefix: string;
  searchPlaceholderLabel: string;
  previousMatchLabel: string;
  nextMatchLabel: string;
  previousDiffLineLabel: string;
  nextDiffLineLabel: string;
  noDiffLineLabel: string;
  noMatchLabel: string;
}

export function DiffEditorHeader({
  leftWidthPx,
  rightWidthPx,
  splitterWidthPx,
  sourcePath,
  targetPath,
  sourceDisplayName,
  targetDisplayName,
  sourceTabExists,
  targetTabExists,
  sourceTabIsDirty,
  targetTabIsDirty,
  sourceSearchQuery,
  targetSearchQuery,
  setSourceSearchQuery,
  setTargetSearchQuery,
  setSourceSearchMatchedRow,
  setTargetSearchMatchedRow,
  jumpSourceSearchMatch,
  jumpTargetSearchMatch,
  sourceSearchDisabled,
  targetSearchDisabled,
  jumpSourceDiffRow,
  jumpTargetDiffRow,
  sourceDiffJumpDisabled,
  targetDiffJumpDisabled,
  handleSavePanel,
  handleHeaderContextMenu,
  saveLabel,
  sourceTitlePrefix,
  targetTitlePrefix,
  searchPlaceholderLabel,
  previousMatchLabel,
  nextMatchLabel,
  previousDiffLineLabel,
  nextDiffLineLabel,
  noDiffLineLabel,
  noMatchLabel,
}: DiffEditorHeaderProps) {
  return (
    <div className="flex h-10 items-center border-b border-border/60 bg-muted/35 text-xs">
      <div className="flex min-w-0 items-center justify-between gap-2 px-2" style={{ width: leftWidthPx }}>
        <span
          className="min-w-0 truncate font-medium text-foreground"
          title={sourcePath}
          onContextMenu={(event) => {
            handleHeaderContextMenu('source', event);
          }}
        >
          {sourceTitlePrefix}: {sourceDisplayName}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative w-44">
            <input
              type="text"
              value={sourceSearchQuery}
              onChange={(event) => {
                setSourceSearchQuery(event.currentTarget.value);
                setSourceSearchMatchedRow(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  jumpSourceSearchMatch('next');
                }
              }}
              placeholder={searchPlaceholderLabel}
              aria-label={`${sourceTitlePrefix} ${searchPlaceholderLabel}`}
              name="diff-source-search"
              autoComplete="off"
              className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpSourceSearchMatch('prev');
                }}
                disabled={sourceSearchDisabled}
                title={sourceSearchDisabled ? noMatchLabel : previousMatchLabel}
                aria-label={previousMatchLabel}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpSourceSearchMatch('next');
                }}
                disabled={sourceSearchDisabled}
                title={sourceSearchDisabled ? noMatchLabel : nextMatchLabel}
                aria-label={nextMatchLabel}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                jumpSourceDiffRow('prev');
              }}
              disabled={sourceDiffJumpDisabled}
              title={sourceDiffJumpDisabled ? noDiffLineLabel : previousDiffLineLabel}
              aria-label={`${sourceTitlePrefix} ${previousDiffLineLabel}`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                jumpSourceDiffRow('next');
              }}
              disabled={sourceDiffJumpDisabled}
              title={sourceDiffJumpDisabled ? noDiffLineLabel : nextDiffLineLabel}
              aria-label={`${sourceTitlePrefix} ${nextDiffLineLabel}`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              sourceTabIsDirty
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            )}
            onClick={() => {
              void handleSavePanel('source');
            }}
            disabled={!sourceTabExists}
            title={`${saveLabel} (Ctrl+S)`}
            aria-label={`${saveLabel} source panel`}
          >
            <Save className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className="border-x border-border/70 bg-muted/30"
        style={{ width: splitterWidthPx }}
        aria-hidden="true"
      />

      <div className="flex min-w-0 items-center justify-between gap-2 px-2" style={{ width: rightWidthPx }}>
        <span
          className="min-w-0 truncate font-medium text-foreground"
          title={targetPath}
          onContextMenu={(event) => {
            handleHeaderContextMenu('target', event);
          }}
        >
          {targetTitlePrefix}: {targetDisplayName}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative w-44">
            <input
              type="text"
              value={targetSearchQuery}
              onChange={(event) => {
                setTargetSearchQuery(event.currentTarget.value);
                setTargetSearchMatchedRow(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  jumpTargetSearchMatch('next');
                }
              }}
              placeholder={searchPlaceholderLabel}
              aria-label={`${targetTitlePrefix} ${searchPlaceholderLabel}`}
              name="diff-target-search"
              autoComplete="off"
              className="h-6 w-full rounded-md border border-border bg-background pl-2 pr-12 text-xs text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-blue-500/40"
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpTargetSearchMatch('prev');
                }}
                disabled={targetSearchDisabled}
                title={targetSearchDisabled ? noMatchLabel : previousMatchLabel}
                aria-label={previousMatchLabel}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  jumpTargetSearchMatch('next');
                }}
                disabled={targetSearchDisabled}
                title={targetSearchDisabled ? noMatchLabel : nextMatchLabel}
                aria-label={nextMatchLabel}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                jumpTargetDiffRow('prev');
              }}
              disabled={targetDiffJumpDisabled}
              title={targetDiffJumpDisabled ? noDiffLineLabel : previousDiffLineLabel}
              aria-label={`${targetTitlePrefix} ${previousDiffLineLabel}`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background disabled:hover:text-muted-foreground"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                jumpTargetDiffRow('next');
              }}
              disabled={targetDiffJumpDisabled}
              title={targetDiffJumpDisabled ? noDiffLineLabel : nextDiffLineLabel}
              aria-label={`${targetTitlePrefix} ${nextDiffLineLabel}`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              targetTabIsDirty
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            )}
            onClick={() => {
              void handleSavePanel('target');
            }}
            disabled={!targetTabExists}
            title={`${saveLabel} (Ctrl+S)`}
            aria-label={`${saveLabel} target panel`}
          >
            <Save className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
