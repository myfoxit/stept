import type { ColumnRead } from '@/types/openapi';

/**
 * Priority levels for column selection
 */
const COLUMN_PRIORITY = {
  // Highest priority - name fields
  NAME_FIELDS: ['name', 'title', 'label', 'display_name', 'full_name'],
  PERSON_FIELDS: ['first_name', 'last_name', 'firstname', 'lastname', 'surname'],
  
  // High priority - identifiers
  IDENTIFIER_FIELDS: ['email', 'username', 'code', 'sku', 'slug', 'key', 'identifier'],
  
  // Medium priority - descriptive fields
  DESCRIPTIVE_FIELDS: ['description', 'summary', 'bio', 'about', 'details'],
  
  // UI types priority order
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

/**
 * Get the display value from a row data object
 */
export function formatRowValue(value: any, uiType?: string): string {
  if (value === null || value === undefined) return '';
  
  // Handle select options
  if (typeof value === 'object' && value.name && 
      (uiType === 'single_select' || uiType === 'multi_select')) {
    return String(value.name).slice(0, 30);
  }
  
  // Handle other objects
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

/**
 * Score a column based on its priority for display
 */
function scoreColumn(column: ColumnRead): number {
  const nameLower = column.name.toLowerCase();
  let score = 0;
  
  // Check name field priority (highest)
  if (COLUMN_PRIORITY.NAME_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 1000;
  } else if (COLUMN_PRIORITY.NAME_FIELDS.some(field => nameLower.includes(field))) {
    score += 900;
  }
  
  // Check person name fields
  if (COLUMN_PRIORITY.PERSON_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 800;
  } else if (COLUMN_PRIORITY.PERSON_FIELDS.some(field => nameLower.includes(field))) {
    score += 700;
  }
  
  // Check identifier fields
  if (COLUMN_PRIORITY.IDENTIFIER_FIELDS.some(field => nameLower === field.toLowerCase())) {
    score += 600;
  } else if (COLUMN_PRIORITY.IDENTIFIER_FIELDS.some(field => nameLower.includes(field))) {
    score += 500;
  }
  
  // Check descriptive fields
  if (COLUMN_PRIORITY.DESCRIPTIVE_FIELDS.some(field => nameLower.includes(field))) {
    score += 300;
  }
  
  // Score by UI type
  const uiTypeIndex = COLUMN_PRIORITY.PREFERRED_UI_TYPES.indexOf(column.ui_type || '');
  if (uiTypeIndex >= 0) {
    score += (COLUMN_PRIORITY.PREFERRED_UI_TYPES.length - uiTypeIndex) * 10;
  }
  
  // Prefer physical columns over virtual
  if (column.column_type === 'physical') {
    score += 50;
  }
  
  // Penalize relation columns
  if (['om_relation', 'mm_relation_left', 'mm_relation_right'].includes(column.ui_type || '')) {
    score -= 100;
  }
  
  return score;
}

/**
 * Get the best columns for row preview based on smart prioritization
 */
export function getPreviewColumns(
  columns: ColumnRead[] | undefined,
  maxColumns: number = 3
): ColumnRead[] {
  if (!columns || columns.length === 0) return [];
  
  // Filter out id and system columns
  const eligibleColumns = columns.filter(c => 
    c.name !== 'id' && 
    c.name !== 'row_id' &&
    !c.name.startsWith('_') &&
    c.column_type === 'physical'
  );
  
  // Score and sort columns
  const scoredColumns = eligibleColumns
    .map(col => ({ col, score: scoreColumn(col) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.col);
  
  return scoredColumns.slice(0, maxColumns);
}

/**
 * Get preview values for a row using smart column selection
 */
export function getRowPreviewValues(
  row: any,
  columns: ColumnRead[] | undefined,
  maxValues: number = 3
): string[] {
  const previewColumns = getPreviewColumns(columns, maxValues);
  const values: string[] = [];
  
  for (const col of previewColumns) {
    let value = null;
    
    // Try nested data structure first
    if (row?.data && typeof row.data === 'object') {
      value = row.data[col.name];
    }
    
    // Fall back to direct property
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
  
  // If we don't have enough values, try to get any non-null values
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

/**
 * Get a single preview string for a row
 */
export function getRowPreview(
  row: any,
  columns: ColumnRead[] | undefined,
  separator: string = ' • '
): string {
  const values = getRowPreviewValues(row, columns, 2); // Reduced from 3 to 2
  return values.join(separator);
}
