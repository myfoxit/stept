import { useRef, useState } from 'react';
import { SettingsTabs } from '@/components/settings-tabs';
import {
  IconUpload,
  IconTrash,
  IconRefresh,
  IconFileText,
  IconDatabase,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SiteHeader } from '@/components/site-header';
import { useProject } from '@/providers/project-provider';
import {
  useKnowledgeSources,
  useUploadKnowledgeSource,
  useDeleteKnowledgeSource,
  useReindexKnowledgeSource,
} from '@/hooks/api/knowledge';
import { toast } from 'sonner';

export function KnowledgeBasePage() {
  const { selectedProjectId } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sources, isLoading } = useKnowledgeSources(selectedProjectId ?? '');
  const uploadMutation = useUploadKnowledgeSource();
  const deleteMutation = useDeleteKnowledgeSource();
  const reindexMutation = useReindexKnowledgeSource();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;
    uploadMutation.mutate(
      { file, projectId: selectedProjectId },
      {
        onSuccess: () => toast.success('File uploaded successfully'),
        onError: () => toast.error('Upload failed'),
      }
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = (sourceId: string) => {
    if (!selectedProjectId) return;
    deleteMutation.mutate(
      { sourceId, projectId: selectedProjectId },
      {
        onSuccess: () => toast.success('Source deleted'),
        onError: () => toast.error('Delete failed'),
      }
    );
  };

  const handleReindex = (sourceId: string) => {
    if (!selectedProjectId) return;
    reindexMutation.mutate(
      { sourceId, projectId: selectedProjectId },
      {
        onSuccess: (data) =>
          toast.success(`Reindexed — ${data.embeddings_created} embeddings created`),
        onError: () => toast.error('Reindex failed'),
      }
    );
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <SiteHeader />
      <div className="p-6 space-y-6">
        <SettingsTabs />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IconDatabase className="h-6 w-6" />
            Knowledge Base
          </h1>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.txt"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <IconUpload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : !sources?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <IconFileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>No knowledge sources yet. Upload a file to get started.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.source_type}</TableCell>
                      <TableCell>{formatSize(s.file_size)}</TableCell>
                      <TableCell>
                        {s.created_at
                          ? new Date(s.created_at).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReindex(s.id)}
                          disabled={reindexMutation.isPending}
                        >
                          <IconRefresh className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(s.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <IconTrash className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
