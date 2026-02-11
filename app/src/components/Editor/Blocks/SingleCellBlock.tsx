import React from 'react';

/**
 * SingleCellBlock — previously rendered DataTable field components.
 * The underlying table/column system has been removed.
 * This is now a simple label+value display.
 */

export interface SingleCellBlockProps {
  label: string;
  value: unknown;
  column?: any;
  rowId?: string;
}

export const SingleCellBlock: React.FC<SingleCellBlockProps> = ({
  label,
  value,
}) => {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div>{value != null ? String(value) : '-'}</div>
    </div>
  );
};
