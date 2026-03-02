import { EventEmitter } from 'events';
import { app } from 'electron';
import { SettingsManager } from './settings';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadResult {
  success: boolean;
  error?: string;
  url?: string;
  recordingId?: string;
  localFallbackPath?: string;
}

export interface UploadProgress {
  currentFile: number;
  totalFiles: number;
  fileProgress: number;
  totalProgress: number;
  status: string;
}

export class CloudUploadService extends EventEmitter {
  private accessTokenProvider: () => string | undefined;
  private settingsManager: SettingsManager;

  constructor(accessTokenProvider: () => string | undefined, settingsManager: SettingsManager) {
    super();
    this.accessTokenProvider = accessTokenProvider;
    this.settingsManager = settingsManager;
  }

  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS_MS = [1000, 2000, 4000];

  public async uploadRecording(
    steps: any[],
    userId?: string,
    projectId?: string,
    workflowTitle?: string
  ): Promise<UploadResult> {
    const accessToken = this.accessTokenProvider();
    if (!accessToken) {
      throw new Error('Authentication required for cloud upload');
    }

    const settings = this.settingsManager.getSettings();
    const baseUrl = settings.cloudEndpoint;
    if (!baseUrl) {
      throw new Error('Cloud endpoint not configured');
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= CloudUploadService.MAX_RETRIES; attempt++) {
      try {
        const result = await this.attemptUpload(steps, baseUrl, accessToken, userId, projectId, workflowTitle);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Upload attempt ${attempt}/${CloudUploadService.MAX_RETRIES} failed:`, lastError.message);

        if (attempt < CloudUploadService.MAX_RETRIES) {
          const delay = CloudUploadService.RETRY_DELAYS_MS[attempt - 1];
          this.emitProgress(`Upload failed, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${CloudUploadService.MAX_RETRIES})`, 0, 0, 0);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted — save locally as fallback
    const msg = lastError?.message || 'Upload failed after all retries';
    console.error('All upload retries exhausted, saving recording locally');
    const fallbackPath = this.saveRecordingLocally(steps);
    this.emit('upload-failed', msg);
    return { success: false, error: `${msg}. Recording saved locally at: ${fallbackPath}`, localFallbackPath: fallbackPath };
  }

  private async attemptUpload(
    steps: any[],
    baseUrl: string,
    accessToken: string,
    userId?: string,
    projectId?: string,
    workflowTitle?: string
  ): Promise<UploadResult> {
    // Step 1: Create upload session
    this.emitProgress('Preparing upload...', 0, 0, 0);
    const sessionId = await this.createSession(baseUrl, accessToken, userId, projectId, workflowTitle);
    if (!sessionId) {
      throw new Error('Failed to create upload session');
    }

    // Step 2: Upload metadata
    this.emitProgress('Uploading metadata...', 0, 0, 10);
    await this.uploadMetadata(baseUrl, accessToken, sessionId, steps);

    // Step 3: Upload images
    const stepsWithImages = steps.filter(s => s.screenshotPath && fs.existsSync(s.screenshotPath));
    const totalFiles = stepsWithImages.length;
    let currentFile = 0;

    for (const step of stepsWithImages) {
      currentFile++;
      this.emitProgress(
        `Uploading image ${currentFile}/${totalFiles}...`,
        currentFile, totalFiles,
        10 + Math.round((currentFile / totalFiles) * 80)
      );

      await this.uploadImage(baseUrl, accessToken, sessionId, step.stepNumber, step.screenshotPath);
    }

    // Step 4: Finalize
    this.emitProgress('Finalizing upload...', totalFiles, totalFiles, 95);
    const finalizeData = await this.finalizeSession(baseUrl, accessToken, sessionId);

    this.emitProgress('Upload completed successfully!', totalFiles, totalFiles, 100);

    return {
      success: true,
      url: finalizeData?.url,
      recordingId: finalizeData?.workflow_id || finalizeData?.workflowId || finalizeData?.id || sessionId,
    };
  }

  private saveRecordingLocally(steps: any[]): string {
    const fallbackDir = path.join(app.getPath('userData'), 'Ondoki', 'failed-uploads');
    fs.mkdirSync(fallbackDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fallbackPath = path.join(fallbackDir, `recording-${timestamp}.json`);

    const data = {
      savedAt: new Date().toISOString(),
      reason: 'Cloud upload failed after all retries',
      steps: steps.map(s => ({
        ...s,
        screenshotPath: s.screenshotPath && fs.existsSync(s.screenshotPath) ? s.screenshotPath : undefined,
      })),
    };

    fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Recording saved locally: ${fallbackPath}`);
    return fallbackPath;
  }

  private async createSession(
    baseUrl: string, token: string, userId?: string, projectId?: string, workflowTitle?: string
  ): Promise<string | null> {
    const payload: Record<string, any> = {
      timestamp: new Date().toISOString(),
      client: 'OndokiDesktop-Electron',
      user_id: userId,
      project_id: projectId,
    };
    if (workflowTitle) {
      payload.workflow_title = workflowTitle;
    }

    const response = await fetch(`${baseUrl}/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${text}`);
    }

    const result = await response.json();
    return result.sessionId || result.session_id || null;
  }

  private async uploadMetadata(
    baseUrl: string, token: string, sessionId: string, steps: any[]
  ): Promise<void> {
    const metadata = steps.map(s => ({
      stepNumber: s.stepNumber,
      timestamp: s.timestamp,
      actionType: s.actionType,
      windowTitle: s.windowTitle,
      description: s.description,
      globalPosition: s.globalMousePosition,
      relativePosition: s.relativeMousePosition,
      windowSize: s.windowSize,
      screenshotRelativePosition: s.screenshotRelativeMousePosition,
      screenshotSize: s.screenshotSize,
      textTyped: s.textTyped,
      scrollDelta: s.scrollDelta,
      generatedTitle: s.generatedTitle,
      generatedDescription: s.generatedDescription,
    }));

    const response = await fetch(`${baseUrl}/session/${sessionId}/metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upload metadata: ${response.status} ${text}`);
    }
  }

  private async uploadImage(
    baseUrl: string, token: string, sessionId: string,
    stepNumber: number, filePath: string
  ): Promise<void> {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', blob, `step_${stepNumber}.png`);
    formData.append('stepNumber', String(stepNumber));

    const response = await fetch(`${baseUrl}/session/${sessionId}/image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upload image for step ${stepNumber}: ${response.status} ${text}`);
    }
  }

  private async finalizeSession(
    baseUrl: string, token: string, sessionId: string
  ): Promise<Record<string, any> | null> {
    const response = await fetch(`${baseUrl}/session/${sessionId}/finalize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn(`Finalize returned ${response.status}`);
      return null;
    }

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private emitProgress(status: string, current: number, total: number, percentage: number): void {
    this.emit('upload-progress', {
      currentFile: current,
      totalFiles: total,
      fileProgress: percentage,
      totalProgress: percentage,
      status,
    } as UploadProgress);
    this.emit('status-changed', status);
  }
}
