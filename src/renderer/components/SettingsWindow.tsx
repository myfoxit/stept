import React, { useState, useEffect } from 'react';
import { Settings } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { X, Settings as SettingsIcon, Bot, Wrench, Loader2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';

interface SettingsWindowProps {
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({ onClose, onSettingsChange }) => {
  const electronAPI = useElectronAPI();
  const [settings, setSettings] = useState<Settings>({
    cloudEndpoint: '', chatApiUrl: '', apiKey: '', llmProvider: 'openai',
    llmApiKey: '', llmModel: '', llmBaseUrl: '', autoAnnotateSteps: true, autoGenerateGuide: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'advanced'>('general');

  useEffect(() => {
    const loadSettings = async () => {
      if (!electronAPI) return;
      try {
        const s = await electronAPI.getSettings();
        setSettings(s); setIsLoading(false);
      } catch { setError('Failed to load settings'); setIsLoading(false); }
    };
    loadSettings();
  }, [electronAPI]);

  const handleInputChange = (field: keyof Settings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setError(null); setSuccessMessage(null);
  };

  const handleSave = async () => {
    if (!electronAPI) return;
    try {
      setIsSaving(true); setError(null);
      await electronAPI.saveSettings(settings);
      setSuccessMessage('Saved!');
      onSettingsChange?.(settings);
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setIsSaving(false); }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?') || !electronAPI) return;
    try {
      setIsSaving(true); setError(null);
      await electronAPI.resetSettings();
      const s = await electronAPI.getSettings();
      setSettings(s); setSuccessMessage('Reset!');
      onSettingsChange?.(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally { setIsSaving(false); }
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div className="card p-6 text-center max-w-xs">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-gray-400" />
          <p className="text-[13px] text-gray-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'general' as const, label: 'General', icon: SettingsIcon },
    { id: 'ai' as const, label: 'AI', icon: Bot },
    { id: 'advanced' as const, label: 'Advanced', icon: Wrench },
  ];

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-gray-800">Settings</h2>
          <button onClick={onClose} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="flex" style={{ height: '380px' }}>
          {/* Sidebar */}
          <div className="w-36 border-r p-2 space-y-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                    activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon className="h-3.5 w-3.5" />{tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 overflow-y-auto scrollbar-thin">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[13px] font-medium text-gray-700 mb-2">Cloud Integration</h3>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Cloud Endpoint</label>
                      <input type="url" value={settings.cloudEndpoint} onChange={(e) => handleInputChange('cloudEndpoint', e.target.value)}
                        className="input-field" placeholder="https://api.ondoki.com" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">API Key</label>
                      <input type="password" value={settings.apiKey} onChange={(e) => handleInputChange('apiKey', e.target.value)}
                        className="input-field" placeholder="Your API key" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-[13px] font-medium text-gray-700 mb-2">Recording</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={settings.autoAnnotateSteps}
                        onChange={(e) => handleInputChange('autoAnnotateSteps', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-500" />
                      <div>
                        <span className="text-[13px] text-gray-700">Auto-annotate steps</span>
                        <p className="text-[11px] text-gray-400">Generate descriptions with AI</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={settings.autoGenerateGuide}
                        onChange={(e) => handleInputChange('autoGenerateGuide', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-500" />
                      <div>
                        <span className="text-[13px] text-gray-700">Auto-generate guide</span>
                        <p className="text-[11px] text-gray-400">Create guide after recording</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[13px] font-medium text-gray-700 mb-2">AI Provider</h3>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Provider</label>
                      <select value={settings.llmProvider} onChange={(e) => handleInputChange('llmProvider', e.target.value)} className="input-field">
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="azure">Azure OpenAI</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">API Key</label>
                      <input type="password" value={settings.llmApiKey} onChange={(e) => handleInputChange('llmApiKey', e.target.value)}
                        className="input-field" placeholder="AI provider API key" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Model</label>
                      <input type="text" value={settings.llmModel} onChange={(e) => handleInputChange('llmModel', e.target.value)}
                        className="input-field" placeholder={settings.llmProvider === 'openai' ? 'gpt-4o-mini' : settings.llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'Model'} />
                    </div>
                    {(settings.llmProvider === 'custom' || settings.llmProvider === 'azure') && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Base URL</label>
                        <input type="url" value={settings.llmBaseUrl} onChange={(e) => handleInputChange('llmBaseUrl', e.target.value)}
                          className="input-field" placeholder="https://..." />
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-md p-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700">API keys are stored locally and only used for processing your recordings.</p>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[13px] font-medium text-gray-700 mb-2">Chat Service</h3>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Chat API URL</label>
                    <input type="url" value={settings.chatApiUrl} onChange={(e) => handleInputChange('chatApiUrl', e.target.value)}
                      className="input-field" placeholder="https://api.ondoki.com/chat" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[13px] font-medium text-gray-700 mb-2">Reset</h3>
                  <div className="bg-red-50 border border-red-100 rounded-md p-2.5">
                    <p className="text-[11px] text-red-600 mb-2">Reset all settings to defaults. Cannot be undone.</p>
                    <button onClick={handleReset} disabled={isSaving} className="btn-destructive btn-sm gap-1">
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <div>
            {error && <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</span>}
            {successMessage && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{successMessage}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={isSaving} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="btn-primary">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;
