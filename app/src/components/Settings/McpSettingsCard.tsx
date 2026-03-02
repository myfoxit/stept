import { useState, useEffect } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  listMcpKeys,
  createMcpKey,
  revokeMcpKey,
  type McpApiKey,
} from '@/api/mcp-keys';

interface McpSettingsCardProps {
  projectId: string;
}

export function McpSettingsCard({ projectId }: McpSettingsCardProps) {
  const [keys, setKeys] = useState<McpApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const data = await listMcpKeys(projectId);
      setKeys(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [projectId]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }
    setCreating(true);
    try {
      const result = await createMcpKey(projectId, newKeyName.trim());
      setCreatedKey(result.raw_key);
      fetchKeys();
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    try {
      await revokeMcpKey(projectId, keyId);
      toast.success('API key revoked');
      fetchKeys();
    } catch {
      toast.error('Failed to revoke API key');
    }
  };

  const copyKey = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setKeyCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const mcpEndpoint = `${window.location.origin}/mcp`;

  const claudeConfig = createdKey
    ? JSON.stringify(
        {
          mcpServers: {
            ondoki: {
              url: mcpEndpoint,
              headers: { Authorization: `Bearer ${createdKey}` },
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>MCP API Keys</CardTitle>
            </div>
            <Button size="sm" onClick={() => { setCreateOpen(true); setCreatedKey(null); setNewKeyName(''); }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Key
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            API keys for connecting AI agents (Claude, Cursor, Copilot) to your project via MCP.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-4 text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">
              No API keys yet. Create one to connect AI agents.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                    <TableCell>{k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Connection info */}
          <div className="mt-4 space-y-2">
            <Label className="text-sm font-medium">MCP Endpoint</Label>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs flex-1">{mcpEndpoint}</code>
              <Button variant="outline" size="sm" onClick={() => copyKey(mcpEndpoint)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create / Show Key Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreatedKey(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{createdKey ? 'API Key Created' : 'Create MCP API Key'}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? 'Copy this key now — it won\'t be shown again.'
                : 'Give this key a name to identify it later.'}
            </DialogDescription>
          </DialogHeader>

          {!createdKey ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Claude Desktop"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? 'Creating…' : 'Create Key'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <Input value={createdKey} readOnly className="font-mono text-xs" />
                  <Button size="sm" onClick={() => copyKey(createdKey)}>
                    {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Claude Desktop Config</Label>
                <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">{claudeConfig}</pre>
                <Button variant="outline" size="sm" onClick={() => copyKey(claudeConfig)}>
                  <Copy className="mr-2 h-3 w-3" /> Copy Config
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setCreatedKey(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
