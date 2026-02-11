import { useParams } from 'react-router-dom';

import { IconFolder } from '@tabler/icons-react';
import { useDocument } from '@/hooks/api/documents';

export function FolderView() {
  const { folderId } = useParams<{ folderId: string }>();
  const { data: folder, isLoading } = useDocument(folderId || '');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading folder...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <IconFolder className="size-16 text-muted-foreground/50" />
      <h1 className="text-2xl font-semibold">{folder?.name || 'Folder'}</h1>
      <p className="text-muted-foreground">
        Folder view - coming soon
      </p>
      <p className="text-sm text-muted-foreground">
        Navigate using the sidebar to view folder contents
      </p>
    </div>
  );
}
