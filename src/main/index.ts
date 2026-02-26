import { app, BrowserWindow, globalShortcut, ipcMain, protocol, screen, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SettingsManager } from './settings';
import { AuthService } from './auth';

const isDev = process.argv.includes('--development');
const SPOTLIGHT_PATH = path.join(__dirname, '..', 'renderer', 'spotlight.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

class OndokiApp {
  private spotlightWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private authService: AuthService;
  private settingsManager: SettingsManager;
  private isQuitting = false;
  private lastProjectId: string = '';

  constructor() {
    this.settingsManager = new SettingsManager();
    this.authService = new AuthService(this.settingsManager);
  }

  public async initialize(): Promise<void> {
    if (!this.handleSingleInstance()) return;
    this.registerProtocol();
    this.setupAppEventListeners();
    setupIpcHandlers(this.authService, this.settingsManager);
    this.setupSpotlightIpc();

    await app.whenReady();
    Menu.setApplicationMenu(null);

    // Tray-only app — no main window
    this.createTray();
    this.registerGlobalShortcuts();

    // Try auto-login on startup
    this.authService.tryAutoLogin().catch(() => {});

    // Show spotlight on launch so user can log in
    this.showSpotlightWindow();

    this.handleStartupProtocol();
  }

  // ─── Global Shortcuts ──────────────────────────────────────────────────────

  private registerGlobalShortcuts(): void {
    const settings = this.settingsManager.getSettings();
    const shortcut = (settings as any).spotlightShortcut || 'Ctrl+Shift+Space';

    try {
      globalShortcut.register(shortcut, () => this.toggleSpotlightWindow());
    } catch (e) {
      console.error(`[Spotlight] Failed to register shortcut "${shortcut}":`, e);
    }

    // Always register Ctrl+Shift+Space as fallback
    if (shortcut !== 'Ctrl+Shift+Space') {
      try { globalShortcut.register('Ctrl+Shift+Space', () => this.toggleSpotlightWindow()); } catch {}
    }

    // Mac: also Cmd+Shift+Space
    if (process.platform === 'darwin') {
      const macShortcut = shortcut.replace('Ctrl', 'Cmd');
      if (macShortcut !== shortcut) {
        try { globalShortcut.register(macShortcut, () => this.toggleSpotlightWindow()); } catch {}
      }
      if (macShortcut !== 'Cmd+Shift+Space' && shortcut !== 'Cmd+Shift+Space') {
        try { globalShortcut.register('Cmd+Shift+Space', () => this.toggleSpotlightWindow()); } catch {}
      }
    }

    console.log('[Spotlight] Global shortcuts registered');
  }

  // ─── Spotlight Window ──────────────────────────────────────────────────────

  private toggleSpotlightWindow(): void {
    if (this.spotlightWindow && !this.spotlightWindow.isDestroyed() && this.spotlightWindow.isVisible()) {
      this.hideSpotlightWindow();
    } else {
      this.showSpotlightWindow();
    }
  }

  private showSpotlightWindow(): void {
    if (!this.spotlightWindow || this.spotlightWindow.isDestroyed()) {
      this.createSpotlightWindow();
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    const winWidth = 620;
    const winHeight = 560;
    const x = Math.round((screenW - winWidth) / 2);
    const y = Math.round(screenH * 0.16);

    this.spotlightWindow!.setBounds({ x, y, width: winWidth, height: winHeight });
    this.spotlightWindow!.show();
    this.spotlightWindow!.focus();

    this.spotlightWindow!.webContents.send('spotlight:show', this.lastProjectId);
  }

  private hideSpotlightWindow(): void {
    if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
      this.spotlightWindow.hide();
    }
  }

  private createSpotlightWindow(): void {
    this.spotlightWindow = new BrowserWindow({
      width: 620,
      height: 560,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      hasShadow: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });

    this.spotlightWindow.setVisibleOnAllWorkspaces(true);

    this.spotlightWindow.on('blur', () => {
      setTimeout(() => {
        if (this.spotlightWindow && !this.spotlightWindow.isDestroyed() && this.spotlightWindow.isVisible()) {
          this.hideSpotlightWindow();
        }
      }, 100);
    });

    this.spotlightWindow.on('closed', () => {
      this.spotlightWindow = null;
    });

    this.spotlightWindow.loadFile(SPOTLIGHT_PATH).catch((err: Error) => {
      console.error('Failed to load spotlight:', err);
    });

    this.spotlightWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    if (isDev) {
      this.spotlightWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }

  private setupSpotlightIpc(): void {
    ipcMain.handle('spotlight:dismiss', () => {
      this.hideSpotlightWindow();
      return { ok: true };
    });

    ipcMain.handle('spotlight:resize', (_event, height: number) => {
      if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
        const bounds = this.spotlightWindow.getBounds();
        const clampedHeight = Math.max(200, Math.min(height, 700));
        this.spotlightWindow.setBounds({ ...bounds, height: clampedHeight });
      }
      return { ok: true };
    });
  }

  // ─── Single Instance ───────────────────────────────────────────────────────

  private handleSingleInstance(): boolean {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) { app.quit(); return false; }

    app.on('second-instance', (event, commandLine) => {
      this.showSpotlightWindow();
      const protocolUrl = commandLine.find(arg => arg.startsWith('ondoki://'));
      if (protocolUrl) this.handleProtocolUrl(protocolUrl);
    });

    return true;
  }

  // ─── Protocol ──────────────────────────────────────────────────────────────

  private registerProtocol(): void {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('ondoki', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('ondoki');
    }

    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleProtocolUrl(url);
    });
  }

  // ─── App Events ────────────────────────────────────────────────────────────

  private setupAppEventListeners(): void {
    // Tray-only app: don't quit when windows close
    app.on('window-all-closed', (e: Event) => {
      // Do nothing — keep running in tray
    });

    app.on('activate', () => {
      this.showSpotlightWindow();
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
    });

    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    });
  }

  // ─── Tray ──────────────────────────────────────────────────────────────────

  private normalTrayIcon: Electron.NativeImage | null = null;
  private badgeTrayIcon: Electron.NativeImage | null = null;

  private createTray(): void {
    const iconPath = path.join(__dirname, '..', '..', 'assets');
    const icon16 = nativeImage.createFromPath(path.join(iconPath, 'icon.png'));

    const trayIcon = icon16.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
    this.normalTrayIcon = trayIcon;

    const badgeBase = nativeImage.createFromPath(path.join(iconPath, 'icon.png'));
    const badge = badgeBase.resize({ width: 16, height: 16 });
    badge.setTemplateImage(false);
    this.badgeTrayIcon = badge;

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Ondoki');

    // Click tray → show spotlight
    this.tray.on('click', () => {
      this.showSpotlightWindow();
    });

    this.updateTrayMenu();

    app.on('context-matches-updated' as any, (matches: any[], ctx: any) => {
      if (this.badgeTrayIcon) this.tray?.setImage(this.badgeTrayIcon);
      this.tray?.setTitle(` ${matches.length}`);
      this.updateTrayMenu(undefined, matches);
    });

    app.on('context-no-matches' as any, () => {
      if (this.normalTrayIcon) this.tray?.setImage(this.normalTrayIcon);
      this.tray?.setTitle('');
      this.updateTrayMenu();
    });
  }

  private updateTrayMenu(contextInfo?: string, matches?: any[]): void {
    if (!this.tray) return;

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open Spotlight',
        accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space',
        click: () => this.showSpotlightWindow(),
      },
      { type: 'separator' },
    ];

    if (matches && matches.length > 0) {
      template.push({ label: `${matches.length} suggestion${matches.length > 1 ? 's' : ''}`, enabled: false });
      for (const m of matches.slice(0, 5)) {
        template.push({
          label: `${m.resource_type === 'workflow' ? '⚡' : '📄'} ${m.resource_name}`,
          click: () => {
            const settings = this.settingsManager.getSettings();
            const frontendUrl = settings.frontendUrl || 'http://localhost:5173';
            const resourcePath = m.resource_type === 'workflow' ? `/workflow/${m.resource_id}` : `/editor/${m.resource_id}`;
            shell.openExternal(`${frontendUrl}${resourcePath}`);
          },
        });
      }
      template.push({ type: 'separator' });
    }

    template.push({ label: 'Quit', click: () => { this.isQuitting = true; app.quit(); } });
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private handleStartupProtocol(): void {
    const protocolUrl = process.argv.find(arg => arg.startsWith('ondoki://'));
    if (protocolUrl) {
      setTimeout(() => this.handleProtocolUrl(protocolUrl), 1000);
    }
  }

  private async handleProtocolUrl(url: string): Promise<void> {
    console.log('Handling protocol URL:', url);

    if (url.startsWith('ondoki://auth/callback')) {
      try {
        const success = await this.authService.handleCallback(url);
        if (success && this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
          const status = await this.authService.getStatus();
          this.spotlightWindow.webContents.send('auth-status-changed', status);
        }
      } catch (error) {
        console.error('Auth callback error:', error);
      }
    }

    this.showSpotlightWindow();
  }
}

const ondokiApp = new OndokiApp();
ondokiApp.initialize().catch(console.error);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
