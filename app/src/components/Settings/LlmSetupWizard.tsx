import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plug,
  CircleAlert,
  Sparkles,
  Server,
  Cloud,
  Bot,
  Settings,
  Search,
  Monitor,
  Github,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchChatModels, updateChatConfig, type ChatConfig, type ChatModel } from '@/api/chat';
import { setLocalProviderConfig, getLocalProviderConfig } from '@/services/local-chat';
import {
  startCopilotDeviceFlow,
  pollCopilotDeviceFlow,
  disconnectCopilot,
  fetchProvidersStatus,
} from '@/api/authProviders';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface LlmSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

type Provider = 'copilot' | 'openai' | 'anthropic' | 'ollama' | 'custom';

interface ProviderOption {
  id: Provider;
  name: string;
  description: string;
  icon: React.ReactNode;
  requiresKey: boolean;
}

const providers: ProviderOption[] = [
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Login with GitHub — uses your Copilot subscription (GPT-4o, Claude)',
    icon: <Github className="h-8 w-8" />,
    requiresKey: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, and other OpenAI models',
    icon: <Cloud className="h-8 w-8" />,
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4, Claude 3.5 Sonnet, and other Claude models',
    icon: <Brain className="h-8 w-8" />,
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally with Ollama — no API key needed',
    icon: <Server className="h-8 w-8" />,
    requiresKey: false,
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    description: 'Any OpenAI-compatible API endpoint',
    icon: <Settings className="h-8 w-8" />,
    requiresKey: true,
  },
];

// ── Auto-detect result ───────────────────────────────────────────────────────

interface AutoDetectResult {
  ollama: { available: boolean; modelCount: number };
}

// ── Main component ───────────────────────────────────────────────────────────

export function LlmSetupWizard({ open, onClose, onConfigSaved }: LlmSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('copilot');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);
  const [saving, setSaving] = useState(false);

  // Auto-detect
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState<AutoDetectResult | null>(null);

  // Copilot device flow
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);
  const [copilotVerifyUrl, setCopilotVerifyUrl] = useState('');
  const [copilotPolling, setCopilotPolling] = useState(false);
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const copilotPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Check Copilot status on mount
  useEffect(() => {
    fetchProvidersStatus()
      .then(({ providers: p }) => {
        const cp = p.find((x) => x.provider === 'copilot');
        if (cp?.connected) setCopilotConnected(true);
      })
      .catch(() => {});
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (copilotPollRef.current) clearInterval(copilotPollRef.current);
  }, []);

  // Auto-detect Ollama when provider selected
  useEffect(() => {
    if (selectedProvider === 'ollama' && step === 1) detectOllama();
  }, [selectedProvider, step]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const detectOllama = async () => {
    setOllamaDetecting(true);
    try {
      const resp = await fetch('http://localhost:11434/api/tags', { mode: 'cors' });
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        setOllamaDetected(true);
        if (models.length > 0 && !selectedModel) setSelectedModel(models[0]);
      }
    } catch {
      setOllamaDetected(false);
      setOllamaModels([]);
    } finally {
      setOllamaDetecting(false);
    }
  };

  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    const result: AutoDetectResult = { ollama: { available: false, modelCount: 0 } };
    try {
      const resp = await fetch('http://localhost:11434/api/tags', { mode: 'cors' });
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        result.ollama = { available: true, modelCount: models.length };
        setOllamaModels(models);
        setOllamaDetected(true);
      }
    } catch { /* not available */ }
    setAutoDetectResult(result);
    setAutoDetecting(false);
  }, []);

  // ── Copilot device flow ────────────────────────────────────────────────────

  const handleStartCopilotFlow = useCallback(async () => {
    setCopilotError(null);
    setCopilotUserCode(null);
    try {
      const data = await startCopilotDeviceFlow();
      setCopilotUserCode(data.user_code);
      setCopilotVerifyUrl(data.verification_uri);
      setCopilotPolling(true);

      const interval = (data.interval || 5) * 1000;
      copilotPollRef.current = setInterval(async () => {
        try {
          const poll = await pollCopilotDeviceFlow();
          if (poll.status === 'success') {
            if (copilotPollRef.current) clearInterval(copilotPollRef.current);
            setCopilotPolling(false);
            setCopilotConnected(true);
            setCopilotUserCode(null);
            toast.success('GitHub Copilot connected!');
          } else if (poll.status === 'expired' || poll.status === 'error') {
            if (copilotPollRef.current) clearInterval(copilotPollRef.current);
            setCopilotPolling(false);
            setCopilotError(poll.message || 'Authentication failed');
            setCopilotUserCode(null);
          }
        } catch {
          if (copilotPollRef.current) clearInterval(copilotPollRef.current);
          setCopilotPolling(false);
          setCopilotError('Polling failed');
        }
      }, interval);
    } catch (err) {
      setCopilotError(err instanceof Error ? err.message : 'Failed to start device flow');
    }
  }, []);

  const handleCopilotDisconnect = useCallback(async () => {
    try {
      await disconnectCopilot();
      setCopilotConnected(false);
      toast.success('Copilot disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, []);

  // ── Test & Save ────────────────────────────────────────────────────────────

  const handleTestConnection = async () => {
    setTestResult('testing');
    setTestMessage('');
    try {
      const models = await fetchChatModels();
      setAvailableModels(models);
      setTestResult('success');
      setTestMessage(
        models.length > 0
          ? `Connected! Found ${models.length} model(s).`
          : 'Connected, but no models found.',
      );
    } catch {
      setTestResult('error');
      setTestMessage('Connection failed. Check your provider settings and API key.');
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const config: Record<string, string> = { provider: selectedProvider };
      if (apiKey) config.api_key = apiKey;
      if (selectedModel) config.model = selectedModel;
      if (baseUrl) config.base_url = baseUrl;

      if (selectedProvider === 'copilot') {
        config.base_url = 'https://api.githubcopilot.com';
        if (!selectedModel) config.model = 'gpt-4o';
      }

      setLocalProviderConfig({ provider: selectedProvider });
      await updateChatConfig(config);

      const label = selectedProvider === 'copilot' ? 'GitHub Copilot' : selectedProvider;
      toast.success('AI configuration saved!', {
        description: `Provider: ${label}, Model: ${config.model || selectedModel || 'default'}`,
      });
      onConfigSaved?.();
      onClose();
    } catch (err) {
      toast.error('Failed to save AI configuration', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Step rendering ─────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <Sparkles className="h-12 w-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-bold">Choose your AI Provider</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the LLM provider to power smart features
        </p>
      </div>

      {/* Auto-detect */}
      <Button variant="outline" className="w-full mb-2" onClick={handleAutoDetect} disabled={autoDetecting}>
        {autoDetecting ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Detecting…</>
        ) : (
          <><Search className="mr-2 h-4 w-4" />Auto-detect local AI</>
        )}
      </Button>

      {autoDetectResult && (
        <div className="rounded-lg border p-3 mb-2 text-sm space-y-2">
          <div className="font-medium flex items-center gap-1.5">
            <Monitor className="h-4 w-4" />
            Detected:
          </div>
          <div className="flex items-center gap-2 ml-5">
            {autoDetectResult.ollama.available ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <CircleAlert className="h-4 w-4 text-amber-500" />
            )}
            <span>
              Ollama: {autoDetectResult.ollama.available ? (
                <span className="text-green-600 font-medium">{autoDetectResult.ollama.modelCount} model(s)</span>
              ) : (
                <span className="text-muted-foreground">Not running</span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Provider cards */}
      <div className="grid gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProvider(p.id)}
            className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
              selectedProvider === p.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/20 hover:bg-accent'
            }`}
          >
            <div className={`flex-shrink-0 rounded-xl p-2.5 ${
              selectedProvider === p.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {p.icon}
            </div>
            <div className="flex-1">
              <div className="font-semibold flex items-center gap-2">
                {p.name}
                {!p.requiresKey && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">No API key</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{p.description}</div>
            </div>
            {selectedProvider === p.id && <Check className="h-5 w-5 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">
          Configure {providers.find((p) => p.id === selectedProvider)?.name}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedProvider === 'copilot'
            ? 'Login with your GitHub account'
            : selectedProvider === 'ollama'
            ? "We'll auto-detect your local Ollama"
            : 'Enter your API key and preferences'}
        </p>
      </div>

      {selectedProvider === 'copilot' ? (
        <div className="space-y-4">
          {copilotConnected ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <Check className="h-5 w-5" />
                GitHub Copilot Connected
              </div>
              <p className="text-sm text-green-600 mt-1">
                Your subscription is active. Choose a model below.
              </p>
              <Button
                variant="ghost" size="sm"
                className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleCopilotDisconnect}
              >
                Disconnect
              </Button>
            </div>
          ) : copilotUserCode ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-sm text-primary mb-3">Enter this code on GitHub:</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-3xl font-mono font-bold tracking-[0.25em] text-primary bg-white px-4 py-2 rounded-lg border">
                    {copilotUserCode}
                  </code>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    navigator.clipboard.writeText(copilotUserCode);
                    toast.success('Code copied!');
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => window.open(copilotVerifyUrl, '_blank')}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open GitHub to authorize
              </Button>
              {copilotPolling && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for authorization…
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-center">
                <Github className="h-12 w-12 mx-auto mb-3 text-foreground" />
                <h3 className="font-semibold mb-1">Login with GitHub</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Authenticate with GitHub to use Copilot's AI models. Requires an active Copilot subscription.
                </p>
                <Button onClick={handleStartCopilotFlow} className="w-full">
                  <Github className="mr-2 h-4 w-4" />
                  Start GitHub Login
                </Button>
              </div>
              {copilotError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-red-700 text-sm">
                    <CircleAlert className="h-4 w-4" />
                    {copilotError}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model picker */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel || 'gpt-4o'} onValueChange={setSelectedModel}>
              <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                <SelectItem value="o3-mini">o3-mini</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Available models depend on your Copilot tier.
            </p>
          </div>
        </div>
      ) : selectedProvider === 'ollama' ? (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {ollamaDetecting ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : ollamaDetected ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <CircleAlert className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <div className="font-medium text-sm">
                  {ollamaDetecting ? 'Detecting Ollama…'
                    : ollamaDetected ? `Ollama detected — ${ollamaModels.length} model(s)`
                    : 'Ollama not detected'}
                </div>
                {!ollamaDetected && !ollamaDetecting && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Make sure Ollama is running at localhost:11434
                  </p>
                )}
              </div>
            </div>
          </div>
          {ollamaModels.length > 0 && (
            <div className="space-y-2">
              <Label>Select Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
                <SelectContent>
                  {ollamaModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Base URL (optional)</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
          </div>
        </div>
      ) : (
        /* OpenAI / Anthropic / Custom */
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key" type="password" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={selectedProvider === 'openai' ? 'sk-…' : selectedProvider === 'anthropic' ? 'sk-ant-…' : 'API key'}
            />
            <p className="text-xs text-muted-foreground">Stored securely on the server.</p>
          </div>
          {selectedProvider === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-api.example.com" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model" value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder={selectedProvider === 'openai' ? 'gpt-4o-mini' : selectedProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'Model name'}
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">
          {selectedProvider === 'copilot' ? 'Review & Finish' : 'Test & Finish'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedProvider === 'copilot' ? 'Review your configuration' : 'Verify your connection works'}
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Provider</span>
            <Badge variant="outline">
              {selectedProvider === 'copilot' ? 'GitHub Copilot' : selectedProvider}
            </Badge>
          </div>
          {selectedProvider === 'copilot' ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-sm flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${copilotConnected ? 'bg-green-500' : 'bg-red-400'}`} />
                  {copilotConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Model</span>
                <Badge variant="outline">{selectedModel || 'gpt-4o'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API</span>
                <span className="text-xs font-mono">api.githubcopilot.com</span>
              </div>
            </>
          ) : (
            <>
              {selectedModel && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Model</span>
                  <Badge variant="outline">{selectedModel}</Badge>
                </div>
              )}
              {baseUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Base URL</span>
                  <span className="text-sm font-mono">{baseUrl}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Test connection (skip for copilot) */}
      {selectedProvider !== 'copilot' && (
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={handleTestConnection} disabled={testResult === 'testing'}
            size="lg" className="w-full"
            variant={testResult === 'success' ? 'outline' : 'default'}
          >
            {testResult === 'testing' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Testing…</>
            ) : testResult === 'success' ? (
              <><Check className="mr-2 h-4 w-4 text-green-500" />Test Again</>
            ) : (
              <><Plug className="mr-2 h-4 w-4" />Test Connection</>
            )}
          </Button>
          {testMessage && (
            <div className={`text-sm text-center ${testResult === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {testMessage}
            </div>
          )}
          {availableModels.length > 0 && (
            <div className="w-full space-y-2">
              <Label className="text-xs text-muted-foreground">Available Models</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableModels.map((m) => <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedProvider === 'copilot' && !copilotConnected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-700">
            ⚠️ GitHub login not completed. Go back and connect your account first.
          </p>
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Setup
            <Badge variant="outline" className="text-xs ml-auto">Step {step + 1}/3</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary/50' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />Back
            </Button>
          ) : <div />}

          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>
              Next<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                <><Sparkles className="mr-1.5 h-4 w-4" />Start using AI</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge for settings page ───────────────────────────────────────────

export function LlmStatusBadge({ config }: { config: ChatConfig | null }) {
  const localConfig = getLocalProviderConfig();
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);

  useEffect(() => {
    if (config?.provider === 'ollama' || localConfig.provider === 'ollama') {
      fetch('http://localhost:11434/api/tags', { mode: 'cors' })
        .then((r) => r.json())
        .then((data) => {
          const count = data.models?.length || 0;
          setOllamaStatus(`Connected, ${count} model${count !== 1 ? 's' : ''} available`);
        })
        .catch(() => setOllamaStatus('Not running'));
    }
  }, [config?.provider, localConfig.provider]);

  // Copilot
  if (config?.provider === 'copilot') {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-sm">GitHub Copilot — {config.model || 'gpt-4o'}</span>
      </div>
    );
  }

  // Ollama
  if ((config?.provider === 'ollama') && ollamaStatus) {
    return (
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${ollamaStatus.startsWith('Connected') ? 'bg-green-500' : 'bg-red-400'}`} />
        <span className="text-sm">Ollama — {ollamaStatus}</span>
      </div>
    );
  }

  // Others
  if (!config) return null;
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${config.configured ? 'bg-green-500' : 'bg-slate-300'}`} />
      <span className="text-sm">
        {config.configured
          ? `${config.provider.charAt(0).toUpperCase() + config.provider.slice(1)} ${config.model} connected`
          : 'Not configured'}
      </span>
    </div>
  );
}
