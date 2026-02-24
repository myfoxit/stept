import { app, BrowserWindow, protocol, shell, Tray, Menu, nativeImage } from 'electron';
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
  private tray: Tray | null = null;
  private authService: AuthService;
  private settingsManager: SettingsManager;
  private isQuitting = false;
  private spotlightWindow: BrowserWindow | null = null;

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

    // Remove default menu bar
    Menu.setApplicationMenu(null);

    // Create main window
    this.createMainWindow();

    // Create tray icon
    this.createTray();

    // Spotlight floating window trigger
    app.on('spotlight:open' as any, (_projectId: string) => this.openSpotlightWindow(_projectId));

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
      width: 480,
      height: 680,
      center: true,
      minWidth: 400,
      minHeight: 500,
      show: true,
      autoHideMenuBar: true,
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

  private normalTrayIcon: Electron.NativeImage | null = null;
  private badgeTrayIcon: Electron.NativeImage | null = null;

  private createTray(): void {
    // Use actual app icon for tray
    const iconPath = path.join(__dirname, '..', '..', 'assets');
    const icon16 = nativeImage.createFromPath(path.join(iconPath, 'icon.png'));
    
    // Create template version (macOS auto-adjusts for dark/light menu bar)
    const trayIcon = icon16.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
    this.normalTrayIcon = trayIcon;

    // Badge icon: same icon but NOT template (renders in color = stands out)
    const badgeBase = nativeImage.createFromPath(path.join(iconPath, 'icon.png'));
    const badge = badgeBase.resize({ width: 16, height: 16 });
    badge.setTemplateImage(false);
    this.badgeTrayIcon = badge;

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Ondoki');
    this.updateTrayMenu();

    // Listen for context match events from ipc-handlers
    app.on('context-matches-updated' as any, (matches: any[], ctx: any) => {
      if (this.badgeTrayIcon) {
        this.tray?.setImage(this.badgeTrayIcon);
      }
      // Show match count next to tray icon
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
      { type: 'separator' },
    ];

    if (contextInfo) {
      template.push({
        label: `📍 ${contextInfo}`,
        enabled: false,
      });
      template.push({
        label: `➕ Add context for "${contextInfo}"...`,
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
      template.push({ label: `📋 ${matches.length} suggestion${matches.length > 1 ? 's' : ''}`, enabled: false });
      for (const m of matches.slice(0, 5)) {
        template.push({
          label: `  ${m.resource_type === 'workflow' ? '🔄' : '📄'} ${m.resource_name}`,
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
      template.push({ label: '📍 No context detected', enabled: false });
    }

    template.push({ type: 'separator' });
    template.push({
      label: '📝 Add Context Note...',
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


  private openSpotlightWindow(projectId?: string): void {
    if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
      this.spotlightWindow.show();
      this.spotlightWindow.focus();
      this.spotlightWindow.webContents.send('spotlight:set-project', projectId || '');
      return;
    }

    this.spotlightWindow = new BrowserWindow({
      width: 860,
      height: 560,
      center: true,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      movable: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const html = `<!doctype html><html><body style="margin:0;font-family:-apple-system,Inter,sans-serif;background:#f8fafc">
      <div style="padding:12px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <b>⌘K Spotlight</b><button onclick="window.close()" style="border:0;background:none;font-size:18px;cursor:pointer">×</button>
      </div>
      <div style="padding:12px">
        <div style="display:flex;gap:8px;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;background:white">
          <span id='icon'>🔎</span><input id='q' placeholder='Search workflows/pages or ask AI…' style='flex:1;border:0;outline:none;font-size:14px' />
          <span style='font-size:10px;border:1px solid #d1d5db;border-radius:6px;padding:2px 4px;color:#6b7280'>ESC</span>
        </div>
        <div style='display:flex;gap:8px;margin-top:8px'>
          <button id='bSearch' style='flex:1;padding:8px;border-radius:8px;border:1px solid #6C5CE7;background:#f4f1ff'>Search</button>
          <button id='bAi' style='flex:1;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff'>Ask AI</button>
        </div>
        <div id='results' style='margin-top:10px;max-height:390px;overflow:auto'></div>
      </div>
      <script>
        const { ipcRenderer, shell } = require('electron');
        let mode='search'; let projectId='${projectId || ''}';
        ipcRenderer.on('spotlight:set-project', (_, p)=>projectId=p||projectId);
        const q=document.getElementById('q'); const r=document.getElementById('results');
        const bS=document.getElementById('bSearch'); const bA=document.getElementById('bAi'); const icon=document.getElementById('icon');
        function draw(list){ r.innerHTML=''; if(!list?.length){ r.innerHTML='<div style="color:#6b7280;font-size:12px;padding:8px">No results</div>'; return;}
          for(const it of list){ const d=document.createElement('div'); d.style='padding:9px 10px;border:1px solid #eef2f7;border-radius:8px;margin-bottom:6px;background:white;cursor:pointer';
            d.innerHTML='<div style=\"font-size:12px;font-weight:600\">'+(it.type==='workflow'?'🔄':'📄')+' '+(it.name||it.resource_name||'Untitled')+'</div><div style=\"font-size:11px;color:#6b7280\">'+(it.preview||it.summary||'')+'</div>';
            d.onclick=()=>{ const id=it.id||it.resource_id; const path=(it.type==='workflow'||it.resource_type==='workflow')?('/workflow/'+id):('/editor/'+id); ipcRenderer.invoke('settings:get').then(s=>shell.openExternal(((s.frontendUrl||'http://localhost:5173').replace(/\/+$/,''))+path)); };
            r.appendChild(d);
          }
        }
        async function search(){ const text=q.value.trim(); if(!text||!projectId){r.innerHTML='<div style="font-size:12px;color:#6b7280;padding:8px">Select a project first.</div>';return;}
          if(mode==='search'){ const kw=await ipcRenderer.invoke('spotlight:search', text, projectId); let list=kw.results||[]; if(text.length>20||/^(how|what|why|when|where|who|which|can|does|is|are|do|should|could|would)\b/i.test(text)){ try{const sem=await ipcRenderer.invoke('spotlight:semantic-search', text, projectId); if((sem.results||[]).length) list=[...sem.results,...list.filter(k=>!(new Set(sem.results.map(x=>x.id))).has(k.id))];}catch{}} draw(list); }
          else { const ans=await ipcRenderer.invoke('chat:send-message', [{role:'user',content:text}], JSON.stringify({project_id:projectId})); r.innerHTML='<div style=\"font-size:12px;background:white;border:1px solid #eef2f7;border-radius:8px;padding:10px;white-space:pre-wrap\">'+ans+'</div>'; }
        }
        q.addEventListener('input',()=>{ if(mode==='search') search();}); q.addEventListener('keydown',e=>{if(e.key==='Escape')window.close(); if(e.key==='Enter'&&mode==='ai')search();});
        bS.onclick=()=>{mode='search';icon.textContent='🔎';bS.style='flex:1;padding:8px;border-radius:8px;border:1px solid #6C5CE7;background:#f4f1ff';bA.style='flex:1;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff';q.placeholder='Search workflows/pages…';search();};
        bA.onclick=()=>{mode='ai';icon.textContent='✨';bA.style='flex:1;padding:8px;border-radius:8px;border:1px solid #6C5CE7;background:#f4f1ff';bS.style='flex:1;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff';q.placeholder='Ask AI about this project…';};
        q.focus();
      </script>
    </body></html>`;

    this.spotlightWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    this.spotlightWindow.once('ready-to-show', () => this.spotlightWindow?.show());
    this.spotlightWindow.on('blur', () => this.spotlightWindow?.hide());
    this.spotlightWindow.on('closed', () => { this.spotlightWindow = null; });
  }

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
    // Check if the app was launched with a protocol URL
    const protocolUrl = process.argv.find(arg => arg.startsWith('ondoki://'));
    if (protocolUrl) {
      // Delay handling to ensure the window is ready
      setTimeout(() => this.handleProtocolUrl(protocolUrl), 1000);
    }
  }

  private async handleProtocolUrl(url: string): Promise<void> {
    console.log('Handling protocol URL:', url);
    
    // Handle auth callback directly in main process
    if (url.startsWith('ondoki://auth/callback')) {
      try {
        const success = await this.authService.handleCallback(url);
        console.log('Auth callback result:', success);
        
        if (success && this.mainWindow) {
          // Notify renderer of auth status change
          const status = await this.authService.getStatus();
          this.mainWindow.webContents.send('auth-status-changed', status);
        }
      } catch (error) {
        console.error('Auth callback error:', error);
      }
    }
    
    if (this.mainWindow) {
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