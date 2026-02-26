import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SettingsManager } from './settings';
import { AuthService } from './auth';

const isDev = process.argv.includes('--development');
const SPOTLIGHT_PATH = path.join(__dirname, '..', 'renderer', 'spotlight.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

class OndokiApp {
  private spotlightWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private countdownWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private authService: AuthService;
  private settingsManager: SettingsManager;
  private isQuitting = false;
  private lastProjectId: string = '';
  private isRecording = false;
  private lastSpotlightShowTime = 0;
  private normalTrayIcon: Electron.NativeImage | null = null;
  private recordingTrayIcon: Electron.NativeImage | null = null;

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
    this.setupSettingsIpc();
    this.setupCountdownIpc();
    this.setupRecordingStateTracking();

    await app.whenReady();
    Menu.setApplicationMenu(null);

    this.createTray();
    this.registerGlobalShortcuts();

    this.authService.tryAutoLogin().catch(() => {});

    // First launch: show spotlight open (not hidden)
    this.showSpotlightWindow();

    this.handleStartupProtocol();
  }

  // ─── Global Shortcuts ──────────────────────────────────────────────────────

  private registeredShortcuts: string[] = [];

  private registerGlobalShortcuts(): void {
    // Unregister old ones
    for (const s of this.registeredShortcuts) {
      try { globalShortcut.unregister(s); } catch {}
    }
    this.registeredShortcuts = [];

    const settings = this.settingsManager.getSettings();

    // Spotlight shortcut
    const spotlightShortcut = settings.spotlightShortcut || 'Ctrl+Shift+Space';
    this.tryRegister(spotlightShortcut, () => this.toggleSpotlightWindow());
    if (process.platform === 'darwin') {
      this.tryRegister(spotlightShortcut.replace('Ctrl', 'Cmd'), () => this.toggleSpotlightWindow());
    }

    // Recording shortcut
    const recordingShortcut = settings.recordingShortcut || 'Ctrl+Shift+R';
    this.tryRegister(recordingShortcut, () => {
      if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
        this.spotlightWindow.webContents.send('toggle-recording');
      }
    });
    if (process.platform === 'darwin') {
      this.tryRegister(recordingShortcut.replace('Ctrl', 'Cmd'), () => {
        if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
          this.spotlightWindow.webContents.send('toggle-recording');
        }
      });
    }

    console.log('[Spotlight] Shortcuts registered:', this.registeredShortcuts);
  }

  private tryRegister(shortcut: string, callback: () => void): void {
    try {
      if (!this.registeredShortcuts.includes(shortcut)) {
        globalShortcut.register(shortcut, callback);
        this.registeredShortcuts.push(shortcut);
      }
    } catch (e) {
      console.warn(`Failed to register shortcut "${shortcut}":`, e);
    }
  }

  // ─── Recording State Tracking ─────────────────────────────────────────────

  private setupRecordingStateTracking(): void {
    // Listen for recording state changes to update tray/dock
    app.on('recording-started' as any, () => {
      this.isRecording = true;
      this.updateTrayForRecording(true);
      if (process.platform === 'darwin') {
        app.dock?.setBadge('⏺');
      }
    });

    app.on('recording-stopped' as any, () => {
      this.isRecording = false;
      this.updateTrayForRecording(false);
      if (process.platform === 'darwin') {
        app.dock?.setBadge('');
      }
    });
  }

  private updateTrayForRecording(recording: boolean): void {
    if (!this.tray) return;
    if (recording) {
      this.tray.setTitle(' ⏺ REC');
      if (this.recordingTrayIcon) this.tray.setImage(this.recordingTrayIcon);
    } else {
      this.tray.setTitle('');
      if (this.normalTrayIcon) this.tray.setImage(this.normalTrayIcon);
    }
    this.updateTrayMenu();
  }

  // ─── Countdown Overlay ────────────────────────────────────────────────────

  private setupCountdownIpc(): void {
    ipcMain.handle('countdown:show', async () => {
      await this.showCountdownOverlay();
      return { ok: true };
    });
  }

  private async showCountdownOverlay(): Promise<void> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW } = primaryDisplay.workAreaSize;

    const pillW = 220;
    const pillH = 48;
    const x = Math.round((screenW - pillW) / 2);
    const y = 32; // near top of screen

    this.countdownWindow = new BrowserWindow({
      width: pillW, height: pillH,
      x, y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    this.countdownWindow.setIgnoreMouseEvents(true);
    this.countdownWindow.setVisibleOnAllWorkspaces(true);

    const html = `<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; }
      body { background: transparent; display: flex; align-items: center; justify-content: center;
             width: 100vw; height: 100vh; font-family: -apple-system, 'Segoe UI', sans-serif; overflow: hidden; }
      .pill { display: flex; align-items: center; gap: 8px;
              padding: 10px 20px; border-radius: 24px;
              background: rgba(0,0,0,0.75); backdrop-filter: blur(12px);
              -webkit-backdrop-filter: blur(12px);
              box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #FF5F57;
             animation: blink 1s step-end infinite; }
      @keyframes blink { 50% { opacity: 0.3; } }
      .text { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9);
              letter-spacing: 0.02em; white-space: nowrap; }
    </style></head><body>
      <div class="pill">
        <div class="dot"></div>
        <div class="text" id="msg">Recording in 3\u2026</div>
      </div>
      <script>
        const el = document.getElementById('msg');
        let n = 3;
        function tick() {
          if (n > 0) {
            el.textContent = 'Recording in ' + n + '\u2026';
            n--;
            setTimeout(tick, 1000);
          } else {
            el.textContent = 'Recording started';
            setTimeout(() => window.close(), 600);
          }
        }
        tick();
      </script>
    </body></html>`;

    await this.countdownWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    this.countdownWindow.show();

    // Auto-close after countdown
    setTimeout(() => {
      if (this.countdownWindow && !this.countdownWindow.isDestroyed()) {
        this.countdownWindow.close();
        this.countdownWindow = null;
      }
    }, 4200);
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
    this.lastSpotlightShowTime = Date.now();
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
      width: 620, height: 560,
      show: false, frame: false, transparent: true,
      resizable: false, movable: false, alwaysOnTop: true,
      skipTaskbar: true, fullscreenable: false, hasShadow: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: PRELOAD_PATH },
    });

    this.spotlightWindow.setVisibleOnAllWorkspaces(true);

    this.spotlightWindow.on('blur', () => {
      // Don't hide if recording — user needs to see the mini status
      if (this.isRecording) return;
      // Don't hide if settings window is open (focus just moved there)
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) return;
      // Debounce: ignore blur within 500ms of showing (macOS focus quirk)
      if (Date.now() - this.lastSpotlightShowTime < 500) return;
      setTimeout(() => {
        if (this.spotlightWindow && !this.spotlightWindow.isDestroyed() && this.spotlightWindow.isVisible()) {
          this.hideSpotlightWindow();
        }
      }, 100);
    });

    this.spotlightWindow.on('closed', () => { this.spotlightWindow = null; });

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
        this.spotlightWindow.setBounds({ ...bounds, height: Math.max(200, Math.min(height, 700)) });
      }
      return { ok: true };
    });
  }

  // ─── Settings Window ──────────────────────────────────────────────────────

  private setupSettingsIpc(): void {
    ipcMain.handle('settings:open-window', () => {
      this.openSettingsWindow();
      return { ok: true };
    });

    // Re-register shortcuts when settings change
    ipcMain.on('settings:shortcuts-changed', () => {
      this.registerGlobalShortcuts();
    });
  }

  private openSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 500, height: 580,
      title: 'Ondoki Settings',
      resizable: false, minimizable: false, maximizable: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: PRELOAD_PATH },
    });

    const settingsHtml = this.generateSettingsHtml();
    this.settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsHtml)}`);

    this.settingsWindow.on('closed', () => { this.settingsWindow = null; });
  }

  private generateSettingsHtml(): string {
    return `<!DOCTYPE html><html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #FAFAFC; color: #1A1A2E; padding: 24px; }
  h1 { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; margin-bottom: 24px; letter-spacing: -0.03em; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 600; color: #A0A0B2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #1A1A2E; }
  input[type="text"], input[type="url"] { width: 100%; padding: 8px 12px; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; background: #fff; margin-bottom: 12px; }
  input:focus { border-color: #6C5CE7; box-shadow: 0 0 0 3px rgba(108,92,231,0.1); }
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
  .toggle { width: 36px; height: 20px; border-radius: 10px; background: #D1D5DB; cursor: pointer; position: relative; transition: background 0.2s; }
  .toggle.on { background: #6C5CE7; }
  .toggle-knob { width: 16px; height: 16px; border-radius: 50%; background: #fff; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  .toggle.on .toggle-knob { transform: translateX(16px); }
  .shortcut-input { font-family: 'JetBrains Mono', monospace; font-size: 12px; text-align: center; }
  .btn { padding: 10px 24px; border-radius: 10px; border: none; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: #6C5CE7; color: #fff; }
  .btn-primary:hover { background: #5A4BD6; }
  .btn-danger { background: transparent; color: #FF5F57; border: 1px solid #FF5F57; }
  .btn-danger:hover { background: rgba(255,95,87,0.08); }
  .footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.07); }
  .hint { font-size: 11px; color: #A0A0B2; margin-top: -8px; margin-bottom: 12px; }
</style>
</head><body>
<h1>⚙️ Settings</h1>

<div class="section">
  <div class="section-title">Ondoki Server</div>
  <label>API URL</label>
  <input type="url" id="chatApiUrl" placeholder="http://localhost:8000/api/v1">
  <label>Frontend URL</label>
  <input type="url" id="frontendUrl" placeholder="http://localhost:5173">
</div>

<div class="section">
  <div class="section-title">AI Enhancement</div>
  <div class="toggle-row">
    <label style="margin:0">Auto-improve step titles with AI</label>
    <div class="toggle" id="toggleAnnotate" onclick="toggleAnnotate()"><div class="toggle-knob"></div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Keyboard Shortcuts</div>
  <label>Open Spotlight</label>
  <input type="text" id="spotlightShortcut" class="shortcut-input" placeholder="Ctrl+Shift+Space" readonly>
  <div class="hint">Click and press your desired shortcut</div>
  <label>Start/Stop Recording</label>
  <input type="text" id="recordingShortcut" class="shortcut-input" placeholder="Ctrl+Shift+R" readonly>
  <div class="hint">Click and press your desired shortcut</div>
</div>

<div class="section">
  <div class="section-title">Account</div>
  <div id="accountInfo" style="font-size:13px;color:#6E6E82;margin-bottom:10px;">Loading...</div>
  <button class="btn btn-danger" onclick="logout()">Sign Out</button>
</div>

<div class="footer">
  <button class="btn btn-primary" onclick="save()">Save</button>
</div>

<script>
  const api = window.electronAPI;
  let settings = {};
  let autoAnnotate = true;

  async function init() {
    settings = await api.getSettings();
    document.getElementById('chatApiUrl').value = settings.chatApiUrl || '';
    document.getElementById('frontendUrl').value = settings.frontendUrl || '';
    document.getElementById('spotlightShortcut').value = settings.spotlightShortcut || 'Ctrl+Shift+Space';
    document.getElementById('recordingShortcut').value = settings.recordingShortcut || 'Ctrl+Shift+R';
    autoAnnotate = settings.autoAnnotateSteps !== false;
    updateToggle();

    const status = await api.getAuthStatus();
    document.getElementById('accountInfo').textContent = status.isAuthenticated
      ? 'Signed in as ' + (status.user?.name || status.user?.email || 'User')
      : 'Not signed in';
  }

  function updateToggle() {
    const el = document.getElementById('toggleAnnotate');
    el.className = autoAnnotate ? 'toggle on' : 'toggle';
  }
  function toggleAnnotate() { autoAnnotate = !autoAnnotate; updateToggle(); }

  // Shortcut capture
  ['spotlightShortcut', 'recordingShortcut'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.metaKey) parts.push('Cmd');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key;
      if (!['Control','Meta','Alt','Shift'].includes(key)) {
        parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
        input.value = parts.join('+');
      }
    });
  });

  async function save() {
    await api.saveSettings({
      chatApiUrl: document.getElementById('chatApiUrl').value,
      cloudEndpoint: document.getElementById('chatApiUrl').value.replace(/\\/api\\/v1$/, '/api/v1/process-recording'),
      frontendUrl: document.getElementById('frontendUrl').value,
      autoAnnotateSteps: autoAnnotate,
      spotlightShortcut: document.getElementById('spotlightShortcut').value,
      recordingShortcut: document.getElementById('recordingShortcut').value,
    });
    // Notify main process to re-register shortcuts
    window.close();
  }

  async function logout() {
    await api.logout();
    document.getElementById('accountInfo').textContent = 'Signed out';
  }

  init();
</script>
</body></html>`;
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
    app.on('open-url', (event, url) => { event.preventDefault(); this.handleProtocolUrl(url); });
  }

  // ─── App Events ────────────────────────────────────────────────────────────

  private setupAppEventListeners(): void {
    app.on('window-all-closed', () => { /* tray-only: keep running */ });
    app.on('activate', () => { this.showSpotlightWindow(); });
    app.on('before-quit', () => { this.isQuitting = true; });
    app.on('will-quit', () => { globalShortcut.unregisterAll(); });

    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    });
  }

  // ─── Tray ──────────────────────────────────────────────────────────────────

  private createTray(): void {
    const iconPath = path.join(__dirname, '..', '..', 'assets');
    const icon16 = nativeImage.createFromPath(path.join(iconPath, 'icon.png'));

    const trayIcon = icon16.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
    this.normalTrayIcon = trayIcon;

    // Recording icon — same but we'll add title text
    const recIcon = icon16.resize({ width: 16, height: 16 });
    recIcon.setTemplateImage(false);
    this.recordingTrayIcon = recIcon;

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Ondoki');
    this.tray.on('click', () => this.showSpotlightWindow());
    this.updateTrayMenu();

    app.on('context-matches-updated' as any, (matches: any[]) => {
      this.updateTrayMenu(matches);
    });
    app.on('context-no-matches' as any, () => { this.updateTrayMenu(); });
  }

  private updateTrayMenu(matches?: any[]): void {
    if (!this.tray) return;

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open Ondoki',
        accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space',
        click: () => this.showSpotlightWindow(),
      },
      { type: 'separator' },
      { label: 'Settings...', click: () => this.openSettingsWindow() },
    ];

    if (matches && matches.length > 0) {
      template.push({ type: 'separator' });
      template.push({ label: `${matches.length} suggestion${matches.length > 1 ? 's' : ''}`, enabled: false });
      for (const m of matches.slice(0, 5)) {
        template.push({
          label: `${m.resource_type === 'workflow' ? '⚡' : '📄'} ${m.resource_name}`,
          click: () => {
            const settings = this.settingsManager.getSettings();
            const frontendUrl = settings.frontendUrl || 'http://localhost:5173';
            const p = m.resource_type === 'workflow' ? `/workflow/${m.resource_id}` : `/editor/${m.resource_id}`;
            shell.openExternal(`${frontendUrl}${p}`);
          },
        });
      }
    }

    template.push({ type: 'separator' });
    template.push({ label: 'Quit', click: () => { this.isQuitting = true; app.quit(); } });
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private handleStartupProtocol(): void {
    const protocolUrl = process.argv.find(arg => arg.startsWith('ondoki://'));
    if (protocolUrl) setTimeout(() => this.handleProtocolUrl(protocolUrl), 1000);
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
      } catch (error) { console.error('Auth callback error:', error); }
    }
    this.showSpotlightWindow();
  }
}

const ondokiApp = new OndokiApp();
ondokiApp.initialize().catch(console.error);

process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });
