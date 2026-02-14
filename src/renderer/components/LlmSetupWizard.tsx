import React, { useState, useEffect } from 'react';
import { Settings, ChatMessage } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';

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

  // Provider options
  const providers = [
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'GPT-4, GPT-3.5 Turbo and other OpenAI models',
      logo: '🤖',
      defaultModel: 'gpt-4',
      requiresBaseUrl: false,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Claude 3 and other Anthropic models',
      logo: '🧠',
      defaultModel: 'claude-3-sonnet-20240229',
      requiresBaseUrl: false,
    },
    {
      id: 'azure',
      name: 'Azure OpenAI',
      description: 'OpenAI models hosted on Microsoft Azure',
      logo: '☁️',
      defaultModel: 'gpt-4',
      requiresBaseUrl: true,
    },
    {
      id: 'custom',
      name: 'Custom',
      description: 'Use a custom OpenAI-compatible API',
      logo: '⚙️',
      defaultModel: '',
      requiresBaseUrl: true,
    },
  ];

  const selectedProvider = providers.find(p => p.id === settings.llmProvider);

  // Handle provider selection
  const handleProviderSelect = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    setSettings(prev => ({
      ...prev,
      llmProvider: providerId,
      llmModel: provider?.defaultModel || '',
      llmBaseUrl: '',
    }));
    setError(null);
  };

  // Handle input change
  const handleInputChange = (field: keyof Settings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
  };

  // Test the configuration
  const testConfiguration = async () => {
    if (!electronAPI) {
      setError('Electron API not available');
      return false;
    }

    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      // Save the current settings temporarily
      const currentSettings = await electronAPI.getSettings();
      const testSettings = { ...currentSettings, ...settings };
      await electronAPI.saveSettings(testSettings);

      // Test with a simple message
      const testMessages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Hello, can you respond with just "AI connection successful"?',
        }
      ];

      const response = await electronAPI.sendChatMessage(testMessages);
      
      if (response && response.toLowerCase().includes('successful')) {
        setTestResult('✅ Connection successful! AI is working properly.');
        return true;
      } else {
        setTestResult(`✅ Connection established. Response: "${response.substring(0, 100)}..."`);
        return true;
      }
    } catch (error) {
      console.error('Test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Test failed';
      setError(errorMessage);
      setTestResult(`❌ Connection failed: ${errorMessage}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle next step
  const handleNext = async () => {
    setError(null);

    switch (currentStep) {
      case 'provider':
        setCurrentStep('credentials');
        break;
      case 'credentials':
        if (!settings.llmApiKey?.trim()) {
          setError('API key is required');
          return;
        }
        setCurrentStep('model');
        break;
      case 'model':
        if (!settings.llmModel?.trim()) {
          setError('Model name is required');
          return;
        }
        if (selectedProvider?.requiresBaseUrl && !settings.llmBaseUrl?.trim()) {
          setError('Base URL is required for this provider');
          return;
        }
        setCurrentStep('test');
        break;
      case 'test':
        const success = await testConfiguration();
        if (success) {
          setCurrentStep('complete');
        }
        break;
      case 'complete':
        await handleComplete();
        break;
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    setError(null);
    setTestResult(null);

    switch (currentStep) {
      case 'credentials':
        setCurrentStep('provider');
        break;
      case 'model':
        setCurrentStep('credentials');
        break;
      case 'test':
        setCurrentStep('model');
        break;
      case 'complete':
        setCurrentStep('test');
        break;
    }
  };

  // Complete setup
  const handleComplete = async () => {
    if (!electronAPI) return;

    try {
      setIsLoading(true);
      const currentSettings = await electronAPI.getSettings();
      const updatedSettings = { ...currentSettings, ...settings } as Settings;
      await electronAPI.saveSettings(updatedSettings);
      onComplete(updatedSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setError('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  // Get step progress
  const getStepProgress = () => {
    const steps: WizardStep[] = ['provider', 'credentials', 'model', 'test', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">AI Setup Wizard</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              ✕
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4">
            <div className="progress-bar">
              <div 
                className="progress-bar-fill transition-all duration-500"
                style={{ width: `${getStepProgress()}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Step {['provider', 'credentials', 'model', 'test', 'complete'].indexOf(currentStep) + 1} of 5
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="wizard-step">
            {/* Provider selection */}
            {currentStep === 'provider' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Choose AI Provider
                </h3>
                <p className="text-gray-600 mb-6">
                  Select the AI service you want to use for smart annotations and guide generation.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      onClick={() => handleProviderSelect(provider.id)}
                      className={`capture-card cursor-pointer ${
                        settings.llmProvider === provider.id ? 'selected' : ''
                      }`}
                    >
                      <div className="flex items-start space-x-4">
                        <span className="text-3xl">{provider.logo}</span>
                        <div>
                          <h4 className="font-semibold text-gray-900">{provider.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">{provider.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Credentials */}
            {currentStep === 'credentials' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  API Credentials
                </h3>
                <p className="text-gray-600 mb-6">
                  Enter your {selectedProvider?.name} API key to authenticate with their service.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedProvider?.name} API Key
                    </label>
                    <input
                      type="password"
                      value={settings.llmApiKey || ''}
                      onChange={(e) => handleInputChange('llmApiKey', e.target.value)}
                      className="input-field"
                      placeholder="sk-..."
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Your API key is stored securely and only used for processing your recordings.
                    </p>
                  </div>

                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">
                      How to get your API key:
                    </h4>
                    <div className="text-sm text-blue-700 space-y-1">
                      {settings.llmProvider === 'openai' && (
                        <>
                          <p>1. Go to <a href="https://platform.openai.com/api-keys" className="underline" target="_blank">platform.openai.com/api-keys</a></p>
                          <p>2. Click "Create new secret key"</p>
                          <p>3. Copy the key and paste it above</p>
                        </>
                      )}
                      {settings.llmProvider === 'anthropic' && (
                        <>
                          <p>1. Go to <a href="https://console.anthropic.com/" className="underline" target="_blank">console.anthropic.com</a></p>
                          <p>2. Navigate to API Keys section</p>
                          <p>3. Create a new key and copy it</p>
                        </>
                      )}
                      {settings.llmProvider === 'azure' && (
                        <>
                          <p>1. Go to your Azure OpenAI resource</p>
                          <p>2. Find "Keys and Endpoint" in the resource management</p>
                          <p>3. Copy one of the keys</p>
                        </>
                      )}
                      {settings.llmProvider === 'custom' && (
                        <p>Contact your AI service provider for API key instructions.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Model configuration */}
            {currentStep === 'model' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Model Configuration
                </h3>
                <p className="text-gray-600 mb-6">
                  Configure the specific model and endpoint for your AI provider.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Model Name
                    </label>
                    <input
                      type="text"
                      value={settings.llmModel || ''}
                      onChange={(e) => handleInputChange('llmModel', e.target.value)}
                      className="input-field"
                      placeholder={selectedProvider?.defaultModel || 'Enter model name'}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The specific model to use (e.g., gpt-4, claude-3-sonnet-20240229)
                    </p>
                  </div>

                  {selectedProvider?.requiresBaseUrl && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Base URL
                      </label>
                      <input
                        type="url"
                        value={settings.llmBaseUrl || ''}
                        onChange={(e) => handleInputChange('llmBaseUrl', e.target.value)}
                        className="input-field"
                        placeholder={
                          settings.llmProvider === 'azure' 
                            ? 'https://your-resource.openai.azure.com/' 
                            : 'https://api.your-provider.com'
                        }
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {settings.llmProvider === 'azure' 
                          ? 'Your Azure OpenAI endpoint URL'
                          : 'The base URL for your custom API'
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Test connection */}
            {currentStep === 'test' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Test Connection
                </h3>
                <p className="text-gray-600 mb-6">
                  Let's test your configuration to make sure everything is working correctly.
                </p>

                <div className="space-y-4">
                  {!testResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                      <span className="text-4xl mb-4 block">🧪</span>
                      <p className="text-gray-600 mb-4">
                        Click "Test Connection" to verify your AI configuration.
                      </p>
                    </div>
                  )}

                  {testResult && (
                    <div className={`border rounded-lg p-4 ${
                      testResult.includes('❌') 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-green-50 border-green-200'
                    }`}>
                      <p className={`text-sm ${
                        testResult.includes('❌') ? 'text-red-700' : 'text-green-700'
                      }`}>
                        {testResult}
                      </p>
                    </div>
                  )}

                  {!testResult && (
                    <button
                      onClick={testConfiguration}
                      disabled={isLoading}
                      className="btn-primary w-full"
                    >
                      {isLoading ? 'Testing...' : 'Test Connection'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Complete */}
            {currentStep === 'complete' && (
              <div>
                <div className="text-center">
                  <span className="text-6xl mb-4 block">🎉</span>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Setup Complete!
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Your AI configuration has been saved successfully. You can now use smart annotations 
                    and guide generation features.
                  </p>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h4 className="text-sm font-medium text-green-800 mb-2">What's enabled:</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>✅ Smart step annotations</li>
                      <li>✅ AI-powered guide generation</li>
                      <li>✅ Chat assistant with recording context</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <span className="text-red-500">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="wizard-navigation">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 'provider' || isLoading}
            className="btn-secondary"
          >
            Previous
          </button>

          <button
            onClick={currentStep === 'test' && !testResult ? testConfiguration : handleNext}
            disabled={isLoading || (currentStep === 'test' && !testResult?.includes('✅'))}
            className="btn-primary"
          >
            {isLoading ? 'Loading...' : 
             currentStep === 'test' && !testResult ? 'Test Connection' :
             currentStep === 'complete' ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LlmSetupWizard;