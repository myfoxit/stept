import type { WorkflowStep } from '@/types/workflow';

export const formatDuration = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

// ──────────────────────────────────────────────────────────────────────────────
// Auto-favicon & Smart Title helpers (#26)
// ──────────────────────────────────────────────────────────────────────────────

/** Well-known browser title separators */
const TITLE_SEPARATORS = [' - ', ' — ', ' | ', ' · ', ' – '];

/** Known browser suffixes to strip */
const BROWSER_SUFFIXES = [
  'Google Chrome', 'Chrome', 'Firefox', 'Safari', 'Microsoft Edge', 'Edge',
  'Brave', 'Opera', 'Vivaldi', 'Arc',
];

/** Known app names that aren't websites */
const KNOWN_APPS = [
  'Finder', 'Terminal', 'iTerm2', 'VS Code', 'Visual Studio Code', 'Code',
  'Slack', 'Discord', 'Figma', 'Notion', 'Obsidian', 'Spotify',
  'Preview', 'TextEdit', 'Notes', 'Mail', 'Messages', 'Calendar',
  'System Preferences', 'System Settings', 'Activity Monitor',
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint',
  'Xcode', 'IntelliJ IDEA', 'WebStorm', 'PyCharm',
];

/**
 * Extract a likely domain or app name from a window title.
 * Browser tabs often look like "Page Title - Site Name - Chrome"
 * We try to extract the site/app name.
 */
export function extractSiteFromWindowTitle(windowTitle: string): string | null {
  if (!windowTitle?.trim()) return null;

  let title = windowTitle.trim();

  // Strip known browser suffixes from the end
  for (const suffix of BROWSER_SUFFIXES) {
    for (const sep of TITLE_SEPARATORS) {
      if (title.endsWith(`${sep}${suffix}`)) {
        title = title.slice(0, -(sep.length + suffix.length)).trim();
        break;
      }
    }
  }

  // Check for known apps
  const lowerTitle = title.toLowerCase();
  for (const app of KNOWN_APPS) {
    if (lowerTitle === app.toLowerCase() || lowerTitle.startsWith(app.toLowerCase())) {
      return app;
    }
  }

  // Try to find a domain pattern in the title (e.g., "github.com" or "GitHub")
  const domainMatch = title.match(/([a-zA-Z0-9-]+\.(com|org|net|io|dev|app|co|ai|xyz|me))/i);
  if (domainMatch) return domainMatch[1].toLowerCase();

  // Split by separators and take the last meaningful segment (usually the site name)
  for (const sep of TITLE_SEPARATORS) {
    if (title.includes(sep)) {
      const parts = title.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Last part is usually the site/app name
        return parts[parts.length - 1];
      }
    }
  }

  // If no separator found, return the whole title (likely an app name)
  return title.length > 40 ? null : title;
}

/**
 * Attempt to extract a hostname/domain suitable for Google's favicon API
 * from a site name. Handles both "github.com" and "GitHub" style names.
 */
export function siteNameToDomain(siteName: string): string | null {
  if (!siteName) return null;

  // If it already looks like a domain
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/.test(siteName)) {
    return siteName.toLowerCase();
  }

  // Well-known name → domain mappings
  const KNOWN_DOMAINS: Record<string, string> = {
    'google': 'google.com',
    'gmail': 'gmail.com',
    'youtube': 'youtube.com',
    'github': 'github.com',
    'gitlab': 'gitlab.com',
    'stackoverflow': 'stackoverflow.com',
    'stack overflow': 'stackoverflow.com',
    'twitter': 'twitter.com',
    'x': 'x.com',
    'facebook': 'facebook.com',
    'linkedin': 'linkedin.com',
    'reddit': 'reddit.com',
    'amazon': 'amazon.com',
    'aws': 'aws.amazon.com',
    'microsoft': 'microsoft.com',
    'azure': 'azure.microsoft.com',
    'jira': 'atlassian.com',
    'confluence': 'atlassian.com',
    'atlassian': 'atlassian.com',
    'trello': 'trello.com',
    'asana': 'asana.com',
    'notion': 'notion.so',
    'figma': 'figma.com',
    'slack': 'slack.com',
    'discord': 'discord.com',
    'zoom': 'zoom.us',
    'dropbox': 'dropbox.com',
    'google docs': 'docs.google.com',
    'google sheets': 'sheets.google.com',
    'google drive': 'drive.google.com',
    'google calendar': 'calendar.google.com',
    'google meet': 'meet.google.com',
    'chatgpt': 'chat.openai.com',
    'openai': 'openai.com',
    'vercel': 'vercel.com',
    'netlify': 'netlify.com',
    'heroku': 'heroku.com',
    'npm': 'npmjs.com',
    'docker': 'docker.com',
    'wikipedia': 'wikipedia.org',
    'medium': 'medium.com',
    'spotify': 'spotify.com',
  };

  const lower = siteName.toLowerCase().trim();
  if (KNOWN_DOMAINS[lower]) return KNOWN_DOMAINS[lower];

  // Try appending .com as a guess
  if (/^[a-zA-Z0-9-]+$/.test(siteName) && siteName.length <= 20) {
    return `${siteName.toLowerCase()}.com`;
  }

  return null;
}

/**
 * Analyze workflow steps and determine the most-used site/app.
 * Returns { siteName, domain, count } or null.
 */
export function getMostUsedSite(steps: WorkflowStep[]): {
  siteName: string;
  domain: string | null;
  count: number;
} | null {
  if (!steps?.length) return null;

  const siteCounts = new Map<string, number>();

  for (const step of steps) {
    const site = extractSiteFromWindowTitle(step.window_title || '');
    if (site) {
      const key = site.toLowerCase();
      siteCounts.set(key, (siteCounts.get(key) || 0) + 1);
    }
  }

  if (siteCounts.size === 0) return null;

  // Find the most common site
  let topSite = '';
  let topCount = 0;
  for (const [site, count] of siteCounts) {
    if (count > topCount) {
      topSite = site;
      topCount = count;
    }
  }

  // Get original casing from steps
  let originalName = topSite;
  for (const step of steps) {
    const site = extractSiteFromWindowTitle(step.window_title || '');
    if (site && site.toLowerCase() === topSite) {
      originalName = site;
      break;
    }
  }

  return {
    siteName: originalName,
    domain: siteNameToDomain(originalName),
    count: topCount,
  };
}

/**
 * Build a Google Favicon URL from a domain.
 */
export function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Generate a smart, meaningful workflow title from step data.
 * Falls back gracefully: AI title > smart template > generic.
 */
export function generateSmartTitle(
  steps: WorkflowStep[],
  existingTitle?: string | null,
  generatedTitle?: string | null,
): string {
  // If AI already generated a title, prefer it
  if (generatedTitle?.trim()) return generatedTitle.trim();

  // If existing title looks intentional (not default), keep it
  if (existingTitle?.trim() && !isDefaultTitle(existingTitle)) {
    return existingTitle.trim();
  }

  const mostUsed = getMostUsedSite(steps);
  const stepCount = steps.length;

  // Analyze step actions for context
  const actionTypes = new Set<string>();
  for (const step of steps) {
    if (step.step_category) actionTypes.add(step.step_category);
    const desc = (step.description || step.generated_description || '').toLowerCase();
    if (desc.includes('click')) actionTypes.add('navigation');
    if (desc.includes('type') || desc.includes('input') || desc.includes('fill')) actionTypes.add('data-entry');
    if (desc.includes('upload') || desc.includes('download')) actionTypes.add('file-transfer');
    if (desc.includes('login') || desc.includes('sign in')) actionTypes.add('authentication');
    if (desc.includes('search') || desc.includes('filter')) actionTypes.add('search');
    if (desc.includes('create') || desc.includes('new') || desc.includes('add')) actionTypes.add('creation');
    if (desc.includes('edit') || desc.includes('update') || desc.includes('modify')) actionTypes.add('editing');
    if (desc.includes('delete') || desc.includes('remove')) actionTypes.add('deletion');
    if (desc.includes('setting') || desc.includes('config') || desc.includes('preference')) actionTypes.add('configuration');
  }

  // Build contextual title
  if (mostUsed) {
    const site = mostUsed.siteName;
    // Pick a relevant action verb
    if (actionTypes.has('authentication')) return `Sign in to ${site}`;
    if (actionTypes.has('creation')) return `Create new item in ${site}`;
    if (actionTypes.has('configuration')) return `Configure ${site} settings`;
    if (actionTypes.has('data-entry')) return `Fill out form in ${site}`;
    if (actionTypes.has('editing')) return `Edit content in ${site}`;
    if (actionTypes.has('search')) return `Search and navigate ${site}`;
    if (actionTypes.has('file-transfer')) return `File operations in ${site}`;
    if (actionTypes.has('deletion')) return `Remove items in ${site}`;
    // Generic with site name
    return `How to use ${site}`;
  }

  // No site detected — generic but still better than "Workflow: ..."
  if (stepCount <= 3) return 'Quick workflow';
  if (stepCount <= 8) return 'Step-by-step guide';
  return `Detailed guide (${stepCount} steps)`;
}

/**
 * Check if a title is a generic/default one that should be replaced.
 */
export function isDefaultTitle(title: string): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return (
    t.startsWith('workflow:') ||
    t.startsWith('workflow ') ||
    t === 'workflow' ||
    t === 'untitled workflow' ||
    t === 'untitled' ||
    t.startsWith('recording ') ||
    t.startsWith('session ') ||
    /^recording[-_\s]?[0-9a-f-]+$/i.test(t) ||
    /^session[-_\s]?[0-9a-f-]+$/i.test(t)
  );
}
