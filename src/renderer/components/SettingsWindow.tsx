import React, { useEffect, useState } from 'react';
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
    llmProvider: '',
    llmApiKey: '',
    llmModel: '',
    llmBaseUrl: '',
    autoAnnotateSteps: true,
    autoGenerateGuide: false,
    frontendUrl: 'http://localhost:5173',
    minimizeOnRecord: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!electronAPI) return;
      try {
        const s = await electronAPI.getSettings();
        setSettings(s);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [electronAPI]);

  const handleInputChange = (field: keyof Settings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!electronAPI) return;
    try {
      setIsSaving(true);
      // AI settings are web-managed: keep existing values untouched.
      const { llmProvider, llmApiKey, llmModel, llmBaseUrl, ...rest } = settings;
      await electronAPI.saveSettings(rest);
      onSettingsChange?.(settings);
      setTimeout(onClose, 200);
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="dialog-overlay"><div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>Loading…</div></div>;
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--card)', borderRadius: 14, width: 440, maxWidth: '92vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Settings</div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            AI configuration is managed by Ondoki Web.
          </div>

          <div>
            <div className="field-label">Frontend URL</div>
            <input className="text-input" value={settings.frontendUrl || ''} onChange={(e) => handleInputChange('frontendUrl', e.target.value)} />
          </div>

          <div>
            <div className="field-label">Chat API URL</div>
            <input className="text-input" value={settings.chatApiUrl || ''} onChange={(e) => handleInputChange('chatApiUrl', e.target.value)} />
          </div>

          <div>
            <div className="field-label">Cloud Endpoint URL</div>
            <input className="text-input" value={settings.cloudEndpoint || ''} onChange={(e) => handleInputChange('cloudEndpoint', e.target.value)} />
          </div>

          <div>
            <div className="field-label">API Key (Optional)</div>
            <input className="text-input" type="password" value={settings.apiKey || ''} onChange={(e) => handleInputChange('apiKey', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', padding: 14 }}>
          <button className="btn-sm ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="btn-sm primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;
