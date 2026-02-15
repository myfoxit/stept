import { useState, useEffect } from 'react';
import { IconLink, IconPlus, IconTrash, IconWorld, IconDeviceDesktop } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listContextLinks,
  createContextLink,
  deleteContextLink,
  type ContextLink,
} from '@/api/context-links';

interface ContextLinkPanelProps {
  projectId: string;
  resourceType: 'workflow' | 'document';
  resourceId: string;
}

export function ContextLinkPanel({ projectId, resourceType, resourceId }: ContextLinkPanelProps) {
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [matchType, setMatchType] = useState('url_pattern');
  const [matchValue, setMatchValue] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLinks();
  }, [projectId, resourceId]);

  const loadLinks = async () => {
    try {
      const data = await listContextLinks(projectId, resourceType, resourceId);
      setLinks(data);
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    if (!matchValue.trim()) return;
    setLoading(true);
    try {
      await createContextLink({
        project_id: projectId,
        match_type: matchType,
        match_value: matchValue,
        resource_type: resourceType,
        resource_id: resourceId,
        note: note || undefined,
      });
      setMatchValue('');
      setNote('');
      setShowForm(false);
      await loadLinks();
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextLink(id);
      setLinks(links.filter(l => l.id !== id));
    } catch {
      // ignore
    }
  };

  const placeholders: Record<string, string> = {
    url_pattern: '*.salesforce.com/*/Account*',
    url_exact: 'https://app.example.com/dashboard',
    app_name: 'Microsoft Excel',
    window_title: 'Customer Portal',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <IconLink className="h-4 w-4" />
            Context Links
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)} className="h-7">
            <IconPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 && !showForm && (
          <p className="text-xs text-muted-foreground">
            No context links yet. Add one to surface this {resourceType} when visiting specific URLs or apps.
          </p>
        )}

        {links.map(link => (
          <div key={link.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                {link.match_type.includes('url') ? <IconWorld className="h-3 w-3" /> : <IconDeviceDesktop className="h-3 w-3" />}
                <span className="font-medium">{link.match_value}</span>
              </div>
              {link.note && <p className="mt-1 text-muted-foreground">{link.note}</p>}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDelete(link.id)}>
              <IconTrash className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {showForm && (
          <div className="space-y-2 rounded-md border p-3">
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url_pattern">URL Pattern (glob)</SelectItem>
                <SelectItem value="url_exact">Exact URL</SelectItem>
                <SelectItem value="app_name">App Name</SelectItem>
                <SelectItem value="window_title">Window Title</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={placeholders[matchType]}
              value={matchValue}
              onChange={e => setMatchValue(e.target.value)}
              className="h-8 text-xs"
            />
            <Textarea
              placeholder="Note (optional) — e.g., 'Customer X needs manual approval'"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="min-h-[60px] text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={loading || !matchValue.trim()} className="h-7 text-xs">
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="h-7 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
