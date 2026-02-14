/**
 * Clean display utilities for recorded steps.
 * Raw data stays in the step object for future features (replay, RAG, export).
 * These functions produce human-readable text for the UI only.
 */

const NOISE_ROLES = ['Group', 'ScrollArea', 'Window', 'WebArea', 'Splitter', 'Unknown', 'Client', 'Application', 'Pane', 'HostingView'];

function cleanRole(role: string): string {
  return (role || '').replace(/^AX/, '');
}

function cleanWindowTitle(title: string): string {
  if (!title || title === 'Unknown Window') return '';
  // Strip common suffixes
  return title
    .replace(/\s*[-—|]\s*(Google Chrome|Firefox|Safari|Microsoft Edge|Arc|Brave|Opera)$/i, '')
    .replace(/\s*[-—|]\s*(Visual Studio Code|Code)$/i, '')
    .trim();
}

function shortAppName(ownerApp: string, windowTitle: string): string {
  if (!ownerApp) return '';
  // Common app name mappings
  const appNames: Record<string, string> = {
    'Google Chrome': 'Chrome',
    'Microsoft Edge': 'Edge',
    'Code': 'VS Code',
    'Finder': 'Finder',
    'System Preferences': 'Settings',
    'System Settings': 'Settings',
  };
  return appNames[ownerApp] || ownerApp;
}

/**
 * Primary display title for a step.
 * Priority: AI title > meaningful element > action summary
 */
export function getStepTitle(step: any): string {
  // 1. AI-generated title (best)
  if (step.isAnnotated && step.generatedTitle) {
    return step.generatedTitle;
  }

  // 2. Build from element info
  const role = cleanRole(step.elementRole || '');
  const elementName = step.elementName || '';
  const textTyped = step.textTyped || '';

  if (step.actionType === 'Type' && textTyped) {
    const truncated = textTyped.length > 40 ? textTyped.substring(0, 40) + '…' : textTyped;
    return `Type "${truncated}"`;
  }

  if (step.actionType === 'Keyboard Shortcut' && textTyped) {
    return `Press ${textTyped}`;
  }

  if (step.actionType === 'Scroll') {
    const direction = (step.scrollDelta || 0) > 0 ? 'down' : 'up';
    return `Scroll ${direction}`;
  }

  // Double/triple click
  if (step.actionType === 'Double Click' || step.actionType === 'Triple Click') {
    if (elementName && !NOISE_ROLES.includes(elementName) && elementName !== role) {
      return `${step.actionType} "${elementName}"`;
    }
    const windowClean = cleanWindowTitle(step.windowTitle || '');
    return `${step.actionType}${windowClean ? ` in ${windowClean.substring(0, 50)}` : ''}`;
  }

  // Right click
  if (step.actionType === 'Right Click') {
    if (elementName && !NOISE_ROLES.includes(elementName)) {
      return `Right-click "${elementName}"`;
    }
    const windowClean = cleanWindowTitle(step.windowTitle || '');
    return `Right-click${windowClean ? ` in ${windowClean.substring(0, 50)}` : ''}`;
  }

  // Element has a meaningful name
  if (elementName && !NOISE_ROLES.includes(elementName) && elementName !== role) {
    if (role && !NOISE_ROLES.includes(role)) {
      return `Click "${elementName}"`;
    }
    return `Click "${elementName}"`;
  }

  // Element has a meaningful role but no name
  if (role && !NOISE_ROLES.includes(role)) {
    return `Click ${role}`;
  }

  // Fallback: just the action
  const windowClean = cleanWindowTitle(step.windowTitle || '');
  if (windowClean) {
    return `Click in ${windowClean.substring(0, 50)}`;
  }

  return step.actionType || 'Action';
}

/**
 * Secondary subtitle for a step.
 * Shows app name / context.
 */
export function getStepSubtitle(step: any): string {
  const app = shortAppName(step.ownerApp || '', step.windowTitle || '');
  const windowClean = cleanWindowTitle(step.windowTitle || '');
  
  if (app && windowClean && windowClean !== app) {
    return `${app} — ${windowClean.substring(0, 50)}`;
  }
  if (app) return app;
  if (windowClean) return windowClean.substring(0, 60);
  return step.windowTitle || '';
}

/**
 * AI annotation badge — returns true if step has AI-generated content.
 */
export function isAiAnnotated(step: any): boolean {
  return !!(step.isAnnotated && step.generatedTitle);
}
