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
  getSlackConfig,
  updateSlackConfig,
  disconnectSlack,
  testSlackConnection,
  type SlackConfig,
  type SlackConfigInput,
  type SlackTestRequest,
} from '@/api/slack';

export function SlackSettingsCard({ projectId }: { projectId: string }) {
  const { projects } = useProject();
  const queryClient = useQueryClient();
  const [botToken, setBotToken] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [showBotToken, setShowBotToken] = useState(false);
  const [showSigningSecret, setShowSigningSecret] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<string | undefined>(undefined);
  const [channelMap, setChannelMap] = useState<Record<string, string>>({});
  const [testChannel, setTestChannel] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);


  // Get current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['slack-config', projectId],
    queryFn: () => getSlackConfig(projectId),
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
    mutationFn: (input: SlackConfigInput) => updateSlackConfig(projectId, input),
    onSuccess: () => {
      toast.success('Slack integration updated successfully');
      queryClient.invalidateQueries({ queryKey: ['slack-config', projectId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.response?.data?.detail || 'Unknown error'}`);
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: () => disconnectSlack(projectId),
    onSuccess: () => {
      toast.success('Slack integration disconnected');
      queryClient.invalidateQueries({ queryKey: ['slack-config', projectId] });
      // Reset form
      setBotToken('');
      setSigningSecret('');
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
    if (!testChannel.trim()) {
      toast.error('Please enter a channel ID to test');
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = await testSlackConnection(projectId, {
        channel: testChannel.trim(),
      });
      
      if (response.status === 'success') {
        toast.success('Test message sent! Check your Slack channel.');
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
    if (!botToken.trim() || !signingSecret.trim()) {
      toast.error('Please enter both bot token and signing secret');
      return;
    }

    setIsSaving(true);
    try {
      await saveConfigMutation.mutateAsync({
        bot_token: botToken.trim(),
        signing_secret: signingSecret.trim(),
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
    if (confirm('Are you sure you want to disconnect Slack? This will remove all configuration.')) {
      deleteConfigMutation.mutate();
    }
  };

  const isConnected = config?.connected;
  const hasUnsavedChanges = 
    (botToken && botToken !== '••••••••') ||
    (signingSecret && signingSecret !== '••••••••') ||
    enabled !== (config?.enabled || false) ||
    defaultProjectId !== (config?.default_project_id || projectId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Slack Integration
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
            Slack Integration
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
            <Label htmlFor={`slack-enabled-${projectId}`} className="text-sm font-normal">
              Enable
            </Label>
            <Switch
              id={`slack-enabled-${projectId}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </CardTitle>
        <CardDescription>
          Surface workflows in Slack channels with slash commands, @mentions, and DMs.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Bot Token */}
        <div className="space-y-2">
          <Label htmlFor={`bot-token-${projectId}`}>Bot Token</Label>
          <div className="relative">
            <Input
              id={`bot-token-${projectId}`}
              type={showBotToken ? 'text' : 'password'}
              placeholder={isConnected ? '••••••••' : 'xoxb-your-bot-token'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowBotToken(!showBotToken)}
            >
              {showBotToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Signing Secret */}
        <div className="space-y-2">
          <Label htmlFor={`signing-secret-${projectId}`}>Signing Secret</Label>
          <div className="relative">
            <Input
              id={`signing-secret-${projectId}`}
              type={showSigningSecret ? 'text' : 'password'}
              placeholder={isConnected ? '••••••••' : 'your-signing-secret'}
              value={signingSecret}
              onChange={(e) => setSigningSecret(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowSigningSecret(!showSigningSecret)}
            >
              {showSigningSecret ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
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
              Project to search when no channel-specific mapping is configured.
            </p>
          </div>
        )}

        {/* Test Connection */}
        {isConnected && (
          <div className="space-y-2">
            <Label htmlFor={`test-channel-${projectId}`}>Test Connection</Label>
            <div className="flex gap-2">
              <Input
                id={`test-channel-${projectId}`}
                placeholder="#general or channel-id"
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={testConnection}
                disabled={isTestingConnection || !testChannel.trim()}
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
              Send a test message to verify the bot can post to your channel.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || (!hasUnsavedChanges && !(!isConnected && botToken && signingSecret))}
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
                  <span className="font-medium">Create a Slack App</span>
                </div>
                <div className="ml-8 space-y-1">
                  <p>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">api.slack.com/apps <ExternalLink className="h-3 w-3" /></a></p>
                  <p>Click "Create New App" → "From scratch"</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                    2
                  </div>
                  <span className="font-medium">Configure Bot Scopes</span>
                </div>
                <div className="ml-8 space-y-1">
                  <p>Go to "OAuth & Permissions" → "Scopes"</p>
                  <p>Add Bot Token Scopes:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">chat:write</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">commands</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">app_mentions:read</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">im:history</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">im:read</code></li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                    3
                  </div>
                  <span className="font-medium">Create Slash Command</span>
                </div>
                <div className="ml-8 space-y-1">
                  <p>Go to "Slash Commands" → "Create New Command"</p>
                  <p>Command: <code className="text-xs bg-muted px-1 py-0.5 rounded">/stept</code></p>
                  <p>Request URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{window.location.origin}/api/v1/integrations/slack/slash</code></p>
                  <p>Description: "Search stept workflows and documents"</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                    4
                  </div>
                  <span className="font-medium">Enable Events</span>
                </div>
                <div className="ml-8 space-y-1">
                  <p>Go to "Event Subscriptions" → Enable Events</p>
                  <p>Request URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{window.location.origin}/api/v1/integrations/slack/webhook</code></p>
                  <p>Subscribe to bot events:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">app_mention</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">message.im</code></li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                    5
                  </div>
                  <span className="font-medium">Install & Get Credentials</span>
                </div>
                <div className="ml-8 space-y-1">
                  <p>Go to "Install App" → Install to workspace</p>
                  <p>Copy the "Bot User OAuth Token" (starts with xoxb-)</p>
                  <p>Go to "Basic Information" → Copy "Signing Secret"</p>
                  <p>Paste both values in the form above</p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-blue-800 text-xs">
                  <p className="font-medium">Usage:</p>
                  <ul className="mt-1 space-y-0.5">
                    <li>• <code>/stept deploy production</code> - Slash command (private results)</li>
                    <li>• <code>@YourBot how to backup database</code> - Mention in channels</li>
                    <li>• Send DMs to the bot to search privately</li>
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