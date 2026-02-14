import { ipcMain, shell, app, WebContents } from 'electron';
import { AuthService } from './auth';
import { SettingsManager } from './settings';
import { RecordingService } from './recording';
import { ScreenshotService } from './screenshot';
import { ChatService } from './chat';
import { SmartAnnotationService } from './smart-annotation';
import { GuideGenerationService } from './guide-generation';
import { CloudUploadService } from './cloud-upload';

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

  // Dispose services on app quit
  app.on('before-quit', () => {
    recordingService.dispose();
    screenshotService.dispose();
  });

  // Recording IPC handlers
  ipcMain.handle('recording:start', async (event, captureArea, projectId) => {
    try {
      await recordingService.startRecording(captureArea, projectId);
      
      // Forward events to renderer + auto-annotate
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

      // Forward annotation results to renderer
      smartAnnotationService.on('step-annotated', (annotatedStep) => {
        event.sender.send('step-annotated', annotatedStep);
      });
      
      recordingService.on('state-changed', (state) => {
        event.sender.send('recording-state-changed', state);
      });
      
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
      return await chatService.sendMessage(messages, context);
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