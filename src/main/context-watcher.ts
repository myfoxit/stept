import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

interface ActiveContext {
  windowTitle: string;
  appName: string;
  url?: string;
  appBundleId?: string;
}

interface ContextMatch {
  id: string;
  match_type: string;
  match_value: string;
  resource_type: 'workflow' | 'document';
  resource_id: string;
  resource_name: string;
  resource_summary?: string;
  note?: string;
  priority: number;
  match_reason?: string;
}

export interface RunningApp {
  name: string;
  bundleId?: string;
}

export class ContextWatcherService extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastContext: string = '';
  private cache: Map<string, { matches: ContextMatch[]; time: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000;
  private readonly POLL_INTERVAL = 5000;

  private apiBaseUrl: string = '';
  private accessToken: string = '';
  private projectId: string = '';
  private enabled: boolean = false;

  private nativeBinaryPath: string;

  // Running apps cache (10s TTL)
  private runningAppsCache: { apps: RunningApp[]; time: number } | null = null;
  private readonly RUNNING_APPS_CACHE_TTL = 10 * 1000;

  // Bundle ID cache (persists for session)
  private bundleIdCache: Map<string, string | null> = new Map();

  private readonly BROWSERS = ['Google Chrome', 'Safari', 'Firefox', 'Arc', 'Microsoft Edge', 'Brave Browser', 'Chromium', 'Opera'];

  constructor() {
    super();
    this.nativeBinaryPath = path.join(__dirname, '..', '..', 'native', 'macos', 'window-info');
  }

  configure(apiBaseUrl: string, accessToken: string, projectId: string) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  start() {
    if (this.interval) return;
    this.enabled = true;
    this.interval = setInterval(() => this.check(), this.POLL_INTERVAL);
    this.check();
  }

  stop() {
    this.enabled = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async check() {
    if (!this.enabled || !this.apiBaseUrl || !this.accessToken) return;

    try {
      const ctx = await this.getActiveContext();
      if (!ctx) return;

      const ctxKey = JSON.stringify({ app: ctx.appName, host: ctx.url ? new URL(ctx.url).hostname : '', title: (ctx.windowTitle || '').slice(0, 120) });
      if (ctxKey === this.lastContext) return;
      this.lastContext = ctxKey;

      const cached = this.cache.get(ctxKey);
      if (cached && Date.now() - cached.time < this.CACHE_TTL) {
        if (cached.matches.length > 0) {
          this.emit('matches', cached.matches, ctx);
        }
        return;
      }

      const matches = await this.queryMatches(ctx);
      this.cache.set(ctxKey, { matches, time: Date.now() });

      if (matches.length > 0) {
        this.emit('matches', matches, ctx);
      } else {
        this.emit('no-matches', ctx);
      }
    } catch (e) {
      // Silent fail
    }
  }

  public async getActiveContext(): Promise<ActiveContext | null> {
    try {
      const { stdout } = await execFileAsync(this.nativeBinaryPath, ['mouse'], { timeout: 2000 });
      const info = JSON.parse(stdout);

      const windowTitle = info?.window?.title || '';
      const appName = info?.window?.ownerName || '';

      if (!appName || appName === 'Electron' || appName === 'Ondoki Desktop') return null;

      const ctx: ActiveContext = { windowTitle, appName };

      if (this.BROWSERS.includes(appName)) {
        const url = await this.getBrowserUrl(appName);
        if (url) ctx.url = url;
      }

      // Get bundle identifier (macOS)
      if (process.platform === 'darwin') {
        const bundleId = await this.getAppBundleId(appName);
        if (bundleId) ctx.appBundleId = bundleId;
      }

      return ctx;
    } catch {
      return null;
    }
  }

  private async getBrowserUrl(appName: string): Promise<string | null> {
    const scriptMap: Record<string, string> = {
      'Google Chrome': 'tell application "Google Chrome" to get URL of active tab of first window',
      'Safari': 'tell application "Safari" to get URL of current tab of first window',
      'Arc': 'tell application "Arc" to get URL of active tab of first window',
      'Microsoft Edge': 'tell application "Microsoft Edge" to get URL of active tab of first window',
      'Brave Browser': 'tell application "Brave Browser" to get URL of active tab of first window',
      'Chromium': 'tell application "Chromium" to get URL of active tab of first window',
      'Opera': 'tell application "Opera" to get URL of active tab of first window',
      'Firefox': 'tell application "System Events" to tell process "Firefox" to get value of attribute "AXTitle" of window 1',
    };

    const script = scriptMap[appName];
    if (!script) return null;

    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 1500 });
      const result = stdout.trim();
      if (appName === 'Firefox') return null;
      if (result && result.startsWith('http')) return result;
      return null;
    } catch {
      return null;
    }
  }

  private async queryMatches(ctx: ActiveContext): Promise<ContextMatch[]> {
    const params = new URLSearchParams();
    if (ctx.url) {
      params.set('url', ctx.url);
      try {
        const host = new URL(ctx.url).hostname;
        params.set('hostname', host);
        const hostNoWww = host.replace(/^www\./, '');
        if (hostNoWww !== host) params.set('hostname_base', hostNoWww);
      } catch {}
    }
    if (ctx.appName) params.set('app_name', ctx.appName);
    if (ctx.appBundleId) params.set('app_bundle_id', ctx.appBundleId);
    if (ctx.windowTitle) params.set('window_title', ctx.windowTitle);
    if (this.projectId) params.set('project_id', this.projectId);

    const url = `${this.apiBaseUrl}/context-links/match?${params}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const matches: ContextMatch[] = data.matches || [];

    // Derive match_reason for UI display
    for (const m of matches) {
      if (!m.match_reason) {
        m.match_reason = this.deriveMatchReason(m, ctx);
      }
    }

    return matches;
  }

  private deriveMatchReason(match: ContextMatch, ctx: ActiveContext): string {
    const type = match.match_type;
    if (type === 'app_exact' || type === 'app_regex') {
      return ctx.appName || match.match_value;
    }
    if (type === 'url_regex' || type === 'url_exact') {
      try {
        return new URL(ctx.url || match.match_value).hostname;
      } catch {
        return match.match_value;
      }
    }
    if (type === 'window_regex' || type === 'window_exact') {
      return ctx.windowTitle?.slice(0, 40) || match.match_value;
    }
    if (type === 'hostname' || type === 'hostname_base') {
      return match.match_value;
    }
    // Fallback: show app name or match value
    return ctx.appName || match.match_value;
  }

  private async getAppBundleId(appName: string): Promise<string | null> {
    if (this.bundleIdCache.has(appName)) {
      return this.bundleIdCache.get(appName) || null;
    }

    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', [
        '-e', `id of application "${appName}"`,
      ], { timeout: 1500 });
      const bundleId = stdout.trim() || null;
      this.bundleIdCache.set(appName, bundleId);
      return bundleId;
    } catch {
      this.bundleIdCache.set(appName, null);
      return null;
    }
  }

  public async getRunningApps(): Promise<RunningApp[]> {
    // Return cached if fresh
    if (this.runningAppsCache && Date.now() - this.runningAppsCache.time < this.RUNNING_APPS_CACHE_TTL) {
      return this.runningAppsCache.apps;
    }

    const apps: RunningApp[] = [];

    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync('/usr/bin/osascript', [
          '-e', 'tell application "System Events" to get {name, bundle identifier} of every application process whose background only is false',
        ], { timeout: 3000 });

        // AppleScript returns: {name1, name2, ...}, {id1, id2, ...}
        const lines = stdout.trim();
        // Parse the two lists
        const match = lines.match(/^\{(.*)\},\s*\{(.*)\}$/s);
        if (match) {
          const names = match[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          const ids = match[2].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          for (let i = 0; i < names.length; i++) {
            const name = names[i];
            if (name && name !== 'Electron' && name !== 'Ondoki Desktop') {
              apps.push({
                name,
                bundleId: ids[i] && ids[i] !== 'missing value' ? ids[i] : undefined,
              });
            }
          }
        }
      } catch {
        // Fallback: simpler approach
        try {
          const { stdout } = await execFileAsync('/usr/bin/osascript', [
            '-e', 'tell application "System Events" to get name of every application process whose background only is false',
          ], { timeout: 3000 });
          const names = stdout.trim().split(',').map(s => s.trim());
          for (const name of names) {
            if (name && name !== 'Electron' && name !== 'Ondoki Desktop') {
              apps.push({ name });
            }
          }
        } catch {}
      }
    } else if (process.platform === 'win32') {
      try {
        const { stdout } = await execFileAsync('powershell.exe', [
          '-NoProfile', '-Command',
          'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -Property ProcessName -Unique | ForEach-Object { $_.ProcessName }',
        ], { timeout: 5000 });
        const names = stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          apps.push({ name });
        }
      } catch {}
    }

    this.runningAppsCache = { apps, time: Date.now() };
    return apps;
  }
}
