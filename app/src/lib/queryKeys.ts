export const queryKeys = {
  users: () => ['users'] as const,
  projects: (userId?: string) => ['projects', userId] as const,
  tables: (projectId?: number) => ['tables', projectId] as const,
  columns: (tableId?: string) => {
    if (tableId === undefined || tableId === null) {
      return ['columns', 'no-table'];
    }
    return ['columns', tableId];
  },
  filters: (tableId?: string) => ['filters', tableId] as const,
  fields: (tableId: string, applyFilters = true, applySorts = true) =>
    ['fields', tableId, applyFilters, applySorts] as const,
  relations: (leftId?: string | null, rightId?: string | null) =>
    ['relations', leftId ?? null, rightId ?? null] as const,
  selectOptions: (columnId: string) => ['selectOptions', columnId] as const,
  document: (docId: string) => ['document', docId] as const,
  text_container: (containerId?: string) =>
    ['text_container', containerId] as const,
  formulas: (columnId?: string) => ['formulas', columnId] as const,
  documentLinks: (docId: string) => ['documentLinks', docId] as const,
  documentsByTableRow: (tableId: string, rowId: number) =>
    ['documentsByTableRow', tableId, rowId] as const,
  shareSettings: (resourceType: string, resourceId: string) =>
    ['share', resourceType, resourceId] as const,
  databases: (projectId: string) => ['databases', projectId] as const,
  database: (databaseId: string) => ['database', databaseId] as const,
  dbTable: (tableId: string) => ['dbTable', tableId] as const,
  dbView: (viewId: string) => ['dbView', viewId] as const,
  dbRecords: (tableId: string) => ['dbRecords', tableId] as const,
};
