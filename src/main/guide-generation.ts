import { EventEmitter } from 'events';
import { ChatService } from './chat';

export interface GuideGenerationOptions {
  title?: string;
  includeScreenshots?: boolean;
  format?: 'markdown' | 'html';
  style?: 'detailed' | 'concise' | 'tutorial';
}

export class GuideGenerationService extends EventEmitter {
  private chatService: ChatService;

  constructor(chatService: ChatService) {
    super();
    this.chatService = chatService;
  }

  public async generateGuide(
    steps: any[],
    options: GuideGenerationOptions = {}
  ): Promise<string> {
    if (!steps || steps.length === 0) {
      throw new Error('No steps provided for guide generation');
    }

    const {
      title = 'Step-by-Step Guide',
      includeScreenshots = true,
      format = 'markdown',
      style = 'detailed'
    } = options;

    try {
      const prompt = this.createGuidePrompt(steps, {
        title,
        includeScreenshots,
        format,
        style
      });

      this.emit('generation-started');

      const guide = await this.chatService.sendMessage([
        {
          role: 'system',
          content: this.getSystemPrompt(format, style),
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const processedGuide = this.postProcessGuide(guide, steps, includeScreenshots);

      this.emit('generation-completed', processedGuide);
      return processedGuide;

    } catch (error) {
      this.emit('generation-failed', error);
      throw new Error(`Failed to generate guide: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async generateGuideStreaming(
    steps: any[],
    options: GuideGenerationOptions = {},
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!steps || steps.length === 0) {
      throw new Error('No steps provided for guide generation');
    }

    const {
      title = 'Step-by-Step Guide',
      includeScreenshots = true,
      format = 'markdown',
      style = 'detailed'
    } = options;

    try {
      const prompt = this.createGuidePrompt(steps, {
        title,
        includeScreenshots,
        format,
        style
      });

      this.emit('generation-started');

      let fullGuide = '';

      // Set up token listener
      const tokenHandler = (token: string) => {
        fullGuide += token;
        onToken?.(token);
        this.emit('token', token);
      };

      this.chatService.on('token', tokenHandler);

      try {
        const guide = await this.chatService.sendMessage([
          {
            role: 'system',
            content: this.getSystemPrompt(format, style),
          },
          {
            role: 'user',
            content: prompt,
          },
        ]);

        const processedGuide = this.postProcessGuide(guide || fullGuide, steps, includeScreenshots);

        this.emit('generation-completed', processedGuide);
        return processedGuide;

      } finally {
        this.chatService.off('token', tokenHandler);
      }

    } catch (error) {
      this.emit('generation-failed', error);
      throw new Error(`Failed to generate guide: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getSystemPrompt(format: string, style: string): string {
    const basePrompt = `You are an expert technical writer creating user guides from screen recordings. Your goal is to create clear, actionable instructions.`;

    const styleInstructions = {
      detailed: 'Provide comprehensive explanations with context and tips.',
      concise: 'Keep instructions brief and to the point.',
      tutorial: 'Write in a friendly, educational tone suitable for beginners.',
    };

    const formatInstructions = {
      markdown: 'Use Markdown formatting with proper headers, lists, and code blocks.',
      html: 'Use HTML formatting with appropriate tags and structure.',
    };

    return `${basePrompt}

Style: ${styleInstructions[style as keyof typeof styleInstructions]}
Format: ${formatInstructions[format as keyof typeof formatInstructions]}

Guidelines:
- Create logical step groupings and clear transitions
- Use descriptive headings and subheadings
- Include helpful context and explanations
- Maintain consistent formatting throughout
- Focus on user outcomes and goals`;
  }

  private createGuidePrompt(
    steps: any[],
    options: GuideGenerationOptions
  ): string {
    const { title, includeScreenshots, style } = options;

    // Group steps by window/application for better organization
    const stepGroups = this.groupStepsByContext(steps);
    
    // Create step summaries
    const stepSummaries = steps.map((step, index) => {
      const parts = [
        `${step.stepNumber}. ${step.actionType}`,
        `Window: ${step.windowTitle}`,
      ];

      if (step.generatedTitle) {
        parts.push(`AI Title: ${step.generatedTitle}`);
      }

      if (step.generatedDescription) {
        parts.push(`AI Description: ${step.generatedDescription}`);
      } else {
        parts.push(`Description: ${step.description}`);
      }

      if (step.textTyped) {
        parts.push(`Text: "${step.textTyped}"`);
      }

      return parts.join('\n');
    });

    const contextInfo = this.analyzeWorkflowContext(steps);

    return `Create a comprehensive ${style} guide titled "${title}" based on this recorded workflow.

Workflow Context:
${contextInfo}

Recorded Steps:
${stepSummaries.join('\n\n')}

Requirements:
- Create a logical flow with clear sections
- Group related steps together
- Provide helpful context and explanations
- Include prerequisites if needed
- Add tips and best practices where relevant
${includeScreenshots ? '- Reference screenshots where appropriate (they will be embedded separately)' : '- Do not reference screenshots'}
- End with a summary of what was accomplished

The guide should be easy to follow for someone who wants to replicate this workflow.`;
  }

  private groupStepsByContext(steps: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};

    for (const step of steps) {
      const key = step.windowTitle || 'Unknown Application';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(step);
    }

    return groups;
  }

  private analyzeWorkflowContext(steps: any[]): string {
    const analysis = [];
    
    // Count different action types
    const actionCounts = steps.reduce((acc: { [key: string]: number }, step) => {
      acc[step.actionType] = (acc[step.actionType] || 0) + 1;
      return acc;
    }, {});

    analysis.push(`Total Steps: ${steps.length}`);
    analysis.push(`Actions: ${Object.entries(actionCounts).map(([action, count]) => `${count} ${action}`).join(', ')}`);

    // Identify main applications
    const windowTitles = [...new Set(steps.map(s => s.windowTitle))];
    analysis.push(`Applications: ${windowTitles.join(', ')}`);

    // Check for text input
    const textSteps = steps.filter(s => s.textTyped);
    if (textSteps.length > 0) {
      analysis.push(`Text Input: ${textSteps.length} typing actions`);
    }

    // Estimate duration
    const startTime = steps[0]?.timestamp;
    const endTime = steps[steps.length - 1]?.timestamp;
    if (startTime && endTime) {
      const duration = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
      analysis.push(`Duration: ${duration} seconds`);
    }

    return analysis.join('\n');
  }

  private postProcessGuide(
    guide: string,
    steps: any[],
    includeScreenshots: boolean
  ): string {
    let processedGuide = guide;

    // Clean up the guide
    processedGuide = this.cleanupMarkdown(processedGuide);

    // Add screenshot references if enabled
    if (includeScreenshots) {
      processedGuide = this.addScreenshotReferences(processedGuide, steps);
    }

    // Add metadata footer
    processedGuide += this.generateMetadataFooter(steps);

    return processedGuide;
  }

  private cleanupMarkdown(content: string): string {
    return content
      // Fix multiple consecutive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Ensure proper spacing around headers
      .replace(/\n(#{1,6})/g, '\n\n$1')
      // Fix list formatting
      .replace(/^\s*[\-\*]\s+/gm, '- ')
      // Fix numbered list formatting
      .replace(/^\s*(\d+)\.\s+/gm, '$1. ')
      .trim();
  }

  private addScreenshotReferences(guide: string, steps: any[]): string {
    // This is a simplified implementation
    // In a full implementation, you would intelligently insert screenshot references
    // based on the guide content and available screenshots
    
    const stepsWithScreenshots = steps.filter(step => step.screenshotPath);
    
    if (stepsWithScreenshots.length === 0) {
      return guide;
    }

    // Add a screenshots section
    const screenshotSection = `

## Screenshots

The following screenshots were captured during this workflow:

${stepsWithScreenshots.map(step => 
  `- **Step ${step.stepNumber}**: ${step.generatedTitle || step.description}`
).join('\n')}

*Screenshots can be found in the exported package and referenced in the steps above.*`;

    return guide + screenshotSection;
  }

  private generateMetadataFooter(steps: any[]): string {
    const startTime = steps[0]?.timestamp;
    const endTime = steps[steps.length - 1]?.timestamp;
    const timestamp = new Date().toISOString();

    return `

---

*Guide generated on ${new Date().toLocaleString()} from ${steps.length} recorded steps.*`;
  }

  public async generateQuickSummary(steps: any[]): Promise<string> {
    if (!steps || steps.length === 0) {
      return 'No steps recorded.';
    }

    const context = steps.map(step => 
      `${step.actionType} in ${step.windowTitle}${step.textTyped ? ` (typed: "${step.textTyped}")` : ''}`
    ).join('; ');

    try {
      const summary = await this.chatService.sendMessage([
        {
          role: 'user',
          content: `Summarize this workflow in 1-2 sentences: ${context}`,
        },
      ]);

      return summary.trim();
    } catch (error) {
      console.error('Failed to generate quick summary:', error);
      return `Workflow with ${steps.length} steps across ${[...new Set(steps.map(s => s.windowTitle))].length} applications.`;
    }
  }

  public dispose(): void {
    this.removeAllListeners();
  }
}