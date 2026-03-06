import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelMode } from './types';
import { getSearchPanelMessages } from '@/i18n';

interface SearchPanelHeaderProps {
  canReplace: boolean;
  panelMode: PanelMode;
  messages: ReturnType<typeof getSearchPanelMessages>;
  onClose: () => void;
  onModeChange: (mode: PanelMode) => void;
}

export function SearchPanelHeader({ canReplace, panelMode, messages, onClose, onModeChange }: SearchPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex items-center rounded-md border border-border p-0.5">
        <button
          type="button"
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            panelMode === 'find'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() => onModeChange('find')}
        >
          {messages.find}
        </button>
        <button
          type="button"
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
            panelMode === 'replace'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() => onModeChange('replace')}
          disabled={!canReplace}
          title={canReplace ? messages.switchToReplaceMode : messages.noFileOpen}
        >
          {messages.replace}
        </button>
        <button
          type="button"
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
            panelMode === 'filter'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() => onModeChange('filter')}
          disabled={!canReplace}
          title={canReplace ? messages.switchToFilterMode : messages.noFileOpen}
        >
          {messages.filter}
        </button>
      </div>

      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={onClose}
        title={messages.close}
        aria-label={messages.close}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
