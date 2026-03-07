import React, { useEffect, useState, useCallback } from 'react';

interface SettingsData {
  chatApiUrl: string;
  frontendUrl: string;
  autoAnnotateSteps: boolean;
  minimizeOnRecord: boolean;
  spotlightShortcut: string;
  recordingShortcut: string;
}

const defaults: SettingsData = {
  chatApiUrl: '',
  frontendUrl: '',
  autoAnnotateSteps: true,
  minimizeOnRecord: true,
  spotlightShortcut: 'Ctrl+Shift+Space',
  recordingShortcut: 'Ctrl+Shift+R',
};

const Toggle: React.FC<{ value: boolean; onChange: () => void }> = ({
  value,
  onChange,
}) => (
  <button
    type="button"
    className={`settings-toggle${value ? ' on' : ''}`}
    onClick={onChange}
  >
    <div className="settings-toggle-knob" />
  </button>
);

const ShortcutInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.metaKey) parts.push('Cmd');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key;
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
        parts.push(
          key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key,
        );
        onChange(parts.join('+'));
      }
    },
    [onChange],
  );

  return (
    <input
      type="text"
      value={value}
      readOnly
      placeholder={placeholder}
      className="settings-input settings-input--shortcut"
      onKeyDown={handleKeyDown}
    />
  );
};

const SettingsWindow: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData>(defaults);
  const [isLoading, setIsLoading] = useState(true);
  const [accountInfo, setAccountInfo] = useState('Loading...');

  useEffect(() => {
    const init = async () => {
      const api = window.electronAPI;
      if (!api) {
        setIsLoading(false);
        return;
      }

      try {
        const s = await api.getSettings();
        setSettings({
          chatApiUrl: s.chatApiUrl || '',
          frontendUrl: s.frontendUrl || '',
          autoAnnotateSteps: s.autoAnnotateSteps !== false,
          minimizeOnRecord: s.minimizeOnRecord !== false,
          spotlightShortcut: s.spotlightShortcut || 'Ctrl+Shift+Space',
          recordingShortcut: s.recordingShortcut || 'Ctrl+Shift+R',
        });
      } catch (e) {
        console.error('Failed to load settings:', e);
      }

      try {
        const status = await api.getAuthStatus();
        setAccountInfo(
          status.isAuthenticated
            ? `Signed in as ${status.user?.name || status.user?.email || 'User'}`
            : 'Not signed in',
        );
      } catch {
        setAccountInfo('Could not fetch account status');
      }

      setIsLoading(false);
    };

    init();
  }, []);

  const update = useCallback(
    <K extends keyof SettingsData>(field: K, value: SettingsData[K]) => {
      setSettings((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    try {
      await api.saveSettings({
        chatApiUrl: settings.chatApiUrl,
        cloudEndpoint: settings.chatApiUrl.replace(
          /\/api\/v1$/,
          '/api/v1/process-recording',
        ),
        frontendUrl: settings.frontendUrl,
        autoAnnotateSteps: settings.autoAnnotateSteps,
        minimizeOnRecord: settings.minimizeOnRecord,
        spotlightShortcut: settings.spotlightShortcut,
        recordingShortcut: settings.recordingShortcut,
      });
      window.close();
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, [settings]);

  const handleLogout = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    try {
      await api.logout();
      setAccountInfo('Signed out');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="settings-page">
        <div className="settings-title">Settings</div>
        <p className="settings-account">Loading...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-title">Settings</div>

      {/* Server Configuration */}
      <div className="settings-section">
        <div className="settings-section-title">Server Configuration</div>
        <div className="settings-card">
          <label className="settings-label">API URL</label>
          <input
            type="url"
            className="settings-input"
            value={settings.chatApiUrl}
            onChange={(e) => update('chatApiUrl', e.target.value)}
            placeholder="http://localhost:8000/api/v1"
          />
          <label className="settings-label">Frontend URL</label>
          <input
            type="url"
            className="settings-input"
            value={settings.frontendUrl}
            onChange={(e) => update('frontendUrl', e.target.value)}
            placeholder="http://localhost:5173"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {/* AI Enhancement */}
      <div className="settings-section">
        <div className="settings-section-title">AI Enhancement</div>
        <div className="settings-card">
          <div className="settings-toggle-row" style={{ padding: 0 }}>
            <label className="settings-label" style={{ margin: 0 }}>
              Auto-improve step titles with AI
            </label>
            <span className="settings-hint" style={{ fontSize: '0.8em', color: '#888' }}>
              Controlled in project settings on the web
            </span>
          </div>
        </div>
      </div>

      {/* Recording */}
      <div className="settings-section">
        <div className="settings-section-title">Recording</div>
        <div className="settings-card">
          <div className="settings-toggle-row" style={{ padding: 0 }}>
            <label className="settings-label" style={{ margin: 0 }}>
              Minimize when recording starts
            </label>
            <Toggle
              value={settings.minimizeOnRecord}
              onChange={() =>
                update('minimizeOnRecord', !settings.minimizeOnRecord)
              }
            />
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="settings-section">
        <div className="settings-section-title">Keyboard Shortcuts</div>
        <div className="settings-card">
          <label className="settings-label">Open Spotlight</label>
          <ShortcutInput
            value={settings.spotlightShortcut}
            onChange={(v) => update('spotlightShortcut', v)}
            placeholder="Ctrl+Shift+Space"
          />
          <div className="settings-hint">
            Click and press your desired shortcut
          </div>
          <label className="settings-label">Start/Stop Recording</label>
          <ShortcutInput
            value={settings.recordingShortcut}
            onChange={(v) => update('recordingShortcut', v)}
            placeholder="Ctrl+Shift+R"
          />
          <div className="settings-hint">
            Click and press your desired shortcut
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div className="settings-card">
          <div className="settings-account">{accountInfo}</div>
          <button
            className="settings-btn settings-btn--danger"
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="settings-footer">
        <button
          className="settings-btn settings-btn--primary"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default SettingsWindow;
