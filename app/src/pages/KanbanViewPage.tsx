// src/pages/DataTablePage.tsx

import KanbanView from '@/components/KanbanView/KanbanView';
import * as React from 'react';
import { useParams } from 'react-router-dom';

export default function DataTablePage() {
  const { tableId } = useParams<{ tableId: string }>();

  return (
    <div className="p-4 flex-1 ">
      <KanbanView key={tableId} tableId={tableId} />
    </div>
  );
}
