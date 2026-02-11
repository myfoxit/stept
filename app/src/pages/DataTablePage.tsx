// src/pages/DataTablePage.tsx
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from '@/components/DataTable/DataTable.tsx';
import { SidebarHeader } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';

export default function DataTablePage() {
  const { tableId } = useParams<{ tableId: string }>();

  return (
    <div>
      <SiteHeader name="Table" />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <DataTable key={tableId} tableId={tableId} />
        </div>
      </div>
    </div>
  );
}
