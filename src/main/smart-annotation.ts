import { EventEmitter } from 'events';
import { ChatService } from './chat';

export interface WorkflowAnnotation {
  workflowTitle: string;
  steps: { stepNumber: number; title: string }[];
}

export class SmartAnnotationService extends EventEmitter {
  private chatService: ChatService;
  private annotationQueue: any[] = [];
  private pendingCount = 0;

  constructor(chatService: ChatService) {
    super();
    this.chatService = chatService;
  }

  /**
   * Batch-annotate an entire workflow. Sends all step metadata (no screenshots)
   * in a single LLM call and returns a workflow title + per-step titles.
   * Returns null if annotation fails so callers can proceed with raw data.
   */
  public async annotateWorkflow(steps: any[], transcript?: string): Promise<WorkflowAnnotation | null> {
    if (!steps || steps.length === 0) return null;

    const prompt = this.buildBatchPrompt(steps, transcript);

    try {
      const response = await this.chatService.sendMessage([
        { role: 'user', content: prompt },
      ]);

      return this.parseBatchResponse(response, steps.length);
    } catch (error) {
      console.error('[SmartAnnotation] Batch annotation failed:', error);
      return null;
    }
  }

  private buildBatchPrompt(steps: any[], transcript?: string): string {
    const stepLines = steps.map((s, i) => {
      const parts: string[] = [];
      parts.push(`${i + 1}. [${s.actionType || 'Action'}]`);
      if (s.windowTitle) parts.push(`in "${s.windowTitle}"`);
      if (s.description) parts.push(`- ${s.description}`);
      if (s.textTyped) parts.push(`(typed: "${s.textTyped}")`);
      if (s.elementName) parts.push(`[element: ${s.elementName}]`);
      if (s.elementRole) parts.push(`[role: ${s.elementRole}]`);
      if (s.nativeElement?.domId) parts.push(`[domId: ${s.nativeElement.domId}]`);
      if (s.ownerApp) parts.push(`(app: ${s.ownerApp})`);
      return parts.join(' ');
    });

    const transcriptSection = transcript
      ? `\n\nUser's spoken narration during this workflow (use as PRIMARY source for understanding intent and context):\n"${transcript}"\n`
      : '';

    return `You are analyzing a screen recording of a user workflow. Given the following steps, generate:
1. A concise workflow title (max 60 chars) describing what the user accomplished
2. For each step, a brief action description (max 80 chars) that makes sense in context of the whole workflow

Rules:
- ALWAYS preserve the exact quoted UI element name from the description (e.g., if the raw description says Click "Create new secret key", your title MUST include "Create new secret key" in quotes)
- Never paraphrase button/link/field names — users need exact labels to find them
- Add contextual info the raw description lacks: what section/area of the page, why this step matters, what happens next
- For vague raw descriptions (like "Click here"), use workflow context to describe what was actually clicked
- Keep titles concise (max 60 chars) but precise
- Format: "{Verb} {exact element name} {context}" e.g., Click "Create new secret key" in the API dashboard
- Preserve typed text as-is — do not redact or paraphrase what the user typed
- If a spoken transcript is provided, use it as the primary source of context for WHY each step was taken. The transcript provides user intent that element data alone cannot capture.
${transcriptSection}
Steps:
${stepLines.join('\n')}

Respond ONLY with JSON, no markdown fences:
{
  "workflowTitle": "...",
  "steps": [
    {"stepNumber": 1, "title": "..."},
    ...
  ]
}`;
  }

  private parseBatchResponse(response: string, stepCount: number): WorkflowAnnotation | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[SmartAnnotation] No JSON found in batch response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.workflowTitle || !Array.isArray(parsed.steps)) {
        console.error('[SmartAnnotation] Invalid batch response structure');
        return null;
      }

      const workflowTitle = String(parsed.workflowTitle).substring(0, 60);
      const steps = parsed.steps
        .filter((s: any) => s && typeof s.stepNumber === 'number' && s.title)
        .map((s: any) => ({
          stepNumber: s.stepNumber,
          title: String(s.title).substring(0, 80),
        }));

      return { workflowTitle, steps };
    } catch (error) {
      console.error('[SmartAnnotation] Failed to parse batch response:', error);
      return null;
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
