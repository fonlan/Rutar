import { Check } from 'lucide-react';
import { type CSSProperties } from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import type {
  FilterMatch,
  SearchMatch,
  SearchResultPanelState,
} from './types';
import { renderFilterPreview, renderMatchPreview } from './utils';

interface SearchResultItemsProps {
  filterMatches: FilterMatch[];
  filterRulesPayloadLength: number;
  fontFamily: string;
  handleSelectMatch: (index: number) => void;
  isFilterMode: boolean;
  keyword: string;
  matches: SearchMatch[];
  messages: ReturnType<typeof getSearchPanelMessages>;
  resultListTextStyle: CSSProperties;
  resultPanelState: SearchResultPanelState;
  visibleCurrentFilterMatchIndex: number;
  visibleCurrentMatchIndex: number;
  visibleFilterMatches: FilterMatch[];
  visibleMatches: SearchMatch[];
}

export function SearchResultItems({
  filterMatches,
  filterRulesPayloadLength,
  fontFamily,
  handleSelectMatch,
  isFilterMode,
  keyword,
  matches,
  messages,
  resultListTextStyle,
  resultPanelState,
  visibleCurrentFilterMatchIndex,
  visibleCurrentMatchIndex,
  visibleFilterMatches,
  visibleMatches,
}: SearchResultItemsProps) {
  if (resultPanelState !== 'open') {
    return null;
  }

  if (isFilterMode) {
    if (filterRulesPayloadLength === 0 || visibleFilterMatches.length === 0) {
      return null;
    }

    return visibleFilterMatches.map((match, index) => {
      const isActive = index === visibleCurrentFilterMatchIndex;
      const sourceIndex = filterMatches.indexOf(match);

      return (
        <button
          key={`filter-${match.line}-${match.ruleIndex}-${index}`}
          type="button"
          data-result-item="true"
          className={cn(
            'flex min-w-full w-max items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
            isActive ? 'bg-primary/12' : 'hover:bg-muted/50'
          )}
          title={messages.lineColTitle(match.line, Math.max(1, match.column || 1))}
          onClick={() => {
            if (sourceIndex >= 0) {
              handleSelectMatch(sourceIndex);
            }
          }}
        >
          <span
            className="w-16 shrink-0 border-r border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
            style={{ fontFamily }}
          >
            {match.line}
          </span>
          <span
            className="pl-2 text-xs text-foreground whitespace-pre"
            style={resultListTextStyle}
          >
            {renderFilterPreview(match)}
          </span>
          {isActive ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        </button>
      );
    });
  }

  if (!keyword || visibleMatches.length === 0) {
    return null;
  }

  return visibleMatches.map((match, index) => {
    const isActive = index === visibleCurrentMatchIndex;
    const sourceIndex = matches.indexOf(match);

    return (
      <button
        key={`${match.start}-${match.end}-${index}`}
        type="button"
        data-result-item="true"
        className={cn(
          'flex min-w-full w-max items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
          isActive ? 'bg-primary/12' : 'hover:bg-muted/50'
        )}
        title={messages.lineColTitle(match.line, match.column)}
        onClick={() => {
          if (sourceIndex >= 0) {
            handleSelectMatch(sourceIndex);
          }
        }}
      >
        <span
          className="w-16 shrink-0 border-r border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
          style={{ fontFamily }}
        >
          {match.line}
        </span>
        <span
          className="pl-2 text-xs text-foreground whitespace-pre"
          style={resultListTextStyle}
        >
          {renderMatchPreview(match)}
        </span>
      </button>
    );
  });
}
