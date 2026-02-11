import React, { useState, useEffect } from 'react';
import {
  IconBrain,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconLoader2,
  IconPlugConnected,
  IconAlertCircle,
  IconSparkles,
  IconServer,
  IconCloud,
  IconRobot,
  IconSettings,
} from '@tabler/icons-react';
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
import { fetchChatConfig, fetchChatModels, updateChatConfig, type ChatConfig, type ChatModel } from '@/api/chat';
import { toast } from 'sonner';

interface LlmSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

type Provider = 'openai' | 'anthropic' | 'ollama' | 'custom';

interface ProviderOption {
  id: Provider;
  name: string;
  description: string;
  icon: React.ReactNode;
  requiresKey: boolean;
}

const providers: ProviderOption[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, and other OpenAI models',
    icon: <IconCloud className="h-8 w-8" />,
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4, Claude 3.5 Sonnet, and other Claude models',
    icon: <IconBrain className="h-8 w-8" />,
    requiresKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally — no API key needed',
    icon: <IconServer className="h-8 w-8" />,
    requiresKey: false,
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    description: 'Any OpenAI-compatible API endpoint',
    icon: <IconSettings className="h-8 w-8" />,
    requiresKey: true,
  },
];

export function LlmSetupWizard({ open, onClose, onConfigSaved }: LlmSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);

  // Auto-detect Ollama on mount
  useEffect(() => {
    if (selectedProvider === 'ollama' && step === 1) {
      detectOllama();
    }
  }, [selectedProvider, step]);

  const detectOllama = async () => {
    setOllamaDetecting(true);
    try {
      const resp = await fetch('http://localhost:11434/api/tags', { mode: 'cors' });
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        setOllamaDetected(true);
        if (models.length > 0 && !selectedModel) {
          setSelectedModel(models[0]);
        }
      }
    } catch {
      setOllamaDetected(false);
      setOllamaModels([]);
    } finally {
      setOllamaDetecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTestResult('testing');
    setTestMessage('');
    try {
      const models = await fetchChatModels();
      if (models.length > 0) {
        setAvailableModels(models);
        setTestResult('success');
        setTestMessage(`Connected! Found ${models.length} model(s).`);
      } else {
        setTestResult('success');
        setTestMessage('Connected, but no models found. The provider may have limited model access.');
      }
    } catch {
      setTestResult('error');
      setTestMessage('Connection failed. Check your provider settings and API key.');
    }
  };

  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      const config: Record<string, string> = { provider: selectedProvider };
      if (apiKey) config.api_key = apiKey;
      if (selectedModel) config.model = selectedModel;
      if (baseUrl) config.base_url = baseUrl;

      await updateChatConfig(config);
      toast.success('AI configuration saved!', {
        description: `Provider: ${selectedProvider}, Model: ${selectedModel || 'default'}`,
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

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <IconSparkles className="h-12 w-12 text-indigo-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold">Choose your AI Provider</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select the LLM provider to power smart features
              </p>
            </div>
            <div className="grid gap-3">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                    selectedProvider === p.id
                      ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                      : 'border-border hover:border-indigo-200 hover:bg-accent'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 rounded-xl p-2.5 ${
                      selectedProvider === p.id
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </div>
                  {selectedProvider === p.id && (
                    <IconCheck className="h-5 w-5 text-indigo-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Configure {providers.find((p) => p.id === selectedProvider)?.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedProvider === 'ollama'
                  ? 'We\'ll auto-detect your local Ollama instance'
                  : 'Enter your API key and model preferences'}
              </p>
            </div>

            {selectedProvider === 'ollama' ? (
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    {ollamaDetecting ? (
                      <IconLoader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    ) : ollamaDetected ? (
                      <IconCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <IconAlertCircle className="h-5 w-5 text-amber-500" />
                    )}
                    <div>
                      <div className="font-medium text-sm">
                        {ollamaDetecting
                          ? 'Detecting Ollama…'
                          : ollamaDetected
                          ? `Ollama detected — ${ollamaModels.length} model(s) available`
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
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {ollamaModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Base URL (optional)</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      selectedProvider === 'openai'
                        ? 'sk-…'
                        : selectedProvider === 'anthropic'
                        ? 'sk-ant-…'
                        : 'API key'
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Your key is stored securely on the server.
                  </p>
                </div>

                {selectedProvider === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://your-api.example.com"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="model">Model (optional)</Label>
                  <Input
                    id="model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder={
                      selectedProvider === 'openai'
                        ? 'gpt-4o-mini'
                        : selectedProvider === 'anthropic'
                        ? 'claude-sonnet-4-20250514'
                        : 'Model name'
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Test & Finish</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Verify your connection works
              </p>
            </div>

            {/* Config summary */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <Badge variant="outline" className="capitalize">{selectedProvider}</Badge>
                </div>
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
              </CardContent>
            </Card>

            {/* Test button */}
            <div className="flex flex-col items-center gap-3">
              <Button
                onClick={handleTestConnection}
                disabled={testResult === 'testing'}
                size="lg"
                className="w-full"
                variant={testResult === 'success' ? 'outline' : 'default'}
              >
                {testResult === 'testing' ? (
                  <>
                    <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing connection…
                  </>
                ) : testResult === 'success' ? (
                  <>
                    <IconCheck className="mr-2 h-4 w-4 text-green-500" />
                    Test Again
                  </>
                ) : (
                  <>
                    <IconPlugConnected className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>

              {testMessage && (
                <div
                  className={`text-sm text-center ${
                    testResult === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {testMessage}
                </div>
              )}

              {/* Show available models */}
              {availableModels.length > 0 && (
                <div className="w-full space-y-2">
                  <Label className="text-xs text-muted-foreground">Available Models</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableModels.map((m) => (
                      <Badge key={m.id} variant="secondary" className="text-xs">
                        {m.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconRobot className="h-5 w-5 text-indigo-500" />
            AI Setup
            <Badge variant="outline" className="text-xs ml-auto">
              Step {step + 1}/3
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-indigo-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {renderStepContent()}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <IconChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>
              Next
              <IconChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? (
                <>
                  <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <IconSparkles className="mr-1.5 h-4 w-4" />
                  Start using AI
                </>
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
  if (!config) return null;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-2 w-2 rounded-full ${
          config.configured ? 'bg-green-500' : 'bg-slate-300'
        }`}
      />
      <span className="text-sm">
        {config.configured
          ? `${config.provider.charAt(0).toUpperCase() + config.provider.slice(1)} ${config.model} connected`
          : 'Not configured'}
      </span>
    </div>
  );
}
