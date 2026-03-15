import * as React from 'react';
import { useSpreadsheet } from './SpreadsheetContext';
import { cn } from '@/lib/utils';

interface HighlightableCellProps {
  rowIndex: number;
  colIndex: number;
  children: React.ReactNode;
  className?: string;
}

export function HighlightableCell({
  rowIndex,
  colIndex,
  children,
  className,
}: HighlightableCellProps) {
  const { setActiveCell, renderBaseIndex, lastAddedRowIndex } = useSpreadsheet();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const globalRowIndex = renderBaseIndex + rowIndex;
  const isNewRow = lastAddedRowIndex === globalRowIndex;

  const handleClick = React.useCallback(() => {
    setActiveCell({ row: globalRowIndex, col: colIndex });
  }, [globalRowIndex, colIndex, setActiveCell]);

  return (
    <div
      data-sr-cell
      data-sr-row={globalRowIndex}
      data-sr-col={colIndex}
      ref={containerRef}
      onClick={handleClick}
      className={cn(
        'w-full cursor-pointer px-2 py-1 min-h-[32px] flex items-center outline-none min-w-0',
        isNewRow && 'bg-yellow-100/60',
        className
      )}
    >
      {children}
    </div>
  );
}
