import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

interface ActiveContext {
  windowTitle: string;
  appName: string;
  url?: string;
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
}

export class ContextWatcherService extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastContext: string = '';
  private cache: Map<string, { matches: ContextMatch[]; time: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly POLL_INTERVAL = 3000;

  private apiBaseUrl: string = '';
  private accessToken: string = '';
  private projectId: string = '';
  private enabled: boolean = false;

  private nativeBinaryPath: string;

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

      const ctxKey = JSON.stringify(ctx);
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

  private async getActiveContext(): Promise<ActiveContext | null> {
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
    if (ctx.url) params.set('url', ctx.url);
    params.set('app_name', ctx.appName);
    if (this.projectId) params.set('project_id', this.projectId);

    const url = `${this.apiBaseUrl}/api/context-links/match?${params}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.matches || [];
  }
}
