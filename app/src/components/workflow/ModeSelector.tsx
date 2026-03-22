import React from 'react';
import { List, SlidersHorizontal, Play, MousePointer2 } from 'lucide-react';

export type ViewMode = 'movie' | 'slides' | 'expanded' | 'sandbox';

interface ModeSelectorProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  compact?: boolean;
  /** Set to true when workflow has DOM snapshots (enables sandbox mode) */
  hasDomSnapshots?: boolean;
}

const modes: { value: ViewMode; label: string; icon: React.ElementType; requiresDom?: boolean }[] = [
  { value: 'slides', label: 'Slides', icon: SlidersHorizontal },
  { value: 'movie', label: 'Movie', icon: Play },
  { value: 'expanded', label: 'Expanded', icon: List },
  { value: 'sandbox', label: 'Try it', icon: MousePointer2, requiresDom: true },
];

export function ModeSelector({ mode, onChange, compact, hasDomSnapshots }: ModeSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/50 p-0.5">
      {modes.map(({ value, label, icon: Icon, requiresDom }) => {
        const disabled = requiresDom && !hasDomSnapshots;
        return (
          <button
            key={value}
            onClick={() => !disabled && onChange(value)}
            title={disabled ? 'Requires HTML capture (record with Chrome extension)' : label}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 transition-colors ${
              compact ? 'py-1 text-xs' : 'py-1.5 text-sm'
            } font-medium ${
              disabled
                ? 'text-muted-foreground/40 cursor-not-allowed'
                : mode === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
