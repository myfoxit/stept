import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { desktopCapturer } from 'electron';
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
  private lastActiveContext: ActiveContext | null = null;
  private cache: Map<string, { matches: ContextMatch[]; time: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000;
  private readonly POLL_INTERVAL = 5000;

  private apiBaseUrl: string = '';
  private accessToken: string = '';
  private projectId: string = '';
  private enabled: boolean = false;
  private paused: boolean = false;

  private nativeBinaryPath: string;
  private bundleIdCache: Map<string, string | null> = new Map();
  private runningAppsCache: { apps: RunningApp[]; time: number } | null = null;
  private readonly RUNNING_APPS_CACHE_TTL = 10 * 1000;

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

  pause() { this.paused = true; }

  resume() {
    this.paused = false;
    this.lastContext = '';
  }

  private async check() {
    if (!this.enabled || this.paused || !this.apiBaseUrl || !this.accessToken) return;

    try {
      const ctx = await this.getActiveContext();
      if (!ctx) return;

      this.lastActiveContext = ctx;

      const ctxKey = JSON.stringify({
        app: ctx.appName,
        title: (ctx.windowTitle || '').slice(0, 120),
        url: ctx.url || '',
      });
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
    } catch {
      // Silent fail
    }
  }

  public getLastActiveContext(): ActiveContext | null {
    return this.lastActiveContext;
  }

  public async forceMatchCheck(): Promise<ContextMatch[]> {
    const ctx = this.lastActiveContext;
    if (!ctx || !this.apiBaseUrl || !this.accessToken) return [];

    try {
      const matches = await this.queryMatches(ctx);
      if (matches.length > 0) {
        this.emit('matches', matches, ctx);
      } else {
        this.emit('no-matches', ctx);
      }
      return matches;
    } catch {
      return [];
    }
  }

  // ─── Context Detection ──────────────────────────────────────────────

  public async getActiveContext(): Promise<ActiveContext | null> {
    try {
      // macOS: use native binary (fast, gives app name + window title)
      if (process.platform === 'darwin') {
        return await this.getActiveContextMacOS();
      }

      // All platforms: use desktopCapturer (built into Electron, reliable)
      return await this.getActiveContextDesktopCapturer();
    } catch {
      return null;
    }
  }

  private async getActiveContextMacOS(): Promise<ActiveContext | null> {
    const { stdout } = await execFileAsync(this.nativeBinaryPath, ['mouse'], { timeout: 2000 });
    const info = JSON.parse(stdout);

    const windowTitle = info?.window?.title || '';
    const appName = info?.window?.ownerName || '';

    if (!appName || this.isOwnApp(appName)) return null;

    const ctx: ActiveContext = { windowTitle, appName };

    if (this.BROWSERS.includes(appName)) {
      const url = await this.getBrowserUrl(appName);
      if (url) ctx.url = url;
    }

    const bundleId = await this.getAppBundleId(appName);
    if (bundleId) ctx.appBundleId = bundleId;

    return ctx;
  }

  private async getActiveContextDesktopCapturer(): Promise<ActiveContext | null> {
    // desktopCapturer.getSources returns all visible windows with their titles
    // Window titles from browsers include the page: "Google - Google Chrome"
    // This works on Windows, macOS, and Linux with zero external deps
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      fetchWindowIcons: false,
      thumbnailSize: { width: 1, height: 1 }, // minimal — we only need titles
    });

    // Filter out our own windows
    const external = sources.filter(s => {
      const title = s.name || '';
      return title.trim() !== '' && !this.isOwnApp(title);
    });

    if (external.length === 0) return null;

    // First source is typically the topmost/most-recently-focused window
    const top = external[0];
    const windowTitle = top.name || '';

    // Parse browser window titles: "Page Title - Browser Name"
    // Chrome: "Google - Google Chrome"
    // Edge: "Google - Microsoft Edge"
    // Firefox: "Google — Mozilla Firefox"
    const parsed = this.parseBrowserWindowTitle(windowTitle);

    const ctx: ActiveContext = {
      windowTitle,
      appName: parsed.appName || windowTitle,
    };

    // Try to extract URL from title for known browsers
    // Browser titles often show "domain.com" or "Page Title" — useful for matching
    if (parsed.isBrowser && parsed.pageTitle) {
      // We don't get the exact URL, but we can send the page title
      // and window_title matching will pick it up
      // Also set a synthetic hostname if the page title looks like a domain
      const domainMatch = parsed.pageTitle.match(/^([\w-]+\.[\w.-]+)/);
      if (domainMatch) {
        ctx.url = `https://${domainMatch[1]}`;
      }
    }

    return ctx;
  }

  private parseBrowserWindowTitle(title: string): { appName: string; pageTitle: string; isBrowser: boolean } {
    // Common browser title patterns:
    // "Page Title - Google Chrome"
    // "Page Title - Microsoft Edge"  
    // "Page Title — Mozilla Firefox"
    // "Page Title - Brave"
    // "Page Title - Opera"
    const browserSuffixes = [
      'Google Chrome', 'Microsoft Edge', 'Mozilla Firefox', 'Brave',
      'Opera', 'Safari', 'Arc', 'Chromium', 'Vivaldi', 'Brave Browser',
    ];

    for (const browser of browserSuffixes) {
      // Try both " - " and " — " separators
      for (const sep of [' - ', ' — ', ' – ']) {
        if (title.endsWith(`${sep}${browser}`)) {
          return {
            appName: browser,
            pageTitle: title.slice(0, -(sep.length + browser.length)),
            isBrowser: true,
          };
        }
      }
    }

    // Not a browser, or unknown format
    // Try generic " - AppName" pattern (many apps use this)
    const lastDash = title.lastIndexOf(' - ');
    if (lastDash > 0) {
      return {
        appName: title.slice(lastDash + 3).trim(),
        pageTitle: title.slice(0, lastDash).trim(),
        isBrowser: false,
      };
    }

    return { appName: title, pageTitle: '', isBrowser: false };
  }

  private isOwnApp(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'electron' || lower.includes('ondoki desktop') || lower.includes('ondoki-desktop');
  }

  // ─── macOS Browser URL via AppleScript ──────────────────────────────

  private async getBrowserUrl(appName: string): Promise<string | null> {
    const scriptMap: Record<string, string> = {
      'Google Chrome': 'tell application "Google Chrome" to get URL of active tab of first window',
      'Safari': 'tell application "Safari" to get URL of current tab of first window',
      'Arc': 'tell application "Arc" to get URL of active tab of first window',
      'Microsoft Edge': 'tell application "Microsoft Edge" to get URL of active tab of first window',
      'Brave Browser': 'tell application "Brave Browser" to get URL of active tab of first window',
      'Chromium': 'tell application "Chromium" to get URL of active tab of first window',
      'Opera': 'tell application "Opera" to get URL of active tab of first window',
    };

    const script = scriptMap[appName];
    if (!script) return null;

    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 1500 });
      const result = stdout.trim();
      if (result && result.startsWith('http')) return result;
      return null;
    } catch {
      return null;
    }
  }

  // ─── Match API ──────────────────────────────────────────────────────

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
    return data.matches || [];
  }

  // ─── macOS Bundle ID ───────────────────────────────────────────────

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

  // ─── Running Apps ──────────────────────────────────────────────────

  public async getRunningApps(): Promise<RunningApp[]> {
    if (this.runningAppsCache && Date.now() - this.runningAppsCache.time < this.RUNNING_APPS_CACHE_TTL) {
      return this.runningAppsCache.apps;
    }

    const apps: RunningApp[] = [];

    // Use desktopCapturer — works everywhere
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        fetchWindowIcons: false,
        thumbnailSize: { width: 1, height: 1 },
      });

      const seen = new Set<string>();
      for (const source of sources) {
        const parsed = this.parseBrowserWindowTitle(source.name);
        const name = parsed.appName || source.name;
        if (name && !this.isOwnApp(name) && !seen.has(name)) {
          seen.add(name);
          apps.push({ name });
        }
      }
    } catch {}

    // macOS: also get bundle IDs
    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync('/usr/bin/osascript', [
          '-e', 'tell application "System Events" to get name of every application process whose background only is false',
        ], { timeout: 3000 });
        const names = stdout.trim().split(',').map(s => s.trim());
        const seen = new Set(apps.map(a => a.name));
        for (const name of names) {
          if (name && !this.isOwnApp(name) && !seen.has(name)) {
            seen.add(name);
            apps.push({ name });
          }
        }
      } catch {}
    }

    this.runningAppsCache = { apps, time: Date.now() };
    return apps;
  }
}
