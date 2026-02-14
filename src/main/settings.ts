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
  tokens: {
    refreshToken?: string;
  };
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
};

const defaultWindowState: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false,
};

export class SettingsManager {
  private store: any;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'settings',
      cwd: path.join(app.getPath('userData'), 'Ondoki'),
      defaults: {
        settings: defaultSettings,
        windowState: defaultWindowState,
        tokens: {},
      },
      // Encrypt sensitive data
      encryptionKey: 'ondoki-desktop-encryption-key',
      // Use same format as C# app for compatibility
      fileExtension: 'json',
    });
  }

  public getSettings(): Settings {
    return this.store.get('settings', defaultSettings);
  }

  public async saveSettings(settings: Partial<Settings>): Promise<void> {
    const currentSettings = this.getSettings();
    const newSettings = { ...currentSettings, ...settings };
    this.store.set('settings', newSettings);
  }

  public async resetSettings(): Promise<void> {
    this.store.set('settings', defaultSettings);
  }

  public isLlmConfigured(): boolean {
    const settings = this.getSettings();
    return !!(settings.llmProvider && settings.llmModel);
  }

  public getWindowState(): WindowState {
    return this.store.get('windowState', defaultWindowState);
  }

  public setWindowState(state: WindowState): void {
    this.store.set('windowState', state);
  }

  // Token management (encrypted)
  public getRefreshToken(): string | undefined {
    return this.store.get('tokens.refreshToken');
  }

  public setRefreshToken(token: string): void {
    this.store.set('tokens.refreshToken', token);
  }

  public clearRefreshToken(): void {
    this.store.delete('tokens.refreshToken');
  }

  // Utility methods for specific settings
  public getApiEndpoints() {
    const settings = this.getSettings();
    return {
      cloud: settings.cloudEndpoint,
      chat: settings.chatApiUrl,
      api: settings.apiKey,
    };
  }

  public getLlmConfig() {
    const settings = this.getSettings();
    return {
      provider: settings.llmProvider,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      baseUrl: settings.llmBaseUrl,
      isConfigured: this.isLlmConfigured(),
    };
  }

  public getAutomationSettings() {
    const settings = this.getSettings();
    return {
      autoAnnotateSteps: settings.autoAnnotateSteps,
      autoGenerateGuide: settings.autoGenerateGuide,
    };
  }

  // Migration from C# settings format (for compatibility)
  public migrateFromLegacySettings(legacySettingsPath: string): boolean {
    try {
      const fs = require('fs');
      if (fs.existsSync(legacySettingsPath)) {
        const legacyData = JSON.parse(fs.readFileSync(legacySettingsPath, 'utf8'));
        
        // Map C# settings to Electron settings
        const migratedSettings: Partial<Settings> = {
          cloudEndpoint: legacyData.CloudEndpoint || defaultSettings.cloudEndpoint,
          chatApiUrl: legacyData.ChatApiUrl || defaultSettings.chatApiUrl,
          apiKey: legacyData.ApiKey || defaultSettings.apiKey,
          llmProvider: legacyData.LlmProvider || defaultSettings.llmProvider,
          llmApiKey: legacyData.LlmApiKey || defaultSettings.llmApiKey,
          llmModel: legacyData.LlmModel || defaultSettings.llmModel,
          llmBaseUrl: legacyData.LlmBaseUrl || defaultSettings.llmBaseUrl,
          autoAnnotateSteps: legacyData.AutoAnnotateSteps ?? defaultSettings.autoAnnotateSteps,
          autoGenerateGuide: legacyData.AutoGenerateGuide ?? defaultSettings.autoGenerateGuide,
        };

        this.saveSettings(migratedSettings);
        console.log('Successfully migrated legacy settings');
        return true;
      }
    } catch (error) {
      console.error('Failed to migrate legacy settings:', error);
    }
    return false;
  }

  // Debug/development helpers
  public exportSettings(): string {
    return JSON.stringify({
      settings: this.getSettings(),
      windowState: this.getWindowState(),
    }, null, 2);
  }

  public importSettings(settingsJson: string): boolean {
    try {
      const data = JSON.parse(settingsJson);
      if (data.settings) {
        this.saveSettings(data.settings);
      }
      if (data.windowState) {
        this.setWindowState(data.windowState);
      }
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  // Get store file path for backup purposes
  public getStorePath(): string {
    return this.store.path;
  }

  // Clear all data (for testing or reset)
  public clearAll(): void {
    this.store.clear();
  }
}