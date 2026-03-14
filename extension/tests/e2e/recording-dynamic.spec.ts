import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { createFixtureServer, stopServer } from './helpers/serve-fixtures';
import { ExtensionDriver } from './helpers/extension-driver';
import { compareSnapshots, formatActualSteps, type GoldenSnapshot } from './helpers/snapshot-comparator';
import goldenData from './fixtures/golden/dynamic-content.json';
import http from 'http';

const extensionPath = path.resolve(__dirname, '../..');

let server: http.Server;
let context: BrowserContext;
let driver: ExtensionDriver;

test.beforeAll(async () => {
  server = await createFixtureServer(3340);
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

test('dynamic content captures interactions with late-appearing elements', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3340/dynamic-content.html');
  await page.waitForTimeout(1000);

  await driver.startRecording(page);

  // Click "Load Posts" — content appears after 500ms delay
  await page.click('#load-posts');
  await page.waitForTimeout(800); // Wait for simulated AJAX

  // Wait for dynamic content to appear
  await expect(page.locator('[data-testid="post-1"]')).toBeVisible();

  // Click "Like" on dynamically loaded post
  await page.click('[data-testid="like-btn-1"]');
  await page.waitForTimeout(300);

  // Click "Load Comments"
  await page.click('#load-comments');
  await page.waitForTimeout(800);

  // Verify comments appeared
  await expect(page.locator('[data-testid="comment-1"]')).toBeVisible();

  const steps = await driver.stopRecording(page);
  console.log('Actual steps:\n' + formatActualSteps(steps));

  const golden = goldenData as GoldenSnapshot;
  const result = compareSnapshots(steps, golden);
  console.log('\n' + result.summary);
  expect(result.passed, result.summary).toBe(true);

  // Verify dynamically added elements have proper element info
  const likeClick = steps.find(s =>
    s.actionType === 'Left Click' && s.elementInfo?.testId === 'like-btn-1',
  );
  if (likeClick) {
    expect(likeClick.elementInfo.tagName).toBe('button');
    expect(likeClick.elementInfo.selector).toBeTruthy();
  }
});
