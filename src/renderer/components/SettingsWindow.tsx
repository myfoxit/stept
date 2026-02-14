import React, { useState, useEffect } from 'react';
import { Settings } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';

interface SettingsWindowProps {
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({ onClose, onSettingsChange }) => {
  const electronAPI = useElectronAPI();
  const [settings, setSettings] = useState<Settings>({
    cloudEndpoint: '',
    chatApiUrl: '',
    apiKey: '',
    llmProvider: 'openai',
    llmApiKey: '',
    llmModel: '',
    llmBaseUrl: '',
    autoAnnotateSteps: true,
    autoGenerateGuide: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'advanced'>('general');

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!electronAPI) return;

      try {
        const currentSettings = await electronAPI.getSettings();
        setSettings(currentSettings);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setError('Failed to load settings');
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [electronAPI]);

  // Handle input change
  const handleInputChange = (field: keyof Settings, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
    setSuccessMessage(null);
  };

  // Handle save
  const handleSave = async () => {
    if (!electronAPI) return;

    try {
      setIsSaving(true);
      setError(null);

      await electronAPI.saveSettings(settings);
      setSuccessMessage('Settings saved successfully!');
      
      if (onSettingsChange) {
        onSettingsChange(settings);
      }

      // Auto-close after successful save
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    if (!electronAPI) return;

    try {
      setIsSaving(true);
      setError(null);

      await electronAPI.resetSettings();
      const defaultSettings = await electronAPI.getSettings();
      setSettings(defaultSettings);
      setSuccessMessage('Settings reset to defaults!');
      
      if (onSettingsChange) {
        onSettingsChange(defaultSettings);
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to reset settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div className="dialog-content max-w-2xl">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            ✕
          </button>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-200 p-4">
            <nav className="space-y-2">
              {[
                { id: 'general', label: '⚙️ General', tab: 'general' },
                { id: 'ai', label: '🤖 AI Settings', tab: 'ai' },
                { id: 'advanced', label: '🔧 Advanced', tab: 'advanced' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.tab as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === item.tab 
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 max-h-96 overflow-y-auto scrollbar-thin">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div className="settings-section">
                  <h3>Cloud Integration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cloud Endpoint
                      </label>
                      <input
                        type="url"
                        value={settings.cloudEndpoint}
                        onChange={(e) => handleInputChange('cloudEndpoint', e.target.value)}
                        className="input-field"
                        placeholder="https://api.ondoki.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The base URL for the Ondoki cloud service
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => handleInputChange('apiKey', e.target.value)}
                        className="input-field"
                        placeholder="Enter your API key"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Your personal API key for cloud uploads
                      </p>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Recording Preferences</h3>
                  <div className="space-y-4">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.autoAnnotateSteps}
                        onChange={(e) => handleInputChange('autoAnnotateSteps', e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">
                          Auto-annotate steps
                        </span>
                        <p className="text-xs text-gray-500">
                          Automatically generate descriptions for recorded steps using AI
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.autoGenerateGuide}
                        onChange={(e) => handleInputChange('autoGenerateGuide', e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">
                          Auto-generate guide
                        </span>
                        <p className="text-xs text-gray-500">
                          Automatically create a guide when recording is complete
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* AI Settings */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="settings-section">
                  <h3>AI Provider</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Provider
                      </label>
                      <select
                        value={settings.llmProvider}
                        onChange={(e) => handleInputChange('llmProvider', e.target.value)}
                        className="input-field"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="azure">Azure OpenAI</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={settings.llmApiKey}
                        onChange={(e) => handleInputChange('llmApiKey', e.target.value)}
                        className="input-field"
                        placeholder="Enter your AI provider API key"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Model
                      </label>
                      <input
                        type="text"
                        value={settings.llmModel}
                        onChange={(e) => handleInputChange('llmModel', e.target.value)}
                        className="input-field"
                        placeholder={
                          settings.llmProvider === 'openai' ? 'gpt-4' :
                          settings.llmProvider === 'anthropic' ? 'claude-3-sonnet-20240229' :
                          'Model name'
                        }
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The AI model to use for annotations and guide generation
                      </p>
                    </div>

                    {settings.llmProvider === 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Base URL
                        </label>
                        <input
                          type="url"
                          value={settings.llmBaseUrl}
                          onChange={(e) => handleInputChange('llmBaseUrl', e.target.value)}
                          className="input-field"
                          placeholder="https://api.your-provider.com"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Custom API endpoint for your AI provider
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <span className="text-amber-500 mt-0.5">⚠️</span>
                    <div>
                      <h4 className="text-sm font-medium text-amber-800">Important</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        AI features require a valid API key. Your key is stored securely and only used for 
                        processing your recordings locally.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Settings */}
            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div className="settings-section">
                  <h3>Chat Service</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chat API URL
                      </label>
                      <input
                        type="url"
                        value={settings.chatApiUrl}
                        onChange={(e) => handleInputChange('chatApiUrl', e.target.value)}
                        className="input-field"
                        placeholder="https://api.ondoki.com/chat"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Override the default chat service endpoint
                      </p>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Reset Options</h3>
                  <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-red-800 mb-2">
                        Reset All Settings
                      </h4>
                      <p className="text-sm text-red-700 mb-3">
                        This will reset all settings to their default values. This action cannot be undone.
                      </p>
                      <button
                        onClick={handleReset}
                        disabled={isSaving}
                        className="btn-destructive text-sm"
                      >
                        Reset to Defaults
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <div className="flex-1">
            {error && (
              <div className="flex items-center space-x-2 text-red-600">
                <span>⚠️</span>
                <span className="text-sm">{error}</span>
              </div>
            )}
            {successMessage && (
              <div className="flex items-center space-x-2 text-green-600">
                <span>✅</span>
                <span className="text-sm">{successMessage}</span>
              </div>
            )}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="btn-secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;