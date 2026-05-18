import { AlertCircle, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import { pathBaseName } from '@/lib/pathUtils';
import type { PathSearchFileError, PathSearchMatch } from './types';

interface CrossFileResultsPanelProps {
  matches: PathSearchMatch[];
  totalFiles: number;
  scannedFiles: number;
  completed: boolean;
  isSearching: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  fileErrors: PathSearchFileError[];
  hasRunOnce: boolean;
  keyword: string;
  resultListTextStyle: CSSProperties;
  messages: ReturnType<typeof getSearchPanelMessages>;
  onLoadMore: () => void;
  onSelectMatch: (match: PathSearchMatch) => void;
}

interface FileGroup {
  filePath: string;
  baseName: string;
  matches: PathSearchMatch[];
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

interface MatchTextSegments {
  before: string;
  highlight: string;
  after: string;
}

export function splitLineTextByByteRange(
  lineText: string,
  matchStart: number,
  matchEnd: number,
): MatchTextSegments {
  if (matchEnd <= matchStart) {
    return { before: lineText, highlight: '', after: '' };
  }
  const encoded = utf8Encoder.encode(lineText);
  const safeStart = Math.max(0, Math.min(matchStart, encoded.length));
  const safeEnd = Math.max(safeStart, Math.min(matchEnd, encoded.length));
  const before = utf8Decoder.decode(encoded.slice(0, safeStart));
  const highlight = utf8Decoder.decode(encoded.slice(safeStart, safeEnd));
  const after = utf8Decoder.decode(encoded.slice(safeEnd));
  return { before, highlight, after };
}

function groupMatches(matches: PathSearchMatch[]): FileGroup[] {
  const groups: FileGroup[] = [];
  const indexByPath = new Map<string, number>();

  for (const match of matches) {
    let index = indexByPath.get(match.filePath);
    if (index === undefined) {
      index = groups.length;
      indexByPath.set(match.filePath, index);
      groups.push({
        filePath: match.filePath,
        baseName: pathBaseName(match.filePath),
        matches: [],
      });
    }
    groups[index].matches.push(match);
  }

  return groups;
}

export function CrossFileResultsPanel({
  matches,
  totalFiles,
  scannedFiles,
  completed,
  isSearching,
  isLoadingMore,
  errorMessage,
  fileErrors,
  hasRunOnce,
  keyword,
  resultListTextStyle,
  messages,
  onLoadMore,
  onSelectMatch,
}: CrossFileResultsPanelProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const fileGroups = useMemo(() => groupMatches(matches), [matches]);
  const totalMatches = matches.length;

  const toggleCollapse = useCallback((filePath: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (completed || isLoadingMore || isSearching) {
        return;
      }
      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom < 48) {
        onLoadMore();
      }
    },
    [completed, isLoadingMore, isSearching, onLoadMore],
  );

  useEffect(() => {
    setCollapsedPaths(new Set());
  }, [keyword, totalFiles]);

  const summaryText = useMemo(() => {
    return messages.crossFileResultsSummary(totalMatches, fileGroups.length, scannedFiles, totalFiles);
  }, [fileGroups.length, messages, scannedFiles, totalFiles, totalMatches]);

  if (!hasRunOnce) {
    return null;
  }

  let body: ReactNode;
  if (errorMessage) {
    body = (
      <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span className="break-all">{errorMessage}</span>
      </div>
    );
  } else if (isSearching && fileGroups.length === 0) {
    body = (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {messages.crossFileSearching}
      </div>
    );
  } else if (fileGroups.length === 0) {
    body = (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        {messages.crossFileNoMatches}
      </div>
    );
  } else {
    body = (
      <div
        ref={listRef}
        className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-muted/20"
        onScroll={handleScroll}
      >
        {fileGroups.map((group) => {
          const collapsed = collapsedPaths.has(group.filePath);
          return (
            <CrossFileResultGroup
              key={group.filePath}
              collapsed={collapsed}
              group={group}
              onSelectMatch={onSelectMatch}
              onToggleCollapse={toggleCollapse}
              resultListTextStyle={resultListTextStyle}
              messages={messages}
            />
          );
        })}

        {isLoadingMore && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {messages.crossFileLoadingMore}
          </div>
        )}

        {completed && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            {messages.crossFileCompleted(totalMatches, fileGroups.length)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="break-all">{summaryText}</span>
        {isSearching && !errorMessage && fileGroups.length > 0 && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </div>

      {body}

      {fileErrors.length > 0 && (
        <details className="rounded-md border border-border bg-muted/10 px-2 py-1 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {messages.crossFileFileErrorsTitle(fileErrors.length)}
          </summary>
          <ul className="mt-1 space-y-1">
            {fileErrors.slice(0, 50).map((entry) => (
              <li key={`${entry.filePath}-${entry.error}`} className="break-all">
                <span className="text-foreground">{entry.filePath}</span>: {entry.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface CrossFileResultGroupProps {
  collapsed: boolean;
  group: FileGroup;
  resultListTextStyle: CSSProperties;
  messages: ReturnType<typeof getSearchPanelMessages>;
  onToggleCollapse: (filePath: string) => void;
  onSelectMatch: (match: PathSearchMatch) => void;
}

function CrossFileResultGroup({
  collapsed,
  group,
  resultListTextStyle,
  messages,
  onToggleCollapse,
  onSelectMatch,
}: CrossFileResultGroupProps) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        onClick={() => onToggleCollapse(group.filePath)}
        title={group.filePath}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <FileText className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{group.baseName}</span>
        <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground">
          {messages.crossFileGroupMatchCount(group.matches.length)}
        </span>
      </button>

      {!collapsed && (
        <ul className="bg-background/40">
          {group.matches.map((match, index) => (
            <CrossFileResultRow
              key={`${match.filePath}:${match.line}:${match.column}:${index}`}
              match={match}
              onSelect={onSelectMatch}
              resultListTextStyle={resultListTextStyle}
            />
          ))}
        </ul>
      )}

      <div className="px-2 pb-1 text-[10px] text-muted-foreground/70 break-all" title={group.filePath}>
        {group.filePath}
      </div>
    </div>
  );
}

interface CrossFileResultRowProps {
  match: PathSearchMatch;
  resultListTextStyle: CSSProperties;
  onSelect: (match: PathSearchMatch) => void;
}

function CrossFileResultRow({ match, onSelect, resultListTextStyle }: CrossFileResultRowProps) {
  const segments = useMemo(
    () => splitLineTextByByteRange(match.lineText, match.matchStart, match.matchEnd),
    [match.lineText, match.matchStart, match.matchEnd],
  );

  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex w-full items-baseline gap-2 px-3 py-1 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        )}
        onClick={() => onSelect(match)}
        title={`${match.filePath}:${match.line}:${match.column}`}
      >
        <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
          {match.line}:{match.column}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[12px]"
          style={resultListTextStyle}
        >
          {segments.before}
          <mark className="rounded-sm bg-yellow-300/70 px-0.5 text-foreground dark:bg-yellow-500/40">
            {segments.highlight || '\u200b'}
          </mark>
          {segments.after}
        </span>
      </button>
    </li>
  );
}
