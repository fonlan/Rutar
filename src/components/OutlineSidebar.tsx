import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileJson } from 'lucide-react';
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
  const language = useStore((state) => state.settings.language);
  const activeTabId = useStore((state) => state.activeTabId);
  const outlineWidth = useStore((state) => state.outlineWidth);
  const setOutlineWidth = useStore((state) => state.setOutlineWidth);
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

  if (!outlineOpen) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden"
      style={{ width: `${outlineWidth}px` }}
    >
      <div className="p-3 text-[10px] font-bold text-muted-foreground uppercase border-b truncate">
        {title}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-2">
        {parseError ? (
          <div className="px-3 py-2 text-xs text-destructive/90 break-words">{parseError}</div>
        ) : nodes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">{tr('outline.empty')}</div>
        ) : (
          nodes.map((node, index) => (
            <TreeNodeItem
              key={`${node.label}-${index}`}
              node={node}
              level={0}
              activeTabId={activeTabId}
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
}: {
  node: OutlineNode;
  level: number;
  activeTabId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const handleSelectNode = () => {
    if (activeTabId) {
      dispatchNavigateToLineFromOutline(activeTabId, node.line, node.column);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 text-xs transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleSelectNode}
      >
        <span
          className="w-4 h-4 flex items-center justify-center"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) {
              setExpanded((value) => !value);
            }
          }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : null}
        </span>
        {getNodeIcon(node.nodeType)}
        <span className="truncate flex-1">{node.label}</span>
      </div>

      {expanded && hasChildren
        ? node.children.map((child, index) => (
            <TreeNodeItem
              key={`${child.label}-${index}`}
              node={child}
              level={level + 1}
              activeTabId={activeTabId}
            />
          ))
        : null}
    </div>
  );
}
