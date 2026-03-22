import { useState, useEffect } from 'react';
import {
  Bot,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Copy,
  Calendar,
  FileText,
  Workflow,
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getIntercomConfig,
  updateIntercomConfig,
  disconnectIntercom,
  testIntercomConnection,
  triggerIntercomSync,
  getIntercomSyncStatus,
  type IntercomConfig,
  type IntercomConfigInput,
  type IntercomTestRequest,
} from '@/api/intercom';

export function IntercomSettingsCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [region, setRegion] = useState<string>('us');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingSync, setIsTestingSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['intercom-config', projectId],
    queryFn: () => getIntercomConfig(projectId),
    enabled: !!projectId,
  });

  // Get sync status
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['intercom-sync-status', projectId],
    queryFn: () => getIntercomSyncStatus(projectId),
    enabled: !!projectId && !!config?.connected,
    refetchInterval: 5000, // Refresh every 5 seconds to show sync progress
  });

  // Update state when config loads
  useEffect(() => {
    if (config) {
      setRegion(config.region || 'us');
      setSyncEnabled(config.sync_enabled ?? true);
      setWebhookEnabled(config.webhook_enabled ?? false);
    }
  }, [config]);

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: (input: IntercomConfigInput) => updateIntercomConfig(projectId, input),
    onSuccess: () => {
      toast.success('Intercom integration updated successfully');
      queryClient.invalidateQueries({ queryKey: ['intercom-config', projectId] });
      queryClient.invalidateQueries({ queryKey: ['intercom-sync-status', projectId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.response?.data?.detail || 'Unknown error'}`);
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: () => disconnectIntercom(projectId),
    onSuccess: () => {
      toast.success('Intercom integration disconnected');
      queryClient.invalidateQueries({ queryKey: ['intercom-config', projectId] });
      queryClient.invalidateQueries({ queryKey: ['intercom-sync-status', projectId] });
      // Reset form
      setAccessToken('');
      setClientSecret('');
      setRegion('us');
      setSyncEnabled(true);
      setWebhookEnabled(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to disconnect: ${error.response?.data?.detail || 'Unknown error'}`);
    },
  });

  // Test connection
  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await testIntercomConnection(projectId, { test_type: 'connection' });
      
      if (response.status === 'success') {
        toast.success(`Connected! ${response.message}`);
      } else {
        toast.error('Connection test failed');
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.response?.data?.detail || 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Test content sync
  const testContentSync = async () => {
    setIsTestingSync(true);
    try {
      const response = await testIntercomConnection(projectId, { test_type: 'content_sync' });
      
      if (response.status === 'success') {
        toast.success('Content sync test successful! Fin AI is ready.');
      } else {
        toast.error('Content sync test failed');
      }
    } catch (error: any) {
      toast.error(`Sync test failed: ${error.response?.data?.detail || 'Unknown error'}`);
    } finally {
      setIsTestingSync(false);
    }
  };

  // Trigger sync
  const triggerSync = async (force = false) => {
    setIsSyncing(true);
    try {
      const response = await triggerIntercomSync(projectId, { force });
      
      if (response.status === 'scheduled') {
        toast.success('Content sync started! This may take a few moments.');
        // Refetch status to show progress
        setTimeout(() => refetchSyncStatus(), 1000);
      } else {
        toast.error('Failed to start sync');
      }
    } catch (error: any) {
      toast.error(`Sync failed: ${error.response?.data?.detail || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Save configuration
  const handleSave = async () => {
    if (!accessToken.trim() || !clientSecret.trim()) {
      toast.error('Please enter both access token and client secret');
      return;
    }

    setIsSaving(true);
    try {
      await saveConfigMutation.mutateAsync({
        access_token: accessToken.trim(),
        client_secret: clientSecret.trim(),
        project_id: projectId,
        region,
        sync_enabled: syncEnabled,
        webhook_enabled: webhookEnabled,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect Intercom? This will remove all configuration and stop content syncing.')) {
      deleteConfigMutation.mutate();
    }
  };

  // Copy webhook URL
  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/v1/integrations/intercom/webhook`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  };

  const isConnected = config?.connected;
  const hasUnsavedChanges = 
    (accessToken && accessToken !== '••••••••') ||
    (clientSecret && clientSecret !== '••••••••') ||
    region !== (config?.region || 'us') ||
    syncEnabled !== (config?.sync_enabled ?? true) ||
    webhookEnabled !== (config?.webhook_enabled ?? false);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Intercom Integration
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
            <Bot className="h-5 w-5" />
            Intercom Integration
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
        </CardTitle>
        <CardDescription>
          Power Intercom's Fin AI with your workflows and surface relevant content in agent conversations.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Connection Setup */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Connection Settings</h4>
          
          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor={`access-token-${projectId}`}>Access Token</Label>
            <div className="relative">
              <Input
                id={`access-token-${projectId}`}
                type={showAccessToken ? 'text' : 'password'}
                placeholder={isConnected ? '••••••••' : 'Your Intercom access token'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowAccessToken(!showAccessToken)}
              >
                {showAccessToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label htmlFor={`client-secret-${projectId}`}>Client Secret</Label>
            <div className="relative">
              <Input
                id={`client-secret-${projectId}`}
                type={showClientSecret ? 'text' : 'password'}
                placeholder={isConnected ? '••••••••' : 'For webhook verification'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowClientSecret(!showClientSecret)}
              >
                {showClientSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Region */}
          <div className="space-y-2">
            <Label htmlFor={`region-${projectId}`}>Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger>
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">🇺🇸 United States</SelectItem>
                <SelectItem value="eu">🇪🇺 Europe</SelectItem>
                <SelectItem value="au">🇦🇺 Australia</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose the region where your Intercom workspace is hosted.
            </p>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Features</h4>
          
          {/* Content Sync */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Content Sync</span>
                {config?.content_source_id && (
                  <Badge variant="outline" className="text-xs">
                    Source ID: {config.content_source_id.slice(0, 8)}...
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Push workflows and documents to Intercom's Fin AI for customer support.
              </p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={setSyncEnabled}
              disabled={!isConnected}
            />
          </div>

          {/* Conversation Webhook */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-600" />
                <span className="font-medium">Conversation Webhook</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Surface relevant workflows in agent conversations automatically.
              </p>
            </div>
            <Switch
              checked={webhookEnabled}
              onCheckedChange={setWebhookEnabled}
              disabled={!isConnected}
            />
          </div>
        </div>

        {/* Sync Status & Controls */}
        {isConnected && config?.sync_enabled && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Content Sync</h4>
            
            {/* Sync Stats */}
            {syncStatus?.stats && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-600">
                    <Workflow className="h-4 w-4" />
                    <span className="font-semibold">{syncStatus.stats.workflows_synced}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Workflows</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-green-600">
                    <FileText className="h-4 w-4" />
                    <span className="font-semibold">{syncStatus.stats.documents_synced}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Documents</p>
                </div>
              </div>
            )}

            {/* Last Sync */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Last synced: {formatDateTime(config.last_synced_at)}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => triggerSync(false)}
                  disabled={isSyncing}
                  variant="outline"
                  size="sm"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Sync Now
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => triggerSync(true)}
                  disabled={isSyncing}
                  variant="outline"
                  size="sm"
                >
                  Force Resync
                </Button>
              </div>
            </div>

            {/* Sync Errors */}
            {syncStatus?.stats?.errors && syncStatus.stats.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Sync Errors
                </div>
                <ul className="mt-2 space-y-1 text-sm text-red-600">
                  {syncStatus.stats.errors.slice(0, 3).map((error, idx) => (
                    <li key={idx} className="text-xs">• {error}</li>
                  ))}
                  {syncStatus.stats.errors.length > 3 && (
                    <li className="text-xs text-red-500">
                      ... and {syncStatus.stats.errors.length - 3} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Webhook URL */}
        {isConnected && webhookEnabled && (
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                value={`${window.location.origin}/api/v1/integrations/intercom/webhook`}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                onClick={copyWebhookUrl}
                variant="outline"
                size="sm"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL to your Intercom webhook settings to enable conversation assistance.
            </p>
          </div>
        )}

        {/* Test Connections */}
        {isConnected && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Test Connection</h4>
            <div className="flex gap-2">
              <Button
                onClick={testConnection}
                disabled={isTestingConnection}
                variant="outline"
                size="sm"
              >
                {isTestingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Test API
              </Button>
              <Button
                onClick={testContentSync}
                disabled={isTestingSync || !syncEnabled}
                variant="outline"
                size="sm"
              >
                {isTestingSync ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Test Fin AI
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || (!hasUnsavedChanges && !(!isConnected && accessToken && clientSecret))}
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
                    <span className="font-medium">Create Intercom App</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Go to <a href="https://developers.intercom.com" target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">Intercom Developer Hub <ExternalLink className="h-3 w-3" /></a></p>
                    <p>Click "New app" → Choose your workspace</p>
                    <p>Select "Internal integration" or "Public app" based on your needs</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      2
                    </div>
                    <span className="font-medium">Configure Permissions</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Go to "Authentication" → OAuth scopes</p>
                    <p>Enable these scopes:</p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Read conversations</code></li>
                      <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Manage conversations</code></li>
                      <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Read and write AI content</code></li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      3
                    </div>
                    <span className="font-medium">Get Access Token</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Go to "Authentication" section</p>
                    <p>Copy the "Access Token" (starts with dG9r...)</p>
                    <p>Copy the "Client secret" for webhook verification</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      4
                    </div>
                    <span className="font-medium">Enable Webhooks (Optional)</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Go to "Webhooks" section → Add webhook</p>
                    <p>URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{window.location.origin}/api/v1/integrations/intercom/webhook</code></p>
                    <p>Subscribe to events:</p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li><code className="text-xs bg-muted px-1 py-0.5 rounded">conversation.user.created</code></li>
                      <li><code className="text-xs bg-muted px-1 py-0.5 rounded">conversation.user.replied</code></li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                      5
                    </div>
                    <span className="font-medium">Install & Configure</span>
                  </div>
                  <div className="ml-8 space-y-1">
                    <p>Paste your credentials in the form above</p>
                    <p>Enable Content Sync to push workflows to Fin AI</p>
                    <p>Enable Webhook for real-time conversation assistance</p>
                    <p>Click "Test Fin AI" to verify everything works</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-blue-800 text-xs">
                    <p className="font-medium">Benefits:</p>
                    <ul className="mt-1 space-y-0.5">
                      <li>• **Fin AI** answers customer questions using your workflows</li>
                      <li>• **AI Copilot** suggests relevant content to agents</li>
                      <li>• **Webhook** auto-surfaces workflows in conversations</li>
                      <li>• **Search endpoint** for custom Messenger apps</li>
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