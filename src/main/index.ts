import { app, BrowserWindow, globalShortcut, ipcMain, protocol, screen, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SettingsManager } from './settings';
import { AuthService } from './auth';

// Resolve paths for renderer and preload
const isDev = process.argv.includes('--development');
const RENDERER_PATH = path.join(__dirname, '..', 'renderer', 'index.html');
const SPOTLIGHT_PATH = path.join(__dirname, '..', 'renderer', 'spotlight.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

class OndokiApp {
  private mainWindow: BrowserWindow | null = null;
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
    // Handle app instance management
    if (!this.handleSingleInstance()) {
      return;
    }

    // Register custom protocol
    this.registerProtocol();

    // Set up app event listeners
    this.setupAppEventListeners();

    // Set up IPC handlers
    setupIpcHandlers(this.authService, this.settingsManager);

    // Set up spotlight IPC
    this.setupSpotlightIpc();

    // Wait for app to be ready
    await app.whenReady();

    // Remove default menu bar
    Menu.setApplicationMenu(null);

    // Create main window
    this.createMainWindow();

    // Create tray icon
    this.createTray();

    // Register global shortcuts
    this.registerGlobalShortcuts();

    // Spotlight trigger — opens the global spotlight window
    app.on('spotlight:open' as any, (projectId: string) => {
      this.lastProjectId = projectId || this.lastProjectId;
      this.showSpotlightWindow();
    });

    // Handle protocol on startup (if launched via protocol)
    this.handleStartupProtocol();
  }

  // ─── Global Shortcuts ──────────────────────────────────────────────────────

  private registerGlobalShortcuts(): void {
    // Ctrl+Shift+Space — works on both Mac and Windows
    globalShortcut.register('Ctrl+Shift+Space', () => {
      this.toggleSpotlightWindow();
    });

    // Cmd+Shift+Space — Mac alternative
    if (process.platform === 'darwin') {
      globalShortcut.register('Cmd+Shift+Space', () => {
        this.toggleSpotlightWindow();
      });
    }

    console.log('[Spotlight] Global shortcuts registered (Ctrl+Shift+Space' + (process.platform === 'darwin' ? ', Cmd+Shift+Space' : '') + ')');
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

    // Position center of the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    const winWidth = 800;
    const winHeight = 520;
    const x = Math.round((screenW - winWidth) / 2);
    const y = Math.round(screenH * 0.18); // ~18% from top, like macOS Spotlight

    this.spotlightWindow!.setBounds({ x, y, width: winWidth, height: winHeight });
    this.spotlightWindow!.show();
    this.spotlightWindow!.focus();

    // Send project ID to spotlight renderer
    this.spotlightWindow!.webContents.send('spotlight:open-overlay', this.lastProjectId);
  }

  private hideSpotlightWindow(): void {
    if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
      this.spotlightWindow.hide();
    }
  }

  private createSpotlightWindow(): void {
    this.spotlightWindow = new BrowserWindow({
      width: 800,
      height: 520,
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

    // Show on all workspaces (macOS Spaces)
    this.spotlightWindow.setVisibleOnAllWorkspaces(true);

    // Hide on blur (clicking outside)
    this.spotlightWindow.on('blur', () => {
      // Small delay to allow for window interactions
      setTimeout(() => {
        if (this.spotlightWindow && !this.spotlightWindow.isDestroyed() && this.spotlightWindow.isVisible()) {
          this.hideSpotlightWindow();
        }
      }, 100);
    });

    this.spotlightWindow.on('closed', () => {
      this.spotlightWindow = null;
    });

    // Load the spotlight HTML
    this.spotlightWindow.loadFile(SPOTLIGHT_PATH).catch((err: Error) => {
      console.error('Failed to load spotlight renderer:', err);
    });

    // External links
    this.spotlightWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  private setupSpotlightIpc(): void {
    // Dismiss spotlight from renderer
    ipcMain.handle('spotlight:dismiss', () => {
      this.hideSpotlightWindow();
      return { ok: true };
    });
  }

  // ─── Single Instance ───────────────────────────────────────────────────────

  private handleSingleInstance(): boolean {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      app.quit();
      return false;
    }

    app.on('second-instance', (event, commandLine) => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
      }

      const protocolUrl = commandLine.find(arg => arg.startsWith('ondoki://'));
      if (protocolUrl && this.mainWindow) {
        this.handleProtocolUrl(protocolUrl);
      }
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
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
    });

    // Security: Prevent new window creation
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    });
  }

  // ─── Main Window ───────────────────────────────────────────────────────────

  private createMainWindow(): void {
    const windowState = this.settingsManager.getWindowState();

    console.log('Creating main window...');
    this.mainWindow = new BrowserWindow({
      width: 480,
      height: 680,
      center: true,
      minWidth: 400,
      minHeight: 500,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });

    this.mainWindow.show();
    this.mainWindow.focus();

    // Load the renderer
    console.log('Loading renderer from:', RENDERER_PATH);
    this.mainWindow.loadFile(RENDERER_PATH).then(async () => {
      console.log('Renderer loaded successfully');

      // Try auto-login after renderer is loaded
      try {
        const success = await this.authService.tryAutoLogin();
        if (success && this.mainWindow) {
          const status = await this.authService.getStatus();
          this.mainWindow.webContents.send('auth-status-changed', status);
          console.log('Auto-login successful, notified renderer');
        }
      } catch (error) {
        console.error('Auto-login failed:', error);
      }
    }).catch((err: Error) => {
      console.error('Failed to load renderer:', err);
    });

    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        if (windowState?.isMaximized) {
          this.mainWindow.maximize();
        }
        if (isDev) {
          this.mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      }
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting && process.platform === 'darwin') {
        event.preventDefault();
        this.mainWindow?.hide();
      } else {
        this.saveWindowState();
      }
    });

    this.mainWindow.on('moved', () => this.saveWindowState());
    this.mainWindow.on('resized', () => this.saveWindowState());

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
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
    this.updateTrayMenu();

    app.on('context-matches-updated' as any, (matches: any[], ctx: any) => {
      if (this.badgeTrayIcon) {
        this.tray?.setImage(this.badgeTrayIcon);
      }
      this.tray?.setTitle(` ${matches.length}`);
      const contextLabel = ctx.url
        ? `${ctx.appName} — ${new URL(ctx.url).hostname}`
        : ctx.appName;
      this.updateTrayMenu(contextLabel, matches);
    });

    app.on('context-no-matches' as any, () => {
      if (this.normalTrayIcon) {
        this.tray?.setImage(this.normalTrayIcon);
      }
      this.tray?.setTitle('');
      this.updateTrayMenu();
    });
  }

  private updateTrayMenu(contextInfo?: string, matches?: any[]): void {
    if (!this.tray) return;

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: 'Open Ondoki', click: () => this.showMainWindow() },
      {
        label: 'Open Spotlight',
        accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space',
        click: () => this.showSpotlightWindow(),
      },
      { type: 'separator' },
    ];

    if (contextInfo) {
      template.push({ label: contextInfo, enabled: false });
      template.push({
        label: 'Add context note...',
        click: () => {
          this.showMainWindow();
          if (this.mainWindow) {
            this.mainWindow.webContents.send('show-add-context-note');
          }
        },
      });
    }

    if (matches && matches.length > 0) {
      template.push({ type: 'separator' });
      template.push({ label: `${matches.length} suggestion${matches.length > 1 ? 's' : ''}`, enabled: false });
      for (const m of matches.slice(0, 5)) {
        template.push({
          label: `${m.resource_type === 'workflow' ? 'Workflow' : 'Page'}: ${m.resource_name}`,
          click: () => {
            const settings = this.settingsManager.getSettings();
            const frontendUrl = settings.frontendUrl || 'http://localhost:5173';
            const resourcePath = m.resource_type === 'workflow' ? `/workflow/${m.resource_id}` : `/editor/${m.resource_id}`;
            shell.openExternal(`${frontendUrl}${resourcePath}`);
          },
        });
      }
    }

    if (!contextInfo && (!matches || matches.length === 0)) {
      template.push({ label: 'No context detected', enabled: false });
    }

    template.push({ type: 'separator' });
    template.push({
      label: 'Add Context Note...',
      click: () => {
        this.showMainWindow();
        if (this.mainWindow) {
          this.mainWindow.webContents.send('show-add-context-note');
        }
      },
    });
    template.push({ type: 'separator' });
    template.push({ label: 'Quit', click: () => { this.isQuitting = true; app.quit(); } });

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private showMainWindow(): void {
    if (!this.mainWindow) {
      this.createMainWindow();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  private getAppIcon(): string | undefined {
    const iconPath = path.join(__dirname, '..', '..', 'assets');

    switch (process.platform) {
      case 'win32':
        return path.join(iconPath, 'icon.ico');
      case 'darwin':
        return path.join(iconPath, 'icon.icns');
      default:
        return path.join(iconPath, 'icon.png');
    }
  }

  private saveWindowState(): void {
    if (!this.mainWindow) return;

    const bounds = this.mainWindow.getBounds();
    const isMaximized = this.mainWindow.isMaximized();

    this.settingsManager.setWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  }

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
        console.log('Auth callback result:', success);

        if (success && this.mainWindow) {
          const status = await this.authService.getStatus();
          this.mainWindow.webContents.send('auth-status-changed', status);
        }
      } catch (error) {
        console.error('Auth callback error:', error);
      }
    }

    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }
  }
}

// Initialize and start the application
const ondokiApp = new OndokiApp();
ondokiApp.initialize().catch(console.error);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
