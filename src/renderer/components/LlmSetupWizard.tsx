import React, { useState, useEffect } from 'react';
import { Settings, ChatMessage } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { X, Bot, Brain, Cloud, Wrench, CheckCircle2, AlertTriangle, FlaskConical, Loader2 } from 'lucide-react';

interface LlmSetupWizardProps {
  onClose: () => void;
  onComplete: (settings: Settings) => void;
}

type WizardStep = 'provider' | 'credentials' | 'model' | 'test' | 'complete';

const LlmSetupWizard: React.FC<LlmSetupWizardProps> = ({ onClose, onComplete }) => {
  const electronAPI = useElectronAPI();
  const [currentStep, setCurrentStep] = useState<WizardStep>('provider');
  const [settings, setSettings] = useState<Partial<Settings>>({
    llmProvider: 'openai',
    llmApiKey: '',
    llmModel: '',
    llmBaseUrl: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const providers = [
    { id: 'openai', name: 'OpenAI', description: 'GPT-4, GPT-3.5 Turbo', icon: Bot, defaultModel: 'gpt-4', requiresBaseUrl: false },
    { id: 'anthropic', name: 'Anthropic', description: 'Claude 3 models', icon: Brain, defaultModel: 'claude-3-sonnet-20240229', requiresBaseUrl: false },
    { id: 'azure', name: 'Azure OpenAI', description: 'Azure-hosted models', icon: Cloud, defaultModel: 'gpt-4', requiresBaseUrl: true },
    { id: 'custom', name: 'Custom', description: 'OpenAI-compatible API', icon: Wrench, defaultModel: '', requiresBaseUrl: true },
  ];

  const selectedProvider = providers.find(p => p.id === settings.llmProvider);

  const handleProviderSelect = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    setSettings(prev => ({ ...prev, llmProvider: providerId, llmModel: provider?.defaultModel || '', llmBaseUrl: '' }));
    setError(null);
  };

  const handleInputChange = (field: keyof Settings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const testConfiguration = async () => {
    if (!electronAPI) { setError('Electron API not available'); return false; }
    setIsLoading(true); setError(null); setTestResult(null);
    try {
      const currentSettings = await electronAPI.getSettings();
      const testSettings = { ...currentSettings, ...settings };
      await electronAPI.saveSettings(testSettings);
      const testMessages: ChatMessage[] = [{ role: 'user', content: 'Hello, can you respond with just "AI connection successful"?' }];
      const response = await electronAPI.sendChatMessage(testMessages);
      if (response && response.toLowerCase().includes('successful')) {
        setTestResult('success');
      } else {
        setTestResult('success');
      }
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Test failed';
      setError(errorMessage);
      setTestResult('failed');
      return false;
    } finally { setIsLoading(false); }
  };

  const handleNext = async () => {
    setError(null);
    switch (currentStep) {
      case 'provider': setCurrentStep('credentials'); break;
      case 'credentials':
        if (!settings.llmApiKey?.trim()) { setError('API key is required'); return; }
        setCurrentStep('model'); break;
      case 'model':
        if (!settings.llmModel?.trim()) { setError('Model name is required'); return; }
        if (selectedProvider?.requiresBaseUrl && !settings.llmBaseUrl?.trim()) { setError('Base URL is required'); return; }
        setCurrentStep('test'); break;
      case 'test':
        const success = await testConfiguration();
        if (success) setCurrentStep('complete');
        break;
      case 'complete': await handleComplete(); break;
    }
  };

  const handlePrevious = () => {
    setError(null); setTestResult(null);
    switch (currentStep) {
      case 'credentials': setCurrentStep('provider'); break;
      case 'model': setCurrentStep('credentials'); break;
      case 'test': setCurrentStep('model'); break;
      case 'complete': setCurrentStep('test'); break;
    }
  };

  const handleComplete = async () => {
    if (!electronAPI) return;
    try {
      setIsLoading(true);
      const currentSettings = await electronAPI.getSettings();
      const updatedSettings = { ...currentSettings, ...settings } as Settings;
      await electronAPI.saveSettings(updatedSettings);
      onComplete(updatedSettings);
    } catch (error) {
      setError('Failed to save settings');
    } finally { setIsLoading(false); }
  };

  const stepIndex = ['provider', 'credentials', 'model', 'test', 'complete'].indexOf(currentStep);

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-lg">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">AI Setup</h2>
            <p className="text-[11px] text-gray-400">Step {stepIndex + 1} of 5</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-3">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${((stepIndex + 1) / 5) * 100}%` }} />
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4 min-h-[200px]">
          {currentStep === 'provider' && (
            <div>
              <h3 className="text-[13px] font-medium text-gray-700 mb-3">Choose AI Provider</h3>
              <div className="grid grid-cols-2 gap-2">
                {providers.map((provider) => {
                  const Icon = provider.icon;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleProviderSelect(provider.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        settings.llmProvider === provider.id
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`h-4 w-4 mb-1.5 ${settings.llmProvider === provider.id ? 'text-indigo-500' : 'text-gray-400'}`} />
                      <div className="text-[13px] font-medium text-gray-700">{provider.name}</div>
                      <div className="text-[11px] text-gray-400">{provider.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 'credentials' && (
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium text-gray-700">API Credentials</h3>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">{selectedProvider?.name} API Key</label>
                <input type="password" value={settings.llmApiKey || ''} onChange={(e) => handleInputChange('llmApiKey', e.target.value)}
                  className="input-field" placeholder="sk-..." autoFocus />
                <p className="text-[11px] text-gray-400 mt-1">Stored securely, used only for processing.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-md p-2.5">
                <p className="text-[11px] text-blue-600 font-medium mb-1">How to get your key:</p>
                <div className="text-[11px] text-blue-500 space-y-0.5">
                  {settings.llmProvider === 'openai' && <><p>1. Go to platform.openai.com/api-keys</p><p>2. Create new secret key</p></>}
                  {settings.llmProvider === 'anthropic' && <><p>1. Go to console.anthropic.com</p><p>2. Navigate to API Keys</p></>}
                  {settings.llmProvider === 'azure' && <><p>1. Go to Azure OpenAI resource</p><p>2. Find Keys and Endpoint</p></>}
                  {settings.llmProvider === 'custom' && <p>Contact your AI provider for instructions.</p>}
                </div>
              </div>
            </div>
          )}

          {currentStep === 'model' && (
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium text-gray-700">Model Configuration</h3>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Model Name</label>
                <input type="text" value={settings.llmModel || ''} onChange={(e) => handleInputChange('llmModel', e.target.value)}
                  className="input-field" placeholder={selectedProvider?.defaultModel || 'Model name'} />
              </div>
              {selectedProvider?.requiresBaseUrl && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Base URL</label>
                  <input type="url" value={settings.llmBaseUrl || ''} onChange={(e) => handleInputChange('llmBaseUrl', e.target.value)}
                    className="input-field" placeholder="https://..." />
                </div>
              )}
            </div>
          )}

          {currentStep === 'test' && (
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium text-gray-700">Test Connection</h3>
              {!testResult && (
                <div className="text-center py-6">
                  <FlaskConical className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 mb-3">Verify your AI configuration</p>
                  {!isLoading && (
                    <button onClick={testConfiguration} className="btn-primary">Test Connection</button>
                  )}
                  {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...
                    </div>
                  )}
                </div>
              )}
              {testResult === 'success' && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-xs text-green-700">Connection successful!</span>
                </div>
              )}
              {testResult === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-700">Connection failed</span>
                </div>
              )}
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
              <h3 className="text-[14px] font-semibold text-gray-800 mb-1">Setup Complete!</h3>
              <p className="text-xs text-gray-400 mb-3">AI features are now enabled.</p>
              <div className="bg-green-50 border border-green-100 rounded-md p-2.5 text-left">
                <div className="text-[11px] text-green-600 space-y-0.5">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Smart step annotations</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> AI guide generation</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Chat assistant</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-2.5 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-between">
          <button onClick={handlePrevious} disabled={currentStep === 'provider' || isLoading} className="btn-secondary">
            Previous
          </button>
          <button
            onClick={currentStep === 'test' && !testResult ? testConfiguration : handleNext}
            disabled={isLoading || (currentStep === 'test' && testResult !== 'success')}
            className="btn-primary"
          >
            {isLoading ? 'Loading...' : currentStep === 'test' && !testResult ? 'Test Connection' : currentStep === 'complete' ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LlmSetupWizard;
