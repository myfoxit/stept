import * as React from 'react';

interface DecimalFieldProps {
  value: any;
  columnSettings?: {
    scale?: number;
    show_thousands_separator?: boolean;
  };
}

export function DecimalField({ value, columnSettings }: DecimalFieldProps) {
  const formatDecimal = (val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    
    // Just ensure it uses . as decimal separator
    const strVal = String(val).replace(',', '.');
    const num = parseFloat(strVal);
    
    if (isNaN(num)) return '-';
    
    // Apply scale if specified
    const scale = columnSettings?.scale ?? 2;
    const formattedNum = num.toFixed(scale);
    
    // Apply thousands separator if requested
    if (columnSettings?.show_thousands_separator) {
      const parts = formattedNum.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }
    
    return formattedNum;
  };

  return (
    <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
      {formatDecimal(value)}
    </span>
  );
}


