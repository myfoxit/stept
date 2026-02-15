import React, { useState, useEffect } from 'react';
import {
  IconGitBranch,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandBitbucket,
  IconUpload,
  IconDownload,
  IconPlugConnected,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconCheck,
  IconX,
  IconClock,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  type GitSyncConfig,
  type GitSyncConfigInput,
  getGitSyncConfig,
  upsertGitSyncConfig,
  deleteGitSyncConfig,
  pushToGit,
  pullFromGit,
  testGitConnection,
} from '@/api/git-sync';

interface GitSyncCardProps {
  projectId: string;
}

const providerIcons = {
  github: IconBrandGithub,
  gitlab: IconBrandGitlab,
  bitbucket: IconBrandBitbucket,
};

const providerLabels = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, { icon: typeof IconCheck; color: string; label: string }> = {
    success: { icon: IconCheck, color: 'text-green-500', label: 'Success' },
    error: { icon: IconX, color: 'text-red-500', label: 'Error' },
    in_progress: { icon: IconLoader2, color: 'text-yellow-500', label: 'Syncing…' },
  };
  const s = map[status] || { icon: IconClock, color: 'text-muted-foreground', label: status };
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
      <Icon className={`h-3 w-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
      {s.label}
    </span>
  );
}

export function GitSyncCard({ projectId }: GitSyncCardProps) {
  const [config, setConfig] = useState<GitSyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Form state
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'bitbucket'>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [directory, setDirectory] = useState('/');
  const [accessToken, setAccessToken] = useState('');
  const [syncFormat, setSyncFormat] = useState<'markdown' | 'html'>('markdown');
  const [autoSync, setAutoSync] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getGitSyncConfig(projectId);
      setConfig(data);
      setProvider(data.provider);
      setRepoUrl(data.repo_url);
      setBranch(data.branch);
      setDirectory(data.directory);
      setSyncFormat(data.sync_format);
      setAutoSync(data.auto_sync);
      setAccessToken(''); // Don't populate token — user must re-enter
    } catch {
      // 404 = not configured yet, which is fine
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [projectId]);

  const getFormData = (): GitSyncConfigInput => ({
    provider,
    repo_url: repoUrl,
    branch,
    directory,
    access_token: accessToken,
    sync_format: syncFormat,
    auto_sync: autoSync,
  });

  const handleSave = async () => {
    if (!repoUrl || !accessToken) {
      toast.error('Repository URL and access token are required');
      return;
    }
    setSaving(true);
    try {
      const data = await upsertGitSyncConfig(projectId, getFormData());
      setConfig(data);
      setAccessToken('');
      toast.success('Git sync configuration saved');
    } catch (e: any) {
      toast.error('Failed to save', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGitSyncConfig(projectId);
      setConfig(null);
      setRepoUrl('');
      setBranch('main');
      setDirectory('/');
      setAccessToken('');
      setSyncFormat('markdown');
      setAutoSync(false);
      toast.success('Git sync configuration removed');
    } catch {
      toast.error('Failed to remove configuration');
    }
  };

  const handleTest = async () => {
    if (!repoUrl || !accessToken) {
      toast.error('Fill in repository URL and access token first');
      return;
    }
    setTesting(true);
    try {
      await testGitConnection(projectId, getFormData());
      toast.success('Connection successful!');
    } catch (e: any) {
      toast.error('Connection failed', { description: e?.response?.data?.detail || e?.message });
    } finally {
      setTesting(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    try {
      const result = await pushToGit(projectId);
      toast.success(`Pushed ${result.pushed} files to Git`);
      await loadConfig();
    } catch (e: any) {
      toast.error('Push failed', { description: e?.response?.data?.detail || e?.message });
      await loadConfig();
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      const result = await pullFromGit(projectId);
      toast.success(`Pulled from Git: ${result.created} created, ${result.updated} updated`);
      await loadConfig();
    } catch (e: any) {
      toast.error('Pull failed', { description: e?.response?.data?.detail || e?.message });
      await loadConfig();
    } finally {
      setPulling(false);
    }
  };

  if (loading) {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center justify-center py-8">
          <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconGitBranch className="h-5 w-5" />
            <CardTitle>Git Sync</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {config && <StatusBadge status={config.last_sync_status} />}
            {config && (
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <IconTrash className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sync your pages bidirectionally with a Git repository as Markdown files.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider */}
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['github', 'gitlab', 'bitbucket'] as const).map((p) => {
                const Icon = providerIcons[p];
                return (
                  <SelectItem key={p} value={p}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {providerLabels[p]}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Repo URL */}
        <div className="space-y-2">
          <Label>Repository URL</Label>
          <Input
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
        </div>

        {/* Branch + Directory */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Directory</Label>
            <Input
              placeholder="/"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
            />
          </div>
        </div>

        {/* Access Token */}
        <div className="space-y-2">
          <Label>Access Token (PAT)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder={config ? config.access_token_masked : 'ghp_xxxxxxxxxxxx'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {provider === 'github' && 'Needs repo scope. Generate at GitHub → Settings → Developer settings → PATs.'}
            {provider === 'gitlab' && 'Needs api scope. Generate at GitLab → Preferences → Access Tokens.'}
            {provider === 'bitbucket' && 'Needs repository:write scope. Generate at Bitbucket → App passwords.'}
          </p>
        </div>

        {/* Sync Format + Auto-sync */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <Select value={syncFormat} onValueChange={(v) => setSyncFormat(v as any)}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Auto-sync on save</Label>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
        </div>

        {/* Last sync info */}
        {config?.last_sync_at && (
          <div className="text-xs text-muted-foreground">
            Last synced: {new Date(config.last_sync_at).toLocaleString()}
            {config.last_sync_error && (
              <span className="block text-red-500 mt-1">{config.last_sync_error}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !repoUrl || !accessToken} size="sm">
            {saving ? <IconLoader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {config ? 'Update' : 'Save'} Configuration
          </Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !repoUrl || !accessToken}>
            {testing ? <IconLoader2 className="mr-2 h-4 w-4 animate-spin" /> : <IconPlugConnected className="mr-2 h-4 w-4" />}
            Test
          </Button>
          {config && (
            <>
              <Button variant="outline" size="sm" onClick={handlePush} disabled={pushing}>
                {pushing ? <IconLoader2 className="mr-2 h-4 w-4 animate-spin" /> : <IconUpload className="mr-2 h-4 w-4" />}
                Push to Git
              </Button>
              <Button variant="outline" size="sm" onClick={handlePull} disabled={pulling}>
                {pulling ? <IconLoader2 className="mr-2 h-4 w-4 animate-spin" /> : <IconDownload className="mr-2 h-4 w-4" />}
                Pull from Git
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
