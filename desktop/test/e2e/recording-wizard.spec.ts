import { test, expect } from '@playwright/test';
import { ElectronDriver } from './helpers/electron-driver';
import { FixtureServer } from './helpers/serve-fixtures';
import { compareSnapshots, GoldenSnapshot } from './helpers/snapshot-comparator';
import * as fs from 'fs';
import * as path from 'path';

const goldenPath = path.resolve(__dirname, 'fixtures', 'golden', 'multi-step-wizard.json');
const golden: GoldenSnapshot = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

let driver: ElectronDriver;
let server: FixtureServer;

test.describe('Recording: Multi-Step Wizard', () => {
  test.beforeAll(async () => {
    server = new FixtureServer();
    await server.start();
  });

  test.afterAll(async () => {
    await server.stop();
  });

  test.beforeEach(async () => {
    driver = new ElectronDriver();
  });

  test.afterEach(async () => {
    await driver.close();
  });

  test('navigates through all wizard steps', async () => {
    const page = await driver.launch();
    const url = server.getUrl('multi-step-wizard.html');
    await page.goto(url);

    // Step 1: Personal Info
    expect(await page.textContent('.step.active h2')).toBe('Personal Info');

    await page.fill('#fullName', 'John Doe');
    await page.fill('#emailAddr', 'john@example.com');
    await page.click('text=Next');

    // Step 2: Preferences
    expect(await page.textContent('.step.active h2')).toBe('Preferences');

    await page.click('input[value="daily"]');
    await page.selectOption('#language', 'en');
    await page.click('text=Next');

    // Step 3: Bio
    expect(await page.textContent('.step.active h2')).toBe('About You');

    await page.fill('#bio', 'I am a software developer.');
    await page.click('text=Next');

    // Step 4: Complete
    expect(await page.textContent('.step.active h2')).toBe('All Set!');
  });

  test('can go back through wizard steps', async () => {
    const page = await driver.launch();
    const url = server.getUrl('multi-step-wizard.html');
    await page.goto(url);

    // Advance to step 2
    await page.fill('#fullName', 'Jane');
    await page.click('text=Next');
    expect(await page.textContent('.step.active h2')).toBe('Preferences');

    // Go back
    await page.click('text=Back');
    expect(await page.textContent('.step.active h2')).toBe('Personal Info');

    // Verify data persisted
    expect(await page.inputValue('#fullName')).toBe('Jane');
  });

  test('progress dots update correctly', async () => {
    const page = await driver.launch();
    const url = server.getUrl('multi-step-wizard.html');
    await page.goto(url);

    // Step 0: first dot active
    const dots = page.locator('.progress-dot');
    await expect(dots.nth(0)).toHaveClass(/active/);

    // Advance
    await page.click('text=Next');
    await expect(dots.nth(0)).toHaveClass(/done/);
    await expect(dots.nth(1)).toHaveClass(/active/);
  });

  test('golden snapshot matches mock wizard workflow', async () => {
    const mockSteps = [
      {
        stepNumber: 1, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Click "Full Name" field', screenshotPath: '/tmp/step_001.png',
        globalMousePosition: { x: 200, y: 200 }, relativeMousePosition: { x: 200, y: 200 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 200 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Full Name', elementRole: 'AXTextField',
      },
      {
        stepNumber: 2, timestamp: new Date().toISOString(),
        actionType: 'Type', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Type "John Doe"', textTyped: 'john doe',
        globalMousePosition: { x: 0, y: 0 }, relativeMousePosition: { x: 0, y: 0 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 0, y: 0 }, screenshotSize: { width: 0, height: 0 },
      },
      {
        stepNumber: 3, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Click "Email" field',
        globalMousePosition: { x: 200, y: 280 }, relativeMousePosition: { x: 200, y: 280 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 280 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Email', elementRole: 'AXTextField',
      },
      {
        stepNumber: 4, timestamp: new Date().toISOString(),
        actionType: 'Type', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Type "john@example.com"', textTyped: 'john@example.com',
        globalMousePosition: { x: 0, y: 0 }, relativeMousePosition: { x: 0, y: 0 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 0, y: 0 }, screenshotSize: { width: 0, height: 0 },
      },
      {
        stepNumber: 5, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Click "Next"', screenshotPath: '/tmp/step_005.png',
        globalMousePosition: { x: 350, y: 400 }, relativeMousePosition: { x: 350, y: 400 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 350, y: 400 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Next', elementRole: 'AXButton',
      },
      {
        stepNumber: 6, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Click "Daily digest"',
        globalMousePosition: { x: 200, y: 300 }, relativeMousePosition: { x: 200, y: 300 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 300 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Daily digest', elementRole: 'AXRadioButton',
      },
      {
        stepNumber: 7, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Multi-Step Wizard - Setup',
        description: 'Click "Next"', screenshotPath: '/tmp/step_007.png',
        globalMousePosition: { x: 350, y: 400 }, relativeMousePosition: { x: 350, y: 400 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 350, y: 400 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Next', elementRole: 'AXButton',
      },
    ];

    const result = compareSnapshots(mockSteps as any, golden);
    expect(result.pass).toBe(true);
    expect(result.matched).toBeGreaterThanOrEqual(5);
  });
});
