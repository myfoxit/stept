import { EventEmitter } from 'events';
import { SettingsManager } from './settings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export class ChatService extends EventEmitter {
  private supportsVision?: boolean;

  constructor(
    private accessTokenProvider: () => string | undefined,
    private settingsManager: SettingsManager
  ) {
    super();
  }

  public async sendMessage(
    messages: ChatMessage[],
    recordingContext?: string
  ): Promise<string> {
    // Try backend-proxied first, fall back to direct LLM
    try {
      return await this.sendBackendProxiedMessage(messages, recordingContext);
    } catch (backendError) {
      console.warn('[Chat] Backend proxied failed, trying direct LLM:', backendError instanceof Error ? backendError.message : backendError);

      const llmConfig = this.settingsManager.getLlmConfig();
      if (llmConfig.isConfigured) {
        try {
          return await this.sendDirectLlmMessage(messages, recordingContext);
        } catch (directError) {
          console.error('[Chat] Direct LLM also failed:', directError instanceof Error ? directError.message : directError);
          throw new Error(`Chat unavailable. Backend: ${backendError instanceof Error ? backendError.message : backendError}. Direct LLM: ${directError instanceof Error ? directError.message : directError}`);
        }
      }

      // No direct LLM configured — re-throw original error
      throw backendError;
    }
  }

  private async sendBackendProxiedMessage(
    messages: ChatMessage[],
    recordingContext?: string
  ): Promise<string> {
    const accessToken = this.accessTokenProvider();
    if (!accessToken) {
      throw new Error('Authentication required');
    }

    try {
      const settings = this.settingsManager.getSettings();
      const apiBaseUrl = (settings.chatApiUrl || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages,
          recording_context: recordingContext,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat request failed: ${response.status} ${errorText}`);
      }

      // Handle streaming response (SSE or text/plain)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') ||
          contentType.includes('text/plain') ||
          contentType.includes('ndjson')) {
        return this.handleStreamingResponse(response);
      }

      // Try JSON parse; if the body starts with "data: " it's SSE despite headers
      const text = await response.text();
      if (text.trimStart().startsWith('data: ')) {
        // Backend returned SSE with wrong content-type — parse it manually
        return this.parseSSEText(text);
      }

      try {
        const data = JSON.parse(text);
        // Handle OpenAI-style response
        if (data.choices?.[0]?.message?.content) {
          return data.choices[0].message.content;
        }
        // Handle Anthropic-style response
        if (data.content) {
          const textBlocks = Array.isArray(data.content)
            ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
            : data.content;
          if (textBlocks) return textBlocks;
        }
        return data.response || data.message || 'No response';
      } catch {
        // Raw text response
        return text || 'No response';
      }
    } catch (error) {
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async sendDirectLlmMessage(
    messages: ChatMessage[],
    recordingContext?: string
  ): Promise<string> {
    const llmConfig = this.settingsManager.getLlmConfig();
    
    console.log('[Chat] LLM config:', { provider: llmConfig.provider, model: llmConfig.model, baseUrl: llmConfig.baseUrl, isConfigured: llmConfig.isConfigured });

    if (!llmConfig.isConfigured) {
      throw new Error('LLM not configured');
    }

    try {
      let apiUrl: string;
      let requestBody: any;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Prepare request based on provider
      switch (llmConfig.provider.toLowerCase()) {
        case 'openai':
        case 'azure':
          apiUrl = `${llmConfig.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
          headers['Authorization'] = `Bearer ${llmConfig.apiKey}`;
          requestBody = {
            model: llmConfig.model,
            messages: this.formatMessagesForOpenAI(messages, recordingContext),
            temperature: 0.7,
            max_completion_tokens: 2000,
          };
          break;

        case 'anthropic':
          apiUrl = `${llmConfig.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
          headers['x-api-key'] = llmConfig.apiKey;
          headers['anthropic-version'] = '2023-06-01';
          requestBody = {
            model: llmConfig.model,
            max_tokens: 2000,
            messages: this.formatMessagesForAnthropic(messages, recordingContext),
          };
          break;

        case 'ollama':
          apiUrl = `${llmConfig.baseUrl || 'http://localhost:11434'}/api/chat`;
          requestBody = {
            model: llmConfig.model,
            messages: this.formatMessagesForOllama(messages, recordingContext),
            stream: false,
          };
          break;

        case 'custom':
          apiUrl = `${llmConfig.baseUrl}/chat/completions`;
          if (llmConfig.apiKey) {
            headers['Authorization'] = `Bearer ${llmConfig.apiKey}`;
          }
          requestBody = {
            model: llmConfig.model,
            messages: this.formatMessagesForOpenAI(messages, recordingContext),
            temperature: 0.7,
            max_completion_tokens: 2000,
          };
          break;

        default:
          throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      // Extract response based on provider
      switch (llmConfig.provider.toLowerCase()) {
        case 'openai':
        case 'azure':
        case 'custom':
          return data.choices?.[0]?.message?.content || 'No response';

        case 'anthropic':
          return data.content?.[0]?.text || 'No response';

        case 'ollama':
          return data.message?.content || 'No response';
          
        default:
          return data.response || data.message || 'No response';
      }
    } catch (error) {
      throw new Error(`Failed to send direct LLM message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseSSEText(text: string): string {
    let result = '';
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content
            || parsed.choices?.[0]?.message?.content
            || parsed.content?.[0]?.text
            || '';
          result += content;
        } catch {
          // plain text chunk
          result += data;
        }
      }
    }
    return result || 'No response';
  }

  private async handleStreamingResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let fullResponse = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // Handle Server-Sent Events format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
              if (content) {
                fullResponse += content;
                // Emit token for real-time display
                this.emit('token', content);
              }
            } catch {
              // Handle plain text streaming
              fullResponse += data;
              this.emit('token', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }

  private formatMessagesForOpenAI(messages: ChatMessage[], context?: string): ChatMessage[] {
    const formatted = [...messages];
    
    if (context) {
      // Add context as a system message if not already present
      const hasSystemMessage = formatted.some(m => m.role === 'system');
      if (!hasSystemMessage) {
        formatted.unshift({
          role: 'system',
          content: `You are helping a user understand their screen recording. Here's the context of what they recorded:\n\n${context}`,
        });
      }
    }
    
    return formatted;
  }

  private formatMessagesForAnthropic(messages: ChatMessage[], context?: string): Array<{ role: string; content: string }> {
    // Anthropic doesn't use system role in messages array — it's a top-level param
    // But for simplicity we filter it out and prepend context to the first user message
    const filtered = messages.filter(m => m.role !== 'system');
    const formatted = filtered.map(m => ({ role: m.role, content: m.content }));

    if (context && formatted.length > 0) {
      const contextPrefix = `Context from screen recording:\n${context}\n\n`;
      if (formatted[0].role === 'user') {
        formatted[0] = { ...formatted[0], content: contextPrefix + formatted[0].content };
      } else {
        formatted.unshift({ role: 'user', content: contextPrefix + 'Please help me with this recording.' });
      }
    }

    // Anthropic requires alternating user/assistant messages starting with user
    if (formatted.length === 0 || formatted[0].role !== 'user') {
      formatted.unshift({ role: 'user', content: 'Hello' });
    }

    return formatted;
  }

  private formatMessagesForOllama(messages: ChatMessage[], context?: string): ChatMessage[] {
    return this.formatMessagesForOpenAI(messages, context);
  }

  public async checkVisionSupport(): Promise<boolean> {
    if (this.supportsVision !== undefined) {
      return this.supportsVision;
    }

    const llmConfig = this.settingsManager.getLlmConfig();
    
    if (!llmConfig.isConfigured) {
      this.supportsVision = false;
      return false;
    }

    // Check if the model supports vision
    const visionModels = [
      'gpt-4o',
      'gpt-4-vision',
      'gpt-4o-mini',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-sonnet-4',
      'claude-opus-4',
    ];

    const modelSupportsVision = visionModels.some(model => 
      llmConfig.model.toLowerCase().includes(model.toLowerCase())
    );

    this.supportsVision = modelSupportsVision;
    return this.supportsVision;
  }

  public resetVisionDetection(): void {
    this.supportsVision = undefined;
  }

  public async sendVisionMessage(
    messages: ChatMessage[],
    imageBase64: string,
    prompt: string
  ): Promise<string> {
    const llmConfig = this.settingsManager.getLlmConfig();
    
    if (!llmConfig.isConfigured) {
      throw new Error('LLM not configured');
    }

    const supportsVision = await this.checkVisionSupport();
    if (!supportsVision) {
      throw new Error('Current model does not support vision');
    }

    try {
      let apiUrl: string;
      let requestBody: any;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Prepare vision request based on provider
      switch (llmConfig.provider.toLowerCase()) {
        case 'openai':
        case 'custom':
          apiUrl = `${llmConfig.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
          headers['Authorization'] = `Bearer ${llmConfig.apiKey}`;
          
          const visionMessages = [...messages];
          visionMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { 
                type: 'image_url', 
                image_url: { 
                  url: `data:image/png;base64,${imageBase64}`,
                  detail: 'high'
                }
              }
            ] as any,
          });

          requestBody = {
            model: llmConfig.model,
            messages: visionMessages,
            temperature: 0.7,
            max_completion_tokens: 1000,
          };
          break;

        case 'anthropic':
          apiUrl = `${llmConfig.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
          headers['x-api-key'] = llmConfig.apiKey;
          headers['anthropic-version'] = '2023-06-01';
          requestBody = {
            model: llmConfig.model,
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
                { type: 'text', text: prompt },
              ],
            }],
          };
          break;

        default:
          throw new Error(`Vision not supported for provider: ${llmConfig.provider}`);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      // Extract based on provider
      if (llmConfig.provider.toLowerCase() === 'anthropic') {
        return data.content?.[0]?.text || 'No response';
      }
      return data.choices?.[0]?.message?.content || 'No response';
      
    } catch (error) {
      throw new Error(`Failed to send vision message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate contextual prompt for recording
  public generateRecordingContext(steps: any[]): string {
    if (!steps.length) {
      return '';
    }

    const context = steps.map((step, index) => {
      const stepInfo = [
        `Step ${step.stepNumber}: ${step.actionType}`,
        `Window: ${step.windowTitle}`,
        `Description: ${step.description}`,
      ];
      
      if (step.textTyped) {
        stepInfo.push(`Text: "${step.textTyped}"`);
      }
      
      return stepInfo.join('\n');
    }).join('\n\n');

    return `Recording Session Summary:\n\n${context}`;
  }

  // Clean up resources
  public dispose(): void {
    this.removeAllListeners();
  }
}