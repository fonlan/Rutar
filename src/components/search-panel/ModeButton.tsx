import { cn } from '@/lib/utils';

interface ModeButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

export function ModeButton({ active, label, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
