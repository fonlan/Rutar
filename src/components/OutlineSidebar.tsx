import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, FileCode2, FileJson, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { OutlineNode, OutlineType, useStore } from '@/store/useStore';
import { dispatchNavigateToLineFromOutline } from '@/lib/outline';
import { useResizableSidebarWidth } from '@/hooks/useResizableSidebarWidth';

const OUTLINE_MIN_WIDTH = 160;
const OUTLINE_MAX_WIDTH = 720;

function getNodeIcon(nodeType: string) {
  if (nodeType === 'object' || nodeType === 'array' || nodeType === 'element') {
    return <FileJson className="w-3.5 h-3.5 text-blue-500/80" />;
  }

  return <FileCode2 className="w-3.5 h-3.5 text-muted-foreground/70" />;
}

export function OutlineSidebar({
  nodes,
  activeType,
  parseError,
}: {
  nodes: OutlineNode[];
  activeType: OutlineType;
  parseError: string | null;
}) {
  const outlineOpen = useStore((state) => state.outlineOpen);
  const toggleOutline = useStore((state) => state.toggleOutline);
  const language = useStore((state) => state.settings.language);
  const activeTabId = useStore((state) => state.activeTabId);
  const outlineWidth = useStore((state) => state.outlineWidth);
  const setOutlineWidth = useStore((state) => state.setOutlineWidth);
  const [searchValue, setSearchValue] = useState('');
  const [filteredNodes, setFilteredNodes] = useState<OutlineNode[]>(nodes);
  const [treeExpandSignal, setTreeExpandSignal] = useState({ version: 0, expanded: true });
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const { containerRef, isResizing, startResize } = useResizableSidebarWidth({
    width: outlineWidth,
    minWidth: OUTLINE_MIN_WIDTH,
    maxWidth: OUTLINE_MAX_WIDTH,
    onWidthChange: setOutlineWidth,
  });

  const title = useMemo(() => {
    if (!activeType) {
      return tr('outline.title');
    }

    return `${tr('outline.title')} - ${activeType.toUpperCase()}`;
  }, [activeType, language]);

  const normalizedSearchValue = useMemo(() => searchValue.trim().toLowerCase(), [searchValue]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!normalizedSearchValue) {
        setFilteredNodes(nodes);
        return;
      }

      try {
        const next = await invoke<OutlineNode[]>('filter_outline_nodes', {
          nodes,
          keyword: normalizedSearchValue,
        });

        if (!cancelled) {
          setFilteredNodes(Array.isArray(next) ? next : []);
        }
      } catch (error) {
        console.error('Failed to filter outline nodes:', error);
        if (!cancelled) {
          setFilteredNodes([]);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [nodes, normalizedSearchValue]);

  const hasActiveSearch = normalizedSearchValue.length > 0;
  const searchPlaceholder = tr('outline.searchPlaceholder');
  const searchEmptyText = tr('outline.searchEmpty');
  const searchClearLabel = tr('outline.searchClear');
  const expandAllLabel = tr('outline.expandAll');
  const collapseAllLabel = tr('outline.collapseAll');
  const treeActionDisabled = Boolean(parseError) || filteredNodes.length === 0;

  const setTreeExpanded = (expanded: boolean) => {
    setTreeExpandSignal((state) => ({
      version: state.version + 1,
      expanded,
    }));
  };

  useEffect(() => {
    if (normalizedSearchValue) {
      setTreeExpanded(true);
    }
  }, [normalizedSearchValue]);

  useEffect(() => {
    setSearchValue('');
    setTreeExpandSignal((state) => ({
      version: state.version + 1,
      expanded: true,
    }));
  }, [activeTabId, activeType]);

  if (!outlineOpen) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden"
      style={{ width: `${outlineWidth}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-2 border-b px-2 py-2">
        <span className="flex-1 truncate text-[10px] font-bold uppercase text-muted-foreground">
          {title}
        </span>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
          title={tr('sidebar.close')}
          aria-label={tr('sidebar.close')}
          onClick={() => toggleOutline(false)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 w-full rounded-md border border-input bg-background px-2 pr-7 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
          />
          {searchValue ? (
            <button
              type="button"
              title={searchClearLabel}
              aria-label={searchClearLabel}
              className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setSearchValue('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          title={expandAllLabel}
          aria-label={expandAllLabel}
          disabled={treeActionDisabled}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setTreeExpanded(true)}
        >
          <ChevronsDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={collapseAllLabel}
          aria-label={collapseAllLabel}
          disabled={treeActionDisabled}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setTreeExpanded(false)}
        >
          <ChevronsUp className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-2">
        {parseError ? (
          <div className="px-3 py-2 text-xs text-destructive/90 break-words">{parseError}</div>
        ) : filteredNodes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {hasActiveSearch ? searchEmptyText : tr('outline.empty')}
          </div>
        ) : (
          filteredNodes.map((node, index) => (
            <TreeNodeItem
              key={`${node.label}-${index}`}
              node={node}
              level={0}
              activeTabId={activeTabId}
              treeExpandSignal={treeExpandSignal}
            />
          ))
        )}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize outline sidebar"
        onPointerDown={startResize}
        className={cn(
          'absolute top-0 right-[-3px] h-full w-1.5 cursor-col-resize touch-none transition-colors',
          isResizing ? 'bg-primary/40' : 'hover:bg-primary/25'
        )}
      />
    </div>
  );
}

function TreeNodeItem({
  node,
  level,
  activeTabId,
  treeExpandSignal,
}: {
  node: OutlineNode;
  level: number;
  activeTabId: string | null;
  treeExpandSignal: {
    version: number;
    expanded: boolean;
  };
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded;

  useEffect(() => {
    setExpanded(treeExpandSignal.expanded);
  }, [treeExpandSignal.version, treeExpandSignal.expanded]);

  const handleSelectNode = () => {
    if (activeTabId) {
      dispatchNavigateToLineFromOutline(activeTabId, node.line, node.column);
    }
  };
  const handleToggleExpand = () => {
    if (!hasChildren) {
      return;
    }

    setExpanded((value) => !value);
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 text-xs transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleSelectNode}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }

          event.preventDefault();
          handleSelectNode();
        }}
        role="button"
        tabIndex={0}
        aria-label={node.label}
      >
        <span
          className="w-4 h-4 flex items-center justify-center"
          onClick={(event) => {
            event.stopPropagation();
            handleToggleExpand();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            handleToggleExpand();
          }}
          role="button"
          tabIndex={hasChildren ? 0 : -1}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : null}
        </span>
        {getNodeIcon(node.nodeType)}
        <span className="truncate flex-1">{node.label}</span>
      </div>

      {isExpanded && hasChildren
        ? node.children.map((child, index) => (
            <TreeNodeItem
              key={`${child.label}-${index}`}
              node={child}
              level={level + 1}
              activeTabId={activeTabId}
              treeExpandSignal={treeExpandSignal}
            />
          ))
        : null}
    </div>
  );
}
