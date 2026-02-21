import { useState, useEffect } from 'react';
import { IconTrash, IconRestore, IconTrashX, IconFile, IconRoute } from '@tabler/icons-react';
import { getDeletedDocuments, restoreDocument, permanentDeleteDocument } from '@/api/documents';
import { getDeletedWorkflows, restoreWorkflow, permanentDeleteWorkflow } from '@/api/workflows';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useProject } from '@/providers/project-provider';

interface TrashItem {
  id: string;
  name: string | null;
  type: 'document' | 'workflow';
  deleted_at: string;
}

export default function TrashPage() {
  const { selectedProjectId: projectId } = useProject();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [docs, workflows] = await Promise.all([
        getDeletedDocuments(projectId),
        getDeletedWorkflows(projectId),
      ]);

      const allItems: TrashItem[] = [
        ...docs.map((d: any) => ({
          id: d.id,
          name: d.name,
          type: 'document' as const,
          deleted_at: d.deleted_at,
        })),
        ...workflows.map((w: any) => ({
          id: w.id,
          name: w.name,
          type: 'workflow' as const,
          deleted_at: w.deleted_at,
        })),
      ].sort(
        (a, b) =>
          new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
      );

      setItems(allItems);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, [projectId]);

  const handleRestore = async (item: TrashItem) => {
    try {
      if (item.type === 'document') {
        await restoreDocument(item.id);
      } else {
        await restoreWorkflow(item.id);
      }
      toast.success(`${item.name || 'Untitled'} has been restored.`);
      loadTrash();
    } catch (err) {
      toast.error('Failed to restore item.');
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!confirm(`Permanently delete "${item.name || 'Untitled'}"? This cannot be undone.`)) return;
    try {
      if (item.type === 'document') {
        await permanentDeleteDocument(item.id);
      } else {
        await permanentDeleteWorkflow(item.id);
      }
      toast.success(`${item.name || 'Untitled'} has been permanently deleted.`);
      loadTrash();
    } catch (err) {
      toast.error('Failed to delete item.');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <IconTrash className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Trash</h1>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <IconTrash className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Trash is empty</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {item.type === 'document' ? (
                    <IconFile className="h-5 w-5 text-blue-500" />
                  ) : (
                    <IconRoute className="h-5 w-5 text-purple-500" />
                  )}
                  <div>
                    <p className="font-medium">{item.name || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type === 'document' ? 'Document' : 'Workflow'} · Deleted{' '}
                      {formatDate(item.deleted_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(item)}
                  >
                    <IconRestore className="mr-1 h-4 w-4" />
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handlePermanentDelete(item)}
                  >
                    <IconTrashX className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
