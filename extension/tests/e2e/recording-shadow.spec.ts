import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/shadow-dom.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3339);
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

test('shadow DOM captures interactions with web components', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3339/shadow-dom.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Click "Save" button inside custom-button shadow DOM
  // Playwright can pierce shadow DOM with locators
  const saveBtn = page.locator('custom-button').locator('button:has-text("Save")');
  await saveBtn.click();
  await page.waitForTimeout(300);

  // Type in shadow DOM input
  const searchInput = page.locator('custom-input').locator('input');
  await searchInput.click();
  await page.waitForTimeout(200);
  await searchInput.type('test query', { delay: 50 });
  await page.waitForTimeout(200);

  // Click search button inside shadow DOM (triggers blur on input)
  const searchBtn = page.locator('custom-input').locator('button');
  await searchBtn.click();
  await page.waitForTimeout(500);

  // Verify events were logged
  await expect(page.locator('#event-log')).toContainText('Save');
  await expect(page.locator('#event-log')).toContainText('Search');

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Shadow DOM elements should still have some element info captured
  expect(steps.length).toBeGreaterThanOrEqual(3);
  const clickSteps = steps.filter(s => s.actionType === 'Left Click');
  expect(clickSteps.length).toBeGreaterThanOrEqual(2);
});
