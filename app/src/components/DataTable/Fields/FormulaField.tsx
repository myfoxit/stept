import type { ColumnRead } from '@/types/openapi';
import { evaluateFormula } from '@/utils/formulaEvaluator';

export interface FormulaFieldProps {
  column: ColumnRead;
  rowData: Record<string, any>;
  columnsMeta?: ColumnRead[]; 
}



function mapRowByColumnId(
  rowData: Record<string, any>,
  columnsMeta: ColumnRead[]
) {
  const idValueMap: Record<string, any> = {};

  for (const col of columnsMeta) {

    if (col.column_type === 'physical') {
      idValueMap[col.id] = rowData[col.name] ?? null;
    }
 
    else if (col.column_type === 'virtual' && rowData[col.display_name]) {
    
      idValueMap[col.id] = rowData[col.display_name];
    }
  }

  return idValueMap;
}

export default function FormulaField({
  column,
  rowData,
  columnsMeta,
}: FormulaFieldProps) {
  const flatRow = mapRowByColumnId(rowData, columnsMeta ?? []);

  const result = evaluateFormula(
    // 3.00 * 1.80 + 3.00 + 1.80 = 5.43.001.80
    rowData[column.name].formula ?? '',
    flatRow,
    columnsMeta
  ) as any;
  if (result?.error) {
    return <span>{String(result.error.reason)}</span>;
  }

  return <span>{String(result)}</span>;
}
