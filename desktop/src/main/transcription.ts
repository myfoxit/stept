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
  /**
   * Align transcription segments to recording steps.
   * 
   * Logic: each step gets the speech that was spoken in the window
   * BEFORE that step's click (i.e., between the previous click and this click).
   * 
   * Step 1: gets all speech from recording start → step 1 click time
   * Step 2: gets all speech from step 1 click → step 2 click time
   * Step N: gets all speech from step N-1 click → step N click time
   * Last step also gets any trailing speech (up to 30s after)
   * 
   * Segments are assigned based on their midpoint falling within the window,
   * so each segment is assigned to exactly one step.
   */
  public alignToSteps(
    segments: TranscriptionSegment[],
    steps: any[],
    recordingStartTime: number
  ): Map<number, string> {
    const alignedMap = new Map<number, string>();

    if (!segments.length || !steps.length) return alignedMap;

    // Calculate click times relative to recording start (in seconds)
    const clickTimes = steps.map(s =>
      (new Date(s.timestamp).getTime() - recordingStartTime) / 1000
    );

    for (let i = 0; i < steps.length; i++) {
      // Window: from previous click (or recording start) to this click
      const windowStart = i === 0 ? 0 : clickTimes[i - 1];
      const windowEnd = i === steps.length - 1
        ? clickTimes[i] + 30  // last step: also capture trailing speech
        : clickTimes[i];

      // Assign segments whose midpoint falls within this window
      const matched = segments.filter(seg => {
        const midpoint = (seg.start + seg.end) / 2;
        return midpoint >= windowStart && midpoint < windowEnd;
      });

      if (matched.length > 0) {
        const text = matched.map(s => s.text).join(' ').trim();
        if (text) {
          alignedMap.set(steps[i].stepNumber, text);
        }
      }
    }

    return alignedMap;
  }

  public dispose(): void {
    this.removeAllListeners();
  }
}
