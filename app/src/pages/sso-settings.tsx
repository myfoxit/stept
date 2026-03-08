import React, { useEffect, useState } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  TestTube2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  listSsoConfigs,
  createSsoConfig,
  updateSsoConfig,
  deleteSsoConfig,
  testSsoConfig,
  type SsoConfigRead,
  type SsoConfigCreate,
  type SsoConfigUpdate,
  type SsoTestResult,
} from '@/api/sso';
import type { AxiosError } from 'axios';

interface FormState {
  domain: string;
  provider_name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  enabled: boolean;
  auto_create_users: boolean;
}

const emptyForm: FormState = {
  domain: '',
  provider_name: '',
  issuer_url: '',
  client_id: '',
  client_secret: '',
  enabled: true,
  auto_create_users: false,
};

export function SsoSettingsPage() {
  const [configs, setConfigs] = useState<SsoConfigRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test results per config id
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; data?: SsoTestResult; error?: string }>
  >({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listSsoConfigs();
      setConfigs(data);
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      if (axErr.response?.status === 403) {
        setForbidden(true);
      } else {
        setError(axErr.response?.data?.detail || 'Failed to load SSO configurations.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (cfg: SsoConfigRead) => {
    setEditingId(cfg.id);
    setForm({
      domain: cfg.domain,
      provider_name: cfg.provider_name,
      issuer_url: cfg.issuer_url,
      client_id: cfg.client_id,
      client_secret: '',
      enabled: cfg.enabled,
      auto_create_users: cfg.auto_create_users,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.domain || !form.provider_name || !form.issuer_url || !form.client_id) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (!editingId && !form.client_secret) {
      setFormError('Client secret is required when creating a new provider.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const payload: SsoConfigUpdate = { ...form };
        if (!payload.client_secret) delete payload.client_secret;
        await updateSsoConfig(editingId, payload);
      } else {
        await createSsoConfig(form as SsoConfigCreate);
      }
      setDialogOpen(false);
      await fetchConfigs();
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      setFormError(axErr.response?.data?.detail || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteSsoConfig(deleteId);
      setDeleteId(null);
      await fetchConfigs();
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      setError(axErr.response?.data?.detail || 'Failed to delete configuration.');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: undefined! }));
    try {
      const data = await testSsoConfig(id);
      setTestResults((prev) => ({ ...prev, [id]: { ok: true, data } }));
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, error: axErr.response?.data?.detail || 'OIDC discovery failed' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  if (forbidden) {
    return (
      <SettingsLayout
        title="Single Sign-On"
        description="Configure enterprise SSO providers for your organization."
      >
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            You need admin access to manage SSO settings.
          </p>
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="Single Sign-On"
      description="Configure enterprise SSO providers for your organization."
    >
      <div className="space-y-6">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && configs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No SSO providers configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add an SSO provider to enable enterprise single sign-on for your organization.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add SSO Provider
            </Button>
          </div>
        )}

        {!loading && configs.length > 0 && (
          <>
            <div className="flex justify-end">
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add SSO Provider
              </Button>
            </div>

            {configs.map((cfg) => (
              <Card key={cfg.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{cfg.provider_name}</CardTitle>
                    <Badge variant={cfg.enabled ? 'default' : 'secondary'}>
                      {cfg.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(cfg.id)}
                      disabled={testingId === cfg.id}
                    >
                      {testingId === cfg.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <TestTube2 className="h-4 w-4 mr-1" />
                      )}
                      Test
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(cfg)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteId(cfg.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Domain: </span>
                    <span className="font-medium">@{cfg.domain}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Issuer URL: </span>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-md inline-block align-bottom">
                      {cfg.issuer_url}
                    </code>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Auto-create users: </span>
                    <span>{cfg.auto_create_users ? 'Yes' : 'No'}</span>
                  </div>

                  {testResults[cfg.id] && (
                    <div className="mt-3 rounded-md border p-3 text-sm">
                      {testResults[cfg.id].ok ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-green-600 font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            OIDC discovery OK
                          </div>
                          {testResults[cfg.id].data && (
                            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                              {Object.entries(testResults[cfg.id].data!).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1">
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="font-medium">{key}:</span>{' '}
                                  <code className="truncate max-w-xs inline-block align-bottom">
                                    {val}
                                  </code>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-destructive">
                          <XCircle className="h-4 w-4" />
                          {testResults[cfg.id].error}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit SSO Provider' : 'Add SSO Provider'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="domain">Domain *</Label>
              <Input
                id="domain"
                placeholder="acme.com"
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider_name">Provider Name *</Label>
              <Input
                id="provider_name"
                placeholder="Acme Corp SSO"
                value={form.provider_name}
                onChange={(e) => setForm((f) => ({ ...f, provider_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuer_url">Issuer URL *</Label>
              <Input
                id="issuer_url"
                placeholder="https://acme.okta.com"
                value={form.issuer_url}
                onChange={(e) => setForm((f) => ({ ...f, issuer_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID *</Label>
              <Input
                id="client_id"
                placeholder="Client ID"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_secret">
                Client Secret {editingId ? '(leave blank to keep unchanged)' : '*'}
              </Label>
              <Input
                id="client_secret"
                type="password"
                placeholder={editingId ? 'unchanged' : 'Client Secret'}
                value={form.client_secret}
                onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enabled</Label>
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto_create_users">Auto-create users</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically create accounts for new users who sign in via SSO
                </p>
              </div>
              <Switch
                id="auto_create_users"
                checked={form.auto_create_users}
                onCheckedChange={(v) => setForm((f) => ({ ...f, auto_create_users: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? 'Save Changes' : 'Create Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SSO Provider</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this SSO provider? Users who rely on this provider
            will no longer be able to sign in via SSO.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
