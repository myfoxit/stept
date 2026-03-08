import React from 'react';
import { List, SlidersHorizontal, Play } from 'lucide-react';

export type ViewMode = 'movie' | 'slides' | 'expanded';

interface ModeSelectorProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  compact?: boolean;
}

const modes: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: 'slides', label: 'Slides', icon: SlidersHorizontal },
  { value: 'movie', label: 'Movie', icon: Play },
  { value: 'expanded', label: 'Expanded', icon: List },
];

export function ModeSelector({ mode, onChange, compact }: ModeSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/50 p-0.5">
      {modes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 transition-colors ${
            compact ? 'py-1 text-xs' : 'py-1.5 text-sm'
          } font-medium ${
            mode === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          {label}
        </button>
      ))}
    </div>
  );
}
