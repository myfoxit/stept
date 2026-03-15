import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SiteHeader } from '@/components/site-header';
import { DatabaseHeader } from '@/components/Database/DatabaseHeader';
import { TableTabs } from '@/components/Database/TableTabs';
import { ViewToolbar } from '@/components/Database/ViewToolbar';
import { DataGrid } from '@/components/Database/DataGrid';
import {
  useDatabase,
  useTable,
  useView,
  useRecords,
  useUpdateDatabase,
  useCreateTable,
  useCreateField,
  useCreateRecord,
  useUpdateRecord,
  useBatchDeleteRecords,
  useUpdateViewSorts,
  useUpdateViewFilters,
} from '@/hooks/api/databases';
import { useProject } from '@/providers/project-provider';
import { toast } from 'sonner';

export function DatabaseViewPage() {
  const { databaseId } = useParams<{ databaseId: string }>();
  const navigate = useNavigate();
  const { selectedProjectId } = useProject();

  const { data: database, isLoading: dbLoading } = useDatabase(databaseId);
  const [activeTableId, setActiveTableId] = React.useState<string | null>(null);
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedRecordIds, setSelectedRecordIds] = React.useState<Set<number>>(new Set());

  // Set initial active table when database loads
  React.useEffect(() => {
    if (database?.tables?.length && !activeTableId) {
      setActiveTableId(database.tables[0].id);
    }
  }, [database, activeTableId]);

  // Load table details
  const { data: table } = useTable(activeTableId || undefined);

  // Set initial active view when table loads
  React.useEffect(() => {
    if (table?.views?.length && !activeViewId) {
      setActiveViewId(table.views[0].id);
    }
  }, [table, activeViewId]);

  // Load view details for sorts/filters
  const { data: viewDetail } = useView(activeViewId || undefined);

  // Load records
  const recordParams = React.useMemo(() => {
    const params: Record<string, any> = { limit: 500 };
    if (activeViewId) params.view_id = activeViewId;
    if (searchQuery) params.search = searchQuery;
    return params;
  }, [activeViewId, searchQuery]);

  const { data: recordsData } = useRecords(activeTableId || undefined, recordParams);

  // Mutations
  const updateDb = useUpdateDatabase();
  const createTableMut = useCreateTable();
  const createFieldMut = useCreateField();
  const createRecordMut = useCreateRecord();
  const updateRecordMut = useUpdateRecord();
  const batchDeleteMut = useBatchDeleteRecords();
  const updateSortsMut = useUpdateViewSorts();
  const updateFiltersMut = useUpdateViewFilters();

  if (dbLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">Loading database...</span>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">Database not found</span>
      </div>
    );
  }

  const fields = table?.fields || [];
  const records = recordsData?.records || [];
  const total = recordsData?.total || 0;

  return (
    <div className="flex flex-col h-full">
      <SiteHeader
        breadcrumbs={[
          { label: 'Documents', href: '/' },
          { label: database.name },
        ]}
      />

      <DatabaseHeader
        database={database}
        onUpdateName={(name) => {
          if (!selectedProjectId) return;
          updateDb.mutate(
            { databaseId: database.id, name, projectId: selectedProjectId },
            { onError: () => toast.error('Failed to update database name') }
          );
        }}
        onUpdateDescription={(description) => {
          if (!selectedProjectId) return;
          updateDb.mutate(
            { databaseId: database.id, description, projectId: selectedProjectId },
            { onError: () => toast.error('Failed to update description') }
          );
        }}
      />

      <ViewToolbar
        views={table?.views || []}
        activeViewId={activeViewId}
        onSelectView={(viewId) => setActiveViewId(viewId)}
        fields={fields}
        currentSorts={viewDetail?.sorts || []}
        currentFilters={viewDetail?.filters || []}
        onUpdateSorts={(sorts) => {
          if (!activeViewId || !activeTableId) return;
          updateSortsMut.mutate(
            { viewId: activeViewId, tableId: activeTableId, sorts },
            { onError: () => toast.error('Failed to update sorts') }
          );
        }}
        onUpdateFilters={(filters) => {
          if (!activeViewId || !activeTableId) return;
          updateFiltersMut.mutate(
            { viewId: activeViewId, tableId: activeTableId, filters },
            { onError: () => toast.error('Failed to update filters') }
          );
        }}
        onAddField={(data) => {
          if (!activeTableId) return;
          createFieldMut.mutate(
            { tableId: activeTableId, ...data },
            {
              onSuccess: () => toast.success('Field added'),
              onError: () => toast.error('Failed to add field'),
            }
          );
        }}
        isAddingField={createFieldMut.isPending}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <DataGrid
        fields={fields}
        records={records}
        total={total}
        selectedRecordIds={selectedRecordIds}
        onSelectionChange={setSelectedRecordIds}
        onCreateRecord={() => {
          if (!activeTableId) return;
          createRecordMut.mutate(
            { tableId: activeTableId },
            { onError: () => toast.error('Failed to create record') }
          );
        }}
        isCreating={createRecordMut.isPending}
        onUpdateRecord={(recordId, fieldUpdates) => {
          if (!activeTableId) return;
          updateRecordMut.mutate(
            { tableId: activeTableId, recordId, fields: fieldUpdates },
            { onError: () => toast.error('Failed to update record') }
          );
        }}
        onDeleteRecords={(recordIds) => {
          if (!activeTableId) return;
          batchDeleteMut.mutate(
            { tableId: activeTableId, recordIds },
            {
              onSuccess: (data) => toast.success(`Deleted ${data.deleted} record(s)`),
              onError: () => toast.error('Failed to delete records'),
            }
          );
        }}
      />

      <TableTabs
        tables={database.tables}
        activeTableId={activeTableId}
        onSelectTable={(tableId) => {
          setActiveTableId(tableId);
          setActiveViewId(null);
          setSelectedRecordIds(new Set());
        }}
        onAddTable={() => {
          createTableMut.mutate(
            { databaseId: database.id, name: `Table ${database.tables.length + 1}` },
            {
              onSuccess: (newTable) => {
                setActiveTableId(newTable.id);
                setActiveViewId(null);
                toast.success('Table added');
              },
              onError: () => toast.error('Failed to add table'),
            }
          );
        }}
      />
    </div>
  );
}
