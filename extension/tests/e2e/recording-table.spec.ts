import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/complex-table.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3337);
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

test('data table captures sort, row action, and pagination clicks', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3337/complex-table.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Sort by name
  await page.click('[data-testid="sort-name"]');
  await page.waitForTimeout(300);

  // Click edit on first row
  await page.click('[data-testid="edit-0"]');
  await page.waitForTimeout(300);

  // Navigate to page 2
  await page.click('[data-testid="page-2"]');
  await page.waitForTimeout(500);

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Verify repetitive structure elements are uniquely identified
  const clickSteps = steps.filter(s => s.actionType === 'Left Click');
  expect(clickSteps.length).toBeGreaterThanOrEqual(3);

  // Each click should have element info
  for (const step of clickSteps) {
    expect(step.elementInfo).toBeDefined();
    expect(step.elementInfo.tagName).toBeTruthy();
  }
});
