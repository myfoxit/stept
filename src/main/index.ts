import { app, BrowserWindow, protocol, shell } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SettingsManager } from './settings';
import { AuthService } from './auth';

// Resolve paths for renderer and preload
const isDev = process.argv.includes('--development');
const RENDERER_PATH = path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

class OndokiApp {
  private mainWindow: BrowserWindow | null = null;
  private authService: AuthService;
  private settingsManager: SettingsManager;
  private isQuitting = false;

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

    // Wait for app to be ready
    await app.whenReady();

    // Create main window
    this.createMainWindow();

    // Handle protocol on startup (if launched via protocol)
    this.handleStartupProtocol();
  }

  private handleSingleInstance(): boolean {
    const gotTheLock = app.requestSingleInstanceLock();
    
    if (!gotTheLock) {
      app.quit();
      return false;
    }

    app.on('second-instance', (event, commandLine) => {
      // Someone tried to run a second instance, focus our window instead
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
      }

      // Handle protocol URL if passed
      const protocolUrl = commandLine.find(arg => arg.startsWith('ondoki://'));
      if (protocolUrl && this.mainWindow) {
        this.handleProtocolUrl(protocolUrl);
      }
    });

    return true;
  }

  private registerProtocol(): void {
    // Register the protocol for OAuth callbacks
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('ondoki', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('ondoki');
    }

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleProtocolUrl(url);
    });
  }

  private setupAppEventListeners(): void {
    app.on('window-all-closed', () => {
      // On macOS, keep the app running even when all windows are closed
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      // On macOS, re-create the window when the dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    // Security: Prevent new window creation
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    });
  }

  private createMainWindow(): void {
    const windowState = this.settingsManager.getWindowState();

    console.log('Creating main window...');
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      center: true,
      minWidth: 800,
      minHeight: 600,
      show: true,
      backgroundColor: '#f8fafc',
      icon: this.getAppIcon(),
      // titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });

    // Force show window
    this.mainWindow.show();
    this.mainWindow.focus();
    console.log('Window bounds:', JSON.stringify(this.mainWindow.getBounds()));
    console.log('Window visible:', this.mainWindow.isVisible());
    console.log('Window minimized:', this.mainWindow.isMinimized());
    
    // Load the renderer
    console.log('Loading renderer from:', RENDERER_PATH);
    this.mainWindow.loadFile(RENDERER_PATH).then(() => {
      console.log('Renderer loaded successfully');
    }).catch((err: Error) => {
      console.error('Failed to load renderer:', err);
    });

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show();

        if (windowState?.isMaximized) {
          this.mainWindow.maximize();
        }

        // Open DevTools in development
        if (isDev) {
          this.mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      }
    });

    // Save window state when closing
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting && process.platform === 'darwin') {
        event.preventDefault();
        this.mainWindow?.hide();
      } else {
        this.saveWindowState();
      }
    });

    // Save window state on move/resize
    this.mainWindow.on('moved', () => this.saveWindowState());
    this.mainWindow.on('resized', () => this.saveWindowState());

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
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
    // Check if the app was launched with a protocol URL
    const protocolUrl = process.argv.find(arg => arg.startsWith('ondoki://'));
    if (protocolUrl) {
      // Delay handling to ensure the window is ready
      setTimeout(() => this.handleProtocolUrl(protocolUrl), 1000);
    }
  }

  private handleProtocolUrl(url: string): void {
    console.log('Handling protocol URL:', url);
    
    if (this.mainWindow) {
      // Send the protocol URL to the renderer process
      this.mainWindow.webContents.send('protocol-url', url);
      
      // Bring the window to front
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