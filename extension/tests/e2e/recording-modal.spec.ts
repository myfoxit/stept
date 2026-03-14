import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/modal-dialog.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3334);
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

test('modal dialog workflow captures element interactions inside overlay', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3334/modal-dialog.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Open modal
  await page.click('#open-modal');
  await page.waitForTimeout(300);

  // Type in the modal input
  await page.click('#item-name');
  await page.waitForTimeout(200);
  await page.type('#item-name', 'Test Item', { delay: 50 });
  await page.waitForTimeout(200);

  // Click save (triggers blur on input + click)
  await page.click('#save-modal');
  await page.waitForTimeout(500);

  // Verify saved message appears
  await expect(page.locator('#saved-msg')).toHaveClass(/visible/);

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Verify elements inside modal have correct parent chain info
  const modalClick = steps.find(s =>
    s.actionType === 'Left Click' && s.elementInfo?.id === 'item-name',
  );
  if (modalClick) {
    expect(modalClick.elementInfo.tagName).toBe('input');
    expect(modalClick.elementInfo.testId).toBe('item-name-input');
  }
});
