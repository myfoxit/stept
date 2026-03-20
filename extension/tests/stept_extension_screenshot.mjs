import { chromium } from '@playwright/test';
import fs from 'fs';
const extPath = '/Users/ahoehne/repos/stept/extension/dist';
const userDataDir = '/tmp/stept-extension-playwright';
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync('/Users/ahoehne/.openclaw/workspace/out', { recursive: true });
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
  ],
  viewport: { width: 1440, height: 960 },
});
const page = context.pages()[0] || await context.newPage();
await page.goto('chrome://extensions/', { waitUntil: 'load' });
await page.screenshot({ path: '/Users/ahoehne/.openclaw/workspace/out/stept-chrome-extension-screenshot.png', fullPage: true });
console.log('OK /Users/ahoehne/.openclaw/workspace/out/stept-chrome-extension-screenshot.png');
await context.close();
