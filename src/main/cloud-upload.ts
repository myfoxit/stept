import { EventEmitter } from 'events';
import { SettingsManager } from './settings';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface UploadResult {
  success: boolean;
  error?: string;
  url?: string;
  recordingId?: string;
}

export interface UploadProgress {
  stepIndex: number;
  totalSteps: number;
  currentFile?: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
}

export interface CloudRecording {
  recording_id: string;
  project_id: string;
  user_id: string;
  title: string;
  description?: string;
  steps: CloudStep[];
  metadata: RecordingMetadata;
}

export interface CloudStep {
  step_number: number;
  timestamp: string;
  action_type: string;
  window_title: string;
  description: string;
  screenshot?: CloudScreenshot;
  global_mouse_position: { x: number; y: number };
  relative_mouse_position: { x: number; y: number };
  window_size: { width: number; height: number };
  screenshot_relative_mouse_position: { x: number; y: number };
  screenshot_size: { width: number; height: number };
  text_typed?: string;
  scroll_delta?: number;
  element_name?: string;
  generated_title?: string;
  generated_description?: string;
  is_annotated?: boolean;
}

export interface CloudScreenshot {
  filename: string;
  mime_type: string;
  size: number;
  width: number;
  height: number;
  data: string; // Base64 encoded
}

export interface RecordingMetadata {
  app_version: string;
  platform: string;
  total_duration_seconds?: number;
  total_steps: number;
  created_at: string;
  export_settings?: any;
}

export class CloudUploadService extends EventEmitter {
  constructor(
    private accessTokenProvider: () => string | undefined,
    private settingsManager: SettingsManager
  ) {
    super();
  }

  public async uploadRecording(
    steps: any[],
    projectId: string,
    userId: string,
    options: {
      title?: string;
      description?: string;
      includeScreenshots?: boolean;
    } = {}
  ): Promise<UploadResult> {
    const accessToken = this.accessTokenProvider();
    if (!accessToken) {
      throw new Error('Authentication required for cloud upload');
    }

    if (!steps || steps.length === 0) {
      throw new Error('No steps to upload');
    }

    try {
      this.emit('upload-started');

      // Prepare recording data
      const recording = await this.prepareRecordingData(
        steps,
        projectId,
        userId,
        options
      );

      // Calculate total size for progress tracking
      const totalSize = this.calculateTotalSize(recording);
      let uploadedSize = 0;

      this.emit('upload-progress', {
        stepIndex: 0,
        totalSteps: recording.steps.length,
        bytesUploaded: 0,
        totalBytes: totalSize,
        percentage: 0,
      });

      // Upload to cloud
      const result = await this.performUpload(recording, accessToken, (progress) => {
        uploadedSize += progress.bytesUploaded;
        this.emit('upload-progress', {
          ...progress,
          bytesUploaded: uploadedSize,
          totalBytes: totalSize,
          percentage: Math.round((uploadedSize / totalSize) * 100),
        });
      });

      this.emit('upload-completed', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('upload-failed', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async prepareRecordingData(
    steps: any[],
    projectId: string,
    userId: string,
    options: {
      title?: string;
      description?: string;
      includeScreenshots?: boolean;
    }
  ): Promise<CloudRecording> {
    const { title, description, includeScreenshots = true } = options;

    // Generate recording ID
    const recordingId = this.generateRecordingId();

    // Convert steps to cloud format
    const cloudSteps: CloudStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.emit('upload-progress', {
        stepIndex: i,
        totalSteps: steps.length,
        currentFile: step.screenshotPath ? path.basename(step.screenshotPath) : undefined,
        bytesUploaded: 0,
        totalBytes: 0,
        percentage: 0,
      });

      const cloudStep = await this.convertStepToCloudFormat(step, includeScreenshots);
      cloudSteps.push(cloudStep);
    }

    // Calculate duration
    const startTime = new Date(steps[0].timestamp);
    const endTime = new Date(steps[steps.length - 1].timestamp);
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    return {
      recording_id: recordingId,
      project_id: projectId,
      user_id: userId,
      title: title || this.generateDefaultTitle(steps),
      description,
      steps: cloudSteps,
      metadata: {
        app_version: require('../../../package.json').version,
        platform: process.platform,
        total_duration_seconds: durationSeconds,
        total_steps: steps.length,
        created_at: new Date().toISOString(),
        export_settings: this.settingsManager.getSettings(),
      },
    };
  }

  private async convertStepToCloudFormat(step: any, includeScreenshots: boolean): Promise<CloudStep> {
    const cloudStep: CloudStep = {
      step_number: step.stepNumber,
      timestamp: step.timestamp instanceof Date 
        ? step.timestamp.toISOString() 
        : new Date(step.timestamp).toISOString(),
      action_type: step.actionType,
      window_title: step.windowTitle,
      description: step.description,
      global_mouse_position: step.globalMousePosition,
      relative_mouse_position: step.relativeMousePosition,
      window_size: step.windowSize,
      screenshot_relative_mouse_position: step.screenshotRelativeMousePosition,
      screenshot_size: step.screenshotSize,
      text_typed: step.textTyped,
      scroll_delta: step.scrollDelta,
      element_name: step.elementName,
      generated_title: step.generatedTitle,
      generated_description: step.generatedDescription,
      is_annotated: step.isAnnotated,
    };

    // Include screenshot if requested and available
    if (includeScreenshots && step.screenshotPath) {
      cloudStep.screenshot = await this.processScreenshot(step.screenshotPath);
    }

    return cloudStep;
  }

  private async processScreenshot(screenshotPath: string): Promise<CloudScreenshot | undefined> {
    try {
      if (!fs.existsSync(screenshotPath)) {
        console.warn(`Screenshot not found: ${screenshotPath}`);
        return undefined;
      }

      const stats = await fs.promises.stat(screenshotPath);
      const data = await fs.promises.readFile(screenshotPath);
      
      // Get image dimensions (simplified - you might want to use a library like sharp)
      const { width, height } = await this.getImageDimensions(screenshotPath);

      return {
        filename: path.basename(screenshotPath),
        mime_type: 'image/png',
        size: stats.size,
        width,
        height,
        data: data.toString('base64'),
      };
    } catch (error) {
      console.error(`Failed to process screenshot ${screenshotPath}:`, error);
      return undefined;
    }
  }

  private async getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
    try {
      // This would typically use a library like sharp or jimp
      // For now, return default dimensions
      return { width: 1920, height: 1080 };
    } catch (error) {
      console.error('Failed to get image dimensions:', error);
      return { width: 1920, height: 1080 };
    }
  }

  private calculateTotalSize(recording: CloudRecording): number {
    let totalSize = 0;
    
    // Base JSON size estimate
    totalSize += JSON.stringify(recording).length;
    
    // Add screenshot data size
    for (const step of recording.steps) {
      if (step.screenshot) {
        totalSize += step.screenshot.size;
      }
    }
    
    return totalSize;
  }

  private async performUpload(
    recording: CloudRecording,
    accessToken: string,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const settings = this.settingsManager.getSettings();
    const uploadUrl = settings.cloudEndpoint;

    if (!uploadUrl) {
      throw new Error('Cloud endpoint not configured');
    }

    try {
      // For large uploads, we might want to split into chunks
      // For now, upload everything at once
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(recording),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        url: result.url || result.view_url,
        recordingId: result.recording_id || recording.recording_id,
      };

    } catch (error) {
      throw new Error(`Network error during upload: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateRecordingId(): string {
    return `rec_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateDefaultTitle(steps: any[]): string {
    if (!steps.length) {
      return 'Untitled Recording';
    }

    // Try to generate a meaningful title from the steps
    const windowTitles = [...new Set(steps.map(s => s.windowTitle))].filter(t => t && t !== 'Unknown Window');
    
    if (windowTitles.length === 1) {
      return `Recording in ${windowTitles[0]}`;
    } else if (windowTitles.length > 1) {
      return `Multi-app Recording (${windowTitles.slice(0, 2).join(', ')}${windowTitles.length > 2 ? '...' : ''})`;
    }

    // Fallback to action-based title
    const actionTypes = [...new Set(steps.map(s => s.actionType))];
    if (actionTypes.length === 1) {
      return `${actionTypes[0]} Recording`;
    }

    return `Recording - ${new Date().toLocaleDateString()}`;
  }

  public async uploadScreenshotsOnly(
    screenshots: string[],
    projectId: string,
    recordingId: string
  ): Promise<UploadResult> {
    const accessToken = this.accessTokenProvider();
    if (!accessToken) {
      throw new Error('Authentication required');
    }

    try {
      this.emit('upload-started');

      const screenshotData = [];
      for (let i = 0; i < screenshots.length; i++) {
        const screenshot = await this.processScreenshot(screenshots[i]);
        if (screenshot) {
          screenshotData.push(screenshot);
        }

        this.emit('upload-progress', {
          stepIndex: i,
          totalSteps: screenshots.length,
          currentFile: path.basename(screenshots[i]),
          bytesUploaded: screenshot?.size || 0,
          totalBytes: screenshots.length * 1000000, // Rough estimate
          percentage: Math.round(((i + 1) / screenshots.length) * 100),
        });
      }

      const settings = this.settingsManager.getSettings();
      const uploadUrl = `${settings.cloudEndpoint}/screenshots`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recording_id: recordingId,
          project_id: projectId,
          screenshots: screenshotData,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Screenshot upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      this.emit('upload-completed', result);

      return {
        success: true,
        url: result.url,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('upload-failed', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  public dispose(): void {
    this.removeAllListeners();
  }
}