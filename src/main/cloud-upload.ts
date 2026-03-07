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

/**
 * Streaming upload service.
 *
 * Flow:
 *   1. beginSession()    — called on recording start, creates upload session
 *   2. enqueueImage()    — called per step, uploads image in background
 *   3. finishUpload()    — called on recording stop, uploads metadata + finalizes
 *
 * Images upload in the background during recording. By the time the user stops,
 * most/all images are already on the server. The stop path only needs to send
 * metadata and finalize — typically <2s.
 */
export class CloudUploadService extends EventEmitter {
  private accessTokenProvider: () => string | undefined;
  private settingsManager: SettingsManager;

  // Streaming session state
  private activeSessionId: string | null = null;
  private activeBaseUrl: string | null = null;
  private uploadQueue: Array<{ stepNumber: number; filePath: string }> = [];
  private uploadedCount = 0;
  private totalEnqueued = 0;
  private uploading = false;
  private concurrency = 3;

  constructor(accessTokenProvider: () => string | undefined, settingsManager: SettingsManager) {
    super();
    this.accessTokenProvider = accessTokenProvider;
    this.settingsManager = settingsManager;
  }

  // ------------------------------------------------------------------
  // Streaming API
  // ------------------------------------------------------------------

  /**
   * Create an upload session at the start of recording.
   * Returns the session ID or null on failure (recording still works locally).
   */
  public async beginSession(userId?: string, projectId?: string): Promise<string | null> {
    this.resetStreamingState();

    const accessToken = this.accessTokenProvider();
    if (!accessToken) {
      console.warn('[Upload] No auth token — streaming upload disabled for this recording');
      return null;
    }

    const settings = this.settingsManager.getSettings();
    const baseUrl = settings.cloudEndpoint;
    if (!baseUrl) {
      console.warn('[Upload] No cloud endpoint — streaming upload disabled');
      return null;
    }

    try {
      const sessionId = await this.createSession(baseUrl, accessToken, userId, projectId);
      if (sessionId) {
        this.activeSessionId = sessionId;
        this.activeBaseUrl = baseUrl;
        console.log(`[Upload] Streaming session started: ${sessionId}`);
      }
      return sessionId;
    } catch (e) {
      console.warn('[Upload] Failed to create session, will retry on stop:', (e as Error).message);
      return null;
    }
  }

  /**
   * Queue an image for background upload. Called each time a step screenshot is saved.
   * Non-blocking — returns immediately.
   */
  public enqueueImage(stepNumber: number, filePath: string): void {
    this.totalEnqueued++;
    this.uploadQueue.push({ stepNumber, filePath });
    this.emitStreamingProgress();
    this.drainQueue();
  }

  /**
   * Finalize the upload after recording stops.
   * Waits for any in-flight image uploads, sends metadata, and finalizes.
   */
  public async finishUpload(
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

    // If no streaming session, create one now (fallback)
    if (!this.activeSessionId) {
      const sessionId = await this.createSession(baseUrl, accessToken, userId, projectId, workflowTitle);
      if (!sessionId) throw new Error('Failed to create upload session');
      this.activeSessionId = sessionId;
      this.activeBaseUrl = baseUrl;

      // Upload all images now (no streaming happened)
      for (const step of steps) {
        if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
          this.enqueueImage(step.stepNumber, step.screenshotPath);
        }
      }
    }

    // Wait for all queued image uploads to complete
    await this.waitForDrain();

    // Upload metadata
    this.emit('status-changed', 'Uploading metadata...');
    await this.uploadMetadata(baseUrl, accessToken, this.activeSessionId, steps);

    // Finalize
    this.emit('status-changed', 'Finalizing...');
    const finalizeData = await this.finalizeSession(baseUrl, accessToken, this.activeSessionId);

    const result: UploadResult = {
      success: true,
      url: finalizeData?.url,
      recordingId: finalizeData?.workflow_id || finalizeData?.workflowId || finalizeData?.id || this.activeSessionId,
    };

    this.emitProgress('Upload complete!', this.uploadedCount, this.totalEnqueued, 100);
    this.resetStreamingState();
    return result;
  }

  /**
   * Cancel the active streaming session (e.g. user discards recording).
   */
  public cancelSession(): void {
    this.resetStreamingState();
  }

  /**
   * Get current streaming progress.
   */
  public getStreamingProgress(): { uploaded: number; total: number } {
    return { uploaded: this.uploadedCount, total: this.totalEnqueued };
  }

  // ------------------------------------------------------------------
  // Legacy batch API (kept for compatibility)
  // ------------------------------------------------------------------

  public async uploadRecording(
    steps: any[],
    userId?: string,
    projectId?: string,
    workflowTitle?: string
  ): Promise<UploadResult> {
    // If there's already a streaming session, just finish it
    if (this.activeSessionId) {
      return this.finishUpload(steps, userId, projectId, workflowTitle);
    }

    // Otherwise fall back to batch upload
    const accessToken = this.accessTokenProvider();
    if (!accessToken) throw new Error('Authentication required');

    const settings = this.settingsManager.getSettings();
    const baseUrl = settings.cloudEndpoint;
    if (!baseUrl) throw new Error('Cloud endpoint not configured');

    try {
      return await this.attemptBatchUpload(steps, baseUrl, accessToken, userId, projectId, workflowTitle);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const fallbackPath = this.saveRecordingLocally(steps);
      return { success: false, error: `${msg}. Saved locally: ${fallbackPath}`, localFallbackPath: fallbackPath };
    }
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private resetStreamingState(): void {
    this.activeSessionId = null;
    this.activeBaseUrl = null;
    this.uploadQueue = [];
    this.uploadedCount = 0;
    this.totalEnqueued = 0;
    this.uploading = false;
  }

  private async drainQueue(): Promise<void> {
    if (this.uploading) return; // another drain loop is running
    this.uploading = true;

    const token = this.accessTokenProvider();
    if (!token || !this.activeSessionId || !this.activeBaseUrl) {
      this.uploading = false;
      return;
    }

    while (this.uploadQueue.length > 0) {
      // Take up to `concurrency` items
      const batch = this.uploadQueue.splice(0, this.concurrency);
      await Promise.all(batch.map(async ({ stepNumber, filePath }) => {
        try {
          await this.uploadImage(this.activeBaseUrl!, token, this.activeSessionId!, stepNumber, filePath);
          this.uploadedCount++;
          this.emitStreamingProgress();
        } catch (e) {
          console.error(`[Upload] Failed to upload step ${stepNumber}:`, (e as Error).message);
          // Re-queue for one retry
          this.uploadQueue.push({ stepNumber, filePath });
        }
      }));
    }

    this.uploading = false;
  }

  private waitForDrain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.uploadQueue.length === 0 && !this.uploading) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private emitStreamingProgress(): void {
    this.emit('upload-progress', {
      currentFile: this.uploadedCount,
      totalFiles: this.totalEnqueued,
      fileProgress: this.totalEnqueued > 0 ? Math.round((this.uploadedCount / this.totalEnqueued) * 100) : 0,
      totalProgress: this.totalEnqueued > 0 ? Math.round((this.uploadedCount / this.totalEnqueued) * 100) : 0,
      status: `Uploading ${this.uploadedCount}/${this.totalEnqueued}`,
    } as UploadProgress);
  }

  private async attemptBatchUpload(
    steps: any[], baseUrl: string, accessToken: string,
    userId?: string, projectId?: string, workflowTitle?: string
  ): Promise<UploadResult> {
    const sessionId = await this.createSession(baseUrl, accessToken, userId, projectId, workflowTitle);
    if (!sessionId) throw new Error('Failed to create upload session');

    await this.uploadMetadata(baseUrl, accessToken, sessionId, steps);

    const stepsWithImages = steps.filter(s => s.screenshotPath && fs.existsSync(s.screenshotPath));
    const total = stepsWithImages.length;
    let done = 0;

    for (let i = 0; i < stepsWithImages.length; i += this.concurrency) {
      const batch = stepsWithImages.slice(i, i + this.concurrency);
      await Promise.all(batch.map(async (step) => {
        await this.uploadImage(baseUrl, accessToken, sessionId, step.stepNumber, step.screenshotPath);
        done++;
        this.emitProgress(`Uploading ${done}/${total}`, done, total, Math.round((done / total) * 90) + 10);
      }));
    }

    const finalizeData = await this.finalizeSession(baseUrl, accessToken, sessionId);
    this.emitProgress('Done!', total, total, 100);

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
      reason: 'Upload failed',
      steps: steps.map(s => ({ ...s, screenshotPath: s.screenshotPath && fs.existsSync(s.screenshotPath) ? s.screenshotPath : undefined })),
    };
    fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2), 'utf-8');
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
    if (workflowTitle) payload.workflow_title = workflowTitle;

    const response = await fetch(`${baseUrl}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${text}`);
    }
    const result = await response.json();
    return result.sessionId || result.session_id || null;
  }

  private async uploadMetadata(baseUrl: string, token: string, sessionId: string, steps: any[]): Promise<void> {
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
      ownerApp: s.ownerApp || undefined,
      elementInfo: s.nativeElement || (
        (s.elementName || s.elementRole || s.elementDescription) ? {
          role: s.elementRole || undefined,
          title: s.elementName || undefined,
          description: s.elementDescription || undefined,
        } : undefined
      ),
    }));

    const response = await fetch(`${baseUrl}/session/${sessionId}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData as any,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upload step ${stepNumber}: ${response.status} ${text}`);
    }
  }

  private async finalizeSession(baseUrl: string, token: string, sessionId: string): Promise<Record<string, any> | null> {
    const response = await fetch(`${baseUrl}/session/${sessionId}/finalize`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      console.warn(`Finalize returned ${response.status}`);
      return null;
    }
    try { return await response.json(); } catch { return null; }
  }

  private emitProgress(status: string, current: number, total: number, percentage: number): void {
    this.emit('upload-progress', {
      currentFile: current, totalFiles: total,
      fileProgress: percentage, totalProgress: percentage, status,
    } as UploadProgress);
    this.emit('status-changed', status);
  }
}
