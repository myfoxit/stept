import { useState, useEffect } from 'react';
import {
  Github,
  GitBranch,
  Upload,
  Plug,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useProject } from '@/providers/project-provider';
import {
  getGitSyncConfig,
  upsertGitSyncConfig,
  exportToGit,
  testGitConnection,
  deleteGitSyncConfig,
  type GitSyncConfig,
  type GitSyncConfigInput,
} from '@/api/git-sync';

const PROVIDERS = [
  { value: 'github', label: 'GitHub', icon: Github },
  { value: 'gitlab', label: 'GitLab', icon: GitBranch },
  { value: 'bitbucket', label: 'Bitbucket', icon: Upload },
] as const;

export function GitSyncCard() {
  const { selectedProjectId } = useProject();
  const [config, setConfig] = useState<GitSyncConfig | null>(null);
  const [provider, setProvider] = useState<string>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [directory, setDirectory] = useState('/');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) return;
    getGitSyncConfig(selectedProjectId)
      .then(c => {
        setConfig(c);
        setProvider(c.provider);
        setRepoUrl(c.repo_url);
        setBranch(c.branch);
        setDirectory(c.directory);
      })
      .catch(() => {
        setConfig(null);
      })
      .finally(() => setLoaded(true));
  }, [selectedProjectId]);

  if (!loaded) return null;

  const getInput = (): GitSyncConfigInput => ({
    provider: provider as any,
    repo_url: repoUrl,
    branch,
    directory,
    access_token: token,
  });

  const handleSave = async () => {
    if (!selectedProjectId || !repoUrl || !token) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      const c = await upsertGitSyncConfig(selectedProjectId, getInput());
      setConfig(c);
      setToken('');
      toast.success('Git export configured');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!selectedProjectId || !repoUrl || !token) {
      toast.error('Fill in repo URL and token first');
      return;
    }
    setTesting(true);
    try {
      await testGitConnection(selectedProjectId, getInput());
      toast.success('Connection successful!');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Connection failed');
    }
    setTesting(false);
  };

  const handleExport = async () => {
    if (!selectedProjectId) return;
    setExporting(true);
    try {
      const result = await exportToGit(selectedProjectId);
      toast.success(`Exported ${result.exported} pages to Git`);
      // Refresh config to get updated status
      const c = await getGitSyncConfig(selectedProjectId);
      setConfig(c);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Export failed');
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!selectedProjectId) return;
    try {
      await deleteGitSyncConfig(selectedProjectId);
      setConfig(null);
      setRepoUrl('');
      setBranch('main');
      setDirectory('/');
      setToken('');
      toast.success('Git export configuration removed');
    } catch {
      toast.error('Failed to remove configuration');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Github className="h-5 w-5" />
          Export to Git
        </CardTitle>
        <CardDescription>
          Export your pages as Markdown to a Git repository.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="h-4 w-4" />
                      {p.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Branch</Label>
            <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Repository URL</Label>
          <Input
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
          />
        </div>

        <div className="space-y-2">
          <Label>Directory (optional)</Label>
          <Input
            value={directory}
            onChange={e => setDirectory(e.target.value)}
            placeholder="/ (root) or docs/"
          />
        </div>

        <div className="space-y-2">
          <Label>
            Access Token
            {config && <span className="ml-2 text-xs text-muted-foreground">({config.access_token_masked})</span>}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder={config ? 'Enter new token to update' : 'ghp_... or glpat-...'}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        {config?.last_sync_status && (
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
            {config.last_sync_status === 'success' && <Check className="h-4 w-4 text-green-500" />}
            {config.last_sync_status === 'error' && <X className="h-4 w-4 text-destructive" />}
            {config.last_sync_status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin" />}
            <div>
              <span className="font-medium capitalize">{config.last_sync_status}</span>
              {config.last_sync_at && (
                <span className="ml-2 text-muted-foreground">
                  {new Date(config.last_sync_at).toLocaleString()}
                </span>
              )}
              {config.last_sync_error && (
                <p className="mt-1 text-xs text-destructive">{config.last_sync_error}</p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTest} variant="outline" size="sm" disabled={testing || !repoUrl || !token}>
            {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plug className="mr-1 h-4 w-4" />}
            Test
          </Button>
          <Button onClick={handleSave} size="sm" disabled={saving || !repoUrl || !token}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {config ? 'Update' : 'Save'}
          </Button>
          {config && (
            <>
              <Button onClick={handleExport} size="sm" variant="secondary" disabled={exporting}>
                {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                Export to Git
              </Button>
              <Button onClick={handleDelete} size="sm" variant="ghost" className="text-destructive">
                Remove
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
