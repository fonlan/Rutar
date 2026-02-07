import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileJson } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { ContentTreeNode, ContentTreeType, useStore } from '@/store/useStore';
import { dispatchNavigateToLineFromContentTree } from '@/lib/contentTree';

function getNodeIcon(nodeType: string) {
  if (nodeType === 'object' || nodeType === 'array' || nodeType === 'element') {
    return <FileJson className="w-3.5 h-3.5 text-blue-500/80" />;
  }

  return <FileCode2 className="w-3.5 h-3.5 text-muted-foreground/70" />;
}

export function ContentTreeSidebar({
  nodes,
  activeType,
  parseError,
}: {
  nodes: ContentTreeNode[];
  activeType: ContentTreeType;
  parseError: string | null;
}) {
  const { contentTreeOpen, settings, activeTabId } = useStore();
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);

  const title = useMemo(() => {
    if (!activeType) {
      return tr('contentTree.title');
    }

    return `${tr('contentTree.title')} - ${activeType.toUpperCase()}`;
  }, [activeType, settings.language]);

  if (!contentTreeOpen) {
    return null;
  }

  return (
    <div className="w-72 border-r bg-muted/5 flex flex-col h-full select-none overflow-hidden">
      <div className="p-3 text-[10px] font-bold text-muted-foreground uppercase border-b truncate">
        {title}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-2">
        {parseError ? (
          <div className="px-3 py-2 text-xs text-destructive/90 break-words">{parseError}</div>
        ) : nodes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">{tr('contentTree.empty')}</div>
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
    </div>
  );
}

function TreeNodeItem({
  node,
  level,
  activeTabId,
}: {
  node: ContentTreeNode;
  level: number;
  activeTabId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const handleSelectNode = () => {
    if (activeTabId) {
      dispatchNavigateToLineFromContentTree(activeTabId, node.line, node.column);
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
