import { DEFAULT_API_BASE_URL, BUILD_CONFIG } from '@/shared/constants';

export async function getApiBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBaseUrl'], (result) => {
      resolve(result.apiBaseUrl || DEFAULT_API_BASE_URL);
    });
  });
}

export async function applyDisplayMode(): Promise<void> {
  const { displayMode } = await chrome.storage.local.get(['displayMode']);
  const mode = displayMode || 'sidepanel';
  if (mode === 'sidepanel') {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.action.setPopup({ popup: '' });
  } else {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    chrome.action.setPopup({ popup: 'popup.html' });
  }
}
