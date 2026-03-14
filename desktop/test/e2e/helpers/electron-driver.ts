import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

export interface RecordedStep {
  stepNumber: number;
  timestamp: string;
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
  elementRole?: string;
  elementDescription?: string;
  ownerApp?: string;
  nativeElement?: Record<string, any>;
  generatedTitle?: string;
  generatedDescription?: string;
}

export class ElectronDriver {
  private app: ElectronApplication | null = null;
  private mainWindow: Page | null = null;
  private collectedSteps: RecordedStep[] = [];

  /**
   * Launch the Electron app in test mode.
   * Sets NODE_ENV=test and points to a mock API URL so no real backend is needed.
   */
  async launch(): Promise<Page> {
    const mainPath = path.resolve(__dirname, '..', '..', '..', 'lib', 'main', 'index.js');

    this.app = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ONDOKI_API_URL: 'http://localhost:39999', // non-existent mock
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });

    // Wait for the first window (spotlight/main window)
    this.mainWindow = await this.app.firstWindow();
    await this.mainWindow.waitForLoadState('domcontentloaded');

    // Set up step collection via IPC listener in the main process
    await this.app.evaluate(({ ipcMain }) => {
      // Store steps in a global array accessible from evaluate()
      (global as any).__e2eRecordedSteps = [];
    });

    return this.mainWindow;
  }

  /**
   * Get the Electron application instance.
   */
  getApp(): ElectronApplication {
    if (!this.app) throw new Error('ElectronDriver not launched');
    return this.app;
  }

  /**
   * Get the main window page.
   */
  getMainWindow(): Page {
    if (!this.mainWindow) throw new Error('ElectronDriver not launched');
    return this.mainWindow;
  }

  /**
   * Start recording via IPC.
   * The recording:start handler expects a CaptureArea object.
   */
  async startRecording(captureArea?: any, projectId?: string): Promise<void> {
    if (!this.app) throw new Error('ElectronDriver not launched');

    const area = captureArea ?? { type: 'all-displays' as const };

    // Clear collected steps
    this.collectedSteps = [];

    // Set up step listener in main process
    await this.app.evaluate(async ({ ipcMain }) => {
      (global as any).__e2eRecordedSteps = [];
    });

    // Trigger recording start via renderer IPC call
    await this.mainWindow!.evaluate(async (args) => {
      const { area, projectId } = args;
      // Use the electronAPI exposed by preload
      const api = (window as any).electronAPI;
      if (api?.startRecording) {
        await api.startRecording(area, projectId || 'test-project', false);
      }
    }, { area, projectId });
  }

  /**
   * Stop recording and return captured steps.
   */
  async stopRecording(): Promise<RecordedStep[]> {
    if (!this.app) throw new Error('ElectronDriver not launched');

    // Stop recording via renderer IPC
    const steps = await this.mainWindow!.evaluate(async () => {
      const api = (window as any).electronAPI;
      if (api?.stopRecording) {
        await api.stopRecording();
      }
      // Steps were sent to the renderer via 'step-recorded' events;
      // collect them from the global accumulator
      return (window as any).__e2eCollectedSteps || [];
    });

    return steps as RecordedStep[];
  }

  /**
   * Collect steps that were recorded.
   * This queries the main process for stored steps.
   */
  async getRecordedSteps(): Promise<RecordedStep[]> {
    if (!this.app) throw new Error('ElectronDriver not launched');

    return this.app.evaluate(() => {
      return (global as any).__e2eRecordedSteps || [];
    });
  }

  /**
   * Get the current recording state.
   */
  async getRecordingState(): Promise<any> {
    if (!this.mainWindow) throw new Error('ElectronDriver not launched');

    return this.mainWindow.evaluate(async () => {
      const api = (window as any).electronAPI;
      return api?.getRecordingState?.();
    });
  }

  /**
   * Navigate the main window to a specific URL.
   * Useful for testing recording on fixture pages.
   */
  async navigateMainWindow(url: string): Promise<void> {
    if (!this.mainWindow) throw new Error('ElectronDriver not launched');
    await this.mainWindow.goto(url);
    await this.mainWindow.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for recording to produce at least N steps.
   * Polls the main process step array.
   */
  async waitForSteps(minCount: number, timeoutMs = 15_000): Promise<RecordedStep[]> {
    if (!this.app) throw new Error('ElectronDriver not launched');

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const steps = await this.getRecordedSteps();
      if (steps.length >= minCount) return steps;
      await new Promise((r) => setTimeout(r, 300));
    }

    const finalSteps = await this.getRecordedSteps();
    return finalSteps;
  }

  /**
   * Close the Electron app gracefully.
   */
  async close(): Promise<void> {
    if (this.app) {
      try {
        await this.app.close();
      } catch {
        // App may have already quit
      }
      this.app = null;
      this.mainWindow = null;
    }
  }
}
