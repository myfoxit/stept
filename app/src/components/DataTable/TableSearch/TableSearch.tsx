'use client';

import * as React from 'react';
import type { ColumnRead } from '@/types/openapi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  IconChevronDown,
  IconWorld,
  IconTypography,
  IconPaperclip,
  IconClock,
  IconListDetails,
  IconCurrencyDollar,
  IconTag,
  IconSearch,
  IconTableShortcut,
  IconX,
} from '@tabler/icons-react';

type Props = {
  columns?: ColumnRead[] | undefined;
  defaultScope?: 'global' | string;
  className?: string;
  embedded?: boolean;
  onSearch?: (query: string, scope: 'global' | string) => void;
  value?: string;
  scope?: 'global' | string;
};

function iconFor(uiType?: string) {
  switch (uiType) {
    case 'single_line_text':
    case 'long_text':
      return <IconTypography size={16} className="mr-2" />;
    case 'attachment':
      return <IconPaperclip size={16} className="mr-2" />;
    case 'single_select':
    case 'multi_select':
      return <IconTag size={16} className="mr-2" />;
    case 'currency':
      return <IconCurrencyDollar size={16} className="mr-2" />;
    case 'status':
      return <IconListDetails size={16} className="mr-2" />;
    case 'duration':
    case 'time':
      return <IconClock size={16} className="mr-2" />;
    default:
      return <IconTableShortcut size={16} className="mr-2" />;
  }
}

export function TableSearch({
  columns = [],
  defaultScope = 'global',
  className,
  embedded = false,
  onSearch,
  value = '',
  scope = 'global',
}: Props) {
  const [selected, setSelected] = React.useState<string>(scope || defaultScope);
  const [query, setQuery] = React.useState(value || '');
  const debounceTimerRef = React.useRef<NodeJS.Timeout>();

  // Sync with external value/scope changes
  React.useEffect(() => {
    setQuery(value || '');
  }, [value]);

  React.useEffect(() => {
    setSelected(scope || 'global');
  }, [scope]);

  const handleSearch = React.useCallback(
    (searchQuery: string, searchScope: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Instant update of input
      setQuery(searchQuery);

      // Debounced API call
      debounceTimerRef.current = setTimeout(() => {
        if (onSearch) {
          onSearch(searchQuery.trim(), searchScope as 'global' | string);
        }
      }, 300);
    },
    [onSearch]
  );

  const handleScopeChange = React.useCallback(
    (newScope: string) => {
      setSelected(newScope);
      // Re-trigger search with new scope if query exists
      if (query && onSearch) {
        onSearch(query.trim(), newScope as 'global' | string);
      }
    },
    [query, onSearch]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuery('');
        if (onSearch) {
          onSearch('', selected as 'global' | string);
        }
      }
    },
    [selected, onSearch]
  );

  const selectedMeta =
    selected === 'global'
      ? undefined
      : columns?.find((c) => c.name === selected);

  const label =
    selected === 'global' ? 'Global' : selectedMeta?.display_name || selected;

  const placeholder =
    selected === 'global' ? 'Search everything' : `Search in ${label}`;

  const hasQuery = Boolean(query?.trim());

  return (
    <div
      className={['flex items-center w-full md:w-auto', className].filter(Boolean).join(' ')}
      data-testid="table-search"
      data-search-active={hasQuery ? 'true' : 'false'}
    >
      <div className="flex items-center w-full md:w-auto rounded-md border bg-background pr-1">
        {/* Field selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-none rounded-l-md border-r px-2 cursor-pointer text-gray-800"
            >
              {selected === 'global' ? (
                <IconWorld size={16} className="" />
              ) : (
                iconFor(selectedMeta?.ui_type)
              )}
              <span className="max-w-[120px] truncate "> {label}</span>
              <IconChevronDown size={16} className="" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-0">
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Search fields
            </div>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => handleScopeChange('global')}
            >
              <IconWorld size={16} className="mr-2" />
              Global
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {columns?.map((col) => (
              <DropdownMenuItem
                key={col.id}
                className="cursor-pointer"
                onClick={() => handleScopeChange(col.name)}
              >
                {iconFor(col.ui_type)}
                <span className="truncate">{col.display_name || col.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Text input */}
        <Input
          className={[
            'h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            embedded ? 'w-[180px]' : 'w-full md:w-[340px]',
          ].join(' ')}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleSearch(e.target.value, selected)}
          onKeyDown={handleKeyDown}
        />

        {/* Search/Clear button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer"
          onClick={() => {
            if (query) {
              setQuery('');
              if (onSearch) {
                onSearch('', selected as 'global' | string);
              }
            }
          }}
          data-testid="table-search-clear"
        >
          {hasQuery ? <IconX size={16} /> : <IconSearch size={16} />}
        </Button>
      </div>

      {/* Invisible status hook for tests */}
      <span
        data-testid="table-search-status"
        data-search-active={hasQuery ? 'true' : 'false'}
        className="sr-only"
      >
        {hasQuery ? 'searching' : 'idle'}
      </span>
    </div>
  );
}
