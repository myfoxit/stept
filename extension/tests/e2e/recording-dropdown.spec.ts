import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/dropdown-menu.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3336);
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

test('dropdown menu captures trigger click and item selection', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3336/dropdown-menu.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Open status dropdown
  await page.click('#status-trigger');
  await page.waitForTimeout(300);
  await expect(page.locator('#status-menu')).toHaveClass(/open/);

  // Select "Completed"
  await page.click('[data-testid="status-completed"]');
  await page.waitForTimeout(500);

  // Verify selection
  await expect(page.locator('#selected-value')).toHaveText(/Completed/);

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Verify dynamic elements are captured with selectors
  const itemClick = steps.find(s =>
    s.actionType === 'Left Click' && s.elementInfo?.testId === 'status-completed',
  );
  if (itemClick) {
    expect(itemClick.elementInfo.role).toBe('menuitem');
  }
});
