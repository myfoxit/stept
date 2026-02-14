import { EventEmitter } from 'events';
import { ChatService } from './chat';
import * as fs from 'fs';

export interface AnnotatedStep {
  stepNumber: number;
  timestamp: Date;
  actionType: string;
  windowTitle: string;
  description: string;
  screenshotPath?: string;
  globalMousePosition: { x: number; y: number };
  relativeMousePosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  screenshotRelativeMousePosition: { x: number; y: number };
  screenshotSize: { width: number; height: number };
  textTyped?: string;
  scrollDelta?: number;
  elementName?: string;
  generatedTitle?: string;
  generatedDescription?: string;
  isAnnotated: boolean;
  cropRegion?: CropRegion;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SmartAnnotationService extends EventEmitter {
  private static readonly MAX_CONCURRENCY = 3;
  private static readonly THUMBNAIL_WIDTH = 512;

  private chatService: ChatService;
  private annotationQueue: any[] = [];
  private processing = false;
  private recentTitles: string[] = [];
  private pendingCount = 0;

  constructor(chatService: ChatService) {
    super();
    this.chatService = chatService;
  }

  public async annotateStep(step: any): Promise<AnnotatedStep> {
    try {
      const annotatedStep = await this.processStepAnnotation(step);
      this.emit('step-annotated', annotatedStep);
      return annotatedStep;
    } catch (error) {
      console.error('Failed to annotate step:', error);
      // Return step without annotation on error
      return {
        ...step,
        isAnnotated: false,
      };
    }
  }

  public enqueueStep(step: any): void {
    this.annotationQueue.push(step);
    this.pendingCount++;
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.annotationQueue.length > 0) {
        const step = this.annotationQueue.shift();
        if (step) {
          await this.processStepAnnotation(step);
          this.pendingCount = Math.max(0, this.pendingCount - 1);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async processStepAnnotation(step: any): Promise<AnnotatedStep> {
    try {
      const supportsVision = await this.chatService.checkVisionSupport();
      
      let title: string;
      let description: string;
      let cropRegion: CropRegion | undefined;

      if (supportsVision && step.screenshotPath) {
        // Use vision-based annotation
        const visionResult = await this.annotateWithVision(step);
        title = visionResult.title;
        description = visionResult.description;
        cropRegion = visionResult.cropRegion;
      } else {
        // Use text-based annotation
        const textResult = await this.annotateWithText(step);
        title = textResult.title;
        description = textResult.description;
      }

      // Update recent titles for context
      this.updateRecentTitles(title);

      const annotatedStep: AnnotatedStep = {
        ...step,
        generatedTitle: title,
        generatedDescription: description,
        isAnnotated: true,
        cropRegion,
      };

      return annotatedStep;
    } catch (error) {
      console.error('Failed to process step annotation:', error);
      return {
        ...step,
        isAnnotated: false,
      };
    }
  }

  private async annotateWithVision(step: any): Promise<{
    title: string;
    description: string;
    cropRegion?: CropRegion;
  }> {
    if (!step.screenshotPath || !fs.existsSync(step.screenshotPath)) {
      throw new Error('Screenshot not found');
    }

    // Read and encode screenshot
    const imageBuffer = await fs.promises.readFile(step.screenshotPath);
    const imageBase64 = imageBuffer.toString('base64');

    // Create contextual prompt
    const contextPrompt = this.createVisionPrompt(step);

    try {
      const response = await this.chatService.sendVisionMessage(
        [],
        imageBase64,
        contextPrompt
      );

      return this.parseVisionResponse(response);
    } catch (error) {
      console.error('Vision annotation failed, falling back to text:', error);
      return this.annotateWithText(step);
    }
  }

  private async annotateWithText(step: any): Promise<{
    title: string;
    description: string;
  }> {
    const prompt = this.createTextPrompt(step);

    try {
      const response = await this.chatService.sendMessage([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      return this.parseTextResponse(response);
    } catch (error) {
      console.error('Text annotation failed:', error);
      return {
        title: this.generateFallbackTitle(step),
        description: step.description,
      };
    }
  }

  private createVisionPrompt(step: any): string {
    const contextPart = this.recentTitles.length > 0 
      ? `\n\nRecent steps in this workflow:\n${this.recentTitles.slice(-3).map((title, i) => `${i + 1}. ${title}`).join('\n')}`
      : '';

    return `Analyze this screenshot and provide a concise annotation for the user action.

Action Details:
- Type: ${step.actionType}
- Window: ${step.windowTitle}
- Original description: ${step.description}
${step.textTyped ? `- Text typed: "${step.textTyped}"` : ''}
${contextPart}

Please respond in JSON format:
{
  "title": "Brief, clear title (max 50 chars)",
  "description": "One sentence description",
  "crop": {
    "x": 0-100,
    "y": 0-100, 
    "width": 0-100,
    "height": 0-100
  }
}

The crop should highlight the most relevant area of the screenshot (as percentages).`;
  }

  private createTextPrompt(step: any): string {
    const contextPart = this.recentTitles.length > 0
      ? `\n\nRecent steps:\n${this.recentTitles.slice(-3).join(', ')}`
      : '';

    return `Create a concise, user-friendly title and description for this action:

Action: ${step.actionType}
Window: ${step.windowTitle}
Description: ${step.description}
${step.textTyped ? `Text: "${step.textTyped}"` : ''}
${contextPart}

Respond in JSON format:
{
  "title": "Brief title (max 50 chars)",
  "description": "One sentence description"
}`;
  }

  private parseVisionResponse(response: string): {
    title: string;
    description: string;
    cropRegion?: CropRegion;
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const result = {
        title: this.sanitizeTitle(parsed.title || 'Action'),
        description: this.sanitizeDescription(parsed.description || 'User action'),
        cropRegion: undefined as CropRegion | undefined,
      };

      // Parse crop region if provided
      if (parsed.crop && typeof parsed.crop === 'object') {
        const crop = parsed.crop;
        if (
          typeof crop.x === 'number' &&
          typeof crop.y === 'number' &&
          typeof crop.width === 'number' &&
          typeof crop.height === 'number' &&
          crop.x >= 0 && crop.x <= 100 &&
          crop.y >= 0 && crop.y <= 100 &&
          crop.width > 0 && crop.width <= 100 &&
          crop.height > 0 && crop.height <= 100
        ) {
          result.cropRegion = {
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height,
          };
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to parse vision response:', error);
      // Extract title and description from plain text as fallback
      return this.parseTextResponse(response);
    }
  }

  private parseTextResponse(response: string): {
    title: string;
    description: string;
  } {
    try {
      // Try to extract JSON first
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: this.sanitizeTitle(parsed.title || 'Action'),
          description: this.sanitizeDescription(parsed.description || 'User action'),
        };
      }

      // Fallback to extracting from plain text
      const lines = response.split('\n').map(line => line.trim()).filter(line => line);
      const title = lines[0] || 'Action';
      const description = lines[1] || lines[0] || 'User action';

      return {
        title: this.sanitizeTitle(title),
        description: this.sanitizeDescription(description),
      };
    } catch (error) {
      console.error('Failed to parse text response:', error);
      return {
        title: 'Action',
        description: 'User action',
      };
    }
  }

  private generateFallbackTitle(step: any): string {
    if (step.textTyped) {
      const text = step.textTyped.substring(0, 30);
      return `Type "${text}${text.length > 30 ? '...' : ''}"`;
    }

    if (step.actionType?.includes('Click')) {
      const windowName = this.extractWindowName(step.windowTitle);
      return `Click in ${windowName}`;
    }

    return step.actionType || 'Action';
  }

  private extractWindowName(windowTitle: string): string {
    if (!windowTitle || windowTitle === 'Unknown Window') {
      return 'app';
    }

    // Extract app name from common window title patterns
    const patterns = [
      /^(.+?)\s*-\s*.+$/, // "Document - App Name"
      /^(.+?)\s*\|\s*.+$/, // "Page | App Name"
      /^(.+?)\s*—\s*.+$/, // "Document — App Name"
    ];

    for (const pattern of patterns) {
      const match = windowTitle.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Take first few words if no pattern matches
    const words = windowTitle.split(' ').slice(0, 3);
    return words.join(' ');
  }

  private sanitizeTitle(title: string): string {
    return title
      .replace(/[^\w\s\-.,!?()]/g, '') // Remove special chars except basic punctuation
      .trim()
      .substring(0, 50);
  }

  private sanitizeDescription(description: string): string {
    return description
      .replace(/[^\w\s\-.,!?()"']/g, '') // Allow more punctuation for descriptions
      .trim()
      .substring(0, 200);
  }

  private updateRecentTitles(title: string): void {
    this.recentTitles.push(title);
    
    // Keep only the last 10 titles for context
    if (this.recentTitles.length > 10) {
      this.recentTitles = this.recentTitles.slice(-10);
    }
  }

  public getPendingCount(): number {
    return this.pendingCount;
  }

  public clearQueue(): void {
    this.annotationQueue = [];
    this.pendingCount = 0;
  }

  public dispose(): void {
    this.clearQueue();
    this.removeAllListeners();
  }
}