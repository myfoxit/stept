import * as React from 'react';
import type { FieldRead } from '@/api/databases';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Star, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CellRendererProps {
  field: FieldRead;
  value: any;
  isEditing: boolean;
  onChange: (value: any) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const SELECT_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-yellow-100 text-yellow-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800',
  'bg-cyan-100 text-cyan-800',
];

function getOptionColor(option: string, options?: string[]): string {
  const idx = options?.indexOf(option) ?? 0;
  return SELECT_COLORS[idx % SELECT_COLORS.length];
}

export function CellRenderer({ field, value, isEditing, onChange, onCommit, onCancel }: CellRendererProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const selectOptions: string[] = field.options?.choices || field.options?.options || [];

  switch (field.field_type) {
    case 'checkbox':
      return (
        <div className="flex items-center justify-center h-full">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => {
              onChange(!!checked);
              // Auto-commit for checkbox
              setTimeout(onCommit, 0);
            }}
          />
        </div>
      );

    case 'rating':
      return (
        <div className="flex items-center gap-0.5 h-full">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => {
                onChange(value === star ? null : star);
                setTimeout(onCommit, 0);
              }}
              className="p-0 bg-transparent border-none cursor-pointer"
            >
              <Star
                className={cn(
                  'size-4',
                  star <= (value || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                )}
              />
            </button>
          ))}
        </div>
      );

    case 'single_select':
      if (isEditing) {
        return (
          <select
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => {
              onChange(e.target.value || null);
              setTimeout(onCommit, 0);
            }}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          >
            <option value="">—</option>
            {selectOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      }
      return value ? (
        <Badge variant="secondary" className={cn('text-xs font-normal', getOptionColor(value, selectOptions))}>
          {value}
        </Badge>
      ) : null;

    case 'multi_select':
      if (isEditing) {
        const currentValues: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-1 items-center min-h-[32px]">
            {selectOptions.map((opt) => {
              const selected = currentValues.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? currentValues.filter((v) => v !== opt)
                      : [...currentValues, opt];
                    onChange(next);
                  }}
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded cursor-pointer border',
                    selected
                      ? getOptionColor(opt, selectOptions) + ' border-transparent'
                      : 'bg-white border-gray-200 text-gray-500'
                  )}
                >
                  {opt}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onCommit}
              className="text-xs text-blue-600 ml-1 cursor-pointer bg-transparent border-none"
            >
              Done
            </button>
          </div>
        );
      }
      if (Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((v: string) => (
              <Badge key={v} variant="secondary" className={cn('text-xs font-normal', getOptionColor(v, selectOptions))}>
                {v}
              </Badge>
            ))}
          </div>
        );
      }
      return null;

    case 'number':
    case 'decimal':
    case 'currency':
    case 'percent':
      if (isEditing) {
        return (
          <input
            type="number"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none text-right"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      if (value == null) return null;
      if (field.field_type === 'currency') return <span className="text-right w-full block">${Number(value).toFixed(2)}</span>;
      if (field.field_type === 'percent') return <span className="text-right w-full block">{value}%</span>;
      return <span className="text-right w-full block">{value}</span>;

    case 'date':
      if (isEditing) {
        return (
          <input
            type="date"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value ? <span>{value}</span> : null;

    case 'datetime':
      if (isEditing) {
        return (
          <input
            type="datetime-local"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value ? <span>{new Date(value).toLocaleString()}</span> : null;

    case 'long_text':
    case 'rich_text':
      if (isEditing) {
        return (
          <textarea
            autoFocus
            className="w-full h-full min-h-[60px] border-none bg-transparent text-sm outline-none resize-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        );
      }
      return value ? <span className="line-clamp-2">{value}</span> : null;

    case 'email':
      if (isEditing) {
        return (
          <input
            type="email"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value ? <a href={`mailto:${value}`} className="text-blue-600 underline">{value}</a> : null;

    case 'url':
      if (isEditing) {
        return (
          <input
            type="url"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate block">
          {value}
        </a>
      ) : null;

    case 'phone':
      if (isEditing) {
        return (
          <input
            type="tel"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value ? <span>{value}</span> : null;

    case 'attachment':
      return (
        <div className="flex items-center gap-1 text-gray-400">
          <Paperclip className="size-3.5" />
          {Array.isArray(value) && value.length > 0 && <span className="text-xs">{value.length}</span>}
        </div>
      );

    case 'user':
      return value ? <span className="text-sm text-gray-600">{typeof value === 'object' ? value.name : value}</span> : null;

    // single_line_text and fallback
    default:
      if (isEditing) {
        return (
          <input
            type="text"
            autoFocus
            className="w-full h-full border-none bg-transparent text-sm outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return value != null ? <span className="truncate">{String(value)}</span> : null;
  }
}
