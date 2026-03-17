import React, { useEffect, useState } from 'react';
import { sendToBackground } from '@/shared/messages';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [displayMode, setDisplayMode] = useState('sidepanel');
  const [apiUrl, setApiUrl] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [autoUpload, setAutoUpload] = useState(true);
  const [buildMode, setBuildMode] = useState('');
  const [apiSaveLabel, setApiSaveLabel] = useState('Save');
  const [frontendSaveLabel, setFrontendSaveLabel] = useState('Save');

  useEffect(() => {
    if (!open) return;
    (async () => {
      const settings = await sendToBackground<any>({ type: 'GET_SETTINGS' });
      if (settings.apiBaseUrl) setApiUrl(settings.apiBaseUrl);
      if (settings.frontendUrl) setFrontendUrl(settings.frontendUrl);
      setDisplayMode(settings.displayMode || 'sidepanel');
      setAutoUpload(settings.autoUpload !== false);
      setBuildMode(settings.buildMode || '');
    })();
  }, [open]);

  const handleModeChange = async (mode: string) => {
    setDisplayMode(mode);
    await sendToBackground({ type: 'SET_DISPLAY_MODE', displayMode: mode });
  };

  const handleAutoUploadChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setAutoUpload(e.target.checked);
    await sendToBackground({
      type: 'SET_SETTINGS',
      autoUpload: e.target.checked,
    });
  };

  const handleSaveApiUrl = async () => {
    const url = apiUrl.trim();
    if (url) {
      await sendToBackground({ type: 'SET_SETTINGS', apiBaseUrl: url });
      setApiSaveLabel('Saved!');
      setTimeout(() => setApiSaveLabel('Save'), 1500);
    }
  };

  const handleSaveFrontendUrl = async () => {
    const url = frontendUrl.trim();
    if (url) {
      await sendToBackground({ type: 'SET_SETTINGS', frontendUrl: url });
      setFrontendSaveLabel('Saved!');
      setTimeout(() => setFrontendSaveLabel('Save'), 1500);
    }
  };

  const handleLogout = async () => {
    await sendToBackground({ type: 'LOGOUT' });
    onClose();
    // Close the sidepanel after sign-out
    window.close();
  };

  return (
    <>
      <div
        className={`settings-backdrop${open ? ' open' : ''}`}
        id="settingsBackdrop"
        onClick={onClose}
      />
      <div
        className={`settings-panel${open ? ' open' : ''}`}
        id="settingsPanel"
      >
        <div className="settings-panel-header">
          <span className="settings-panel-title">Settings</span>
          <button
            className="settings-panel-close"
            id="settingsCloseBtn"
            title="Close"
            onClick={onClose}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="settings-panel-body">
          {/* Display Mode */}
          <label className="sp-settings-label">Display Mode</label>
          <div className="sp-mode-selector">
            <button
              id="spModeSidePanel"
              className={`sp-mode-btn${displayMode === 'sidepanel' ? ' active' : ''}`}
              data-mode="sidepanel"
              onClick={() => handleModeChange('sidepanel')}
            >
              Side Panel
            </button>
            <button
              id="spModeDock"
              className={`sp-mode-btn${displayMode === 'dock' ? ' active' : ''}`}
              data-mode="dock"
              onClick={() => handleModeChange('dock')}
            >
              Dock
            </button>
          </div>

          {/* Auto-upload */}
          <label className="sp-settings-label" style={{ marginTop: 8 }}>
            Recording
          </label>
          <div className="settings-toggle-group">
            <label className="settings-toggle-row">
              <span>Auto-upload on complete</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="settingsAutoUpload"
                  checked={autoUpload}
                  onChange={handleAutoUploadChange}
                />
                <span className="toggle-slider" />
              </label>
            </label>
          </div>

          {/* API URL (hidden in cloud mode) */}
          {buildMode !== 'cloud' && (
            <div id="apiUrlSection">
              <label
                className="sp-settings-label"
                style={{ marginTop: 8 }}
                htmlFor="spApiUrlInput"
              >
                API URL
              </label>
              <div className="api-url-row">
                <input
                  id="spApiUrlInput"
                  className="sp-settings-input"
                  type="text"
                  placeholder="https://app.stept.ai/api/v1"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
                <button
                  id="spSaveSettingsBtn"
                  className="btn btn-outline btn-sm"
                  onClick={handleSaveApiUrl}
                >
                  {apiSaveLabel}
                </button>
              </div>

              <label
                className="sp-settings-label"
                style={{ marginTop: 8 }}
                htmlFor="spFrontendUrlInput"
              >
                Frontend URL
              </label>
              <div className="api-url-row">
                <input
                  id="spFrontendUrlInput"
                  className="sp-settings-input"
                  type="text"
                  placeholder="http://localhost:5173"
                  value={frontendUrl}
                  onChange={(e) => setFrontendUrl(e.target.value)}
                />
                <button
                  id="spSaveFrontendBtn"
                  className="btn btn-outline btn-sm"
                  onClick={handleSaveFrontendUrl}
                >
                  {frontendSaveLabel}
                </button>
              </div>
            </div>
          )}

          {/* About */}
          <div className="settings-about">
            <span className="settings-about-version">Stept v1.0.1</span>
          </div>

          <div className="settings-divider" />
          <button
            id="spLogoutBtn"
            className="btn btn-outline btn-sm btn-danger-subtle"
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
