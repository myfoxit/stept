import { useState, useEffect } from 'react';
import {
  MessageCircle,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useProject } from '@/providers/project-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTeamsConfig,
  updateTeamsConfig,
  disconnectTeams,
  testTeamsConnection,
  type TeamsConfig,
  type TeamsConfigInput,
  type TeamsTestRequest,
} from '@/api/teams';

export function TeamsSettingsCard({ projectId }: { projectId: string }) {
  const { projects } = useProject();
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<string | undefined>(undefined);
  const [channelMap, setChannelMap] = useState<Record<string, string>>({});
  const [testConversationId, setTestConversationId] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['teams-config', projectId],
    queryFn: () => getTeamsConfig(projectId),
    enabled: !!projectId,
  });

  // Update state when config loads
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setDefaultProjectId(config.default_project_id || projectId);
      setChannelMap(config.channel_project_map || {});
    }
  }, [config, projectId]);

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: (input: TeamsConfigInput) => updateTeamsConfig(projectId, input),
    onSuccess: () => {
      toast.success('Teams integration updated successfully');
      queryClient.invalidateQueries({ queryKey: ['teams-config', projectId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.response?.data?.detail || 'Unknown error'}`);
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: () => disconnectTeams(projectId),
    onSuccess: () => {
      toast.success('Teams integration disconnected');
      queryClient.invalidateQueries({ queryKey: ['teams-config', projectId] });
      // Reset form
      setAppId('');
      setAppPassword('');
      setWebhookUrl('');
      setEnabled(false);
      setDefaultProjectId(projectId);
      setChannelMap({});
    },
    onError: (error: any) => {
      toast.error(`Failed to disconnect: ${error.response?.data?.detail || 'Unknown error'}`);
    },
  });

  // Test connection
  const testConnection = async () => {
    if (!testConversationId.trim()) {
      toast.error('Please enter a conversation ID to test');
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = await testTeamsConnection(projectId, {
        conversation_id: testConversationId.trim(),
      });
      
      if (response.status === 'success') {
        toast.success('Test message sent! Check your Teams conversation.');
      } else if (response.status === 'partial_success') {
        toast.info(response.message || 'Configuration looks valid');
      } else {
        toast.error('Test failed');
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.response?.data?.detail || 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Save configuration
  const handleSave = async () => {
    // Validate that we have either Bot Framework credentials OR webhook URL
    const hasBotFramework = appId.trim() && appPassword.trim();
    const hasWebhook = webhookUrl.trim();
    
    if (!hasBotFramework && !hasWebhook) {
      toast.error('Please enter either Bot Framework credentials (App ID + Password) or a Webhook URL');
      return;
    }

    setIsSaving(true);
    try {
      await saveConfigMutation.mutateAsync({
        app_id: appId.trim() || undefined,
        app_password: appPassword.trim() || undefined,
        webhook_url: webhookUrl.trim() || undefined,
        default_project_id: defaultProjectId || projectId,
        channel_project_map: channelMap,
        enabled,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect Teams? This will remove all configuration.')) {
      deleteConfigMutation.mutate();
    }
  };

  const isConnected = config?.connected;
  const hasUnsavedChanges = 
    (appId && appId !== '••••••••') ||
    (appPassword && appPassword !== '••••••••') ||
    (webhookUrl && webhookUrl !== '••••••••') ||
    enabled !== (config?.enabled || false) ||
    defaultProjectId !== (config?.default_project_id || projectId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Microsoft Teams Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Microsoft Teams Integration
            {isConnected && (
              <Badge variant="default" className="bg-green-600 text-white">
                Connected
              </Badge>
            )}
            {!isConnected && (
              <Badge variant="secondary">
                Disconnected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`teams-enabled-${projectId}`} className="text-sm font-normal">
              Enable
            </Label>
            <Switch
              id={`teams-enabled-${projectId}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </CardTitle>
        <CardDescription>
          Surface workflows in Teams channels with @mentions, DMs, and interactive Adaptive Cards.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Integration Mode Info */}
        <div className="bg-muted/50 p-3 rounded-lg">
          <div className="text-sm">
            <p className="font-medium mb-2">Choose your integration mode:</p>
            <div className="space-y-1 text-xs">
              <p>• <strong>Bot Framework</strong> (recommended): Full features with threading, authentication</p>
              <p>• <strong>Webhook</strong> (simple): Basic posting, easier setup</p>
            </div>
          </div>
        </div>

        {/* Bot Framework Section */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <Label className="font-medium">Bot Framework (Recommended)</Label>
          </div>
          
          {/* App ID */}
          <div className="space-y-2">
            <Label htmlFor={`app-id-${projectId}`}>App ID</Label>
            <Input
              id={`app-id-${projectId}`}
              placeholder={isConnected ? '••••••••' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>

          {/* App Password */}
          <div className="space-y-2">
            <Label htmlFor={`app-password-${projectId}`}>App Password</Label>
            <div className="relative">
              <Input
                id={`app-password-${projectId}`}
                type={showAppPassword ? 'text' : 'password'}
                placeholder={isConnected ? '••••••••' : 'your-app-password'}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowAppPassword(!showAppPassword)}
              >
                {showAppPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Webhook Section */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
            <Label className="font-medium">Webhook (Alternative)</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`webhook-url-${projectId}`}>Webhook URL</Label>
            <div className="relative">
              <Input
                id={`webhook-url-${projectId}`}
                type={showWebhookUrl ? 'text' : 'password'}
                placeholder={isConnected ? '••••••••' : 'https://your-domain.webhook.office.com/...'}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowWebhookUrl(!showWebhookUrl)}
              >
                {showWebhookUrl ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Default Project */}
        {projects && projects.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor={`default-project-${projectId}`}>Default Project</Label>
            <Select value={defaultProjectId || projectId} onValueChange={setDefaultProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select default project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Project to search when no conversation-specific mapping is configured.
            </p>
          </div>
        )}

        {/* Test Connection */}
        {isConnected && (
          <div className="space-y-2">
            <Label htmlFor={`test-conversation-${projectId}`}>Test Connection</Label>
            <div className="flex gap-2">
              <Input
                id={`test-conversation-${projectId}`}
                placeholder="conversation-id or @mention the bot"
                value={testConversationId}
                onChange={(e) => setTestConversationId(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={testConnection}
                disabled={isTestingConnection}
                variant="outline"
              >
                {isTestingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Test'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For Bot Framework: @mention the bot in Teams to test. For Webhook: enter a conversation ID.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || (!hasUnsavedChanges && !(!isConnected && (appId || webhookUrl)))}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : isConnected ? (
              'Update'
            ) : (
              'Connect'
            )}
          </Button>
          
          {isConnected && (
            <Button
              onClick={handleDisconnect}
              variant="destructive"
              disabled={deleteConfigMutation.isPending}
            >
              {deleteConfigMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </Button>
          )}
        </div>

        {/* Setup Instructions */}
        <Accordion type="single" collapsible>
          <AccordionItem value="instructions" className="border-none">
            <AccordionTrigger className="text-sm font-medium hover:no-underline px-0">
              Setup Instructions
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-3 px-0">
              <div className="bg-muted/50 p-3 rounded-lg space-y-3 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      1
                    </div>
                    <span className="font-medium">Register a Bot Application</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Go to <a href="https://portal.azure.com/" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">Azure Portal <ExternalLink className="h-3 w-3" /></a> or <a href="https://dev.teams.microsoft.com/" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">Teams Developer Portal <ExternalLink className="h-3 w-3" /></a></p>
                    <p>Create a new Bot Channel Registration or Teams App</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      2
                    </div>
                    <span className="font-medium">Get App ID and Password</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Copy the Application (client) ID</p>
                    <p>Generate a client secret in "Certificates & secrets"</p>
                    <p>Save both values - you'll need them above</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      3
                    </div>
                    <span className="font-medium">Configure Messaging Endpoint</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>In Bot Channel Registration, set messaging endpoint:</p>
                    <p><code className="text-xs bg-muted px-1 py-0.5 rounded">{window.location.origin}/api/v1/integrations/teams/webhook</code></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      4
                    </div>
                    <span className="font-medium">Add Microsoft Teams Channel</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>In "Channels", add Microsoft Teams</p>
                    <p>Enable the bot for Teams</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      5
                    </div>
                    <span className="font-medium">Install in Teams</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Create an app package or use App Studio/Developer Portal</p>
                    <p>Install the bot in your Teams workspace</p>
                    <p>Add the bot to channels or start a direct conversation</p>
                  </div>
                </div>

                {/* Alternative Webhook Setup */}
                <div className="border-t pt-3 mt-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                        Alt
                      </div>
                      <span className="font-medium">Webhook Alternative (Simpler)</span>
                    </div>
                    <div className="ml-8 space-y-1">
                      <p>Create an Incoming Webhook in your Teams channel</p>
                      <p>Copy the webhook URL and paste it above</p>
                      <p>Note: Limited functionality (no threading, no authentication)</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-blue-800 text-xs">
                    <p className="font-medium">Usage:</p>
                    <ul className="mt-1 space-y-0.5">
                      <li>• <code>@YourBot deploy production</code> - Mention in channels</li>
                      <li>• Send direct messages to search privately</li>
                      <li>• Use interactive buttons to share results with your team</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}