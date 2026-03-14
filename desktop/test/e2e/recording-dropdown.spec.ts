import { test, expect } from '@playwright/test';
import { ElectronDriver } from './helpers/electron-driver';
import { FixtureServer } from './helpers/serve-fixtures';
import { compareSnapshots, GoldenSnapshot } from './helpers/snapshot-comparator';
import * as fs from 'fs';
import * as path from 'path';

const goldenPath = path.resolve(__dirname, 'fixtures', 'golden', 'dropdown-menu.json');
const golden: GoldenSnapshot = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

let driver: ElectronDriver;
let server: FixtureServer;

test.describe('Recording: Dropdown Menu', () => {
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

  test('navigates to dropdown page and makes selections', async () => {
    const page = await driver.launch();
    const url = server.getUrl('dropdown-menu.html');
    await page.goto(url);

    // Verify page loaded
    expect(await page.textContent('h1')).toBe('Preferences');

    // Open role dropdown
    await page.click('#roleDropdown');
    const roleMenu = page.locator('#roleMenu');
    await expect(roleMenu).toHaveClass(/open/);

    // Select "Developer"
    await page.click('text=Developer');
    await expect(roleMenu).not.toHaveClass(/open/);
    expect(await page.textContent('#roleValue')).toBe('Developer');

    // Open theme dropdown
    await page.click('#themeDropdown');
    const themeMenu = page.locator('#themeMenu');
    await expect(themeMenu).toHaveClass(/open/);

    // Select "Dark"
    await page.click('text=Dark');
    await expect(themeMenu).not.toHaveClass(/open/);
    expect(await page.textContent('#themeValue')).toBe('Dark');

    // Verify result displayed
    const result = page.locator('#selectionResult');
    await expect(result).toBeVisible();
    expect(await result.textContent()).toContain('Developer');
    expect(await result.textContent()).toContain('Dark');
  });

  test('golden snapshot matches mock dropdown workflow', async () => {
    const mockSteps = [
      {
        stepNumber: 1, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dropdown Menu - Selection',
        description: 'Click role dropdown', screenshotPath: '/tmp/step_001.png',
        globalMousePosition: { x: 200, y: 200 }, relativeMousePosition: { x: 200, y: 200 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 200 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Select a role...', elementRole: 'AXPopUpButton', elementDescription: 'Role combobox',
      },
      {
        stepNumber: 2, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dropdown Menu - Selection',
        description: 'Click "Developer"',
        globalMousePosition: { x: 200, y: 250 }, relativeMousePosition: { x: 200, y: 250 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 250 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Developer', elementRole: 'AXMenuItem', elementDescription: 'Option',
      },
      {
        stepNumber: 3, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dropdown Menu - Selection',
        description: 'Click theme dropdown', screenshotPath: '/tmp/step_003.png',
        globalMousePosition: { x: 200, y: 350 }, relativeMousePosition: { x: 200, y: 350 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 350 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Select a theme...', elementRole: 'AXComboBox', elementDescription: 'Theme combobox',
      },
      {
        stepNumber: 4, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dropdown Menu - Selection',
        description: 'Click "Dark"',
        globalMousePosition: { x: 200, y: 400 }, relativeMousePosition: { x: 200, y: 400 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 400 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Dark', elementRole: 'AXMenuItem', elementDescription: 'Option',
      },
    ];

    const result = compareSnapshots(mockSteps as any, golden);
    expect(result.pass).toBe(true);
    expect(result.matched).toBeGreaterThanOrEqual(2);
  });
});
