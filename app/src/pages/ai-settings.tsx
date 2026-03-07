import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Brain,
  Plug,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fetchChatConfig, fetchChatModels, type ChatConfig, type ChatModel } from '@/api/chat';
import { LlmSetupWizard, LlmStatusBadge } from '@/components/Settings/LlmSetupWizard';
import { AiUsageCard } from '@/components/Settings/AiUsageCard';
import { ProviderLogin } from '@/components/Settings/ProviderLogin';
import { SettingsLayout } from '@/components/settings-layout';
import { useProject } from '@/providers/project-provider';
import { useUpdateProject } from '@/hooks/api/projects';
import { toast } from 'sonner';

export function AiSettingsPage() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { selectedProject, selectedProjectId } = useProject();
  const updateProject = useUpdateProject();
  const projectId = routeProjectId || selectedProjectId;
  const [aiConfig, setAiConfig] = useState<ChatConfig | null>(null);
  const [aiModels, setAiModels] = useState<ChatModel[]>([]);
  const [aiTesting, setAiTesting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [aiEnabledLocal, setAiEnabledLocal] = useState<boolean | null>(null);
  const aiEnabledFromServer = selectedProject?.ai_enabled !== false;
  const aiEnabled = aiEnabledLocal ?? aiEnabledFromServer;

  // Sync local state when server data changes (e.g. page load, project switch)
  useEffect(() => {
    setAiEnabledLocal(null);
  }, [selectedProject?.id]);

  const refreshAiConfig = () => {
    fetchChatConfig().then(setAiConfig).catch(() => {});
    fetchChatModels().then(setAiModels).catch(() => {});
  };

  useEffect(() => {
    refreshAiConfig();
  }, []);

  const testAiConnection = async () => {
    setAiTesting(true);
    try {
      const models = await fetchChatModels();
      if (models.length > 0) {
        toast.success('Connection successful', {
          description: `Found ${models.length} model(s). Provider: ${aiConfig?.provider || 'unknown'}`,
        });
        setAiModels(models);
      } else {
        toast.warning('Connected but no models found');
      }
    } catch {
      toast.error('Connection failed', { description: 'Check your provider settings and API key.' });
    } finally {
      setAiTesting(false);
    }
  };

  return (
    <SettingsLayout title="AI Settings" description="Configure your AI provider, models, and usage.">
      {/* AI Features Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Features
              </CardTitle>
              <CardDescription className="mt-1">
                When enabled, new recordings are automatically titled and summarized using AI.
                The "Enhance with AI" button appears on workflow pages for full annotation and guide generation.
              </CardDescription>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={async (checked) => {
                if (!projectId || projectId === 'null') return;
                setAiEnabledLocal(checked);
                try {
                  await updateProject.mutateAsync({ projectId, ai_enabled: checked });
                  toast.success(checked ? 'AI features enabled' : 'AI features disabled');
                } catch {
                  setAiEnabledLocal(!checked); // revert on failure
                  toast.error('Failed to update setting');
                }
              }}
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <CardTitle>LLM Provider</CardTitle>
            </div>
            <LlmStatusBadge config={aiConfig} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize">
                  {aiConfig?.provider || 'Not configured'}
                </span>
                {aiConfig?.configured && (
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <span className="text-sm font-medium">
                {aiConfig?.model || '—'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Plug className="h-4 w-4" />
              <span>Status:</span>
              {aiConfig?.configured ? (
                <span className="text-green-500 font-medium">Connected</span>
              ) : (
                <span className="text-muted-foreground">Not configured</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4" />
              <span>SendCloak:</span>
              {aiConfig?.sendcloak_enabled ? (
                <span className="text-green-500 font-medium">Active</span>
              ) : (
                <span className="text-muted-foreground">Disabled</span>
              )}
            </div>
          </div>

          {aiModels.length > 0 && (
            <div className="space-y-2">
              <Label>Available Models</Label>
              <div className="flex flex-wrap gap-2">
                {aiModels.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-md border border-border bg-muted px-2 py-1 text-xs"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick Login</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Login with your existing provider account — no API key needed.
            </p>
            <ProviderLogin onStatusChange={refreshAiConfig} />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setWizardOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {aiConfig?.configured ? 'Reconfigure AI' : 'Setup AI Provider'}
            </Button>
            <Button
              variant="outline"
              onClick={testAiConnection}
              disabled={aiTesting}
            >
              {aiTesting ? 'Testing…' : 'Test Connection'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <LlmSetupWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConfigSaved={refreshAiConfig}
      />

      {aiConfig?.configured && <AiUsageCard />}
    </SettingsLayout>
  );
}
