import { useState, useEffect } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import {
  IconLink,
  IconPlus,
  IconTrash,
  IconWorld,
  IconApps,
  IconFileText,
  IconListDetails,
  IconFilter,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useProject } from '@/providers/project-provider';
import {
  listContextLinks,
  createContextLink,
  deleteContextLink,
  type ContextLink,
} from '@/api/context-links';

const MATCH_TYPE_LABELS: Record<string, string> = {
  url_pattern: 'URL Pattern',
  url_exact: 'Exact URL',
  app_name: 'App Name',
  window_title: 'Window Title',
};

const MATCH_TYPE_ICONS: Record<string, typeof IconWorld> = {
  url_pattern: IconWorld,
  url_exact: IconWorld,
  app_name: IconApps,
  window_title: IconApps,
};

const PLACEHOLDERS: Record<string, string> = {
  url_pattern: '*.salesforce.com/*/Account*',
  url_exact: 'https://app.example.com/dashboard',
  app_name: 'Microsoft Excel',
  window_title: 'Customer Portal',
};

export function ContextLinksPage() {
  const { selectedProjectId } = useProject();
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [matchType, setMatchType] = useState('url_pattern');
  const [matchValue, setMatchValue] = useState('');
  const [resourceType, setResourceType] = useState('workflow');
  const [resourceId, setResourceId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedProjectId) loadLinks();
  }, [selectedProjectId]);

  const loadLinks = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const data = await listContextLinks(selectedProjectId);
      setLinks(data);
    } catch (e) {
      console.error('Failed to load context links:', e);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!matchValue.trim() || !selectedProjectId) return;
    setSaving(true);
    try {
      await createContextLink({
        project_id: selectedProjectId,
        match_type: matchType,
        match_value: matchValue,
        resource_type: resourceType,
        resource_id: resourceId || 'note-only',
        note: note || undefined,
      });
      setMatchValue('');
      setNote('');
      setResourceId('');
      setShowCreate(false);
      await loadLinks();
    } catch (e) {
      console.error('Failed to create context link:', e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextLink(id);
      setLinks(links.filter((l) => l.id !== id));
    } catch (e) {
      console.error('Failed to delete context link:', e);
    }
  };

  const filtered = filter === 'all' ? links : links.filter((l) => l.match_type === filter);

  return (
    <SettingsLayout title="Context Links" description="Attach workflows and notes to URLs, apps, and windows.">
      <div className="space-y-6">
        <div className="flex items-center justify-end">
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <IconPlus className="h-4 w-4" />
          Add Context Link
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <IconFilter className="h-4 w-4 text-muted-foreground" />
        <div className="flex gap-1">
          {['all', 'url_pattern', 'url_exact', 'app_name', 'window_title'].map((f) => (
            <Badge
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : MATCH_TYPE_LABELS[f]}
            </Badge>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} link{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Links List */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <IconLink className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-muted-foreground">
            {links.length === 0
              ? 'No context links yet. Add one to get started.'
              : 'No links match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((link) => {
            const Icon = MATCH_TYPE_ICONS[link.match_type] || IconWorld;
            return (
              <Card key={link.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{link.match_value}</span>
                      <Badge variant="outline" className="text-xs">
                        {MATCH_TYPE_LABELS[link.match_type] || link.match_type}
                      </Badge>
                    </div>
                    {link.note && (
                      <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        📌 {link.note}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {link.resource_type === 'workflow' ? (
                        <IconListDetails className="h-3 w-3" />
                      ) : (
                        <IconFileText className="h-3 w-3" />
                      )}
                      <span>
                        {link.resource_type}: {link.resource_id}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleDelete(link.id)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Context Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Match Type</label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url_pattern">URL Pattern (glob)</SelectItem>
                  <SelectItem value="url_exact">Exact URL</SelectItem>
                  <SelectItem value="app_name">App Name</SelectItem>
                  <SelectItem value="window_title">Window Title</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Match Value</label>
              <Input
                placeholder={PLACEHOLDERS[matchType]}
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Resource Type</label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workflow">Workflow</SelectItem>
                  <SelectItem value="document">Document / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Resource ID</label>
              <Input
                placeholder="Workflow or document ID (leave empty for note-only)"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Note (optional)</label>
              <Textarea
                placeholder="Important: always check duplicate contacts first..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !matchValue.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </SettingsLayout>
  );
}
