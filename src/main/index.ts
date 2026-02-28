import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  Tray,
  Menu,
  nativeImage,
  Notification,
} from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SettingsManager } from './settings';
import { AuthService } from './auth';

const isDev = process.argv.includes('--development');
const SPOTLIGHT_PATH = path.join(__dirname, '..', 'renderer', 'spotlight.html');
const SETTINGS_PATH = path.join(__dirname, '..', 'renderer', 'settings.html');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

class OndokiApp {
  private spotlightWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private countdownWindow: BrowserWindow | null = null;
  private pickerWindow: BrowserWindow | null = null;
  private pickerResolve: ((area: any) => void) | null = null;
  private tray: Tray | null = null;
  private authService: AuthService;
  private settingsManager: SettingsManager;
  private isQuitting = false;
  private lastProjectId: string = '';
  private isRecording = false;
  private isAuthenticated = false;
  private isStartingRecording = false;
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
    this.setupPickerIpc();
    this.setupRecordingStateTracking();

    await app.whenReady();
    Menu.setApplicationMenu(null);

    // Set dock icon on macOS
    if (process.platform === 'darwin') {
      const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon512.png'));
      if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
    }

    this.createTray();
    this.registerGlobalShortcuts();

    // Track auth state to prevent blur hiding during login
    this.authService.on('status-changed', (status: any) => {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = status.isAuthenticated;
      if (status.isAuthenticated && !wasAuthenticated) {
        // Just completed login — ensure spotlight is visible
        this.showSpotlightWindow();
      }
    });

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
      try {
        globalShortcut.unregister(s);
      } catch {}
    }
    this.registeredShortcuts = [];

    const settings = this.settingsManager.getSettings();

    // Spotlight shortcut
    const spotlightShortcut = settings.spotlightShortcut || 'Ctrl+Shift+Space';
    this.tryRegister(spotlightShortcut, () => this.toggleSpotlightWindow());
    if (process.platform === 'darwin') {
      this.tryRegister(spotlightShortcut.replace('Ctrl', 'Cmd'), () =>
        this.toggleSpotlightWindow(),
      );
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

  /** Get the display where the mouse cursor currently is. */
  private getMouseDisplay(): Electron.Display {
    const cursorPoint = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursorPoint);
  }

  private async showCountdownOverlay(): Promise<void> {
    const mouseDisplay = this.getMouseDisplay();
    const { width: screenW } = mouseDisplay.workAreaSize;
    const workArea = mouseDisplay.workArea;

    const pillW = 220;
    const pillH = 48;
    const x = workArea.x + Math.round((screenW - pillW) / 2);
    const y = workArea.y + 32; // near top of the active display

    this.countdownWindow = new BrowserWindow({
      width: pillW,
      height: pillH,
      x,
      y,
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
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #E14D2A;
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

    await this.countdownWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
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
    if (
      this.spotlightWindow &&
      !this.spotlightWindow.isDestroyed() &&
      this.spotlightWindow.isVisible() &&
      this.spotlightWindow.isFocused()
    ) {
      this.spotlightWindow.minimize();
    } else {
      this.showSpotlightWindow();
    }
  }

  private showSpotlightWindow(): void {
    if (!this.spotlightWindow || this.spotlightWindow.isDestroyed()) {
      this.createSpotlightWindow();
    }

    if (this.spotlightWindow!.isMinimized()) {
      this.spotlightWindow!.restore();
    }
    this.spotlightWindow!.show();
    this.spotlightWindow!.focus();
    this.spotlightWindow!.webContents.send(
      'spotlight:show',
      this.lastProjectId,
    );
  }

  private hideSpotlightWindow(): void {
    if (this.spotlightWindow && !this.spotlightWindow.isDestroyed()) {
      this.spotlightWindow.minimize();
    }
  }

  private createSpotlightWindow(): void {
    const windowIcon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon256.png'));
    this.spotlightWindow = new BrowserWindow({
      width: 450,
      height: 650,
      show: false,
      frame: true,
      transparent: false,
      backgroundColor: '#FFFFFF',
      resizable: true,
      fullscreenable: false,
      hasShadow: true,
      icon: windowIcon,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
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

    // Dev tools available via Cmd+Shift+I — not opened automatically
    if (isDev) {
      this.spotlightWindow.webContents.on(
        'before-input-event',
        (_event, input) => {
          if (
            input.type === 'keyDown' &&
            input.shift &&
            input.meta &&
            input.key === 'I'
          ) {
            this.spotlightWindow?.webContents.toggleDevTools();
          }
        },
      );
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
        this.spotlightWindow.setBounds({
          ...bounds,
          height: Math.max(200, Math.min(height, 700)),
        });
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

    const windowIcon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon256.png'));
    this.settingsWindow = new BrowserWindow({
      width: 480,
      height: 520,
      title: 'Ondoki Settings',
      icon: windowIcon,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });

    this.settingsWindow.loadFile(SETTINGS_PATH);

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });
  }

  // ─── Picker Window ──────────────────────────────────────────────────────────

  private setupPickerIpc(): void {
    ipcMain.handle('picker:open', async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });

        const displays = screen.getAllDisplays();

        const screenSources = sources
          .filter((s) => s.id.startsWith('screen:'))
          .map((s) => {
            const display = displays.find((d) => String(d.id) === s.display_id);
            return {
              id: s.id,
              name: s.name || `Display ${s.display_id}`,
              displayId: s.display_id,
              thumbnail: s.thumbnail.toDataURL(),
              bounds: display?.bounds || null,
              isPrimary: display
                ? display.bounds.x === 0 && display.bounds.y === 0
                : false,
            };
          });

        const windowSources = sources
          .filter((s) => s.id.startsWith('window:') && s.name)
          .map((s) => ({
            id: s.id,
            name: s.name,
            handle: parseInt(s.id.split(':')[1], 10),
            thumbnail: s.thumbnail.toDataURL(),
            appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
          }));

        this.openPickerWindow(screenSources, windowSources);

        return new Promise<any>((resolve) => {
          this.pickerResolve = resolve;
        });
      } catch (error) {
        console.error('Failed to open picker:', error);
        return null;
      }
    });

    ipcMain.handle('picker:select', (_event, captureArea: any) => {
      if (this.pickerResolve) {
        this.pickerResolve(captureArea);
        this.pickerResolve = null;
      }
      if (this.pickerWindow && !this.pickerWindow.isDestroyed()) {
        this.pickerWindow.close();
        this.pickerWindow = null;
      }
      return { ok: true };
    });

    ipcMain.handle('recording:set-starting', (_event, starting: boolean) => {
      this.isStartingRecording = starting;
      return { ok: true };
    });

    ipcMain.handle('picker:get-sources', async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
        const displays = screen.getAllDisplays();
        const screenSources = sources
          .filter((s) => s.id.startsWith('screen:'))
          .map((s) => {
            const display = displays.find((d) => String(d.id) === s.display_id);
            return {
              id: s.id,
              name: s.name || `Display ${s.display_id}`,
              displayId: s.display_id,
              thumbnail: s.thumbnail.toDataURL(),
              bounds: display?.bounds || null,
              isPrimary: display
                ? display.bounds.x === 0 && display.bounds.y === 0
                : false,
            };
          });
        const windowSources = sources
          .filter((s) => s.id.startsWith('window:') && s.name)
          .map((s) => ({
            id: s.id,
            name: s.name,
            handle: parseInt(s.id.split(':')[1], 10),
            thumbnail: s.thumbnail.toDataURL(),
            appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
          }));
        return { screens: screenSources, windows: windowSources };
      } catch (error) {
        console.error('Failed to get sources:', error);
        return { screens: [], windows: [] };
      }
    });
  }

  private openPickerWindow(screenSources: any[], windowSources: any[]): void {
    if (this.pickerWindow && !this.pickerWindow.isDestroyed()) {
      this.pickerWindow.focus();
      return;
    }

    const mouseDisplay = this.getMouseDisplay();
    const workArea = mouseDisplay.workArea;
    const winW = 720;
    const winH = 520;

    // Hide spotlight while picker is open so it doesn't obscure the picker
    if (
      this.spotlightWindow &&
      !this.spotlightWindow.isDestroyed() &&
      this.spotlightWindow.isVisible()
    ) {
      this.spotlightWindow.hide();
    }

    this.pickerWindow = new BrowserWindow({
      width: winW,
      height: winH,
      x: workArea.x + Math.round((workArea.width - winW) / 2),
      y: workArea.y + Math.round((workArea.height - winH) / 2),
      title: 'Choose Capture Source',
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });

    this.pickerWindow.on('closed', () => {
      if (this.pickerResolve) {
        this.pickerResolve(null);
        this.pickerResolve = null;
      }
      this.pickerWindow = null;
      // Restore spotlight after picker closes
      this.showSpotlightWindow();
    });

    const pickerHtml = this.generatePickerHtml(screenSources, windowSources);
    this.pickerWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(pickerHtml)}`,
    );
  }

  private generatePickerHtml(
    screenSources: any[],
    windowSources: any[],
  ): string {
    const screensJson = JSON.stringify(screenSources);
    const windowsJson = JSON.stringify(windowSources);

    return `<!DOCTYPE html><html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #F5F5F5; color: #1A1A2E; overflow: hidden; display: flex; flex-direction: column; height: 100vh; }
  h1 { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.03em; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid rgba(0,0,0,0.07); }
  .section-label { font-size: 11px; font-weight: 600; color: #A0A0B2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
  .body { flex: 1; overflow-y: auto; padding: 18px 24px; }
  .body::-webkit-scrollbar { width: 5px; }
  .body::-webkit-scrollbar-track { background: transparent; }
  .body::-webkit-scrollbar-thumb { background: #D4D4DE; border-radius: 3px; }
  .section { margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .source-card { border: 2px solid rgba(0,0,0,0.07); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.15s; background: #fff; }
  .source-card:hover { border-color: rgba(26,26,26,0.35); box-shadow: 0 4px 16px rgba(26,26,26,0.1); transform: translateY(-1px); }
  @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .source-card.selected { border-color: #3ab08a; box-shadow: 0 0 0 3px rgba(58,176,138,0.15); }
  .thumb { width: 100%; aspect-ratio: 16/9; background: #E8E8F0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .source-info { padding: 8px 10px; }
  .source-name { font-size: 12px; font-weight: 600; color: #1A1A2E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source-meta { font-size: 10px; color: #A0A0B2; margin-top: 2px; }
  .footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-top: 1px solid rgba(0,0,0,0.07); background: #fff; }
  .btn-cancel { padding: 8px 20px; border-radius: 10px; border: 1.5px solid rgba(0,0,0,0.1); background: transparent; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: #6E6E82; cursor: pointer; transition: all 0.15s; }
  .btn-cancel:hover { border-color: #6E6E82; }
  .btn-select { padding: 8px 24px; border-radius: 10px; border: none; background: #3ab08a; color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(58,176,138,0.2); }
  .btn-select:hover { background: #2f9a78; transform: translateY(-1px); }
  .btn-select:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .all-screens-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 2px solid rgba(0,0,0,0.07); border-radius: 12px; cursor: pointer; transition: all 0.15s; background: #fff; margin-bottom: 12px; }
  .all-screens-card:hover { border-color: rgba(26,26,26,0.35); }
  .all-screens-card.selected { border-color: #3ab08a; box-shadow: 0 0 0 3px rgba(58,176,138,0.15); }
  .all-icon { width: 48px; height: 32px; border-radius: 6px; background: linear-gradient(135deg, #3ab08a, #2f9a78); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
</style>
</head><body>
<div class="header">
  <h1>Choose Capture Source</h1>
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#28C840;font-weight:600;">
      <span style="width:6px;height:6px;border-radius:50%;background:#28C840;animation:livePulse 2s infinite;"></span>
      Live
    </span>
    <span style="font-size:11px;color:#A0A0B2;">Click a source, then Start Capture</span>
  </div>
</div>
<div class="body" id="body">
  <div class="section">
    <div class="section-label">Screens</div>
    <div class="all-screens-card" id="all-screens" onclick="selectAll()">
      <div class="all-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </div>
      <div>
        <div class="source-name">Entire Screen</div>
        <div class="source-meta">Capture all displays</div>
      </div>
    </div>
    <div class="grid" id="screens-grid"></div>
  </div>
  <div class="section">
    <div class="section-label">Application Windows</div>
    <div class="grid" id="windows-grid"></div>
  </div>
</div>
<div class="footer">
  <button class="btn-cancel" onclick="cancel()">Cancel</button>
  <button class="btn-select" id="selectBtn" onclick="confirmSelect()">Start Capture</button>
</div>
<script>
  const api = window.electronAPI;
  const screens = ${screensJson};
  const wins = ${windowsJson};
  let selected = { type: 'all-displays' };

  function renderScreens() {
    const grid = document.getElementById('screens-grid');
    grid.innerHTML = screens.map((s, i) => \`
      <div class="source-card" id="screen-\${i}" onclick="selectScreen(\${i})">
        <div class="thumb"><img src="\${s.thumbnail}" alt="\${s.name}"/></div>
        <div class="source-info">
          <div class="source-name">\${s.name}</div>
          <div class="source-meta">\${s.bounds ? s.bounds.width + ' × ' + s.bounds.height : ''}\${s.isPrimary ? ' (primary)' : ''}</div>
        </div>
      </div>
    \`).join('');
  }

  function renderWindows() {
    const grid = document.getElementById('windows-grid');
    if (wins.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:#A0A0B2;">No visible windows</div>';
      return;
    }
    grid.innerHTML = wins.map((w, i) => \`
      <div class="source-card" id="win-\${i}" onclick="selectWindow(\${i})">
        <div class="thumb"><img src="\${w.thumbnail}" alt="\${w.name}"/></div>
        <div class="source-info">
          <div class="source-name">\${w.name}</div>
        </div>
      </div>
    \`).join('');
  }

  function clearSelection() {
    document.querySelectorAll('.source-card, .all-screens-card').forEach(el => el.classList.remove('selected'));
  }

  function selectAll() {
    clearSelection();
    document.getElementById('all-screens').classList.add('selected');
    selected = { type: 'all-displays' };
  }

  function selectScreen(i) {
    clearSelection();
    document.getElementById('screen-' + i).classList.add('selected');
    const s = screens[i];
    selected = { type: 'single-display', displayId: s.displayId, displayName: s.name, bounds: s.bounds };
  }

  function selectWindow(i) {
    clearSelection();
    document.getElementById('win-' + i).classList.add('selected');
    const w = wins[i];
    selected = { type: 'window', windowHandle: w.handle, windowTitle: w.name };
  }

  function confirmSelect() {
    api.pickerSelect(selected);
  }

  function cancel() {
    window.close();
  }

  renderScreens();
  renderWindows();
  selectAll();

  // Live preview: refresh thumbnails every 3 seconds
  setInterval(async () => {
    try {
      const sources = await api.pickerGetSources();
      sources.screens.forEach((s, i) => {
        const card = document.getElementById('screen-' + i);
        if (card) { const img = card.querySelector('img'); if (img) img.src = s.thumbnail; }
      });
      sources.windows.forEach((w, i) => {
        const card = document.getElementById('win-' + i);
        if (card) { const img = card.querySelector('img'); if (img) img.src = w.thumbnail; }
      });
    } catch (e) {}
  }, 3000);
</script>
</body></html>`;
  }

  // ─── Single Instance ───────────────────────────────────────────────────────

  private handleSingleInstance(): boolean {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return false;
    }
    app.on('second-instance', (event, commandLine) => {
      this.showSpotlightWindow();
      const protocolUrl = commandLine.find((arg) =>
        arg.startsWith('ondoki://'),
      );
      if (protocolUrl) this.handleProtocolUrl(protocolUrl);
    });
    return true;
  }

  // ─── Protocol ──────────────────────────────────────────────────────────────

  private registerProtocol(): void {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('ondoki', process.execPath, [
          path.resolve(process.argv[1]),
        ]);
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
      /* tray-only: keep running */
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

  private createTray(): void {
    const iconPath = path.join(__dirname, '..', '..', 'assets');

    // Windows needs .ico for tray; macOS uses .png
    const trayFile = process.platform === 'win32' ? 'icon.ico' : 'trayIcon.png';
    const trayIcon = nativeImage.createFromPath(path.join(iconPath, trayFile));
    trayIcon.setTemplateImage(false); // Color icon, not template
    this.normalTrayIcon = trayIcon;

    // Recording icon — same icon, title changes
    const recIcon = nativeImage.createFromPath(path.join(iconPath, trayFile));
    recIcon.setTemplateImage(false);
    this.recordingTrayIcon = recIcon;

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Ondoki');
    this.tray.on('click', () => this.showSpotlightWindow());
    this.updateTrayMenu();

    app.on('context-matches-updated' as any, (matches: any[]) => {
      this.updateTrayMenu(matches);
    });
    app.on('context-no-matches' as any, () => {
      this.updateTrayMenu();
    });
  }

  private updateTrayMenu(matches?: any[]): void {
    if (!this.tray) return;

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open Ondoki',
        accelerator:
          process.platform === 'darwin'
            ? 'Cmd+Shift+Space'
            : 'Ctrl+Shift+Space',
        click: () => this.showSpotlightWindow(),
      },
      { type: 'separator' },
      { label: 'Settings...', click: () => this.openSettingsWindow() },
    ];

    if (matches && matches.length > 0) {
      template.push({ type: 'separator' });
      template.push({
        label: `${matches.length} suggestion${matches.length > 1 ? 's' : ''}`,
        enabled: false,
      });
      for (const m of matches.slice(0, 5)) {
        template.push({
          label: `${m.resource_type === 'workflow' ? '⚡' : '📄'} ${m.resource_name}`,
          click: () => {
            const settings = this.settingsManager.getSettings();
            const frontendUrl = settings.frontendUrl || 'http://localhost:5173';
            const p =
              m.resource_type === 'workflow'
                ? `/workflow/${m.resource_id}`
                : `/editor/${m.resource_id}`;
            shell.openExternal(`${frontendUrl}${p}`);
          },
        });
      }
    }

    template.push({ type: 'separator' });
    template.push({
      label: 'Quit',
      click: () => {
        this.isQuitting = true;
        app.quit();
      },
    });
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private handleStartupProtocol(): void {
    const protocolUrl = process.argv.find((arg) => arg.startsWith('ondoki://'));
    if (protocolUrl)
      setTimeout(() => this.handleProtocolUrl(protocolUrl), 1000);
  }

  private async handleProtocolUrl(url: string): Promise<void> {
    console.log('Handling protocol URL:', url);
    if (url.startsWith('ondoki://auth/callback')) {
      try {
        const success = await this.authService.handleCallback(url);
        if (
          success &&
          this.spotlightWindow &&
          !this.spotlightWindow.isDestroyed()
        ) {
          const status = await this.authService.getStatus();
          this.spotlightWindow.webContents.send('auth-status-changed', status);
        }
      } catch (error) {
        console.error('Auth callback error:', error);
      }
    }
    setTimeout(() => this.showSpotlightWindow(), 300);
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
