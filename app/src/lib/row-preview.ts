import type { ColumnRead } from '@/types/openapi';

const COLUMN_PRIORITY = {
  NAME_FIELDS: ['name', 'title', 'label', 'display_name', 'full_name'],
  PERSON_FIELDS: ['first_name', 'last_name', 'firstname', 'lastname', 'surname'],
  IDENTIFIER_FIELDS: ['email', 'username', 'code', 'sku', 'slug', 'key', 'identifier'],
  DESCRIPTIVE_FIELDS: ['description', 'summary', 'bio', 'about', 'details'],
  PREFERRED_UI_TYPES: [
    'single_line_text',
    'email',
    'phone',
    'single_select',
    'long_text',
    'url',
    'autonumber'
  ],
};

export function formatRowValue(value: any, uiType?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.name &&
      (uiType === 'single_select' || uiType === 'multi_select')) {
    return String(value.name).slice(0, 30);
  }
  if (typeof value === 'object') {
    if (value.name) return String(value.name).slice(0, 30);
    if (value.title) return String(value.title).slice(0, 30);
    if (value.label) return String(value.label).slice(0, 30);
    if (value.id) return `#${value.id}`;
    if (Array.isArray(value)) {
      if (value.length === 0) return '';
      const names = value.slice(0, 2).map(v =>
        typeof v === 'object' && v.name ? v.name : String(v)
      ).filter(Boolean);
      const result = names.length > 0 ? names.join(', ') + (value.length > 2 ? '...' : '') : '';
      return result.length > 30 ? result.slice(0, 27) + '...' : result;
    }
    return '';
  }
  const strValue = String(value);
  return strValue.length > 30 ? strValue.slice(0, 27) + '...' : strValue;
}

function scoreColumn(column: ColumnRead): number {
  const nameLower = column.name.toLowerCase();
  let score = 0;
  if (COLUMN_PRIORITY.NAME_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 1000;
  } else if (COLUMN_PRIORITY.NAME_FIELDS.some(field => nameLower.includes(field))) {
    score += 900;
  }
  if (COLUMN_PRIORITY.PERSON_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 800;
  } else if (COLUMN_PRIORITY.PERSON_FIELDS.some(field => nameLower.includes(field))) {
    score += 700;
  }
  if (COLUMN_PRIORITY.IDENTIFIER_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 600;
  } else if (COLUMN_PRIORITY.IDENTIFIER_FIELDS.some(field => nameLower.includes(field))) {
    score += 500;
  }
  if (COLUMN_PRIORITY.DESCRIPTIVE_FIELDS.some(field => nameLower.includes(field))) {
    score += 300;
  }
  const uiTypeIndex = COLUMN_PRIORITY.PREFERRED_UI_TYPES.indexOf(column.ui_type || '');
  if (uiTypeIndex >= 0) {
    score += (COLUMN_PRIORITY.PREFERRED_UI_TYPES.length - uiTypeIndex) * 10;
  }
  if (column.column_type === 'physical') {
    score += 50;
  }
  if (['om_relation', 'mm_relation_left', 'mm_relation_right'].includes(column.ui_type || '')) {
    score -= 100;
  }
  return score;
}

export function getPreviewColumns(
  columns: ColumnRead[] | undefined,
  maxColumns: number = 3
): ColumnRead[] {
  if (!columns || columns.length === 0) return [];
  const eligibleColumns = columns.filter(c =>
    c.name !== 'id' &&
    c.name !== 'row_id' &&
    !c.name.startsWith('_') &&
    c.column_type === 'physical'
  );
  const scoredColumns = eligibleColumns
    .map(col => ({ col, score: scoreColumn(col) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.col);
  return scoredColumns.slice(0, maxColumns);
}

export function getRowPreviewValues(
  row: any,
  columns: ColumnRead[] | undefined,
  maxValues: number = 3
): string[] {
  const previewColumns = getPreviewColumns(columns, maxValues);
  const values: string[] = [];
  for (const col of previewColumns) {
    let value = null;
    if (row?.data && typeof row.data === 'object') {
      value = row.data[col.name];
    }
    if (value === null || value === undefined) {
      value = row?.[col.name];
    }
    if (value !== null && value !== undefined) {
      const formatted = formatRowValue(value, col.ui_type);
      if (formatted) {
        values.push(formatted);
      }
    }
  }
  if (values.length === 0 && row) {
    const dataSource = row.data || row;
    if (typeof dataSource === 'object') {
      const keys = Object.keys(dataSource)
        .filter(k => k !== 'id' && k !== 'row_id' && !k.startsWith('_'))
        .slice(0, 1);
      for (const key of keys) {
        const value = dataSource[key];
        if (value !== null && value !== undefined) {
          const formatted = formatRowValue(value);
          if (formatted) {
            values.push(formatted);
          }
        }
      }
    }
  }
  return values;
}

export function getRowPreview(
  row: any,
  columns: ColumnRead[] | undefined,
  separator: string = ' \u2022 '
): string {
  const values = getRowPreviewValues(row, columns, 2);
  return values.join(separator);
}
