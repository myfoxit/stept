import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: '.',
  testMatch: 'recording-*.spec.ts',
  timeout: 30_000,
  retries: 1,
  workers: 1, // Extensions require sequential execution
  reporter: [
    ['html', { outputFolder: '../test-results/html' }],
    ['list'],
  ],
  outputDir: '../test-results/artifacts',
  use: {
    // Extensions require headed Chromium with specific flags
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-first-run',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-translate',
            '--disable-sync',
            // Required for extension screenshot capture
            '--allow-file-access-from-files',
          ],
        },
      },
    },
  ],
});
