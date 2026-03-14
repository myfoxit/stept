import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/basic-form.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3333);
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
      '--disable-popup-blocking',
    ],
  });
  driver = new ExtensionDriver(context);
  await driver.init();
});

test.afterEach(async () => {
  if (context) await context.close();
});

test('basic form login recording captures all steps', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3333/basic-form.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000); // Wait for content script injection

  // Start recording
  await driver.startRecording(page);

  // Perform the workflow: click username, type, click password (triggers blur), click submit
  await page.click('#username');
  await page.waitForTimeout(200);
  await page.type('#username', 'testuser', { delay: 50 });
  await page.waitForTimeout(200);

  // Click password field — this triggers blur on username, capturing the Type event
  await page.click('#password');
  await page.waitForTimeout(500);

  // Click submit button — this triggers blur on password (no Type since password is skipped)
  await page.click('[data-testid="submit-btn"]');
  await page.waitForTimeout(500);

  // Wait for success message
  await expect(page.locator('#success-msg')).toHaveClass(/visible/);

  // Stop recording and get steps
  const steps = await driver.stopRecording(page);

  console.log('Actual steps:\n' + formatActualSteps(steps));

  // Compare against golden
  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);

  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Additional assertions
  expect(steps.length).toBeGreaterThanOrEqual(3); // At minimum: click username, type, click submit
  expect(steps.some(s => s.actionType === 'Left Click')).toBe(true);
  expect(steps.some(s => s.actionType === 'Type' && s.textTyped === 'testuser')).toBe(true);
});

test('basic form captures element info with selectors and xpath', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3333/basic-form.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  await page.click('#username');
  await page.waitForTimeout(300);

  const steps = await driver.stopRecording(page);

  expect(steps.length).toBeGreaterThanOrEqual(1);

  const clickStep = steps.find(s => s.actionType === 'Left Click');
  expect(clickStep).toBeDefined();
  expect(clickStep.elementInfo).toBeDefined();
  expect(clickStep.elementInfo.tagName).toBe('input');
  expect(clickStep.elementInfo.id).toBe('username');
  expect(clickStep.elementInfo.selector).toBeTruthy();
  expect(clickStep.elementInfo.xpath).toBeTruthy();
  expect(clickStep.elementInfo.testId).toBe('username-input');
  expect(clickStep.url).toContain('basic-form.html');
});
