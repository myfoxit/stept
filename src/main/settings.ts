import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';

export interface Settings {
  cloudEndpoint: string;
  chatApiUrl: string;
  apiKey: string;
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  autoAnnotateSteps: boolean;
  autoGenerateGuide: boolean;
  frontendUrl: string;
  spotlightShortcut: string;
  recordingShortcut: string;
  minimizeOnRecord: boolean;
}

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface StoreSchema {
  settings: Settings;
  windowState: WindowState;
  tokens: { refreshToken?: string };
}

const defaultSettings: Settings = {
  cloudEndpoint: 'http://localhost:8000/api/v1/process-recording',
  chatApiUrl: 'http://localhost:8000/api/v1',
  apiKey: '',
  llmProvider: '',
  llmApiKey: '',
  llmModel: '',
  llmBaseUrl: '',
  autoAnnotateSteps: true,
  autoGenerateGuide: false,
  frontendUrl: 'http://localhost:5173',
  spotlightShortcut: 'Ctrl+Shift+Space',
  recordingShortcut: 'Ctrl+Shift+R',
  minimizeOnRecord: true,
};

const defaultWindowState: WindowState = { width: 1200, height: 800, isMaximized: false };

export class SettingsManager {
  private store: any;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'settings',
      cwd: path.join(app.getPath('userData'), 'Ondoki'),
      defaults: { settings: defaultSettings, windowState: defaultWindowState, tokens: {} },
      encryptionKey: 'ondoki-desktop-encryption-key',
      fileExtension: 'json',
    });
  }

  public getSettings(): Settings { return this.store.get('settings', defaultSettings); }

  public async saveSettings(settings: Partial<Settings>): Promise<void> {
    const current = this.getSettings();
    this.store.set('settings', { ...current, ...settings });
  }

  public async resetSettings(): Promise<void> { this.store.set('settings', defaultSettings); }

  public isLlmConfigured(): boolean {
    const s = this.getSettings();
    return !!(s.llmProvider && s.llmModel);
  }

  public getWindowState(): WindowState { return this.store.get('windowState', defaultWindowState); }
  public setWindowState(state: WindowState): void { this.store.set('windowState', state); }

  public getRefreshToken(): string | undefined { return this.store.get('tokens.refreshToken'); }
  public setRefreshToken(token: string): void { this.store.set('tokens.refreshToken', token); }
  public clearRefreshToken(): void { this.store.delete('tokens.refreshToken'); }

  public getApiEndpoints() {
    const s = this.getSettings();
    return { cloud: s.cloudEndpoint, chat: s.chatApiUrl, api: s.apiKey };
  }

  public getLlmConfig() {
    const s = this.getSettings();
    return { provider: s.llmProvider, apiKey: s.llmApiKey, model: s.llmModel, baseUrl: s.llmBaseUrl, isConfigured: this.isLlmConfigured() };
  }

  public getStorePath(): string { return this.store.path; }
  public clearAll(): void { this.store.clear(); }
}
