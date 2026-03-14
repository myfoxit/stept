import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/spa-navigation.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3335);
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

test('SPA navigation captures client-side route changes', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3335/spa-navigation.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Navigate: Home → About → Contact → Home
  await page.click('[data-testid="nav-about"]');
  await page.waitForTimeout(500);
  await expect(page.locator('#page-about')).toBeVisible();

  await page.click('[data-testid="nav-contact"]');
  await page.waitForTimeout(500);
  await expect(page.locator('#page-contact')).toBeVisible();

  await page.click('[data-testid="nav-home"]');
  await page.waitForTimeout(500);
  await expect(page.locator('#page-home')).toBeVisible();

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Verify click steps have URLs
  const clickSteps = steps.filter(s => s.actionType === 'Left Click');
  expect(clickSteps.length).toBeGreaterThanOrEqual(3);
  for (const step of clickSteps) {
    expect(step.url).toBeTruthy();
  }
});
