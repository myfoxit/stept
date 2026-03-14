import * as React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Plug } from 'lucide-react';
import { SettingsLayout } from '@/components/settings-layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  useVerificationConfig,
  useUpdateVerificationConfig,
  useTestConnection,
  type VerificationConfig,
} from '@/hooks/use-staleness';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

export function VerificationSettingsPage() {
  const { selectedProjectId } = useProject();
  const pid = selectedProjectId ?? '';

  const { data: config, isLoading } = useVerificationConfig(pid || undefined);
  const updateConfig = useUpdateVerificationConfig();
  const testConnection = useTestConnection();

  // Local form state, initialized from server
  const [form, setForm] = React.useState<Partial<VerificationConfig>>({});
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (config && !initialized.current) {
      setForm({
        auth_login_url: config.auth_login_url ?? '',
        auth_email: config.auth_email ?? '',
        auth_password: config.auth_password ?? '',
        auth_email_selector: config.auth_email_selector ?? '',
        auth_password_selector: config.auth_password_selector ?? '',
        auth_submit_selector: config.auth_submit_selector ?? '',
        schedule_frequency: config.schedule_frequency ?? 'weekly',
        schedule_day: config.schedule_day ?? 1,
        schedule_time: config.schedule_time ?? '03:00',
        schedule_scope: config.schedule_scope ?? 'all',
        llm_enabled: config.llm_enabled ?? false,
      });
      initialized.current = true;
    }
  }, [config]);

  const update = (field: keyof VerificationConfig, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!pid) return;
    try {
      await updateConfig.mutateAsync({ projectId: pid, config: form });
      toast.success('Verification settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const handleTestConnection = async () => {
    if (!pid) return;
    try {
      const result = await testConnection.mutateAsync({ projectId: pid });
      if (result.success) {
        toast.success(result.message || 'Connection successful');
      } else {
        toast.error(result.message || 'Connection failed');
      }
    } catch {
      toast.error('Connection test failed');
    }
  };

  if (isLoading) {
    return (
      <SettingsLayout title="Verification" description="Configure automated workflow verification.">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Verification" description="Configure automated workflow verification.">
      <div className="space-y-6">
        {/* Run info */}
        {config && (config.last_run_at || config.next_run_at) && (
          <Card>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm">
              <div>
                <span className="text-muted-foreground">Last run: </span>
                <span className="font-medium">{formatDate(config.last_run_at)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Next run: </span>
                <span className="font-medium">{formatDate(config.next_run_at)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-4" />
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-url">Login URL</Label>
              <Input
                id="login-url"
                placeholder="https://app.example.com/login"
                value={form.auth_login_url ?? ''}
                onChange={(e) => update('auth_login_url', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="bot@example.com"
                  value={form.auth_email ?? ''}
                  onChange={(e) => update('auth_email', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  placeholder="••••••••"
                  value={form.auth_password ?? ''}
                  onChange={(e) => update('auth_password', e.target.value)}
                />
              </div>
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground">
              Selector overrides (optional — auto-detected by default)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email-selector">Email Selector</Label>
                <Input
                  id="email-selector"
                  placeholder='input[type="email"]'
                  value={form.auth_email_selector ?? ''}
                  onChange={(e) => update('auth_email_selector', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-selector">Password Selector</Label>
                <Input
                  id="password-selector"
                  placeholder='input[type="password"]'
                  value={form.auth_password_selector ?? ''}
                  onChange={(e) => update('auth_password_selector', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="submit-selector">Submit Selector</Label>
                <Input
                  id="submit-selector"
                  placeholder='button[type="submit"]'
                  value={form.auth_submit_selector ?? ''}
                  onChange={(e) => update('auth_submit_selector', e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testConnection.isPending}
            >
              {testConnection.isPending ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Plug className="size-3.5 mr-1" />
              )}
              Test Connection
            </Button>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={form.schedule_frequency ?? 'weekly'}
                  onValueChange={(v) => update('schedule_frequency', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.schedule_frequency !== 'daily' &&
                form.schedule_frequency !== 'manual' && (
                  <div className="space-y-2">
                    <Label>Day</Label>
                    <Select
                      value={String(form.schedule_day ?? 1)}
                      onValueChange={(v) => update('schedule_day', parseInt(v, 10))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                          (d, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {d}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              {form.schedule_frequency !== 'manual' && (
                <div className="space-y-2">
                  <Label htmlFor="schedule-time">Time</Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={form.schedule_time ?? '03:00'}
                    onChange={(e) => update('schedule_time', e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={form.schedule_scope ?? 'all'}
                onValueChange={(v) => update('schedule_scope', v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All workflows</SelectItem>
                  <SelectItem value="stale_only">Stale workflows only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* LLM */}
        <Card>
          <CardHeader>
            <CardTitle>AI Assistance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  LLM-powered failure analysis
                </p>
                <p className="text-xs text-muted-foreground">
                  Use AI to explain why steps fail and suggest fixes
                </p>
              </div>
              <Switch
                checked={form.llm_enabled ?? false}
                onCheckedChange={(checked) => update('llm_enabled', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4 mr-1" />
            )}
            Save Settings
          </Button>
        </div>
      </div>
    </SettingsLayout>
  );
}
