import React, { useState, useEffect, useCallback } from 'react';
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
  IconCpu,
  IconDownload,
  IconSearch,
  IconDeviceDesktop,
  IconBrandGithub,
  IconCopy,
  IconExternalLink,
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
import { fetchChatModels, updateChatConfig, type ChatConfig, type ChatModel } from '@/api/chat';
import {
  checkWebGPUSupport,
  WEBLLM_MODELS,
  DEFAULT_MODEL,
  getEngine,
  isEngineLoaded,
  getLoadedModel,
  type WebLLMProgress,
} from '@/services/webllm';
import {
  setLocalProviderConfig,
  getLocalProviderConfig,
} from '@/services/local-chat';
import {
  startCopilotDeviceFlow,
  pollCopilotDeviceFlow,
  disconnectCopilot,
  fetchProvidersStatus,
} from '@/api/authProviders';
import { toast } from 'sonner';
import * as Progress from '@radix-ui/react-progress';

interface LlmSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

type Provider = 'openai' | 'anthropic' | 'ollama' | 'custom' | 'webllm' | 'copilot';

interface ProviderOption {
  id: Provider;
  name: string;
  description: string;
  icon: React.ReactNode;
  requiresKey: boolean;
}

const providers: ProviderOption[] = [
  {
    id: 'webllm',
    name: 'Built-in (Browser)',
    description: 'Runs locally in your browser via WebGPU — no API key needed',
    icon: <IconCpu className="h-8 w-8" />,
    requiresKey: false,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Login with GitHub — uses your Copilot subscription (GPT-4o, Claude)',
    icon: <IconBrandGithub className="h-8 w-8" />,
    requiresKey: false,
  },
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
    description: 'Run models locally with Ollama — no API key needed',
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

// ── Auto-detect result type ──────────────────────────────────────────────────

interface AutoDetectResult {
  ollama: {
    available: boolean;
    modelCount: number;
  };
  webgpu: {
    available: boolean;
    reason?: string;
  };
}

export function LlmSetupWizard({ open, onClose, onConfigSaved }: LlmSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('webllm');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);

  // ── WebLLM state ─────────────────────────────────────────────────────────
  const [webllmModel, setWebllmModel] = useState(DEFAULT_MODEL);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);
  const [webgpuReason, setWebgpuReason] = useState<string>('');
  const [webllmProgress, setWebllmProgress] = useState<WebLLMProgress | null>(null);
  const [webllmLoading, setWebllmLoading] = useState(false);
  const [webllmReady, setWebllmReady] = useState(false);

  // ── Auto-detect state ─────────────────────────────────────────────────────
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState<AutoDetectResult | null>(null);

  // ── Copilot device flow state ─────────────────────────────────────────────
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);
  const [copilotVerifyUrl, setCopilotVerifyUrl] = useState<string>('');
  const [copilotPolling, setCopilotPolling] = useState(false);
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const copilotPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Check WebGPU on mount
  useEffect(() => {
    checkWebGPUSupport().then(({ supported, reason }) => {
      setWebgpuSupported(supported);
      if (reason) setWebgpuReason(reason);
    });
  }, []);

  // Check Copilot connection status on mount
  useEffect(() => {
    fetchProvidersStatus()
      .then(({ providers }) => {
        const cp = providers.find((p) => p.provider === 'copilot');
        if (cp?.connected) setCopilotConnected(true);
      })
      .catch(() => {});
  }, []);

  // Cleanup Copilot polling on unmount
  useEffect(() => {
    return () => {
      if (copilotPollRef.current) clearInterval(copilotPollRef.current);
    };
  }, []);

  // Check if WebLLM engine is already loaded
  useEffect(() => {
    if (isEngineLoaded() && getLoadedModel() === webllmModel) {
      setWebllmReady(true);
    }
  }, [webllmModel]);

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

  // ── Auto-detect all local options ──────────────────────────────────────────

  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    const result: AutoDetectResult = {
      ollama: { available: false, modelCount: 0 },
      webgpu: { available: false },
    };

    // Check Ollama
    try {
      const resp = await fetch('http://localhost:11434/api/tags', { mode: 'cors' });
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        result.ollama = { available: true, modelCount: models.length };
        setOllamaModels(models);
        setOllamaDetected(true);
      }
    } catch {
      // Not available
    }

    // Check WebGPU
    const { supported, reason } = await checkWebGPUSupport();
    result.webgpu = { available: supported, reason };
    setWebgpuSupported(supported);
    if (reason) setWebgpuReason(reason);

    setAutoDetectResult(result);
    setAutoDetecting(false);
  }, []);

  // ── Copilot device flow handlers ───────────────────────────────────────────

  const handleStartCopilotFlow = useCallback(async () => {
    setCopilotError(null);
    setCopilotUserCode(null);
    try {
      const data = await startCopilotDeviceFlow();
      setCopilotUserCode(data.user_code);
      setCopilotVerifyUrl(data.verification_uri);

      // Start polling
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
          // pending → keep polling
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

  // ── WebLLM model loading ───────────────────────────────────────────────────

  const handleLoadWebLLM = useCallback(async () => {
    setWebllmLoading(true);
    setWebllmProgress(null);
    setWebllmReady(false);
    try {
      await getEngine(webllmModel, (progress) => {
        setWebllmProgress(progress);
      });
      setWebllmReady(true);
      toast.success('Model loaded!', {
        description: `${WEBLLM_MODELS.find((m) => m.id === webllmModel)?.label} is ready`,
      });
    } catch (err) {
      toast.error('Failed to load model', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setWebllmLoading(false);
    }
  }, [webllmModel]);

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
      if (selectedProvider === 'webllm') {
        // WebLLM is frontend-only — store config in localStorage
        setLocalProviderConfig({
          provider: 'webllm',
          webllmModel,
        });
        toast.success('AI configuration saved!', {
          description: `Provider: Built-in (Browser), Model: ${WEBLLM_MODELS.find((m) => m.id === webllmModel)?.label}`,
        });
        onConfigSaved?.();
        onClose();
      } else {
        // Remote providers (including copilot) — save to backend
        const config: Record<string, string> = { provider: selectedProvider };
        if (apiKey) config.api_key = apiKey;
        if (selectedModel) config.model = selectedModel;
        if (baseUrl) config.base_url = baseUrl;

        // For copilot, set the base URL and default model
        if (selectedProvider === 'copilot') {
          config.base_url = 'https://api.githubcopilot.com';
          if (!selectedModel) config.model = 'gpt-4o';
        }

        // Clear any local provider config
        setLocalProviderConfig({ provider: selectedProvider });

        await updateChatConfig(config);
        toast.success('AI configuration saved!', {
          description: `Provider: ${selectedProvider === 'copilot' ? 'GitHub Copilot' : selectedProvider}, Model: ${config.model || selectedModel || 'default'}`,
        });
        onConfigSaved?.();
        onClose();
      }
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

            {/* Auto-detect button */}
            <Button
              variant="outline"
              className="w-full mb-2"
              onClick={handleAutoDetect}
              disabled={autoDetecting}
            >
              {autoDetecting ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Detecting local options…
                </>
              ) : (
                <>
                  <IconSearch className="mr-2 h-4 w-4" />
                  Auto-detect local AI options
                </>
              )}
            </Button>

            {/* Auto-detect results */}
            {autoDetectResult && (
              <div className="rounded-lg border p-3 mb-2 space-y-2 text-sm">
                <div className="font-medium flex items-center gap-1.5 text-sm">
                  <IconDeviceDesktop className="h-4 w-4" />
                  Local AI options detected:
                </div>
                <div className="flex items-center gap-2 ml-5">
                  {autoDetectResult.webgpu.available ? (
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <IconAlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span>
                    WebGPU (Browser AI): {autoDetectResult.webgpu.available ? (
                      <span className="text-green-600 font-medium">Supported</span>
                    ) : (
                      <span className="text-amber-600">{autoDetectResult.webgpu.reason}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-5">
                  {autoDetectResult.ollama.available ? (
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <IconAlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span>
                    Ollama: {autoDetectResult.ollama.available ? (
                      <span className="text-green-600 font-medium">{autoDetectResult.ollama.modelCount} model(s) available</span>
                    ) : (
                      <span className="text-muted-foreground">Not running</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {providers.map((p) => {
                const isWebllmUnsupported = p.id === 'webllm' && webgpuSupported === false;
                return (
                  <button
                    key={p.id}
                    onClick={() => !isWebllmUnsupported && setSelectedProvider(p.id)}
                    disabled={isWebllmUnsupported}
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                      isWebllmUnsupported
                        ? 'border-border opacity-50 cursor-not-allowed'
                        : selectedProvider === p.id
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
                      <div className="font-semibold flex items-center gap-2">
                        {p.name}
                        {p.id === 'webllm' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            No API key
                          </Badge>
                        )}
                        {p.id === 'copilot' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            No API key
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isWebllmUnsupported
                          ? webgpuReason || 'WebGPU not supported in this browser'
                          : p.description}
                      </div>
                    </div>
                    {selectedProvider === p.id && !isWebllmUnsupported && (
                      <IconCheck className="h-5 w-5 text-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">
                Configure {providers.find((p) => p.id === selectedProvider)?.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedProvider === 'webllm'
                  ? 'Choose a model to run in your browser'
                  : selectedProvider === 'ollama'
                  ? 'We\'ll auto-detect your local Ollama instance'
                  : selectedProvider === 'copilot'
                  ? 'Login with your GitHub account to use Copilot'
                  : 'Enter your API key and model preferences'}
              </p>
            </div>

            {selectedProvider === 'webllm' ? (
              <div className="space-y-4">
                {/* WebGPU status */}
                {webgpuSupported === false && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                      <IconAlertCircle className="h-4 w-4" />
                      WebGPU Not Available
                    </div>
                    <p className="text-xs text-amber-600 mt-1">{webgpuReason}</p>
                  </div>
                )}

                {/* Model picker */}
                <div className="space-y-3">
                  <Label>Select Model</Label>
                  {WEBLLM_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setWebllmModel(model.id)}
                      className={`w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                        webllmModel === model.id
                          ? 'border-indigo-500 bg-indigo-50/50'
                          : 'border-border hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {model.label}
                          <Badge variant="outline" className="text-[10px]">
                            {model.sizeHint}
                          </Badge>
                          {model.id === DEFAULT_MODEL && (
                            <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {model.description}
                        </div>
                      </div>
                      {webllmModel === model.id && (
                        <IconCheck className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Download / Load model */}
                <div className="space-y-3">
                  {webllmReady ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                        <IconCheck className="h-4 w-4" />
                        Model ready!
                      </div>
                      <p className="text-xs text-green-600 mt-0.5">
                        {WEBLLM_MODELS.find((m) => m.id === webllmModel)?.label} is loaded and ready to use.
                      </p>
                    </div>
                  ) : webllmLoading ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <IconLoader2 className="h-4 w-4 animate-spin text-indigo-500" />
                        <span className="text-muted-foreground">
                          {webllmProgress?.text || 'Initializing…'}
                        </span>
                      </div>
                      <Progress.Root
                        className="relative overflow-hidden rounded-full bg-muted h-2 w-full"
                        value={(webllmProgress?.progress ?? 0) * 100}
                      >
                        <Progress.Indicator
                          className="bg-indigo-500 h-full transition-transform duration-300 ease-out"
                          style={{
                            width: `${(webllmProgress?.progress ?? 0) * 100}%`,
                          }}
                        />
                      </Progress.Root>
                      <p className="text-xs text-muted-foreground text-center">
                        {Math.round((webllmProgress?.progress ?? 0) * 100)}% complete
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleLoadWebLLM}
                      disabled={webgpuSupported === false}
                      className="w-full"
                      variant="outline"
                    >
                      <IconDownload className="mr-2 h-4 w-4" />
                      Download &amp; Load Model ({WEBLLM_MODELS.find((m) => m.id === webllmModel)?.sizeHint})
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Models are cached in your browser — only downloaded once.
                    {!webllmReady && !webllmLoading && ' You can also skip this step and load on first use.'}
                  </p>
                </div>
              </div>
            ) : selectedProvider === 'copilot' ? (
              <div className="space-y-4">
                {copilotConnected ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-2 text-green-700 font-medium">
                      <IconCheck className="h-5 w-5" />
                      GitHub Copilot Connected
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      Your Copilot subscription is active. You can use GPT-4o, Claude, and other models.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleCopilotDisconnect}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : copilotUserCode ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center">
                      <p className="text-sm text-indigo-700 mb-3">
                        Enter this code on GitHub:
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <code className="text-3xl font-mono font-bold tracking-[0.25em] text-indigo-900 bg-white px-4 py-2 rounded-lg border">
                          {copilotUserCode}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            navigator.clipboard.writeText(copilotUserCode);
                            toast.success('Code copied!');
                          }}
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      onClick={() => window.open(copilotVerifyUrl, '_blank')}
                    >
                      <IconExternalLink className="mr-2 h-4 w-4" />
                      Open GitHub to authorize
                    </Button>

                    {copilotPolling && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <IconLoader2 className="h-4 w-4 animate-spin" />
                        Waiting for authorization…
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4 text-center">
                      <IconBrandGithub className="h-12 w-12 mx-auto mb-3 text-foreground" />
                      <h3 className="font-semibold mb-1">Login with GitHub</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Authenticate with your GitHub account to use Copilot's AI models.
                        Requires an active GitHub Copilot subscription.
                      </p>
                      <Button onClick={handleStartCopilotFlow} className="w-full">
                        <IconBrandGithub className="mr-2 h-4 w-4" />
                        Start GitHub Login
                      </Button>
                    </div>

                    {copilotError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="flex items-center gap-2 text-red-700 text-sm">
                          <IconAlertCircle className="h-4 w-4" />
                          {copilotError}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Model selection for Copilot */}
                {copilotConnected && (
                  <div className="space-y-2">
                    <Label htmlFor="copilot-model">Model</Label>
                    <Select value={selectedModel || 'gpt-4o'} onValueChange={setSelectedModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                        <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                        <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Available models depend on your Copilot subscription tier.
                    </p>
                  </div>
                )}
              </div>
            ) : selectedProvider === 'ollama' ? (
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
            ) : selectedProvider === 'copilot' ? (
              <div className="space-y-4">
                {/* Device flow UI */}
                {copilotConnected ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                      <IconCheck className="h-4 w-4" />
                      GitHub Copilot connected!
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      Your Copilot subscription is active. Choose a model below.
                    </p>
                  </div>
                ) : copilotUserCode ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/50 p-4 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Enter this code on GitHub:</p>
                      <div className="flex items-center justify-center gap-2">
                        <code className="text-3xl font-bold tracking-widest text-foreground">
                          {copilotUserCode}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            navigator.clipboard.writeText(copilotUserCode);
                            toast.success('Code copied!');
                          }}
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>
                      </div>
                      {copilotPolling && (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <IconLoader2 className="h-4 w-4 animate-spin" />
                          Waiting for authorization…
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => window.open(copilotVerifyUrl, '_blank')}
                      className="w-full"
                    >
                      <IconExternalLink className="mr-2 h-4 w-4" />
                      Open GitHub & Authorize
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <IconBrandGithub className="h-5 w-5" />
                        Login with your GitHub account
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click below to start the device flow. You'll get a code to enter on GitHub.
                        Once authorized, Copilot will be ready — no API key needed.
                      </p>
                    </div>
                    <Button onClick={handleStartCopilotFlow} className="w-full">
                      <IconBrandGithub className="mr-2 h-4 w-4" />
                      Login with GitHub Copilot
                    </Button>
                  </div>
                )}

                {copilotError && (
                  <p className="text-sm text-red-600">{copilotError}</p>
                )}

                {/* Model picker (always visible) */}
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={selectedModel || 'gpt-4o'} onValueChange={setSelectedModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
                      <SelectItem value="o3-mini">o3-mini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : selectedProvider === 'copilot' ? (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <IconBrandGithub className="h-5 w-5 text-indigo-500" />
                    <span className="font-medium">GitHub Copilot — Device Flow Login</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click &quot;Login with GitHub&quot; below. You&apos;ll get a code to enter on GitHub.
                    Once authorized, Copilot will be ready — no API key needed.
                  </p>
                </div>

                {copilotConnected ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                        <IconCheck className="h-4 w-4" />
                        Connected to GitHub Copilot
                      </div>
                      <Button size="sm" variant="ghost" onClick={handleCopilotDisconnect}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : copilotUserCode ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center space-y-2">
                      <p className="text-sm text-indigo-700">Enter this code on GitHub:</p>
                      <div className="text-2xl font-mono font-bold tracking-widest text-indigo-900">
                        {copilotUserCode}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(copilotVerifyUrl, '_blank')}
                      >
                        <IconExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open GitHub
                      </Button>
                    </div>
                    {copilotPolling && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <IconLoader2 className="h-4 w-4 animate-spin" />
                        Waiting for authorization…
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button onClick={handleStartCopilotFlow} className="w-full" variant="outline">
                      <IconBrandGithub className="mr-2 h-4 w-4" />
                      Login with GitHub Copilot
                    </Button>
                    {copilotError && (
                      <p className="text-sm text-red-600 text-center">{copilotError}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={selectedModel || 'gpt-4o'} onValueChange={setSelectedModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
                      <SelectItem value="o3-mini">o3-mini</SelectItem>
                    </SelectContent>
                  </Select>
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
              <h2 className="text-xl font-bold">
                {selectedProvider === 'webllm' || selectedProvider === 'copilot' ? 'Review & Finish' : 'Test & Finish'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedProvider === 'webllm' || selectedProvider === 'copilot'
                  ? 'Review your configuration'
                  : 'Verify your connection works'}
              </p>
            </div>

            {/* Config summary */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <Badge variant="outline" className="capitalize">
                    {selectedProvider === 'webllm'
                      ? 'Built-in (Browser)'
                      : selectedProvider === 'copilot'
                      ? 'GitHub Copilot'
                      : selectedProvider}
                  </Badge>
                </div>
                {selectedProvider === 'webllm' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Model</span>
                      <Badge variant="outline">
                        {WEBLLM_MODELS.find((m) => m.id === webllmModel)?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Size</span>
                      <span className="text-sm">
                        {WEBLLM_MODELS.find((m) => m.id === webllmModel)?.sizeHint}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <span className="text-sm flex items-center gap-1.5">
                        {webllmReady ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            Ready
                          </>
                        ) : (
                          <>
                            <div className="h-2 w-2 rounded-full bg-amber-400" />
                            Will load on first use
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Runs on</span>
                      <span className="text-sm">Your device (private)</span>
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

            {/* Test button (not needed for webllm or copilot) */}
            {selectedProvider !== 'webllm' && selectedProvider !== 'copilot' && (
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
            )}

            {selectedProvider === 'webllm' && !webllmReady && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm text-blue-700">
                  💡 The model will be downloaded when you first send a message.
                  This may take a moment depending on your connection speed.
                </p>
              </div>
            )}
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
  const localConfig = getLocalProviderConfig();
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);

  // Check Ollama status on mount if it's the active provider
  useEffect(() => {
    if (config?.provider === 'ollama' || localConfig.provider === 'ollama') {
      fetch('http://localhost:11434/api/tags', { mode: 'cors' })
        .then((r) => r.json())
        .then((data) => {
          const count = data.models?.length || 0;
          setOllamaStatus(`Connected, ${count} model${count !== 1 ? 's' : ''} available`);
        })
        .catch(() => {
          setOllamaStatus('Not running');
        });
    }
  }, [config?.provider, localConfig.provider]);

  // WebLLM provider (frontend-only)
  if (localConfig.provider === 'webllm') {
    const model = WEBLLM_MODELS.find((m) => m.id === localConfig.webllmModel);
    const loaded = isEngineLoaded();
    return (
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${loaded ? 'bg-green-500' : 'bg-amber-400'}`} />
        <span className="text-sm">
          Built-in (Browser) — {model?.label || 'Unknown model'}
          {loaded ? ' — ready' : ` — ${model?.sizeHint || ''} cached`}
        </span>
      </div>
    );
  }

  // Ollama provider
  if (config?.provider === 'ollama' && ollamaStatus) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            ollamaStatus.startsWith('Connected') ? 'bg-green-500' : 'bg-red-400'
          }`}
        />
        <span className="text-sm">
          Ollama — {ollamaStatus}
        </span>
      </div>
    );
  }

  // Other providers
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
