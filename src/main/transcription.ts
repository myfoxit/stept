import { EventEmitter } from 'events';
import { SettingsManager } from './settings';
import * as fs from 'fs';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
}

/**
 * Sends audio to the backend for speech-to-text transcription.
 * Returns timestamped segments that can be aligned to recording steps.
 */
export class TranscriptionService extends EventEmitter {
  private accessTokenProvider: () => string | undefined;
  private settingsManager: SettingsManager;

  constructor(accessTokenProvider: () => string | undefined, settingsManager: SettingsManager) {
    super();
    this.accessTokenProvider = accessTokenProvider;
    this.settingsManager = settingsManager;
  }

  /**
   * Transcribe an audio file and return timestamped segments.
   * Returns null if transcription fails (callers should fall back to non-transcript behavior).
   */
  public async transcribe(audioFilePath: string): Promise<TranscriptionResult | null> {
    if (!audioFilePath || !fs.existsSync(audioFilePath)) {
      console.warn('[Transcription] Audio file not found:', audioFilePath);
      return null;
    }

    const token = this.accessTokenProvider();
    if (!token) {
      console.warn('[Transcription] No auth token — skipping transcription');
      return null;
    }

    const settings = this.settingsManager.getSettings();
    const apiBase = (settings.chatApiUrl || settings.cloudEndpoint || '').replace(/\/+$/, '');
    if (!apiBase) {
      console.warn('[Transcription] No API endpoint configured — skipping transcription');
      return null;
    }

    try {
      const fileBuffer = fs.readFileSync(audioFilePath);
      const blob = new Blob([fileBuffer], { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const response = await fetch(`${apiBase}/transcription/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData as any,
      });

      if (!response.ok) {
        const text = await response.text();
        console.warn(`[Transcription] Backend returned ${response.status}: ${text}`);
        return null;
      }

      const data = await response.json();
      const segments: TranscriptionSegment[] = Array.isArray(data.segments)
        ? data.segments.map((s: any) => ({
            start: Number(s.start) || 0,
            end: Number(s.end) || 0,
            text: String(s.text || '').trim(),
          }))
        : [];

      const fullText = segments.map(s => s.text).join(' ');

      console.log(`[Transcription] Got ${segments.length} segments, ${fullText.length} chars`);
      return { segments, fullText };
    } catch (error) {
      console.error('[Transcription] Failed:', error);
      return null;
    }
  }

  /**
   * Align transcription segments to recording steps by timestamp.
   * Each step gets the transcript text that overlaps its time window.
   */
  public alignToSteps(
    segments: TranscriptionSegment[],
    steps: any[],
    recordingStartTime: number
  ): Map<number, string> {
    const alignedMap = new Map<number, string>();

    if (!segments.length || !steps.length) return alignedMap;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepTime = (new Date(step.timestamp).getTime() - recordingStartTime) / 1000;
      const nextStepTime = i < steps.length - 1
        ? (new Date(steps[i + 1].timestamp).getTime() - recordingStartTime) / 1000
        : stepTime + 30; // last step: capture up to 30s after

      // Find segments that overlap this step's time window
      const overlapping = segments.filter(seg =>
        seg.end > stepTime && seg.start < nextStepTime
      );

      if (overlapping.length > 0) {
        const text = overlapping.map(s => s.text).join(' ').trim();
        if (text) {
          alignedMap.set(step.stepNumber, text);
        }
      }
    }

    return alignedMap;
  }

  public dispose(): void {
    this.removeAllListeners();
  }
}
