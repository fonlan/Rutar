import { Check } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { getSearchPanelMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import type {
  FilterMatch,
  SearchMatch,
  SearchResultPanelState,
} from './types';
import { renderFilterPreview, renderMatchPreview } from './utils';

interface ResultRow {
  column: number;
  isActive: boolean;
  key: string;
  line: number;
  lineText: string;
  preview: ReactNode;
  showActiveIcon: boolean;
  sourceIndex: number;
}

interface SearchResultItemsProps {
  copyLabel: string;
  copyPlainTextResultEntries: (entries: string[]) => Promise<void>;
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

function areSelectionsEqual(previous: number[], next: number[]) {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
}

function normalizeSelection(sourceIndexes: number[]) {
  const seen = new Set<number>();
  const next: number[] = [];

  sourceIndexes.forEach((sourceIndex) => {
    if (sourceIndex < 0 || seen.has(sourceIndex)) {
      return;
    }

    seen.add(sourceIndex);
    next.push(sourceIndex);
  });

  return next;
}

function buildRangeSelection(rows: ResultRow[], anchorSourceIndex: number | null, targetVisibleIndex: number) {
  const targetRow = rows[targetVisibleIndex];
  if (!targetRow || targetRow.sourceIndex < 0) {
    return [];
  }

  if (anchorSourceIndex === null) {
    return [targetRow.sourceIndex];
  }

  const anchorVisibleIndex = rows.findIndex((row) => row.sourceIndex === anchorSourceIndex);
  if (anchorVisibleIndex < 0) {
    return [targetRow.sourceIndex];
  }

  const startIndex = Math.min(anchorVisibleIndex, targetVisibleIndex);
  const endIndex = Math.max(anchorVisibleIndex, targetVisibleIndex);
  return normalizeSelection(rows.slice(startIndex, endIndex + 1).map((row) => row.sourceIndex));
}

export function SearchResultItems({
  copyLabel,
  copyPlainTextResultEntries,
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
  const [selectedSourceIndexes, setSelectedSourceIndexes] = useState<number[]>([]);
  const [anchorSourceIndex, setAnchorSourceIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionRef = useRef<{ anchorSourceIndex: number; didDrag: boolean } | null>(null);
  const suppressNextClickRef = useRef(false);

  const rows = useMemo<ResultRow[]>(() => {
    if (resultPanelState !== 'open') {
      return [];
    }

    if (isFilterMode) {
      if (filterRulesPayloadLength === 0 || visibleFilterMatches.length === 0) {
        return [];
      }

      return visibleFilterMatches.map((match, index) => ({
        column: Math.max(1, match.column || 1),
        isActive: index === visibleCurrentFilterMatchIndex,
        key: `filter-${match.line}-${match.ruleIndex}-${index}`,
        line: match.line,
        lineText: match.lineText || '',
        preview: renderFilterPreview(match),
        showActiveIcon: index === visibleCurrentFilterMatchIndex,
        sourceIndex: filterMatches.indexOf(match),
      }));
    }

    if (!keyword || visibleMatches.length === 0) {
      return [];
    }

    return visibleMatches.map((match, index) => ({
      column: match.column,
      isActive: index === visibleCurrentMatchIndex,
      key: `${match.start}-${match.end}-${index}`,
      line: match.line,
      lineText: match.lineText || '',
      preview: renderMatchPreview(match),
      showActiveIcon: false,
      sourceIndex: matches.indexOf(match),
    }));
  }, [
    filterMatches,
    filterRulesPayloadLength,
    isFilterMode,
    keyword,
    matches,
    resultPanelState,
    visibleCurrentFilterMatchIndex,
    visibleCurrentMatchIndex,
    visibleFilterMatches,
    visibleMatches,
  ]);

  const selectedSourceIndexSet = useMemo(
    () => new Set(selectedSourceIndexes),
    [selectedSourceIndexes]
  );
  const selectedEntries = useMemo(
    () =>
      rows
        .filter((row) => selectedSourceIndexSet.has(row.sourceIndex))
        .map((row) => row.lineText),
    [rows, selectedSourceIndexSet]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const setSelection = useCallback((nextSelection: number[]) => {
    const normalizedSelection = normalizeSelection(nextSelection);
    setSelectedSourceIndexes((previousSelection) => {
      if (areSelectionsEqual(previousSelection, normalizedSelection)) {
        return previousSelection;
      }

      return normalizedSelection;
    });
  }, []);

  const selectSingleRow = useCallback((sourceIndex: number) => {
    if (sourceIndex < 0) {
      return;
    }

    setSelection([sourceIndex]);
  }, [setSelection]);

  useEffect(() => {
    if (resultPanelState === 'open') {
      return;
    }

    setSelectedSourceIndexes([]);
    setAnchorSourceIndex(null);
    setContextMenu(null);
    dragSelectionRef.current = null;
    suppressNextClickRef.current = false;
    document.body.style.userSelect = '';
  }, [resultPanelState]);

  useEffect(() => {
    const availableSourceIndexes = new Set(rows.map((row) => row.sourceIndex).filter((sourceIndex) => sourceIndex >= 0));

    setSelectedSourceIndexes((previousSelection) => {
      if (previousSelection.length === 0) {
        return previousSelection;
      }

      const nextSelection = previousSelection.filter((sourceIndex) => availableSourceIndexes.has(sourceIndex));
      if (areSelectionsEqual(previousSelection, nextSelection)) {
        return previousSelection;
      }

      return nextSelection;
    });

    setAnchorSourceIndex((previousAnchorSourceIndex) => {
      if (previousAnchorSourceIndex === null || availableSourceIndexes.has(previousAnchorSourceIndex)) {
        return previousAnchorSourceIndex;
      }

      return null;
    });

    if (rows.length === 0) {
      setContextMenu(null);
    }
  }, [rows]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeContextMenu();
        return;
      }

      if (contextMenuRef.current?.contains(target)) {
        return;
      }

      closeContextMenu();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    const closeOnWindowBlur = () => {
      closeContextMenu();
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', closeOnWindowBlur);
    window.addEventListener('resize', closeOnWindowBlur);

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', closeOnWindowBlur);
      window.removeEventListener('resize', closeOnWindowBlur);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    const stopDragSelection = () => {
      if (dragSelectionRef.current?.didDrag) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      dragSelectionRef.current = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('mouseup', stopDragSelection);
    window.addEventListener('blur', stopDragSelection);

    return () => {
      window.removeEventListener('mouseup', stopDragSelection);
      window.removeEventListener('blur', stopDragSelection);
    };
  }, []);

  const handleResultItemMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, sourceIndex: number) => {
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || sourceIndex < 0) {
        return;
      }

      closeContextMenu();
      selectSingleRow(sourceIndex);
      setAnchorSourceIndex(sourceIndex);
      dragSelectionRef.current = {
        anchorSourceIndex: sourceIndex,
        didDrag: false,
      };
      document.body.style.userSelect = 'none';
    },
    [closeContextMenu, selectSingleRow]
  );

  const handleResultItemMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, visibleIndex: number) => {
      const dragSelection = dragSelectionRef.current;
      if (!dragSelection || (event.buttons & 1) === 0) {
        return;
      }

      const nextSelection = buildRangeSelection(rows, dragSelection.anchorSourceIndex, visibleIndex);
      setSelection(nextSelection);
      if (nextSelection.length > 1) {
        dragSelection.didDrag = true;
      }
    },
    [rows, setSelection]
  );

  const handleResultItemClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, visibleIndex: number, sourceIndex: number) => {
      if (sourceIndex < 0) {
        return;
      }

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      closeContextMenu();

      if (event.shiftKey) {
        const nextSelection = buildRangeSelection(rows, anchorSourceIndex, visibleIndex);
        setSelection(nextSelection);
        if (anchorSourceIndex === null) {
          setAnchorSourceIndex(sourceIndex);
        }
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        setSelectedSourceIndexes((previousSelection) => {
          if (previousSelection.includes(sourceIndex)) {
            return previousSelection.filter((value) => value !== sourceIndex);
          }

          return [...previousSelection, sourceIndex];
        });
        setAnchorSourceIndex(sourceIndex);
        return;
      }

      selectSingleRow(sourceIndex);
      setAnchorSourceIndex(sourceIndex);
      handleSelectMatch(sourceIndex);
    },
    [anchorSourceIndex, closeContextMenu, handleSelectMatch, rows, selectSingleRow, setSelection]
  );

  const handleResultItemContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, sourceIndex: number) => {
      event.preventDefault();
      if (sourceIndex < 0) {
        closeContextMenu();
        return;
      }

      if (!selectedSourceIndexSet.has(sourceIndex)) {
        setSelection([sourceIndex]);
        setAnchorSourceIndex(sourceIndex);
      } else if (anchorSourceIndex === null) {
        setAnchorSourceIndex(sourceIndex);
      }

      dragSelectionRef.current = null;
      document.body.style.userSelect = '';
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [anchorSourceIndex, closeContextMenu, selectedSourceIndexSet, setSelection]
  );

  const handleCopySelectedRows = useCallback(async () => {
    closeContextMenu();
    await copyPlainTextResultEntries(selectedEntries);
  }, [closeContextMenu, copyPlainTextResultEntries, selectedEntries]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      {rows.map((row, index) => {
        const isSelected = selectedSourceIndexSet.has(row.sourceIndex);

        return (
          <button
            key={row.key}
            type="button"
            aria-selected={isSelected}
            data-result-item="true"
            data-result-selected={isSelected ? 'true' : 'false'}
            className={cn(
              'flex min-w-full w-max items-center gap-0 border-b border-border/60 px-2 py-1.5 text-left transition-colors',
              isSelected && row.isActive
                ? 'bg-primary/20 ring-1 ring-inset ring-primary/35'
                : isSelected
                  ? 'bg-primary/14'
                  : row.isActive
                    ? 'bg-primary/12'
                    : 'hover:bg-muted/50'
            )}
            title={messages.lineColTitle(row.line, row.column)}
            onClick={(event) => handleResultItemClick(event, index, row.sourceIndex)}
            onContextMenu={(event) => handleResultItemContextMenu(event, row.sourceIndex)}
            onMouseDown={(event) => handleResultItemMouseDown(event, row.sourceIndex)}
            onMouseEnter={(event) => handleResultItemMouseEnter(event, index)}
          >
            <span
              className="w-16 shrink-0 border-r border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
              style={{ fontFamily }}
            >
              {row.line}
            </span>
            <span
              className="pl-2 text-xs text-foreground whitespace-pre"
              style={resultListTextStyle}
            >
              {row.preview}
            </span>
            {row.showActiveIcon ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </button>
        );
      })}

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          role="menu"
          className="fixed z-[60] min-w-[120px] rounded-md border border-border bg-background p-1 shadow-2xl"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleCopySelectedRows()}
            disabled={selectedEntries.length === 0}
          >
            {copyLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
