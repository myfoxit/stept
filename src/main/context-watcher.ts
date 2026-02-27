import { EventEmitter } from 'events';
import { spawn, ChildProcess, execFile } from 'child_process';
import { promisify } from 'util';
import { createInterface, Interface } from 'readline';
import { app } from 'electron';
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
  private watchProcess: ChildProcess | null = null;
  private readline: Interface | null = null;
  private lastActiveContext: ActiveContext | null = null;
  private lastContextKey: string = '';

  private apiBaseUrl: string = '';
  private accessToken: string = '';
  private projectId: string = '';

  private nativeBinaryPath: string;
  private restartAttempts: number = 0;
  private readonly MAX_RESTART_ATTEMPTS = 5;

  private readonly IGNORE_APPS = ['electron', 'ondoki desktop', 'ondoki-desktop'];

  constructor() {
    super();
    if (process.platform === 'darwin') {
      this.nativeBinaryPath = app.isPackaged
        ? path.join(process.resourcesPath, 'native', 'macos', 'window-info')
        : path.join(__dirname, '..', '..', 'native', 'macos', 'window-info');
    } else {
      // Windows — try packaged path first, then dev paths
      const candidates = [
        path.join(process.resourcesPath, 'native', 'windows', 'window-info.exe'),
        path.join(__dirname, '..', '..', 'native', 'windows', 'bin', 'Release', 'net8.0', 'win-x64', 'publish', 'window-info.exe'),
        path.join(__dirname, '..', '..', 'native', 'windows', 'window-info.exe'),
      ];
      this.nativeBinaryPath = candidates[0]; // Will be resolved on start
      for (const c of candidates) {
        try {
          require('fs').accessSync(c);
          this.nativeBinaryPath = c;
          break;
        } catch {}
      }
    }
  }

  configure(apiBaseUrl: string, accessToken: string, projectId: string) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  start() {
    if (this.watchProcess) return;
    this.restartAttempts = 0;
    this.spawnWatcher();
  }

  stop() {
    if (this.watchProcess) {
      this.watchProcess.kill();
      this.watchProcess = null;
    }
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
  }

  public getLastActiveContext(): ActiveContext | null {
    return this.lastActiveContext;
  }

  /**
   * Force a fresh match query using the cached context.
   * Call this when spotlight opens.
   */
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

  // ─── Native watcher process ─────────────────────────────────────────

  private spawnWatcher() {
    try {
      this.watchProcess = spawn(this.nativeBinaryPath, ['watch'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      console.error('[context-watcher] Failed to spawn native watcher:', err);
      return;
    }

    this.readline = createInterface({ input: this.watchProcess.stdout! });

    this.readline.on('line', (line: string) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'ready') {
          console.log('[context-watcher] Native watcher ready');
          this.restartAttempts = 0;
          return;
        }
        if (event.type === 'change') {
          this.handleWindowChange(event.app, event.title);
        }
      } catch {
        // Ignore malformed lines
      }
    });

    this.watchProcess.on('exit', (code) => {
      this.watchProcess = null;
      this.readline = null;

      this.restartAttempts++;
      if (this.restartAttempts > this.MAX_RESTART_ATTEMPTS) {
        console.warn(`[context-watcher] Native watcher exited (code ${code}). Max retries (${this.MAX_RESTART_ATTEMPTS}) reached — stopping.`);
        return;
      }

      const delay = Math.min(3000 * Math.pow(2, this.restartAttempts - 1), 60000);
      console.log(`[context-watcher] Native watcher exited (code ${code}), retry ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS} in ${delay}ms...`);
      setTimeout(() => {
        if (this.apiBaseUrl && this.accessToken) this.spawnWatcher();
      }, delay);
    });
  }

  private async handleWindowChange(appName: string, windowTitle: string) {
    // Skip our own app
    if (!appName || this.IGNORE_APPS.includes(appName.toLowerCase())) return;

    const ctx: ActiveContext = { appName, windowTitle };

    // Always update the cached context
    this.lastActiveContext = ctx;

    // Dedup — don't re-query for same context
    const ctxKey = `${appName}|${windowTitle}`;
    if (ctxKey === this.lastContextKey) return;
    this.lastContextKey = ctxKey;

    // Query match API
    if (!this.apiBaseUrl || !this.accessToken) return;

    try {
      const matches = await this.queryMatches(ctx);
      if (matches.length > 0) {
        this.emit('matches', matches, ctx);
      } else {
        this.emit('no-matches', ctx);
      }
    } catch {
      // Silent fail
    }
  }

  // ─── Fallback: one-shot context detection (for getActiveContext IPC) ──

  public async getActiveContext(): Promise<ActiveContext | null> {
    // Prefer cached context from watch mode
    if (this.lastActiveContext) return this.lastActiveContext;

    // Fallback: call native binary in mouse mode
    try {
      const { stdout } = await execFileAsync(this.nativeBinaryPath, ['mouse'], { timeout: 2000 });
      const info = JSON.parse(stdout);
      const windowTitle = info?.window?.title || '';
      const appName = info?.window?.ownerName || '';
      if (!appName || this.IGNORE_APPS.includes(appName.toLowerCase())) return null;
      return { windowTitle, appName };
    } catch {
      return null;
    }
  }

  // ─── Match API ──────────────────────────────────────────────────────

  private async queryMatches(ctx: ActiveContext): Promise<ContextMatch[]> {
    const params = new URLSearchParams();
    if (ctx.appName) params.set('app_name', ctx.appName);
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
}
