import { ipcMain, shell, app, WebContents, BrowserWindow, Notification } from 'electron';
import { AuthService } from './auth';
import { SettingsManager } from './settings';
import { RecordingService } from './recording';
import { ScreenshotService } from './screenshot';
import { ChatService } from './chat';
import { SmartAnnotationService } from './smart-annotation';
import { GuideGenerationService } from './guide-generation';
import { CloudUploadService } from './cloud-upload';
import { ContextWatcherService } from './context-watcher';

export function setupIpcHandlers(
  authService: AuthService,
  settingsManager: SettingsManager
): void {
  // Create service instances
  const recordingService = new RecordingService();
  const screenshotService = new ScreenshotService();
  const chatService = new ChatService(() => authService.getAccessToken(), settingsManager);
  const smartAnnotationService = new SmartAnnotationService(chatService);
  const guideGenerationService = new GuideGenerationService(chatService);
  const cloudUploadService = new CloudUploadService(() => authService.getAccessToken(), settingsManager);
  const contextWatcher = new ContextWatcherService();

  // Dispose services on app quit
  app.on('before-quit', () => {
    recordingService.dispose();
    screenshotService.dispose();
  });

  // Recording IPC handlers
  ipcMain.handle('recording:start', async (event, captureArea, projectId) => {
    try {
      // Remove stale listeners BEFORE starting to prevent race conditions
      recordingService.removeAllListeners('step-recorded');
      recordingService.removeAllListeners('state-changed');
      smartAnnotationService.removeAllListeners('step-annotated');

      // Set up new listeners BEFORE starting so we don't miss early events
      recordingService.on('step-recorded', (step) => {
        event.sender.send('step-recorded', step);

        // Auto-annotate if enabled
        const settings = settingsManager.getSettings();
        console.log('[IPC] Step recorded. autoAnnotate:', settings.autoAnnotateSteps, 'llmConfigured:', settingsManager.isLlmConfigured());
        if (settings.autoAnnotateSteps && settingsManager.isLlmConfigured()) {
          console.log('[IPC] Enqueuing step', step.stepNumber, 'for annotation');
          smartAnnotationService.enqueueStep(step);
        }
      });

      smartAnnotationService.on('step-annotated', (annotatedStep) => {
        event.sender.send('step-annotated', annotatedStep);
      });
      
      recordingService.on('state-changed', (state) => {
        event.sender.send('recording-state-changed', state);
      });

      await recordingService.startRecording(captureArea, projectId);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('recording:stop', async () => {
    try {
      await recordingService.stopRecording();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('recording:pause', async () => {
    try {
      recordingService.pauseRecording();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to pause recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('recording:resume', async () => {
    try {
      recordingService.resumeRecording();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to resume recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('recording:get-state', () => {
    return recordingService.getState();
  });

  // Screenshot IPC handlers
  ipcMain.handle('screenshot:take', async (event, bounds) => {
    try {
      return await screenshotService.takeScreenshot(bounds);
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('screenshot:get-displays', async () => {
    try {
      return await screenshotService.getDisplays();
    } catch (error) {
      throw new Error(`Failed to get displays: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('screenshot:get-windows', async () => {
    try {
      return await screenshotService.getWindows();
    } catch (error) {
      throw new Error(`Failed to get windows: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Authentication IPC handlers
  ipcMain.handle('auth:initiate-login', async () => {
    try {
      await authService.initiateLogin();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to initiate login: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('auth:handle-callback', async (event, url) => {
    try {
      const success = await authService.handleCallback(url);
      
      // Notify renderer of auth status change
      const status = await authService.getStatus();
      event.sender.send('auth-status-changed', status);
      
      return success;
    } catch (error) {
      throw new Error(`Failed to handle auth callback: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('auth:logout', async (event) => {
    try {
      await authService.logout();
      
      // Notify renderer of auth status change
      const status = await authService.getStatus();
      event.sender.send('auth-status-changed', status);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to logout: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('auth:get-status', async () => {
    return await authService.getStatus();
  });

  ipcMain.handle('auth:try-auto-login', async (event) => {
    try {
      const success = await authService.tryAutoLogin();
      
      if (success) {
        // Notify renderer of auth status change
        const status = await authService.getStatus();
        event.sender.send('auth-status-changed', status);
      }
      
      return success;
    } catch (error) {
      console.error('Auto-login failed:', error);
      return false;
    }
  });

  // Settings IPC handlers
  ipcMain.handle('settings:get', () => {
    return settingsManager.getSettings();
  });

  ipcMain.handle('settings:save', async (event, settings) => {
    try {
      await settingsManager.saveSettings(settings);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('settings:reset', async () => {
    try {
      await settingsManager.resetSettings();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to reset settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Chat IPC handlers
  ipcMain.handle('chat:send-message', async (event, messages, context) => {
    try {
      // Auto-enrich context with active window info and manual context
      let enrichedContext = context;
      try {
        const activeCtx = await contextWatcher.getActiveContext();
        const contextParts: string[] = [];

        if (context) contextParts.push(context);

        if (activeCtx) {
          contextParts.push(`Active context: ${activeCtx.appName}${activeCtx.windowTitle ? ' — ' + activeCtx.windowTitle : ''}${activeCtx.url ? ' (' + activeCtx.url + ')' : ''}`);
        }

        if (manualContextItems.length > 0) {
          const manualStr = manualContextItems.map(item =>
            `[${item.type}${item.label ? ': ' + item.label : ''}] ${item.content.slice(0, 500)}`
          ).join('\n');
          contextParts.push(`User-provided context:\n${manualStr}`);
        }

        if (clipboardWatchingEnabled) {
          const { clipboard } = require('electron');
          const currentClipboard = clipboard.readText();
          if (currentClipboard && currentClipboard !== lastClipboardText) {
            lastClipboardText = currentClipboard;
            contextParts.push(`Recent clipboard: ${currentClipboard.slice(0, 300)}`);
          }
        }

        if (contextParts.length > 0) {
          enrichedContext = contextParts.join('\n\n');
        }
      } catch {
        // Use original context if enrichment fails
      }

      return await chatService.sendMessage(messages, enrichedContext);
    } catch (error) {
      throw new Error(`Failed to send chat message: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Guide generation IPC handlers
  ipcMain.handle('guide:generate', async (event, steps) => {
    try {
      return await guideGenerationService.generateGuide(steps);
    } catch (error) {
      throw new Error(`Failed to generate guide: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Smart annotation IPC handlers
  ipcMain.handle('annotation:annotate-step', async (event, step) => {
    try {
      return await smartAnnotationService.annotateStep(step);
    } catch (error) {
      throw new Error(`Failed to annotate step: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Cloud upload IPC handlers
  ipcMain.handle('cloud:upload', async (event, steps, projectId, userId) => {
    try {
      return await cloudUploadService.uploadRecording(steps, userId, projectId);
    } catch (error) {
      throw new Error(`Failed to upload recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Context watcher IPC handlers
  ipcMain.handle('context:start', async (event, projectId: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };

    contextWatcher.configure(settings.chatApiUrl || settings.cloudEndpoint, token, projectId);

    contextWatcher.removeAllListeners();
    contextWatcher.on('matches', (matches, ctx) => {
      const windows = BrowserWindow.getAllWindows();
      for (const w of windows) {
        w.webContents.send('context:matches', matches, ctx);
      }

      // Emit to main process for tray updates
      app.emit('context-matches-updated', matches, ctx);

      // Show native notification so user sees matches even when Ondoki is in background
      if (Notification.isSupported() && matches.length > 0) {
        const title = matches.length === 1
          ? `${matches[0].resource_name}`
          : `${matches.length} context suggestions`;
        const body = matches
          .slice(0, 3)
          .map((m: any) => m.note ? `${m.resource_name}: ${m.note}` : m.resource_name)
          .join('\n');
        const notif = new Notification({ title, body, silent: true });
        notif.on('click', () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) { win.show(); win.focus(); }
        });
        notif.show();
      }
    });
    contextWatcher.on('no-matches', (ctx) => {
      const windows = BrowserWindow.getAllWindows();
      for (const w of windows) {
        w.webContents.send('context:no-matches', ctx);
      }

      // Emit to main process for tray updates
      app.emit('context-no-matches');
    });

    contextWatcher.start();
    return { success: true };
  });

  ipcMain.handle('context:get-active', async () => {
    return await contextWatcher.getActiveContext();
  });

  ipcMain.handle('context:add-link', async (event, data: {
    project_id: string;
    match_type: string;
    match_value: string;
    resource_type: string;
    resource_id: string;
    note?: string;
  }) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };

    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/context-links`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) return { error: `API error: ${res.status}` };
    return await res.json();
  });

  ipcMain.handle('context:list-links', async (event, projectId?: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };

    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const params = projectId ? `?project_id=${projectId}` : '';
    const res = await fetch(`${apiBase}/context-links${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) return [];
    return await res.json();
  });

  ipcMain.handle('context:delete-link', async (event, linkId: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };

    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/context-links/${linkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) return { error: `API error: ${res.status}` };
    return { ok: true };
  });

  ipcMain.handle('context:stop', async () => {
    contextWatcher.stop();
    return { success: true };
  });

  // Manual context items (in-memory store, shared across windows)
  let manualContextItems: { type: string; content: string; label?: string }[] = [];
  let clipboardWatchingEnabled = false;
  let lastClipboardText = '';

  ipcMain.handle('context:add-manual', async (_event, item: { type: string; content: string; label?: string }) => {
    manualContextItems.push(item);
    return { success: true, items: manualContextItems };
  });

  ipcMain.handle('context:remove-manual', async (_event, index: number) => {
    if (index >= 0 && index < manualContextItems.length) {
      manualContextItems.splice(index, 1);
    }
    return { success: true, items: manualContextItems };
  });

  ipcMain.handle('context:get-manual', async () => {
    return manualContextItems;
  });

  ipcMain.handle('context:get-clipboard', async () => {
    const { clipboard } = require('electron');
    return clipboard.readText();
  });

  ipcMain.handle('context:set-clipboard-watching', async (_event, enabled: boolean) => {
    clipboardWatchingEnabled = enabled;
    if (enabled) {
      const { clipboard } = require('electron');
      lastClipboardText = clipboard.readText();
    }
    return { success: true };
  });

  ipcMain.handle('context:take-screenshot', async () => {
    try {
      const screenshot = require('screenshot-desktop');
      const imgBuffer = await screenshot();
      return imgBuffer.toString('base64');
    } catch (err) {
      console.error('Failed to take context screenshot:', err);
      return null;
    }
  });

  // Spotlight IPC
  ipcMain.handle('spotlight:search', async (event, query: string, projectId: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { results: [] };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const u = new URL(`${apiBase}/search/unified`);
    u.searchParams.set('q', query);
    u.searchParams.set('project_id', projectId);
    u.searchParams.set('limit', '20');
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { results: [] };
    return await res.json();
  });

  ipcMain.handle('spotlight:semantic-search', async (event, query: string, projectId: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { results: [] };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const u = new URL(`${apiBase}/search/unified-semantic`);
    u.searchParams.set('q', query);
    u.searchParams.set('project_id', projectId);
    u.searchParams.set('limit', '20');
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { results: [] };
    return await res.json();
  });

  ipcMain.handle('spotlight:preview', async (_event, resourceId: string, resourceType: string) => {
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { preview: null };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    try {
      const endpoint = resourceType === 'workflow'
        ? `${apiBase}/workflows/${resourceId}`
        : `${apiBase}/documents/${resourceId}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { preview: null };
      return { preview: await res.json() };
    } catch {
      return { preview: null };
    }
  });

  ipcMain.handle('spotlight:open', async (event, projectId?: string) => {
    app.emit('spotlight:open', projectId || '');
    return { ok: true };
  });

  // Utility IPC handlers
  ipcMain.handle('utility:open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('utility:show-in-folder', async (event, path) => {
    try {
      shell.showItemInFolder(path);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to show item in folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('utility:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('utility:get-platform', () => {
    return process.platform;
  });

  // Set up auth service event forwarding
  authService.on('status-changed', (status) => {
    // Broadcast to all renderer processes
    const allWebContents = require('electron').webContents.getAllWebContents();
    allWebContents.forEach((webContents: WebContents) => {
      if (!webContents.isDestroyed()) {
        webContents.send('auth-status-changed', status);
      }
    });
  });

  authService.on('force-logout', () => {
    // Broadcast force logout to all renderer processes
    const allWebContents = require('electron').webContents.getAllWebContents();
    allWebContents.forEach((webContents: WebContents) => {
      if (!webContents.isDestroyed()) {
        webContents.send('force-logout');
      }
    });
  });
}