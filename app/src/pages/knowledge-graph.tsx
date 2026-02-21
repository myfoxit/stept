import { useState } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import {
  IconTopologyStarRing3,
  IconPlus,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject } from '@/providers/project-provider';
import {
  useKnowledgeLinks,
  useKnowledgeGraph,
  useCreateLink,
  useDeleteLink,
  useDetectLinks,
} from '@/hooks/api/links';
import { toast } from 'sonner';

export function KnowledgeGraphPage() {
  const { selectedProjectId } = useProject();
  const pid = selectedProjectId ?? '';

  const { data: links, isLoading } = useKnowledgeLinks(pid);
  const { data: graph } = useKnowledgeGraph(pid);
  const createMutation = useCreateLink();
  const deleteMutation = useDeleteLink();
  const detectMutation = useDetectLinks();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    source_type: 'document',
    source_id: '',
    target_type: 'document',
    target_id: '',
    link_type: 'related',
  });

  const handleCreate = () => {
    if (!pid) return;
    createMutation.mutate(
      { project_id: pid, ...form },
      {
        onSuccess: () => {
          toast.success('Link created');
          setDialogOpen(false);
          setForm({ source_type: 'document', source_id: '', target_type: 'document', target_id: '', link_type: 'related' });
        },
        onError: () => toast.error('Failed to create link'),
      }
    );
  };

  const handleDelete = (linkId: string) => {
    deleteMutation.mutate(
      { linkId, projectId: pid },
      {
        onSuccess: () => toast.success('Link deleted'),
        onError: () => toast.error('Failed to delete'),
      }
    );
  };

  const handleDetect = () => {
    // Detect for a generic resource — user could customize
    detectMutation.mutate(
      { projectId: pid, resourceType: 'document', resourceId: '' },
      {
        onSuccess: (data) => toast.success(`Detected ${data.length} potential links`),
        onError: () => toast.error('Detection failed'),
      }
    );
  };

  const totalNodes = graph?.nodes?.length ?? 0;
  const totalEdges = graph?.edges?.length ?? 0;
  const autoLinks = links?.filter((l) => l.auto_detected).length ?? 0;
  const manualLinks = (links?.length ?? 0) - autoLinks;

  return (
    <SettingsLayout title="Knowledge Graph" description="Visualize and manage connections between your documents.">
      <div className="space-y-6">
        <div className="flex items-center justify-end">
            <div className="flex gap-2">
            <Button variant="outline" onClick={handleDetect} disabled={detectMutation.isPending}>
              <IconWand className="h-4 w-4 mr-2" />
              Detect Links
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <IconPlus className="h-4 w-4 mr-2" />
              Create Link
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Nodes</p>
              <p className="text-2xl font-bold">{totalNodes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Edges</p>
              <p className="text-2xl font-bold">{totalEdges}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Auto</p>
              <p className="text-2xl font-bold">{autoLinks}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Manual</p>
              <p className="text-2xl font-bold">{manualLinks}</p>
            </CardContent>
          </Card>
        </div>

        {/* Links table */}
        <Card>
          <CardHeader>
            <CardTitle>All Links</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : !links?.length ? (
              <p className="text-center py-8 text-muted-foreground">No links yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead></TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-mono text-xs">
                        {link.source_type}:{link.source_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">→</TableCell>
                      <TableCell className="font-mono text-xs">
                        {link.target_type}:{link.target_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{link.link_type ?? '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        {link.confidence != null
                          ? `${(link.confidence * 100).toFixed(0)}%`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={link.auto_detected ? 'secondary' : 'default'}>
                          {link.auto_detected ? 'Auto' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(link.id)}
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

        {/* Create link dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Knowledge Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Source Type</Label>
                  <Select
                    value={form.source_type}
                    onValueChange={(v) => setForm({ ...form, source_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="knowledge_source">Knowledge Source</SelectItem>
                      <SelectItem value="table">Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source ID</Label>
                  <Input
                    value={form.source_id}
                    onChange={(e) => setForm({ ...form, source_id: e.target.value })}
                    placeholder="Resource ID"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Target Type</Label>
                  <Select
                    value={form.target_type}
                    onValueChange={(v) => setForm({ ...form, target_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="knowledge_source">Knowledge Source</SelectItem>
                      <SelectItem value="table">Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target ID</Label>
                  <Input
                    value={form.target_id}
                    onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                    placeholder="Resource ID"
                  />
                </div>
              </div>
              <div>
                <Label>Link Type</Label>
                <Select
                  value={form.link_type}
                  onValueChange={(v) => setForm({ ...form, link_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="related">Related</SelectItem>
                    <SelectItem value="references">References</SelectItem>
                    <SelectItem value="depends_on">Depends On</SelectItem>
                    <SelectItem value="contradicts">Contradicts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsLayout>
  );
}
