import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/multi-step-wizard.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3338);
});

test.afterAll(async () => {
  if (server) await stopServer(server);
});

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });
  driver = new ExtensionDriver(context);
  await driver.init();
});

test.afterEach(async () => {
  if (context) await context.close();
});

test('multi-step wizard captures form interactions across all steps', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3338/multi-step-wizard.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Step 1: Personal Info
  await page.click('#full-name');
  await page.waitForTimeout(200);
  await page.type('#full-name', 'Jane Doe', { delay: 50 });
  await page.waitForTimeout(200);

  await page.click('#email');
  await page.waitForTimeout(200);
  await page.type('#email', 'jane@example.com', { delay: 30 });
  await page.waitForTimeout(200);

  // Click Next (triggers blur on email)
  await page.click('[data-testid="btn-next"]');
  await page.waitForTimeout(500);

  // Step 2: Preferences
  await page.click('[data-testid="notif-sms"]');
  await page.waitForTimeout(200);

  await page.click('[data-testid="theme-dark"]');
  await page.waitForTimeout(200);

  // Click Next
  await page.click('[data-testid="btn-next"]');
  await page.waitForTimeout(500);

  // Step 3: Review → Submit
  await page.click('[data-testid="btn-next"]'); // Submit button
  await page.waitForTimeout(500);

  // Verify success
  await expect(page.locator('#success-panel')).toHaveClass(/visible/);

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Should have many steps across the wizard
  expect(steps.length).toBeGreaterThanOrEqual(7);

  // Verify Type events captured form values
  const typeSteps = steps.filter(s => s.actionType === 'Type');
  expect(typeSteps.some(s => s.textTyped === 'Jane Doe')).toBe(true);
  expect(typeSteps.some(s => s.textTyped === 'jane@example.com')).toBe(true);
});
