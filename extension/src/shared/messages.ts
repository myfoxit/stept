// ─── Message Types ──────────────────────────────────────────
// Extracted from background.js message handler.
// DO NOT rename these strings — they are used across content scripts,
// sidepanel, popup, and guide-runtime.

export type BackgroundMessageType =
  // Auth
  | 'LOGIN'
  | 'LOGOUT'
  | 'CHECK_AUTH'
  // Recording
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'GET_STATE'
  // Steps
  | 'CLICK_EVENT'
  | 'TYPE_EVENT'
  | 'PRE_CAPTURE'
  | 'USER_ACTION'
  | 'GET_STEPS'
  | 'DELETE_STEP'
  | 'REORDER_STEPS'
  | 'SET_STEP_DESCRIPTION'
  | 'CLEAR_STEPS'
  // Upload
  | 'UPLOAD'
  // Settings
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'SET_DISPLAY_MODE'
  | 'SET_REDACTION_SETTINGS'
  | 'GET_REDACTION_SETTINGS'
  // Smart Blur
  | 'TOGGLE_SMART_BLUR'
  // Dock
  | 'SHOW_DOCK'
  | 'HIDE_DOCK'
  | 'OPEN_SIDE_PANEL'
  // Guide
  | 'START_GUIDE'
  | 'STOP_GUIDE'
  | 'GUIDE_STEP_HEALTH'
  | 'GUIDE_STEP_CHANGED'
  | 'GUIDE_STOPPED'
  | 'GUIDE_NAVIGATE'
  | 'GUIDE_GO_TO_STEP'
  | 'GUIDE_FIND_IN_FRAMES'
  | 'GET_GUIDE_STATE'
  | 'FETCH_GUIDES'
  | 'FETCH_GUIDE'
  | 'FETCH_WORKFLOW_GUIDE'
  // API proxy
  | 'API_FETCH'
  | 'API_FETCH_BLOB'
  // Context
  | 'CHECK_CONTEXT_LINKS'
  | 'GET_CONTEXT_MATCHES'
  // Search
  | 'SEARCH';

// Messages sent FROM background TO content/sidepanel/popup
export type ContentMessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'SHOW_DOCK'
  | 'HIDE_DOCK'
  | 'HIDE_DOCK_TEMP'
  | 'SHOW_DOCK_TEMP'
  | 'TOGGLE_SMART_BLUR'
  | 'CLOSE_SMART_BLUR'
  | 'STEP_ADDED'
  | 'APPLY_REDACTION'
  | 'PING'
  // Guide
  | 'START_GUIDE'
  | 'STOP_GUIDE'
  | 'GUIDE_GOTO'
  | 'GUIDE_FIND_IN_FRAME';

// Broadcast messages (background → sidepanel)
export type BroadcastMessageType =
  | 'STEP_ADDED'
  | 'SCREENSHOT_FAILED'
  | 'MAX_STEPS_REACHED'
  | 'RECORDING_STATE_CHANGED'
  | 'CONTEXT_MATCHES_UPDATED'
  | 'GUIDE_STATE_UPDATE';

// Helper: send a typed message to background
export function sendToBackground<T = any>(
  message: { type: BackgroundMessageType; [key: string]: any },
): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || ({} as T));
    });
  });
}
