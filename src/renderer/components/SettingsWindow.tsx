import React, { useState, useEffect } from 'react';
import { Settings } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { OndokiLogoSmall } from './OndokiLogo';

interface SettingsWindowProps {
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

type LlmProvider = 'ondoki' | 'openai' | 'anthropic' | 'gemini' | 'custom';

const MODEL_OPTIONS: { id: LlmProvider; name: string; desc: string; iconBg: string; iconColor: string; iconContent: React.ReactNode }[] = [
  { id: 'ondoki', name: 'Ondoki', desc: 'Default · Built-in', iconBg: 'rgba(108,92,231,0.08)', iconColor: '#6C5CE7', iconContent: <OndokiLogoSmall /> },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o, GPT-4', iconBg: '#E8F5E8', iconColor: '#10A37F', iconContent: <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>G</span> },
  { id: 'anthropic', name: 'Claude', desc: 'Sonnet, Opus, Haiku', iconBg: '#FFF0E6', iconColor: '#D97706', iconContent: <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>C</span> },
  { id: 'gemini', name: 'Gemini', desc: 'Pro, Flash, Ultra', iconBg: '#E8F0FE', iconColor: '#4285F4', iconContent: <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>G</span> },
  { id: 'custom', name: 'Custom (Ollama)', desc: 'Self-hosted · Local inference', iconBg: '#F0F0F4', iconColor: '#555', iconContent: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v8M8 12h8"/></svg>
  )},
];

const SettingsWindow: React.FC<SettingsWindowProps> = ({ onClose, onSettingsChange }) => {
  const electronAPI = useElectronAPI();
  const [settings, setSettings] = useState<Settings>({
    cloudEndpoint: '', chatApiUrl: '', apiKey: '', llmProvider: 'ondoki',
    llmApiKey: '', llmModel: '', llmBaseUrl: '', autoAnnotateSteps: true, autoGenerateGuide: false,
    frontendUrl: 'http://localhost:5173',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showLlmSetup, setShowLlmSetup] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!electronAPI) return;
      try {
        const s = await electronAPI.getSettings();
        setSettings(s);
        setIsLoading(false);
      } catch { setIsLoading(false); }
    };
    loadSettings();
  }, [electronAPI]);

  const handleInputChange = (field: keyof Settings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!electronAPI) return;
    try {
      setIsSaving(true);
      await electronAPI.saveSettings(settings);
      onSettingsChange?.(settings);
      setTimeout(onClose, 300);
    } catch (e) {
      console.error('Failed to save:', e);
    } finally { setIsSaving(false); }
  };

  const selectedModel = (settings.llmProvider || 'ondoki') as LlmProvider;
  const showConfig = selectedModel !== 'ondoki';

  const getEndpointDefaults = (provider: LlmProvider) => {
    switch (provider) {
      case 'openai': return { endpoint: 'https://api.openai.com/v1', label: 'OpenAI Endpoint' };
      case 'anthropic': return { endpoint: 'https://api.anthropic.com/v1', label: 'Anthropic Endpoint' };
      case 'gemini': return { endpoint: 'https://generativelanguage.googleapis.com/v1', label: 'Google AI Endpoint' };
      case 'custom': return { endpoint: 'http://localhost:11434', label: 'Ollama Endpoint' };
      default: return { endpoint: '', label: 'Endpoint' };
    }
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--radius-xl)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', width: 420, maxWidth: '92vw',
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Body */}
        <div style={{ padding: '22px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }} className="scrollbar-thin">
          {/* AI Model Section */}
          <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span className="section-title">AI Model</span>
              <button className="btn-wizard" onClick={() => setShowLlmSetup(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Setup Wizard
              </button>
            </div>

            <div className="model-grid">
              {MODEL_OPTIONS.map((model) => (
                <div
                  key={model.id}
                  className={`model-card ${selectedModel === model.id ? 'selected' : ''}`}
                  style={model.id === 'custom' ? { gridColumn: 'span 2' } : undefined}
                  onClick={() => handleInputChange('llmProvider', model.id)}
                >
                  <div className="model-icon" style={{ background: model.iconBg, color: model.iconColor }}>
                    {model.iconContent}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span className="model-name">{model.name}</span>
                    <span className="model-desc">{model.desc}</span>
                  </div>
                  <div className="model-check">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic config panel */}
            {showConfig && (
              <div style={{
                marginTop: 10, padding: 12, background: 'var(--bg)',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div>
                  <span className="config-label">{getEndpointDefaults(selectedModel).label}</span>
                  <input className="text-input" style={{ fontSize: '0.78rem', padding: '9px 12px' }}
                    value={settings.llmBaseUrl || ''} placeholder={getEndpointDefaults(selectedModel).endpoint}
                    onChange={(e) => handleInputChange('llmBaseUrl', e.target.value)} />
                </div>
                {selectedModel !== 'custom' && (
                  <div>
                    <span className="config-label">API Key</span>
                    <input className="text-input" type="password" style={{ fontSize: '0.78rem', padding: '9px 12px' }}
                      value={settings.llmApiKey || ''} placeholder="sk-..."
                      onChange={(e) => handleInputChange('llmApiKey', e.target.value)} />
                  </div>
                )}
                <div>
                  <span className="config-label">Model Name</span>
                  <input className="text-input" style={{ fontSize: '0.78rem', padding: '9px 12px' }}
                    value={settings.llmModel || ''} placeholder={selectedModel === 'custom' ? 'llama3, mistral...' : 'gpt-4o'}
                    onChange={(e) => handleInputChange('llmModel', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Export Section */}
          <div>
            <span className="section-title" style={{ display: 'block', marginBottom: 14 }}>Export</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div className="field-label">Cloud Endpoint URL</div>
                <input className="text-input" style={{ fontSize: '0.78rem' }}
                  value={settings.cloudEndpoint || ''}
                  onChange={(e) => handleInputChange('cloudEndpoint', e.target.value)} />
              </div>
              <div>
                <div className="field-label">API Key (Optional)</div>
                <input className="text-input" type="password" style={{ fontSize: '0.78rem' }}
                  value={settings.apiKey || ''} placeholder="Bearer token or API key"
                  onChange={(e) => handleInputChange('apiKey', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button className="btn-sm ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="btn-sm primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;
