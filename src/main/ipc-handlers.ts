import { ipcMain, shell, app, WebContents, BrowserWindow, Notification } from 'electron';
import { AuthService } from './auth';
import { SettingsManager } from './settings';
import { RecordingService } from './recording';
import { ScreenshotService } from './screenshot';
import { ChatService } from './chat';
import { CloudUploadService } from './cloud-upload';
import { ContextWatcherService } from './context-watcher';
import { SmartAnnotationService } from './smart-annotation';
import * as path from 'path';
import * as fs from 'fs';

// --- Input validation helpers ---

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
}

function assertOptionalString(value: unknown, name: string): asserts value is string | undefined {
  if (value !== undefined && value !== null && typeof value !== 'string')
    throw new Error(`${name} must be a string`);
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
}

function assertNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${name} must be a non-null object`);
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
}

/** Validate a CaptureArea object from the renderer */
function validateCaptureArea(area: unknown): void {
  assertObject(area, 'captureArea');
  const a = area as Record<string, unknown>;
  if (!['all-displays', 'single-display', 'window'].includes(a.type as string))
    throw new Error('captureArea.type must be all-displays, single-display, or window');
  if (a.displayId !== undefined) assertString(a.displayId, 'captureArea.displayId');
  if (a.displayName !== undefined) assertString(a.displayName, 'captureArea.displayName');
  if (a.windowHandle !== undefined) assertNumber(a.windowHandle, 'captureArea.windowHandle');
  if (a.windowTitle !== undefined) assertString(a.windowTitle, 'captureArea.windowTitle');
  if (a.bounds !== undefined) validateBounds(a.bounds);
}

/** Validate a Rectangle/bounds object */
function validateBounds(bounds: unknown): void {
  assertObject(bounds, 'bounds');
  const b = bounds as Record<string, unknown>;
  assertNumber(b.x, 'bounds.x');
  assertNumber(b.y, 'bounds.y');
  assertNumber(b.width, 'bounds.width');
  assertNumber(b.height, 'bounds.height');
  if (b.width <= 0 || b.height <= 0) throw new Error('bounds width/height must be positive');
  if (b.width > 20000 || b.height > 20000) throw new Error('bounds dimensions exceed maximum');
}

/** Validate settings keys – only allow known setting fields */
const ALLOWED_SETTINGS_KEYS = new Set([
  'cloudEndpoint', 'chatApiUrl', 'apiKey',
  'llmProvider', 'llmApiKey', 'llmModel', 'llmBaseUrl',
  'autoAnnotateSteps', 'autoGenerateGuide', 'frontendUrl',
  'spotlightShortcut', 'recordingShortcut', 'minimizeOnRecord',
]);

function validateSettingsUpdate(settings: unknown): void {
  assertObject(settings, 'settings');
  const s = settings as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key))
      throw new Error(`Unknown settings key: ${key}`);
  }
  // Type-check individual fields if present
  if (s.cloudEndpoint !== undefined) assertString(s.cloudEndpoint, 'cloudEndpoint');
  if (s.chatApiUrl !== undefined) assertString(s.chatApiUrl, 'chatApiUrl');
  if (s.apiKey !== undefined) assertString(s.apiKey, 'apiKey');
  if (s.llmProvider !== undefined) assertString(s.llmProvider, 'llmProvider');
  if (s.llmApiKey !== undefined) assertString(s.llmApiKey, 'llmApiKey');
  if (s.llmModel !== undefined) assertString(s.llmModel, 'llmModel');
  if (s.llmBaseUrl !== undefined) assertString(s.llmBaseUrl, 'llmBaseUrl');
  if (s.autoAnnotateSteps !== undefined) assertBoolean(s.autoAnnotateSteps, 'autoAnnotateSteps');
  if (s.autoGenerateGuide !== undefined) assertBoolean(s.autoGenerateGuide, 'autoGenerateGuide');
  if (s.frontendUrl !== undefined) assertString(s.frontendUrl, 'frontendUrl');
  if (s.spotlightShortcut !== undefined) assertString(s.spotlightShortcut, 'spotlightShortcut');
  if (s.recordingShortcut !== undefined) assertString(s.recordingShortcut, 'recordingShortcut');
  if (s.minimizeOnRecord !== undefined) assertBoolean(s.minimizeOnRecord, 'minimizeOnRecord');
}

/** Validate a chat message array */
function validateChatMessages(messages: unknown): void {
  assertArray(messages, 'messages');
  if ((messages as unknown[]).length === 0) throw new Error('messages must not be empty');
  if ((messages as unknown[]).length > 200) throw new Error('messages exceeds maximum length');
  for (const msg of messages as unknown[]) {
    assertObject(msg, 'message');
    const m = msg as Record<string, unknown>;
    if (!['system', 'user', 'assistant'].includes(m.role as string))
      throw new Error('message.role must be system, user, or assistant');
    assertString(m.content, 'message.content');
    if ((m.content as string).length > 100_000)
      throw new Error('message.content exceeds maximum length');
  }
}

/** Validate URL for openExternal — allow only https and mailto */
function validateExternalUrl(url: unknown): void {
  assertString(url, 'url');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid URL'); }
  const allowed = ['https:', 'mailto:'];
  if (!allowed.includes(parsed.protocol))
    throw new Error(`Protocol ${parsed.protocol} is not allowed. Only https: and mailto: are permitted.`);
}

/** Validate that a path does not contain traversal sequences */
function validateNoPathTraversal(filePath: unknown, name: string): void {
  assertString(filePath, name);
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) throw new Error(`${name} must not contain path traversal`);
}

/** Validate a UUID-like string (alphanumeric + hyphens, reasonable length) */
function validateId(value: unknown, name: string): void {
  assertString(value, name);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new Error(`${name} must be alphanumeric (with hyphens/underscores), max 128 chars`);
}

export function setupIpcHandlers(
  authService: AuthService,
  settingsManager: SettingsManager
): void {
  const recordingService = new RecordingService();
  const screenshotService = new ScreenshotService();
  const chatService = new ChatService(() => authService.getAccessToken(), settingsManager);
  const cloudUploadService = new CloudUploadService(() => authService.getAccessToken(), settingsManager);
  const contextWatcher = new ContextWatcherService();
  const smartAnnotation = new SmartAnnotationService(chatService);

  // Track recorded steps for auto-upload
  let currentRecordingSteps: any[] = [];
  let currentProjectId: string = '';
  let currentUserId: string = '';

  app.on('before-quit', () => {
    recordingService.dispose();
    screenshotService.dispose();
  });

  // Recording IPC handlers
  ipcMain.handle('recording:start', async (event, captureArea, projectId) => {
    try {
      validateCaptureArea(captureArea);
      assertOptionalString(projectId, 'projectId');

      recordingService.removeAllListeners('step-recorded');
      recordingService.removeAllListeners('state-changed');

      currentRecordingSteps = [];
      currentProjectId = projectId || '';

      // Configure ignored shortcuts so they don't create steps
      const settings = settingsManager.getSettings();
      recordingService.setIgnoredShortcuts([
        settings.spotlightShortcut || 'Ctrl+Shift+Space',
        settings.recordingShortcut || 'Ctrl+Shift+R',
      ]);

      // Get userId from auth
      try {
        const status = await authService.getStatus();
        currentUserId = status?.user?.id || '';
      } catch {}

      // Reset annotation service for new recording
      smartAnnotation.clearQueue();

      // Start streaming upload session (images upload in background during recording)
      cloudUploadService.beginSession(currentUserId, currentProjectId).catch((e) => {
        console.warn('[Upload] Failed to begin streaming session:', e.message);
      });

      // Forward upload progress to renderer during recording
      const progressHandler = (progress: any) => {
        event.sender.send('upload:progress', progress);
      };
      cloudUploadService.on('upload-progress', progressHandler);

      recordingService.on('step-recorded', (step) => {
        currentRecordingSteps.push(step);
        event.sender.send('step-recorded', step);

        // Stream-upload screenshot in background
        if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
          cloudUploadService.enqueueImage(step.stepNumber, step.screenshotPath);
        }
      });

      recordingService.on('state-changed', (state) => {
        event.sender.send('recording-state-changed', state);
      });

      await recordingService.startRecording(captureArea, projectId);
      app.emit('recording-started');
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle('recording:stop', async (event) => {
    try {
      await recordingService.stopRecording();
      app.emit('recording-stopped');

      if (currentRecordingSteps.length > 0 && currentProjectId) {
        event.sender.send('upload:started');

        // Batch-annotate the full workflow (10s timeout) — runs in parallel with drain
        let workflowTitle: string | undefined;
        const aiAvailable = settingsManager.isLlmConfigured() || !!authService.getAccessToken();
        const autoAnnotate = settingsManager.getSettings().autoAnnotateSteps !== false;
        if (aiAvailable && autoAnnotate) {
          try {
            const annotationPromise = smartAnnotation.annotateWorkflow(currentRecordingSteps);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
            const annotation = await Promise.race([annotationPromise, timeoutPromise]);

            if (annotation) {
              workflowTitle = annotation.workflowTitle;
              for (const stepAnnotation of annotation.steps) {
                const idx = currentRecordingSteps.findIndex(
                  (s) => s.stepNumber === stepAnnotation.stepNumber
                );
                if (idx !== -1) {
                  currentRecordingSteps[idx].generatedTitle = stepAnnotation.title;
                }
              }
              console.log(`[SmartAnnotation] Workflow annotated: "${workflowTitle}" (${annotation.steps.length} steps)`);
            } else {
              console.warn('[SmartAnnotation] Annotation timed out after 10s, uploading raw data');
            }
          } catch (annotationError) {
            console.error('[SmartAnnotation] Annotation failed, uploading raw data:', annotationError);
          }
        }

        try {
          // finishUpload waits for in-flight images, then sends metadata + finalizes
          const result = await cloudUploadService.finishUpload(
            currentRecordingSteps,
            currentUserId,
            currentProjectId,
            workflowTitle
          );
          event.sender.send('upload:complete', result);

          // Open the workflow in browser
          if (result?.url) {
            shell.openExternal(result.url);
          } else if (result?.recordingId) {
            const settings = settingsManager.getSettings();
            const frontendUrl = (settings.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
            shell.openExternal(`${frontendUrl}/workflow/${result.recordingId}`);
          }

          if (Notification.isSupported()) {
            new Notification({
              title: 'Recording uploaded',
              body: `${currentRecordingSteps.length} steps uploaded successfully`,
              silent: true,
            }).show();
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          event.sender.send('upload:error', errorMsg);

          if (Notification.isSupported()) {
            new Notification({ title: 'Upload failed', body: errorMsg, silent: false }).show();
          }
        }
      }

      currentRecordingSteps = [];
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
      if (bounds !== undefined && bounds !== null) validateBounds(bounds);
      return await screenshotService.takeScreenshot(bounds); }
    catch (error) { throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`); }
  });

  ipcMain.handle('screenshot:get-displays', async () => {
    try { return await screenshotService.getDisplays(); }
    catch (error) { throw new Error(`Failed to get displays: ${error instanceof Error ? error.message : String(error)}`); }
  });

  ipcMain.handle('screenshot:get-windows', async () => {
    try { return await screenshotService.getWindows(); }
    catch (error) { throw new Error(`Failed to get windows: ${error instanceof Error ? error.message : String(error)}`); }
  });

  // Authentication IPC handlers
  ipcMain.handle('auth:initiate-login', async () => {
    try { await authService.initiateLogin(); return { success: true }; }
    catch (error) { throw new Error(`Failed to initiate login: ${error instanceof Error ? error.message : String(error)}`); }
  });

  ipcMain.handle('auth:handle-callback', async (event, url) => {
    try {
      assertString(url, 'url');
      const success = await authService.handleCallback(url);
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
  ipcMain.handle('settings:get', () => settingsManager.getSettings());

  ipcMain.handle('settings:save', async (event, settings) => {
    try {
      validateSettingsUpdate(settings);
      await settingsManager.saveSettings(settings); return { success: true }; }
    catch (error) { throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`); }
  });

  ipcMain.handle('settings:reset', async () => {
    try { await settingsManager.resetSettings(); return { success: true }; }
    catch (error) { throw new Error(`Failed to reset settings: ${error instanceof Error ? error.message : String(error)}`); }
  });

  // Chat IPC handlers
  ipcMain.handle('chat:send-message', async (event, messages, context) => {
    try {
      validateChatMessages(messages);
      assertOptionalString(context, 'context');
      let enrichedContext = context;
      try {
        const activeCtx = await contextWatcher.getActiveContext();
        const contextParts: string[] = [];
        if (context) contextParts.push(context);
        if (activeCtx) {
          contextParts.push(`Active context: ${activeCtx.appName}${activeCtx.windowTitle ? ' — ' + activeCtx.windowTitle : ''}${activeCtx.url ? ' (' + activeCtx.url + ')' : ''}`);
        }
        if (contextParts.length > 0) enrichedContext = contextParts.join('\n\n');
      } catch {}
      return await chatService.sendMessage(messages, enrichedContext);
    } catch (error) {
      throw new Error(`Failed to send chat message: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Cloud upload IPC handlers (manual trigger still available)
  ipcMain.handle('cloud:upload', async (event, steps, projectId, userId) => {
    try {
      assertArray(steps, 'steps');
      assertString(projectId, 'projectId');
      assertString(userId, 'userId');
      return await cloudUploadService.uploadRecording(steps, userId, projectId); }
    catch (error) { throw new Error(`Failed to upload recording: ${error instanceof Error ? error.message : String(error)}`); }
  });

  // Context watcher IPC handlers
  ipcMain.handle('context:start', async (event, projectId) => {
    assertString(projectId, 'projectId');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };

    contextWatcher.configure(settings.chatApiUrl || settings.cloudEndpoint, token, projectId);

    contextWatcher.removeAllListeners();
    contextWatcher.on('matches', (matches, ctx) => {
      const windows = BrowserWindow.getAllWindows();
      for (const w of windows) w.webContents.send('context:matches', matches, ctx);
      app.emit('context-matches-updated', matches, ctx);
    });
    contextWatcher.on('no-matches', (ctx) => {
      const windows = BrowserWindow.getAllWindows();
      for (const w of windows) w.webContents.send('context:no-matches', ctx);
      app.emit('context-no-matches');
    });

    contextWatcher.start();
    return { success: true };
  });

  ipcMain.handle('context:get-active', async () => {
    // Prefer cached context from watch mode (always has the last real window before spotlight)
    return contextWatcher.getLastActiveContext() || await contextWatcher.getActiveContext();
  });

  ipcMain.handle('context:force-match', async () => {
    return await contextWatcher.forceMatchCheck();
  });

  ipcMain.handle('context:add-link', async (event, data) => {
    assertObject(data, 'data');
    const d = data as Record<string, unknown>;
    assertString(d.project_id, 'project_id');
    assertString(d.match_type, 'match_type');
    assertString(d.match_value, 'match_value');
    assertString(d.resource_type, 'resource_type');
    assertString(d.resource_id, 'resource_id');
    assertOptionalString(d.note, 'note');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/context-links`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return { error: `API error: ${res.status}` };
    return await res.json();
  });

  ipcMain.handle('context:list-links', async (event, projectId) => {
    assertOptionalString(projectId, 'projectId');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const params = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const res = await fetch(`${apiBase}/context-links${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json();
  });

  ipcMain.handle('context:delete-link', async (event, linkId) => {
    validateId(linkId, 'linkId');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { error: 'Not authenticated' };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/context-links/${encodeURIComponent(linkId)}`, {
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

  // Removed unexposed IPC channels: context:add-manual, context:remove-manual,
  // context:get-manual, context:get-clipboard, context:set-clipboard-watching,
  // context:take-screenshot — these were not exposed via preload and expanded
  // the attack surface unnecessarily.

  // Spotlight IPC
  ipcMain.handle('spotlight:search', async (event, query, projectId) => {
    assertString(query, 'query');
    assertString(projectId, 'projectId');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { results: [] };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    // Use unified-v2 (RRF fusion of keyword + semantic)
    const u = new URL(`${apiBase}/search/unified-v2`);
    u.searchParams.set('q', query);
    u.searchParams.set('project_id', projectId);
    u.searchParams.set('limit', '20');
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { results: [] };
    return await res.json();
  });

  // Keep for backward compat but also route to unified-v2
  ipcMain.handle('spotlight:semantic-search', async (event, query, projectId) => {
    assertString(query, 'query');
    assertString(projectId, 'projectId');
    const settings = settingsManager.getSettings();
    const token = authService.getAccessToken();
    if (!token) return { results: [] };
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint).replace(/\/+$/, '');
    const u = new URL(`${apiBase}/search/unified-v2`);
    u.searchParams.set('q', query);
    u.searchParams.set('project_id', projectId);
    u.searchParams.set('limit', '20');
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { results: [] };
    return await res.json();
  });

  ipcMain.handle('spotlight:preview', async (_event, resourceId, resourceType) => {
    validateId(resourceId, 'resourceId');
    assertString(resourceType, 'resourceType');
    if (!['workflow', 'document'].includes(resourceType))
      throw new Error('resourceType must be workflow or document');
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
    } catch { return { preview: null }; }
  });

  // Removed unexposed IPC channel: spotlight:open

  // Utility IPC handlers
  ipcMain.handle('utility:open-external', async (event, url) => {
    try {
      validateExternalUrl(url);
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to open external URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Removed unexposed IPC channel: utility:show-in-folder (path traversal risk, not used by renderer)

  ipcMain.handle('utility:get-version', () => app.getVersion());
  ipcMain.handle('utility:get-platform', () => process.platform);

  // Auth event forwarding
  authService.on('status-changed', (status) => {
    const allWebContents = require('electron').webContents.getAllWebContents();
    allWebContents.forEach((webContents: WebContents) => {
      if (!webContents.isDestroyed()) webContents.send('auth-status-changed', status);
    });
  });

  authService.on('force-logout', () => {
    const allWebContents = require('electron').webContents.getAllWebContents();
    allWebContents.forEach((webContents: WebContents) => {
      if (!webContents.isDestroyed()) webContents.send('force-logout');
    });
  });
}
