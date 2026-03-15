// src/pages/DataTablePage.tsx
import { useParams } from 'react-router-dom';
import { DataTable } from '@/components/DataTable/DataTable.tsx';
import { SiteHeader } from '@/components/site-header';

export default function DataTablePage() {
  const { tableId, databaseId } = useParams<{ tableId?: string; databaseId?: string }>();
  const id = tableId || databaseId;

  return (
    <div>
      <SiteHeader name="Table" />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <DataTable key={id} tableId={id ?? ''} />
        </div>
      </div>
    </div>
  );
}
