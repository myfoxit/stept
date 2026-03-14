import { type BrowserContext, type Page } from '@playwright/test';

/**
 * ExtensionDriver controls the Ondoki Chrome extension during E2E tests.
 *
 * It communicates with the background service worker to start/stop recording
 * and retrieve captured steps. For Manifest V3, we use the service worker
 * page that Playwright exposes via context.serviceWorkers().
 */
export class ExtensionDriver {
  private context: BrowserContext;
  private extensionId: string | null = null;

  constructor(context: BrowserContext) {
    this.context = context;
  }

  /** Wait for the extension service worker to be ready and discover the extension ID */
  async init(): Promise<void> {
    // Wait for service worker to appear
    let sw = this.context.serviceWorkers()[0];
    if (!sw) {
      sw = await this.context.waitForEvent('serviceworker');
    }

    // Extract extension ID from service worker URL: chrome-extension://<id>/background.js
    const swUrl = sw.url();
    const match = swUrl.match(/chrome-extension:\/\/([^/]+)\//);
    if (!match) {
      throw new Error(`Cannot extract extension ID from service worker URL: ${swUrl}`);
    }
    this.extensionId = match[1];
  }

  /** Get the extension ID */
  getExtensionId(): string {
    if (!this.extensionId) throw new Error('ExtensionDriver not initialized');
    return this.extensionId;
  }

  /**
   * Start recording by sending START_RECORDING to the background service worker.
   * We do this by evaluating chrome.runtime.sendMessage in a page context.
   */
  async startRecording(page: Page, projectId = 'test-project'): Promise<void> {
    await page.evaluate(
      ({ extId, projId }) => {
        return new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: 'START_RECORDING', projectId: projId }, () => {
            resolve();
          });
        });
      },
      { extId: this.extensionId, projId: projectId },
    );
    // Wait for content script to initialize recording
    await page.waitForTimeout(500);
  }

  /**
   * Stop recording and return the captured steps.
   */
  async stopRecording(page: Page): Promise<any[]> {
    await page.evaluate(
      ({ extId }) => {
        return new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: 'STOP_RECORDING' }, () => {
            resolve();
          });
        });
      },
      { extId: this.extensionId },
    );
    await page.waitForTimeout(300);
    return this.getRecordedSteps(page);
  }

  /**
   * Get currently recorded steps from the background service worker.
   */
  async getRecordedSteps(page: Page): Promise<any[]> {
    const result = await page.evaluate(
      ({ extId }) => {
        return new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: 'GET_STEPS' }, (response: any) => {
            resolve(response);
          });
        });
      },
      { extId: this.extensionId },
    );
    return result?.steps || [];
  }

  /**
   * Wait until the extension has recorded at least `count` steps, or timeout.
   */
  async waitForSteps(page: Page, count: number, timeoutMs = 10_000): Promise<any[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const steps = await this.getRecordedSteps(page);
      if (steps.length >= count) return steps;
      await page.waitForTimeout(250);
    }
    // Return whatever we have
    return this.getRecordedSteps(page);
  }

  /**
   * Clear all recorded steps.
   */
  async clearSteps(page: Page): Promise<void> {
    await page.evaluate(
      ({ extId }) => {
        return new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: 'CLEAR_STEPS' }, () => {
            resolve();
          });
        });
      },
      { extId: this.extensionId },
    );
  }

  /**
   * Get current recording state from background.
   */
  async getState(page: Page): Promise<any> {
    return page.evaluate(
      ({ extId }) => {
        return new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: 'GET_STATE' }, (response: any) => {
            resolve(response);
          });
        });
      },
      { extId: this.extensionId },
    );
  }
}
